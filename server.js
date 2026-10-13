// Crack the Account — booth game server
// Serves the game and a shared leaderboard.
// Storage: PostgreSQL when DATABASE_URL is set (recommended), otherwise a JSON file.

const express = require("express");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MAX_SCORE = 5 * (150 + 75 * 3); // 5 targets, best case per target
const NAME_MAX = 18;

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "4kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

/* ---------------- storage ---------------- */
let store;

if (process.env.DATABASE_URL) {
  const { Pool } = require("pg");
  const url = process.env.DATABASE_URL;
  // Internal hosts (Render's "dpg-…" names have no dot, Railway's end in .railway.internal) don't need SSL.
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  const internal = !host.includes(".") || /\.railway\.internal$|^localhost$|^127\.0\.0\.1$/.test(host);
  const pool = new Pool({ connectionString: url, ssl: internal ? false : { rejectUnauthorized: false } });
  store = {
    kind: "postgres",
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        cracked INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    },
    async add(row) {
      const r = await pool.query(
        "INSERT INTO scores (name, score, cracked) VALUES ($1,$2,$3) RETURNING id, created_at",
        [row.name, row.score, row.cracked]
      );
      return { id: r.rows[0].id, created_at: r.rows[0].created_at };
    },
    async top(limit) {
      const r = await pool.query(
        "SELECT id, name, score, cracked FROM scores ORDER BY score DESC, created_at ASC LIMIT $1",
        [limit]
      );
      return r.rows;
    },
    async rankOf(id) {
      const r = await pool.query(
        `SELECT 1 + COUNT(*)::int AS rank FROM scores s, (SELECT score, created_at FROM scores WHERE id=$1) me
         WHERE s.score > me.score OR (s.score = me.score AND s.created_at < me.created_at)`,
        [id]
      );
      return r.rows[0] ? r.rows[0].rank : null;
    },
    async count() { const r = await pool.query("SELECT COUNT(*)::int AS n FROM scores"); return r.rows[0].n; },
    async clear() { await pool.query("DELETE FROM scores"); },
  };
} else {
  const file = path.join(__dirname, "data", "scores.json");
  let rows = [];
  let nextId = 1;
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows));
  };
  const sorted = () => rows.slice().sort((a, b) => b.score - a.score || a.t - b.t);
  store = {
    kind: "file",
    async init() {
      try { rows = JSON.parse(fs.readFileSync(file, "utf8")); } catch { rows = []; }
      nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    },
    async add(row) { const r = { ...row, id: nextId++, t: Date.now() }; rows.push(r); save(); return { id: r.id }; },
    async top(limit) { return sorted().slice(0, limit).map(({ id, name, score, cracked }) => ({ id, name, score, cracked })); },
    async rankOf(id) { const i = sorted().findIndex(r => r.id === id); return i < 0 ? null : i + 1; },
    async count() { return rows.length; },
    async clear() { rows = []; save(); },
  };
}

/* ---------------- helpers ---------------- */
const lastPost = new Map(); // ip -> recent post timestamps, light anti-spam
function cleanName(v) {
  return String(v || "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX) || "Anonymous";
}

/* ---------------- API ---------------- */
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    res.set("Cache-Control", "no-store");
    res.json({ top: await store.top(limit), total: await store.count() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/score", async (req, res) => {
  try {
    // Booth devices often share one public IP, so allow a burst per minute rather than one post per IP.
    const ip = req.ip || "x";
    const now = Date.now();
    const recent = (lastPost.get(ip) || []).filter(t => now - t < 60_000);
    if (recent.length >= 30) return res.status(429).json({ error: "too_fast" });

    const score = Number(req.body && req.body.score);
    const cracked = Number(req.body && req.body.cracked);
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: "bad_score" });
    if (!Number.isInteger(cracked) || cracked < 0 || cracked > 5) return res.status(400).json({ error: "bad_cracked" });

    recent.push(now);
    lastPost.set(ip, recent);
    const { id } = await store.add({ name: cleanName(req.body.name), score, cracked });
    res.json({ id, rank: await store.rankOf(id), top: await store.top(5) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server" });
  }
});

// Reset the board (e.g. at the start of each day): send header x-admin-key
app.delete("/api/leaderboard", async (req, res) => {
  if (!ADMIN_KEY || req.get("x-admin-key") !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
  await store.clear();
  res.json({ ok: true });
});

app.get("/health", (req, res) => res.json({ ok: true, storage: store.kind }));

store.init()
  .then(() => app.listen(PORT, () => console.log(`Crack the Account on :${PORT} (storage: ${store.kind})`)))
  .catch(err => { console.error("Storage init failed:", err); process.exit(1); });
