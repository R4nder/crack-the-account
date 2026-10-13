// Crack the Account — booth game server
// Serves the game and a shared leaderboard.
// Storage: PostgreSQL when DATABASE_URL is set (recommended), otherwise a JSON file.

const express = require("express");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
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
      await pool.query("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)");
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
    async remove(id) { const r = await pool.query("DELETE FROM scores WHERE id=$1", [id]); return r.rowCount > 0; },
    async rename(id, name) { const r = await pool.query("UPDATE scores SET name=$2 WHERE id=$1", [id, name]); return r.rowCount > 0; },
    async stats() {
      const r = await pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))::int AS today,
        COALESCE(ROUND(AVG(score)),0)::int AS avg, COALESCE(MAX(score),0)::int AS best,
        COUNT(*) FILTER (WHERE cracked = 5)::int AS perfect FROM scores`);
      return r.rows[0];
    },
    async kvGet(k) { const r = await pool.query("SELECT v FROM kv WHERE k=$1", [k]); return r.rows[0] ? r.rows[0].v : null; },
    async kvSet(k, v) { await pool.query("INSERT INTO kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", [k, JSON.stringify(v)]); },
  };
} else {
  const file = path.join(__dirname, "data", "scores.json");
  const kvFile = path.join(__dirname, "data", "kv.json");
  let kv = {};
  try { kv = JSON.parse(fs.readFileSync(kvFile, "utf8")); } catch {}
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
    async remove(id) { const n = rows.length; rows = rows.filter(r => r.id !== id); save(); return rows.length < n; },
    async rename(id, name) { const r = rows.find(r => r.id === id); if (!r) return false; r.name = name; save(); return true; },
    async stats() {
      const off = 3 * 3600e3, dayStart = Math.floor((Date.now() + off) / 86400e3) * 86400e3 - off;
      const total = rows.length;
      return { total, today: rows.filter(r => r.t >= dayStart).length,
        avg: total ? Math.round(rows.reduce((a, r) => a + r.score, 0) / total) : 0,
        best: rows.reduce((m, r) => Math.max(m, r.score), 0), perfect: rows.filter(r => r.cracked === 5).length };
    },
    async kvGet(k) { return k in kv ? kv[k] : null; },
    async kvSet(k, v) { kv[k] = v; fs.mkdirSync(path.dirname(kvFile), { recursive: true }); fs.writeFileSync(kvFile, JSON.stringify(kv)); },
  };
}

/* ---------------- helpers ---------------- */
function cleanName(v) {
  return String(v || "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX) || "Anonymous";
}

/* ---------------- admin settings + per-challenge stats ---------------- */
const G = require("./game");
const settings = { open: true, blockedWords: [], helperCode: "" };
const blank = () => ({ plays: 0, cracked: 0, guess: 0, breach: 0, brute: 0, timeout: 0, locked: 0, secs: 0 });
let cstats = {};
let statsDirty = false;

async function loadSettings() {
  const v = (await store.kvGet("settings")) || {};
  settings.open = v.open !== false;
  settings.blockedWords = Array.isArray(v.blockedWords) ? v.blockedWords : [];
  settings.helperCode = typeof v.helperCode === "string" ? v.helperCode : "";
  G.setDisabled(v.disabled || []);
  G.setRoundSecs(v.roundSecs || G.ROUND_SECS);
  cstats = (await store.kvGet("challenge_stats")) || {};
}
const saveSettings = () => store.kvSet("settings", {
  open: settings.open, blockedWords: settings.blockedWords, helperCode: settings.helperCode, disabled: [...G.config.disabled], roundSecs: G.config.roundSecs,
});
G.hooks.roundEnd = (tid, r) => {
  const c = cstats[tid] || (cstats[tid] = blank());
  c.plays++; c.secs += Math.round(r.secs);
  if (r.ok) { c.cracked++; c[r.method] = (c[r.method] || 0) + 1; }
  else if (r.reason === "locked") c.locked++;
  else c.timeout++;
  statsDirty = true;
};
setInterval(() => {
  if (!statsDirty) return;
  statsDirty = false;
  store.kvSet("challenge_stats", cstats).catch(e => { statsDirty = true; console.error(e); });
}, 10_000).unref();

function playerName(v) {
  const n = cleanName(v);
  const low = n.toLowerCase().replace(/\s+/g, "");
  return settings.blockedWords.some(w => w && low.includes(w)) ? "Anonymous" : n;
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

/* ---------------- game (server-authoritative) ---------------- */
const starts = new Map(); // ip -> recent game starts
function limitStarts(ip) {
  const now = Date.now();
  const recent = (starts.get(ip) || []).filter(t => now - t < 60_000);
  if (recent.length >= 40) return false;
  recent.push(now); starts.set(ip, recent); return true;
}
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
};
function session(req, res) {
  const s = G.getSession(req.body && req.body.sid);
  if (!s) { res.status(404).json({ error: "no_session" }); return null; }
  return s;
}
const L = s => Math.max(0, Math.round(G.leftOf(s)));

app.get("/api/game/info", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ open: settings.open, roundSecs: G.config.roundSecs });
});

app.post("/api/game/start", wrap(async (req, res) => {
  if (!settings.open) return res.status(503).json({ error: "closed" });
  if (!limitStarts(req.ip || "x")) return res.status(429).json({ error: "too_fast" });
  const s = G.newSession(playerName(req.body && req.body.name));
  res.json({ sid: s.id, code: s.code, idx: 0, total: s.targets.length, roundSecs: s.roundSecs, target: G.publicTarget(s.targets[0]), left: L(s) });
}));

app.post("/api/game/guess", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  const over = G.guard(s); if (over) return res.json(over);
  const t = s.targets[s.idx], c = s.cur;
  if (c.loginLocked) return res.json({ status: "login_locked", left: L(s) });
  const pw = String((req.body && req.body.pw) || "").slice(0, 64);
  if (t.answers.map(G.norm).includes(G.norm(pw))) {
    const method = c.breachUsed && t.breach && t.breach.type === "plain" ? "breach" : "guess";
    return res.json({ status: "granted", result: G.endTarget(s, true, method) });
  }
  c.tries++;
  if (c.tries >= G.MAX_TRIES) {
    c.loginLocked = true;
    if (G.hasHash(t)) return res.json({ status: c.breachUsed ? "locked_brute" : "locked_try_breach", tries: c.tries, left: L(s) });
    return res.json({ status: "ended", result: G.endTarget(s, false, null, "locked") });
  }
  const out = { status: "denied", tries: c.tries, hint: t.hints[c.tries - 1], left: L(s) };
  if (c.tries === G.MAX_TRIES - 1) out.pattern = G.patternOf(t.show);
  res.json(out);
}));

app.post("/api/game/breach", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  const over = G.guard(s); if (over) return res.json(over);
  const t = s.targets[s.idx], c = s.cur;
  if (!c.breachUsed) { c.breachUsed = true; c.penalty += G.BREACH_COST; }
  const over2 = G.guard(s); if (over2) return res.json(over2);
  if (!t.breach) return res.json({ status: "ok", found: false, left: L(s) });
  const b = t.breach;
  const hash = G.hasHash(t) ? require("crypto").createHash("sha256").update(t.show + s.id).digest("hex") : null;
  res.json({ status: "ok", found: true, site: b.site, year: b.year, type: b.type, plain: b.plain || null,
    hash: hash ? hash.slice(0, 8) + "…" + hash.slice(-4) : null, left: L(s) });
}));

app.post("/api/game/brute", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  const over = G.guard(s); if (over) return res.json(over);
  const t = s.targets[s.idx], c = s.cur;
  if (!c.breachUsed) return res.json({ status: "no_hash", reason: "no_breach", left: L(s) });
  if (!G.hasHash(t)) return res.json({ status: "no_hash", reason: "none", left: L(s) });
  const words = Array.isArray(req.body && req.body.words) ? req.body.words.slice(0, 6).map(String) : [];
  if (!words.length) return res.status(400).json({ error: "no_words" });
  c.penalty += G.BRUTE_COST;
  const over2 = G.guard(s); if (over2) return res.json(over2);
  const r = G.bruteForce(words, t.answers);
  if (r.hit) return res.json({ status: "cracked", count: r.count, samples: r.samples, cracked: t.show, result: G.endTarget(s, true, "brute") });
  res.json({ status: "exhausted", count: r.count, samples: r.samples, left: L(s) });
}));

app.post("/api/game/timeout", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  const over = G.guard(s); if (over) return res.json(over);
  if (G.leftOf(s) > 2) return res.json({ status: "active", left: L(s) }); // client clock ran ahead
  res.json({ status: "ended", result: G.endTarget(s, false, null, "timeout") });
}));

app.post("/api/game/next", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  if (!s.cur.ended) return res.status(409).json({ error: "round_active" });
  if (s.idx >= s.targets.length - 1) return res.status(409).json({ error: "game_over" });
  s.idx++; G.startTarget(s);
  res.json({ idx: s.idx, target: G.publicTarget(s.targets[s.idx]), left: L(s), score: s.score });
}));

app.post("/api/game/finish", wrap(async (req, res) => {
  const s = session(req, res); if (!s) return;
  if (s.idx < s.targets.length - 1 || !s.cur.ended) return res.status(409).json({ error: "not_finished" });
  const cracked = s.results.filter(r => r.ok).length;
  if (!s.saved) {
    const { id } = await store.add({ name: s.name, score: s.score, cracked });
    s.saved = { id };
  }
  res.json({ id: s.saved.id, name: s.name, score: s.score, cracked, results: s.results, rank: await store.rankOf(s.saved.id), top: await store.top(5) });
}));


/* ---------------- booth helpers (header x-helper-code) ---------------- */
const helperFails = new Map(); // ip -> recent wrong codes
app.get("/api/helper/live", (req, res) => {
  res.set("Cache-Control", "no-store");
  const ip = req.ip || "x", now = Date.now();
  const fails = (helperFails.get(ip) || []).filter(t => now - t < 10 * 60_000);
  if (fails.length >= 8) return res.status(429).json({ error: "too_many" });
  const code = req.get("x-helper-code") || "";
  const okCode = (settings.helperCode && code === settings.helperCode) || (ADMIN_KEY && code === ADMIN_KEY);
  if (!okCode) {
    fails.push(now); helperFails.set(ip, fails);
    return res.status(403).json({ error: settings.helperCode ? "forbidden" : "disabled" });
  }
  res.json({ open: settings.open, games: G.liveSessions() });
});

/* ---------------- admin (header x-admin-key) ---------------- */
const isAdmin = req => ADMIN_KEY && req.get("x-admin-key") === ADMIN_KEY;
const admin = fn => wrap(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
  res.set("Cache-Control", "no-store");
  await fn(req, res);
});
const idOf = req => { const id = parseInt(req.params.id, 10); return Number.isInteger(id) ? id : null; };

// Reset the board (e.g. at the start of each day)
app.delete("/api/leaderboard", admin(async (req, res) => { await store.clear(); res.json({ ok: true }); }));

app.get("/api/admin/overview", admin(async (req, res) => {
  const challenges = G.catalog().map(c => {
    const st = cstats[c.id] || blank();
    return { ...c, stats: { ...st, rate: st.plays ? Math.round((st.cracked / st.plays) * 100) : null, avgSecs: st.plays ? Math.round(st.secs / st.plays) : null } };
  });
  res.json({
    storage: store.kind, active: G.activeCount(), stats: await store.stats(),
    settings: { open: settings.open, roundSecs: G.config.roundSecs, blockedWords: settings.blockedWords, helperCode: settings.helperCode },
    challenges,
  });
}));

app.post("/api/admin/settings", admin(async (req, res) => {
  const b = req.body || {};
  if (typeof b.open === "boolean") settings.open = b.open;
  if (b.roundSecs !== undefined) G.setRoundSecs(b.roundSecs);
  if (typeof b.helperCode === "string") {
    const code = b.helperCode.trim().slice(0, 40);
    if (code && code.length < 6) return res.status(400).json({ error: "short_code" });
    settings.helperCode = code;
  }
  if (Array.isArray(b.blockedWords)) {
    settings.blockedWords = [...new Set(b.blockedWords.map(w => String(w).toLowerCase().replace(/\s+/g, "").slice(0, 30)).filter(Boolean))].slice(0, 100);
  }
  await saveSettings();
  res.json({ ok: true, settings: { open: settings.open, roundSecs: G.config.roundSecs, blockedWords: settings.blockedWords, helperCode: settings.helperCode } });
}));

app.post("/api/admin/challenge/:id", admin(async (req, res) => {
  const err = G.setEnabled(req.params.id, !!(req.body && req.body.enabled));
  if (err) return res.status(400).json({ error: err });
  await saveSettings();
  res.json({ ok: true });
}));

app.get("/api/admin/challenge/:id/preview", admin(async (req, res) => {
  const p = G.preview(req.params.id);
  if (!p) return res.status(404).json({ error: "unknown" });
  res.json(p);
}));

app.delete("/api/admin/challenge-stats", admin(async (req, res) => {
  cstats = {}; await store.kvSet("challenge_stats", cstats); res.json({ ok: true });
}));

app.get("/api/admin/scores", admin(async (req, res) => {
  res.json({ rows: await store.top(500), total: await store.count() });
}));

app.delete("/api/score/:id", admin(async (req, res) => {
  const id = idOf(req); if (id === null) return res.status(400).json({ error: "bad_id" });
  res.json({ ok: await store.remove(id) });
}));

app.patch("/api/score/:id", admin(async (req, res) => {
  const id = idOf(req); if (id === null) return res.status(400).json({ error: "bad_id" });
  res.json({ ok: await store.rename(id, cleanName(req.body && req.body.name)) });
}));

app.get("/health", (req, res) => res.json({ ok: true, storage: store.kind }));

store.init()
  .then(loadSettings)
  .then(() => app.listen(PORT, () => console.log(`Crack the Account on :${PORT} (storage: ${store.kind})`)))
  .catch(err => { console.error("Storage init failed:", err); process.exit(1); });
