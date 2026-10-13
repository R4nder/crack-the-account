// Crack the Account — persona engine and server-side game sessions.
// Every target is built from a template with randomized details, so the
// passwords change on every game. Answers never leave the server until a
// target is over.

const crypto = require("crypto");

const ROUND_SECS = 75;
const MAX_TRIES = 3;
const BREACH_COST = 3;
const BRUTE_COST = 8;
const GRACE_SECS = 3; // network slack before a round counts as timed out
const SESSION_TTL_MS = 45 * 60 * 1000;
const MAX_SESSIONS = 5000;

/* ---------------- helpers ---------------- */
const rnd = n => crypto.randomInt(n);
const pick = a => a[rnd(a.length)];
const ri = (a, b) => a + rnd(b - a + 1);
const pad2 = n => String(n).padStart(2, "0");
const mark = (c, t) => `<mark class="clue" data-c="${c}">${t}</mark>`;
const tag = (c, t) => `<span class="tag">${mark(c, "#" + t)}</span>`;
const reverse = s => [...s].reverse().join("");
const leet = s => s.replace(/a/g, "@").replace(/e/g, "3").replace(/i/g, "1").replace(/o/g, "0").replace(/s/g, "$");
const norm = s => String(s).trim().replace(/\s+/g, "").toLowerCase();

/* ---------------- templates ----------------
   Each returns a full target. `answers` are compared case-insensitively.
   breach: null | {site, year, type:"hash"|"plain"|"both", plain?} — "hash"
   and "both" make brute_force possible after breach_lookup. */
const TEMPLATES = {
  easy: [
    function fahad() {
      const [pet, petAr] = pick([["Lulu", "لولو"], ["Simba", "سمبا"], ["Mishmish", "مشمش"], ["Oreo", "أوريو"], ["Coco", "كوكو"], ["Loz", "لوز"]]);
      const year = ri(1996, 2004);
      const ans = pet + year;
      return {
        name: "فهد", initial: "ف", handle: "@fahad_dmm", email: "fahad.dmm@example.com", bio: "الدمام · هلالي 💙", stats: [142, "1,280", 310],
        posts: [
          { t: `كل عام وأنا بخير 🎂 دخلت الـ${2026 - year}، مواليد ${mark("year", year)}`, w: "قبل يومين" },
          { t: "صباح الخير من الكورنيش 🌊", w: "قبل 5 أيام" },
          { t: `${petAr} قررت إن اللابتوب صار سريرها 🐈 ${tag("pet", pet)}`, w: "قبل أسبوع" },
          { t: "الهلال يفوز الليلة، يا زين الطقطقة 💙", w: "قبل أسبوعين" },
        ],
        breach: { site: "QuickShop", year: 2024, type: "hash" },
        answers: [ans], show: ans,
        hints: ["عنده حيوان أليف، دوّر على اسمه", "الصيغة: اسم + سنة"],
        parts: [{ v: pet, l: "اسم القطة" }, { v: String(year), l: "سنة الميلاد" }], clues: ["pet", "year"],
        why: "اسم القطة من هاشتاق، وسنة الميلاد من منشور عيد الميلاد.",
      };
    },
    function noura() {
      const [kid, kidAr] = pick([["Joud", "جود"], ["Lana", "لانا"], ["Sara", "سارة"], ["Dana", "دانة"], ["Layan", "ليان"], ["Haya", "هيا"]]);
      const year = ri(2012, 2018);
      const sym = pick(["!", "@", "$"]);
      const ans = kid + year + sym;
      return {
        name: "نورة", initial: "ن", handle: "@noura.reads", email: "noura.reads@example.com", bio: `أم ${kidAr} · قارئة · الخبر`, stats: [88, "940", 205],
        posts: [
          { t: `${kidAr} تكمل ${2026 - year} سنة اليوم 🎈 ${tag("kid", kid)}`, w: "قبل 3 أيام" },
          { t: `ليه كل موقع يبي رمز في كلمة المرور 🙄 خلاص صرت أحط ${mark("sym", sym)} في الآخر دايم`, w: "قبل أسبوع" },
          { t: "قهوة الصباح ورواية جديدة ☕", w: "قبل أسبوعين" },
          { t: `سنة ${mark("year", year)} أحلى سنة في حياتي، السنة اللي جت فيها ${kidAr} 🤍`, w: "قبل شهر" },
        ],
        breach: null,
        answers: [ans], show: ans,
        hints: ["فيه شخص غالي عليها مذكور كثير", "اسم + سنة + رمز"],
        parts: [{ v: kid, l: "اسم البنت" }, { v: String(year), l: "سنة ميلادها" }, { v: sym, l: "الرمز اللي تحطه دايم" }], clues: ["kid", "year", "sym"],
        why: "اسم بنتها وسنة ميلادها، والرمز قالته بنفسها في منشور.",
      };
    },
    function majed() {
      const [team, teamAr, emo] = pick([["Ettifaq", "الاتفاق", "💚"], ["Qadsiah", "القادسية", "💛"], ["Hilal", "الهلال", "💙"], ["Nassr", "النصر", "💛"], ["Ittihad", "الاتحاد", "💛"], ["Ahli", "الأهلي", "💚"]]);
      const num = pick([7, 9, 10, 11, 17, 19, 23]);
      const ans = team + num;
      return {
        name: "ماجد", initial: "م", handle: "@majed.fc", email: "majed.fc@example.com", bio: `مدرّج ${teamAr} ${emo}`, stats: [305, "4,020", 612],
        posts: [
          { t: `${tag("team", team)} للأبد ${emo} مهما صار`, w: "قبل يوم" },
          { t: `قميصي رقم ${mark("num", num)} من سنين، ما ألبس غيره`, w: "قبل 4 أيام" },
          { t: "كلمة المرور حقتي؟ فريقي ورقمي، محد بيعرفها 😎", w: "قبل أسبوع" },
          { t: "مباراة الليلة نار 🔥", w: "قبل أسبوعين" },
        ],
        breach: { site: "SportsHub", year: 2023, type: "hash" },
        answers: [ans], show: ans,
        hints: ["وش أكثر شي يحبه؟", "فريق + رقم القميص"],
        parts: [{ v: team, l: "الفريق" }, { v: String(num), l: "رقم القميص" }], clues: ["team", "num"],
        why: "اسم الفريق ورقم القميص، وهو قالها بنفسه في منشور.",
      };
    },
    function hessa() {
      const [city, cityAr] = pick([["Paris", "باريس"], ["London", "لندن"], ["Tokyo", "طوكيو"], ["Rome", "روما"], ["Bali", "بالي"], ["Vienna", "فيينا"]]);
      const year = ri(2019, 2025);
      const ans = city + year;
      return {
        name: "حصة", initial: "ح", handle: "@hessa.travels", email: "hessa.travels@example.com", bio: "سفر · تصوير · الشرقية", stats: [190, "2,760", 340],
        posts: [
          { t: `أحلى رحلة في حياتي ✈️ ${cityAr} ${tag("city", city)} سنة ${mark("year", year)}`, w: "قبل 3 أيام" },
          { t: "كلمة المرور حقتي تذكرني بأحلى رحلة سويتها، المدينة وسنتها 🤍", w: "قبل أسبوع" },
          { t: "تصوير الغروب من البحر 📸", w: "قبل أسبوعين" },
        ],
        breach: { site: "TripBook", year: 2024, type: "hash" },
        answers: [ans], show: ans,
        hints: ["دوّر على أحلى رحلة سوتها", "مدينة + سنة"],
        parts: [{ v: city, l: "المدينة" }, { v: String(year), l: "سنة الرحلة" }], clues: ["city", "year"],
        why: "المدينة والسنة من منشور الرحلة، وهي قالت إن كلمتها مرتبطة فيها.",
      };
    },
  ],

  medium: [
    function khalid() {
      const [kid, kidAr] = pick([["Sultan", "سلطان"], ["Faisal", "فيصل"], ["Turki", "تركي"], ["Nawaf", "نواف"], ["Saud", "سعود"], ["Bandar", "بندر"]]);
      const num = ri(2, 9);
      const ans = `${kid}@${num}`;
      return {
        name: "خالد", initial: "خ", handle: "@k7alid", email: "k7alid@example.com", bio: `نصراوي 💛 · أبو ${kidAr}`, stats: [231, "3,402", 498],
        posts: [
          { t: `${kidAr} أول مرة يحضر مباراة معي 💛 ${tag("kid", kid)}`, w: "قبل 4 أيام" },
          { t: "أنا عندي كلمة مرور وحدة لكل شي، أسهل لي وما أنساها 😎", w: "قبل أسبوع" },
          { t: "مشوار للرياض بالسيارة الجديدة 🚗", w: "قبل أسبوعين" },
          { t: `رقمي المفضل ${mark("num", num)} من يوم كنت صغير، دايم ألبسه`, w: "قبل شهر" },
        ],
        breach: { site: "GameZone", year: 2023, type: "plain", plain: ans },
        answers: [ans], show: ans,
        hints: ["قال إنه يستخدم كلمة وحدة لكل شي… جرّبت التسريبات؟", "اسم + @ + رقم"],
        parts: [{ v: kid, l: "اسم الولد" }, { v: "@", l: "رمز" }, { v: String(num), l: "الرقم المفضل" }], clues: ["kid", "num"],
        why: "تسرّبت كلمة مروره من موقع ألعاب قديم، وهو يستخدم نفس الكلمة في كل مكان.",
      };
    },
    function lama() {
      const [pet, petAr] = pick([["Bella", "بيلا"], ["Luna", "لونا"], ["Kiki", "كيكي"], ["Nala", "نالا"], ["Tofu", "توفو"], ["Milo", "ميلو"]]);
      const year = ri(2018, 2023);
      const ans = `${pet}#${year}`;
      return {
        name: "لمى", initial: "ل", handle: "@lama.bakes", email: "lama.bakes@example.com", bio: "حلويات بيتية 🧁 · الدمام", stats: [120, "1,940", 260],
        posts: [
          { t: `${petAr} جات بيتنا سنة ${mark("year", year)} وغيّرت حياتنا 🐾 ${tag("pet", pet)}`, w: "قبل 5 أيام" },
          { t: `دايم أحط ${mark("sym", "#")} بين الكلمة والرقم، كذا أحس إنها أقوى 🤓`, w: "قبل أسبوع" },
          { t: "طلبية كيك اليوم 🎂", w: "قبل أسبوعين" },
          { t: "من سنين ما غيّرت كلمة المرور، ليش أغيرها وهي شغالة؟ 🤷‍♀️", w: "قبل شهر" },
        ],
        breach: { site: "CakeShop", year: 2022, type: "plain", plain: ans },
        answers: [ans], show: ans,
        hints: ["كلمتها القديمة تسرّبت… وهي ما تغيّرها", "اسم + # + سنة"],
        parts: [{ v: pet, l: "اسم القطة" }, { v: "#", l: "رمزها" }, { v: String(year), l: "سنة ما جات" }], clues: ["pet", "year", "sym"],
        why: "تسرّبت من موقع حلويات قبل سنين، وهي ما غيّرتها من وقتها.",
      };
    },
    function omar() {
      const [car, carAr] = pick([["Patrol", "باترول"], ["Tahoe", "تاهو"], ["Camry", "كامري"], ["Mustang", "موستنج"], ["Accord", "أكورد"], ["Sonata", "سوناتا"]]);
      const year = ri(2012, 2020);
      const ans = `${car}_${year}`;
      return {
        name: "عمر", initial: "ع", handle: "@omar.drives", email: "omar.drives@example.com", bio: "سيارات وطلعات بر 🏜️", stats: [174, "2,230", 390],
        posts: [
          { t: `أول سيارة لي ${carAr} ${tag("car", car)} موديل ${mark("year", year)}، ما أنساها`, w: "قبل 3 أيام" },
          { t: `أحب الـ ${mark("sym", "_")} في كلمات المرور، شكلها مرتب`, w: "قبل أسبوع" },
          { t: "كلمة مروري نفسها في كل المواقع 😂", w: "قبل أسبوعين" },
          { t: "طلعة بر الويكند 🔥", w: "قبل شهر" },
        ],
        breach: { site: "RideClub", year: 2024, type: "plain", plain: ans },
        answers: [ans], show: ans,
        hints: ["كلمته وحدة في كل المواقع… والمواقع تتسرّب", "سيارة + _ + سنة"],
        parts: [{ v: car, l: "أول سيارة" }, { v: "_", l: "رمزه" }, { v: String(year), l: "الموديل" }], clues: ["car", "year", "sym"],
        why: "تسرّبت من منتدى سيارات، ويستخدم نفس الكلمة في كل مكان.",
      };
    },
  ],

  hard: [
    function reem() {
      const [horse, horseAr] = pick([["Najm", "نجم"], ["Barq", "برق"], ["Sahm", "سهم"], ["Ghazal", "غزال"], ["Shaheen", "شاهين"], ["Rayyan", "ريان"]]);
      const d = ri(1, 28), m = ri(1, 12);
      const ans = horse + pad2(d) + pad2(m);
      return {
        name: "ريم", initial: "ر", handle: "@reem.rides", email: "reem.rides@example.com", bio: "فروسية 🐎 · بنت الشرقية", stats: [176, "2,115", 260],
        posts: [
          { t: `أول بطولة لـ${horseAr} 🏆 فخورة فيه ${tag("horse", horse)}`, w: "قبل 6 أيام" },
          { t: "التمرين الصباحي أحلى شي في يومي", w: "قبل أسبوع" },
          { t: "قلت لأختي كلمة المرور حقتي سهلة: اسم أغلى شي عندي، ويوم وشهر ميلاده 🤫", w: "قبل 3 أسابيع" },
          { t: `كل سنة وأنت بخير يا بطل 🎂 عيد ميلاد ${horseAr} ${mark("bday", `${pad2(d)}/${pad2(m)}`)}`, w: "قبل سنة" },
        ],
        breach: { site: "FitTrack", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: ["وش أغلى شي عندها؟ شوف أقدم المنشورات", "اسم + يوم + شهر، بدون رموز"],
        parts: [{ v: horse, l: "اسم الحصان" }, { v: pad2(d), l: "اليوم" }, { v: pad2(m), l: "الشهر" }], clues: ["horse", "bday"],
        why: "المعلومة كانت في منشور قديم من سنة، والمنشورات القديمة ما تختفي.",
      };
    },
    function yousef() {
      const [dog, dogAr] = pick([["Rocky", "روكي"], ["Bruno", "برونو"], ["Toby", "توبي"], ["Zorro", "زورو"], ["Oscar", "أوسكار"], ["Buddy", "بادي"]]);
      const year = ri(2016, 2023);
      const ans = reverse(dog) + year;
      return {
        name: "يوسف", initial: "ي", handle: "@yousef.k9", email: "yousef.k9@example.com", bio: "مدرّب كلاب 🐕 · الخبر", stats: [97, "1,505", 230],
        posts: [
          { t: `${dogAr} معنا من سنة ${mark("year", year)} وصار واحد من العيلة 🐶 ${tag("dog", dog)}`, w: "قبل 4 أيام" },
          { t: `حيلة ذكية: أكتب اسم كلبي ${mark("rev", "بالمقلوب")} في كلمة المرور وبعده السنة اللي جاء فيها، محد بيفكر فيها 🧠`, w: "قبل أسبوعين" },
          { t: "تمرين الصباح مع الشلة 🦮", w: "قبل شهر" },
        ],
        breach: { site: "PetCare", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: ["قرأت حيلته الذكية؟", "اسم الكلب بالمقلوب + سنة"],
        parts: [{ v: dog, l: "اسم الكلب" }, { v: "↺", l: "بالمقلوب" }, { v: String(year), l: "السنة" }], clues: ["dog", "rev", "year"],
        why: "قلب الاسم ما يحمي، لأن أدوات الاختراق تجرّب المقلوب تلقائيًا.",
      };
    },
    function faisal() {
      const word = pick(["Falcon", "Shadow", "Phoenix", "Tiger", "Desert", "Storm"]);
      const year = ri(2015, 2024);
      const ans = leet(word) + year;
      return {
        name: "فيصل", initial: "ف", handle: "@faisal.dev", email: "faisal.dev@example.com", bio: "مبرمج · قهوة وكود ☕", stats: [64, "880", 150],
        posts: [
          { t: `شعاري في الحياة ${tag("word", word)} 🦅`, w: "قبل 3 أيام" },
          { t: `تخرجت سنة ${mark("year", year)} والحمدلله 🎓`, w: "قبل أسبوع" },
          { t: `نصيحة أمنية: خذ كلمة تحبها وبدّل حروفها برموز ${mark("leet", "a=@ و e=3 و i=1 و o=0 و s=$")}، وحط بعدها سنة تخرجك 💪`, w: "قبل أسبوعين" },
          { t: "كود ثم قهوة ثم كود ☕", w: "قبل شهر" },
        ],
        breach: { site: "DevForum", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: ["شوف نصيحته الأمنية", "الشعار بعد تبديل الحروف + سنة التخرج"],
        parts: [{ v: word, l: "الشعار" }, { v: "a→@ o→0", l: "تبديل الحروف" }, { v: String(year), l: "سنة التخرج" }], clues: ["word", "leet", "year"],
        why: "تبديل الحروف برموز نمط معروف، وأدوات الاختراق تجربه تلقائيًا.",
      };
    },
  ],

  boss: [
    function salman() {
      const s = pick([
        { cur: ["winter"], show: "Winter2026", old: "Autumn2025", month: "فبراير", feel: "والجو بارد مرة 🥶" },
        { cur: ["spring"], show: "Spring2026", old: "Winter2026", month: "أبريل", feel: "والجو صار ربيع 🌸" },
        { cur: ["summer"], show: "Summer2026", old: "Spring2026", month: "يوليو", feel: "والحر مو طبيعي 🔥" },
        { cur: ["autumn", "fall"], show: "Autumn2026", old: "Summer2026", month: "أكتوبر", feel: "وأخيرًا بدأ الجو يبرد 🍂" },
      ]);
      return {
        name: "سلمان", initial: "س", handle: "@salman.it", email: "salman.it@example.com", bio: "مسؤول أنظمة · قهوة وسيرفرات", stats: [64, "512", 120],
        posts: [
          { t: "النظام أجبرني أغيّر كلمة المرور مرة ثانية 😤", w: "اليوم" },
          { t: `كل 3 شهور تغيير… أنا ببساطة ${mark("rule", "أغيّر الفصل")} وخلاص 😂`, w: "اليوم" },
          { t: `${mark("now", s.month)} ${s.feel}`, w: "اليوم" },
          { t: "سيرفرات + قهوة = يوم ناجح ☕", w: "قبل أسبوع" },
        ],
        breach: { site: "ITPortal", year: 2026, type: "both", plain: s.old },
        answers: s.cur.map(c => c + "2026"), show: s.show,
        hints: ["شوف كلمته القديمة في التسريبات، وكيف يغيّرها", "فصل السنة الحالي بالإنجليزي + السنة"],
        parts: [{ v: s.old, l: "القديمة من التسريب" }], sep: "→", clues: ["rule", "now"],
        why: "لما الناس يُجبرون يغيّرون كلمة المرور، يعدّلونها بنمط متوقع. واللي عرف القديمة يخمّن الجديدة.",
      };
    },
    function nasser() {
      const word = pick(["Qahwa", "Karak", "Najd", "Sadu", "Dallah", "Majlis"]);
      const n = ri(1, 6);
      const old = word + pad2(n);
      const ans = word + pad2(n + 2);
      return {
        name: "ناصر", initial: "ن", handle: "@nasser.ops", email: "nasser.ops@example.com", bio: "دعم فني · الشرقية", stats: [52, "430", 98],
        posts: [
          { t: `النظام يجبرني أغير كلمة المرور كل شوي 😤 أنا ${mark("rule", "أزيد الرقم واحد")} وخلاص`, w: "اليوم" },
          { t: `من بعد التسريب الأخير ${mark("count", "غيّرتها مرتين")} 🙄`, w: "قبل يومين" },
          { t: "الدلّة ما تفارق المكتب ☕", w: "قبل أسبوع" },
        ],
        breach: { site: "CloudDesk", year: 2025, type: "both", plain: old },
        answers: [ans], show: ans,
        hints: ["كم مرة غيّرها من بعد التسريب؟", "نفس الكلمة + الرقم بعد زيادته مرتين"],
        parts: [{ v: old, l: "القديمة من التسريب" }], sep: "→", clues: ["rule", "count"],
        why: "زيادة رقم على كلمة قديمة نمط مكشوف، واللي عنده القديمة يوصل للجديدة.",
      };
    },
  ],
};

const LEVEL_AR = { easy: "سهل", medium: "متوسط", hard: "صعب", boss: "الزعيم" };
const PLAN = ["easy", "easy", "medium", "hard", "boss"];
const NEED = PLAN.reduce((m, l) => (m[l] = (m[l] || 0) + 1, m), {}); // enabled templates each level needs

/* ---------------- admin-controlled config ---------------- */
const config = { disabled: new Set(), roundSecs: ROUND_SECS };
const hooks = { roundEnd: null }; // (tid, {ok, method, reason, secs}) => void

const byId = {};
for (const lvl of Object.keys(TEMPLATES)) for (const fn of TEMPLATES[lvl]) byId[fn.name] = { fn, lvl };

function enabledOf(lvl) { return TEMPLATES[lvl].filter(fn => !config.disabled.has(fn.name)); }

/* Returns an error string if this change would leave a level without enough challenges. */
function setEnabled(id, on) {
  const e = byId[id];
  if (!e) return "unknown";
  if (on) { config.disabled.delete(id); return null; }
  if (enabledOf(e.lvl).filter(fn => fn.name !== id).length < NEED[e.lvl]) return "min_" + e.lvl;
  config.disabled.add(id);
  return null;
}
function setDisabled(ids) {
  config.disabled = new Set();
  for (const id of ids || []) if (byId[id]) setEnabled(id, false);
}
function setRoundSecs(n) { config.roundSecs = Math.min(120, Math.max(45, Math.round(Number(n) || ROUND_SECS))); }

function catalog() {
  return Object.entries(byId).map(([id, { fn, lvl }]) => {
    const t = fn();
    return { id, level: lvl, levelAr: LEVEL_AR[lvl], name: t.name, handle: t.handle,
      breach: t.breach ? t.breach.type : null, enabled: !config.disabled.has(id), need: NEED[lvl] };
  });
}
function preview(id) {
  const e = byId[id];
  if (!e) return null;
  return { id, lvl: LEVEL_AR[e.lvl], ...e.fn() };
}

function buildTargets() {
  const pools = {};
  for (const l of Object.keys(TEMPLATES)) { pools[l] = enabledOf(l); if (pools[l].length < NEED[l]) pools[l] = [...TEMPLATES[l]]; }
  const out = [];
  for (const lvl of PLAN) {
    const gen = pools[lvl].length > 1 ? pools[lvl].splice(rnd(pools[lvl].length), 1)[0] : pools[lvl][0];
    out.push({ ...gen(), tid: gen.name, lvl: LEVEL_AR[lvl] });
  }
  return out;
}

function publicTarget(t) {
  return { lvl: t.lvl, name: t.name, initial: t.initial, handle: t.handle, email: t.email, bio: t.bio, stats: t.stats, posts: t.posts };
}

function patternOf(ans) {
  let digits = 0;
  return [...ans].map((c, i) => {
    if (i === 0) return c;
    if (/\d/.test(c) && digits < 2) { digits++; return c; }
    return "_";
  }).join(" ");
}

function hasHash(t) { return !!t.breach && (t.breach.type === "hash" || t.breach.type === "both"); }

/* brute force: user words × (as-is, reversed, leet) × up to 3 in order (repeats allowed) × separators × suffixes */
const SEPS = ["", "@", "_", "-", "!", ".", "#"];
const SUFS = ["", "!", "@", "1", "123"];
function bruteForce(words, answers) {
  const want = new Set(answers.map(norm));
  const base = [...new Set(words.map(w => String(w).replace(/^#/, "").trim().slice(0, 24)).filter(Boolean))].slice(0, 6);
  const toks = [...new Set(base.flatMap(w => [w, reverse(w), leet(w), leet(w.toLowerCase())]))];
  let count = 0, hit = null;
  const samples = [];
  const take = s => { count++; if (samples.length < 48) samples.push(s); else if (Math.random() * count < 48) samples[Math.floor(Math.random() * 48)] = s; if (!hit && want.has(norm(s))) hit = s; };
  const n = toks.length;
  for (let a = 0; a < n; a++) {
    for (const f of SUFS) take(toks[a] + f);
    for (let b = 0; b < n; b++) {
      for (const s of SEPS) for (const f of SUFS) take(toks[a] + s + toks[b] + f);
      for (let c = 0; c < n; c++) {
        for (const s of SEPS) for (const f of SUFS) take(toks[a] + s + toks[b] + s + toks[c] + f);
      }
    }
  }
  return { count, hit, samples, words: base };
}

/* ---------------- sessions ---------------- */
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL_MS) sessions.delete(id);
}, 60_000).unref();

function newSession(name) {
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  const id = crypto.randomBytes(16).toString("hex");
  const s = { id, name, roundSecs: config.roundSecs, targets: buildTargets(), idx: 0, score: 0, results: [], saved: null, touched: Date.now() };
  startTarget(s);
  sessions.set(id, s);
  return s;
}
function activeCount(ms = 5 * 60 * 1000) {
  const now = Date.now(); let n = 0;
  for (const s of sessions.values()) if (now - s.touched < ms) n++;
  return n;
}
function getSession(id) {
  const s = sessions.get(String(id || ""));
  if (s) s.touched = Date.now();
  return s;
}
function startTarget(s) {
  s.cur = { startedAt: Date.now(), penalty: 0, tries: 0, breachUsed: false, loginLocked: false, ended: false, result: null };
}
function leftOf(s) {
  const el = (Date.now() - s.cur.startedAt) / 1000 + s.cur.penalty;
  return Math.max(0, s.roundSecs - el);
}
function timedOut(s) {
  return (Date.now() - s.cur.startedAt) / 1000 + s.cur.penalty >= s.roundSecs + GRACE_SECS;
}

function endTarget(s, ok, method, reason) {
  const t = s.targets[s.idx], c = s.cur;
  const left = Math.ceil(leftOf(s));
  const points = !ok ? 0 : method === "brute" ? Math.max(40, 90 + left * 2) : Math.max(40, 150 + left * 3 - c.tries * 40);
  s.score += points;
  c.ended = true;
  c.result = { ok, method: ok ? method : null, reason: ok ? null : reason, points, total: s.score, show: t.show, parts: t.parts, sep: t.sep || "+", why: t.why, clues: t.clues, last: s.idx === s.targets.length - 1 };
  s.results.push({ handle: t.handle, show: t.show, ok, method: ok ? method : null });
  if (hooks.roundEnd) {
    const secs = Math.min(s.roundSecs, (Date.now() - c.startedAt) / 1000 + c.penalty);
    try { hooks.roundEnd(t.tid, { ok, method: ok ? method : null, reason: ok ? null : reason, secs }); } catch (e) { console.error(e); }
  }
  return c.result;
}

/* Common guard: returns an "ended" payload if the round is already over (or just timed out). */
function guard(s) {
  if (s.cur.ended) return { status: "ended", result: s.cur.result };
  if (timedOut(s)) return { status: "ended", result: endTarget(s, false, null, "timeout") };
  return null;
}

module.exports = {
  ROUND_SECS, MAX_TRIES, BREACH_COST, BRUTE_COST, LEVEL_AR,
  config, hooks, setEnabled, setDisabled, setRoundSecs, catalog, preview, activeCount,
  newSession, getSession, startTarget, leftOf, guard, endTarget, publicTarget, patternOf, hasHash, bruteForce, norm,
  _templates: TEMPLATES, _buildTargets: buildTargets,
};
