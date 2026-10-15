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
   Each takes T(ar, en), which returns the text for the player's language,
   and returns a full target. `answers` are compared case-insensitively.
   breach: null | {site, year, type:"hash"|"plain"|"both", plain?} — "hash"
   and "both" make brute_force possible after breach_lookup. */
const TEMPLATES = {
  easy: [
    function badr(T) {
      const gt = pick(["Venom", "Blaze", "Ghost", "Raven", "Viper", "Hunter"]);
      const [gAr, gEn] = pick([["فورتنايت", "Fortnite"], ["فالورانت", "Valorant"], ["روكيت ليق", "Rocket League"], ["كول أوف ديوتي", "Call of Duty"], ["فيفا", "FIFA"]]);
      const ans = gt + "123";
      return {
        name: T("بدر", "Badr"), initial: T("ب", "B"), handle: `@${gt.toLowerCase()}_gg`, email: `${gt.toLowerCase()}.gg@example.com`,
        bio: T("قيمر 🎮 · ستريم كل خميس", "Gamer 🎮 · streaming every Thursday"), stats: [410, "5,860", 720],
        posts: [
          { t: T(`اسمي في كل الألعاب ${mark("tag", gt)} من أيام المتوسط 😎`, `My name in every game has been ${mark("tag", gt)} since middle school 😎`), w: "قبل يومين" },
          { t: T(`الليلة ستريم ${gAr} 🔥 لا تفوتكم`, `Streaming ${gEn} tonight 🔥 don't miss it`), w: "قبل 4 أيام" },
          { t: T(`كلمة المرور حقتي؟ نفس اسمي في الألعاب وبعده ${mark("num", "123")} عشان ما أنساها 😂`, `My password? Same as my gamer name with ${mark("num", "123")} after it so I never forget 😂`), w: "قبل أسبوع" },
          { t: T("خسرت الرانك اليوم 💀", "Lost my rank today 💀"), w: "قبل أسبوعين" },
        ],
        breach: { site: "GameVault", year: 2024, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["وش اسمه في الألعاب؟", "اسمه في الألعاب + 123"], ["What's his gamer name?", "Gamer name + 123"]),
        parts: [{ v: gt, l: T("اسمه في الألعاب", "Gamer name") }, { v: "123", l: T("الأرقام", "Digits") }], clues: ["tag", "num"],
        why: T("استخدم اسمه المعروف في الألعاب وأضاف 123، وهذا أول شي يجرّبه أي هاكر.", "He used his well-known gamer name plus 123, the first thing any hacker tries."),
      };
    },
    function shahad(T) {
      const last4 = String(ri(1000, 9999));
      const phone = `05${ri(0, 9)} ${ri(100, 999)} ${last4}`;
      return {
        name: T("شهد", "Shahad"), initial: T("ش", "S"), handle: "@shahad.flowers", email: "shahad.flowers@example.com",
        bio: T("تنسيق ورد 💐 · الخبر", "Flower arrangements 💐 · Khobar"), stats: [132, "2,310", 288],
        posts: [
          { t: T(`مشروعي الصغير 💐 تنسيق ورد لكل المناسبات. للطلب واتساب: <span dir="ltr">${mark("phone", phone)}</span>`, `My small business 💐 flowers for every occasion. Orders on WhatsApp: ${mark("phone", phone)}`), w: "قبل يومين" },
          { t: T("طلبية عرس اليوم، تعبت بس فرحانة 🤍", "Wedding order today, exhausted but happy 🤍"), w: "قبل 5 أيام" },
          { t: T(`كلمة المرور حقتي سهلة: اسمي بالإنجليزي و${mark("rule", "آخر 4 أرقام من جوالي")}، مستحيل أنساها 🤭`, `My password is easy: my name and ${mark("rule", "the last 4 digits of my phone")}. Impossible to forget 🤭`), w: "قبل أسبوعين" },
        ],
        breach: { site: "FlowerMart", year: 2025, type: "hash" },
        answers: ["Shahad" + last4], show: "Shahad" + last4,
        hints: T(["رقم جوالها منشور… وش قالت عن كلمتها؟", "اسمها بالإنجليزي + آخر 4 أرقام"], ["Her phone number is public… what did she say about her password?", "Her name + last 4 digits"]),
        parts: [{ v: "Shahad", l: T("اسمها", "Her name") }, { v: last4, l: T("آخر 4 أرقام من الجوال", "Last 4 phone digits") }], clues: ["phone", "rule"],
        why: T("رقم الجوال منشور عشان الطلبات، وهي بنت كلمتها منه ومن اسمها.", "Her phone number is public for orders, and she built her password from it and her name."),
      };
    },
    function majed(T) {
      const [team, teamAr, emo] = pick([["Ettifaq", "الاتفاق", "💚"], ["Qadsiah", "القادسية", "💛"], ["Hilal", "الهلال", "💙"], ["Nassr", "النصر", "💛"], ["Ittihad", "الاتحاد", "💛"], ["Ahli", "الأهلي", "💚"]]);
      const num = pick([7, 9, 10, 11, 17, 19, 23]);
      const ans = team + num;
      return {
        name: T("ماجد", "Majed"), initial: T("م", "M"), handle: "@majed.fc", email: "majed.fc@example.com",
        bio: T(`مدرّج ${teamAr} ${emo}`, `${team} fan for life ${emo}`), stats: [305, "4,020", 612],
        posts: [
          { t: T(`${tag("team", team)} للأبد ${emo} مهما صار`, `${tag("team", team)} forever ${emo} no matter what`), w: "قبل يوم" },
          { t: T(`قميصي رقم ${mark("num", num)} من سنين، ما ألبس غيره`, `Been wearing jersey number ${mark("num", num)} for years, never anything else`), w: "قبل 4 أيام" },
          { t: T("كلمة المرور حقتي؟ فريقي ورقمي، محد بيعرفها 😎", "My password? My team and my number. Nobody will ever guess 😎"), w: "قبل أسبوع" },
          { t: T("مباراة الليلة نار 🔥", "Tonight's match is fire 🔥"), w: "قبل أسبوعين" },
        ],
        breach: { site: "SportsHub", year: 2023, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["وش أكثر شي يحبه؟", "فريق + رقم القميص"], ["What does he love most?", "Team + jersey number"]),
        parts: [{ v: team, l: T("الفريق", "Team") }, { v: String(num), l: T("رقم القميص", "Jersey number") }], clues: ["team", "num"],
        why: T("اسم الفريق ورقم القميص، وهو قالها بنفسه في منشور.", "Team name plus jersey number, and he said so himself in a post."),
      };
    },
    function hessa(T) {
      const [city, cityAr] = pick([["Paris", "باريس"], ["London", "لندن"], ["Tokyo", "طوكيو"], ["Rome", "روما"], ["Bali", "بالي"], ["Vienna", "فيينا"]]);
      const year = ri(2019, 2025);
      const ans = city + year;
      return {
        name: T("حصة", "Hessa"), initial: T("ح", "H"), handle: "@hessa.travels", email: "hessa.travels@example.com",
        bio: T("سفر · تصوير · الشرقية", "Travel · Photography · Eastern Province"), stats: [190, "2,760", 340],
        posts: [
          { t: T(`أحلى رحلة في حياتي ✈️ ${cityAr} ${tag("city", city)} سنة ${mark("year", year)}`, `Best trip of my life ✈️ ${tag("city", city)} back in ${mark("year", year)}`), w: "قبل 3 أيام" },
          { t: T("كلمة المرور حقتي تذكرني بأحلى رحلة سويتها، المدينة وسنتها 🤍", "My password reminds me of my best trip ever: the city and the year 🤍"), w: "قبل أسبوع" },
          { t: T("تصوير الغروب من البحر 📸", "Shooting the sunset by the sea 📸"), w: "قبل أسبوعين" },
        ],
        breach: { site: "TripBook", year: 2024, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["دوّر على أحلى رحلة سوتها", "مدينة + سنة"], ["Find her best trip", "City + year"]),
        parts: [{ v: city, l: T("المدينة", "City") }, { v: String(year), l: T("سنة الرحلة", "Trip year") }], clues: ["city", "year"],
        why: T("المدينة والسنة من منشور الرحلة، وهي قالت إن كلمتها مرتبطة فيها.", "The city and year came from her trip post, and she said her password is tied to it."),
      };
    },
  ],

  medium: [
    function mazen(T) {
      const [co, coAr] = pick([["Nuqta", "نقطة"], ["Sahab", "سحاب"], ["Wasl", "وصل"], ["Manara", "منارة"], ["Tamkeen", "تمكين"], ["Rawafid", "روافد"]]);
      const ans = `${co}@2026`;
      return {
        name: T("مازن", "Mazen"), initial: T("م", "M"), handle: "@mazen.works", email: "mazen.works@example.com",
        bio: T("موظف جديد 💼 · الدمام", "New employee 💼 · Dammam"), stats: [58, "610", 140],
        posts: [
          { t: T(`أول يوم دوام في شركة ${coAr} 🎉 ${tag("co", co)}`, `First day at my new company 🎉 ${tag("co", co)}`), w: "قبل 3 أيام" },
          { t: T(`قسم IT عطوني كلمة مرور مؤقتة: ${mark("rule", "اسم الشركة ثم @ ثم السنة")}، وقالوا غيّرها… بغيّرها بعدين 😅`, `IT gave me a temporary password: ${mark("rule", "company name, then @, then the year")}. They said change it… I'll do it later 😅`), w: "قبل 3 أيام" },
          { t: T(`${mark("year", "2026")} سنة البدايات الجديدة 🚀`, `${mark("year", "2026")}, the year of new beginnings 🚀`), w: "قبل أسبوع" },
          { t: T("قهوة أول يوم ☕", "First-day coffee ☕"), w: "قبل أسبوع" },
        ],
        breach: { site: "HRPortal", year: 2026, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["وش قالوا له قسم IT؟", "اسم الشركة بالإنجليزي + @ + السنة"], ["What did IT tell him?", "Company name + @ + year"]),
        parts: [{ v: co, l: T("اسم الشركة", "Company") }, { v: "@", l: T("رمز", "Symbol") }, { v: "2026", l: T("السنة", "Year") }], clues: ["co", "rule", "year"],
        why: T("ما غيّر كلمة المرور المؤقتة، ونمط الشركات الافتراضي سهل يتخمّن.", "He never changed the temporary password, and default company patterns are easy to guess."),
      };
    },
    function lama(T) {
      const [pet, petAr] = pick([["Bella", "بيلا"], ["Luna", "لونا"], ["Kiki", "كيكي"], ["Nala", "نالا"], ["Tofu", "توفو"], ["Milo", "ميلو"]]);
      const year = ri(2018, 2023);
      const ans = `${pet}#${year}`;
      return {
        name: T("لمى", "Lama"), initial: T("ل", "L"), handle: "@lama.bakes", email: "lama.bakes@example.com",
        bio: T("حلويات بيتية 🧁 · الدمام", "Home baking 🧁 · Dammam"), stats: [120, "1,940", 260],
        posts: [
          { t: T(`${petAr} جات بيتنا سنة ${mark("year", year)} وغيّرت حياتنا 🐾 ${tag("pet", pet)}`, `${pet} joined our home in ${mark("year", year)} and changed our lives 🐾 ${tag("pet", pet)}`), w: "قبل 5 أيام" },
          { t: T(`دايم أحط ${mark("sym", "#")} بين الكلمة والرقم، كذا أحس إنها أقوى 🤓`, `I always put a ${mark("sym", "#")} between the word and the number. Feels stronger 🤓`), w: "قبل أسبوع" },
          { t: T("طلبية كيك اليوم 🎂", "Cake order today 🎂"), w: "قبل أسبوعين" },
          { t: T("من سنين ما غيّرت كلمة المرور، ليش أغيرها وهي شغالة؟ 🤷‍♀️", "Haven't changed my password in years. Why change it if it works? 🤷‍♀️"), w: "قبل شهر" },
        ],
        breach: { site: "CakeShop", year: 2022, type: "plain", plain: ans },
        answers: [ans], show: ans,
        hints: T(["كلمتها القديمة تسرّبت… وهي ما تغيّرها", "اسم + # + سنة"], ["Her old password leaked… and she never changes it", "Name + # + year"]),
        parts: [{ v: pet, l: T("اسم القطة", "Cat's name") }, { v: "#", l: T("رمزها", "Her symbol") }, { v: String(year), l: T("سنة ما جات", "Year she arrived") }], clues: ["pet", "year", "sym"],
        why: T("تسرّبت من موقع حلويات قبل سنين، وهي ما غيّرتها من وقتها.", "It leaked from a bakery site years ago, and she never changed it."),
      };
    },
    function omar(T) {
      const [car, carAr] = pick([["Patrol", "باترول"], ["Tahoe", "تاهو"], ["Camry", "كامري"], ["Mustang", "موستنج"], ["Accord", "أكورد"], ["Sonata", "سوناتا"]]);
      const year = ri(2012, 2020);
      const ans = `${car}_${year}`;
      return {
        name: T("عمر", "Omar"), initial: T("ع", "O"), handle: "@omar.drives", email: "omar.drives@example.com",
        bio: T("سيارات وطلعات بر 🏜️", "Cars and desert trips 🏜️"), stats: [174, "2,230", 390],
        posts: [
          { t: T(`أول سيارة لي ${carAr} ${tag("car", car)} موديل ${mark("year", year)}، ما أنساها`, `My first car: ${tag("car", car)}, model ${mark("year", year)}. Never forget it`), w: "قبل 3 أيام" },
          { t: T(`أحب الـ ${mark("sym", "_")} في كلمات المرور، شكلها مرتب`, `I like using ${mark("sym", "_")} in passwords. Looks neat`), w: "قبل أسبوع" },
          { t: T("كلمة مروري نفسها في كل المواقع 😂", "Same password on every site 😂"), w: "قبل أسبوعين" },
          { t: T("طلعة بر الويكند 🔥", "Desert trip this weekend 🔥"), w: "قبل شهر" },
        ],
        breach: { site: "RideClub", year: 2024, type: "plain", plain: ans },
        answers: [ans], show: ans,
        hints: T(["كلمته وحدة في كل المواقع… والمواقع تتسرّب", "سيارة + _ + سنة"], ["One password for every site… and sites get breached", "Car + _ + year"]),
        parts: [{ v: car, l: T("أول سيارة", "First car") }, { v: "_", l: T("رمزه", "His symbol") }, { v: String(year), l: T("الموديل", "Model year") }], clues: ["car", "year", "sym"],
        why: T("تسرّبت من منتدى سيارات، ويستخدم نفس الكلمة في كل مكان.", "It leaked from a car forum, and he uses the same password everywhere."),
      };
    },
  ],

  hard: [
    function muneera(T) {
      const pool = [["Abdullah", "عبدالله"], ["Mohammed", "محمد"], ["Sara", "سارة"], ["Jawaher", "جواهر"], ["Hamad", "حمد"], ["Lulwa", "لولوة"], ["Nawaf", "نواف"], ["Dana", "دانة"]];
      const kids = [];
      while (kids.length < 3) { const k = pool.splice(rnd(pool.length), 1)[0]; if (!kids.some(x => x[0][0] === k[0][0])) kids.push(k); }
      const year = ri(2008, 2016);
      const ini = kids.map(k => k[0][0]).join("");
      const ans = ini + year;
      const tags = kids.map(k => tag("kids", k[0])).join(" ");
      return {
        name: T("منيرة", "Muneera"), initial: T("م", "M"), handle: "@muneera.home", email: "muneera.home@example.com",
        bio: T("أم لثلاثة 💛 · الشرقية", "Mom of three 💛 · Eastern Province"), stats: [215, "1,870", 330],
        posts: [
          { t: T(`عيالي من الكبير للصغير ${tags} 🤍 الله يحفظهم`, `My kids, oldest to youngest ${tags} 🤍`), w: "قبل 4 أيام" },
          { t: T(`${2026 - year} سنة على زواجنا 💍 من سنة ${mark("year", year)} وحنا مع بعض`, `${2026 - year} years married 💍 together since ${mark("year", year)}`), w: "قبل أسبوعين" },
          { t: T(`نصيحة لصديقاتي: حطّوا في كلمة المرور ${mark("rule", "أول حرف من أسماء عيالكم بالترتيب")} وبعدها سنة زواجكم، محد بيعرفها 😌`, `Tip for my friends: make your password ${mark("rule", "the first letter of each kid's name, in order")}, then your wedding year. Nobody will figure it out 😌`), w: "قبل شهر" },
          { t: T("عزومة الجمعة عندنا 🍲", "Friday family lunch at our place 🍲"), w: "قبل شهر" },
        ],
        breach: { site: "FamilyCloud", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["شوف نصيحتها لصديقاتها", "أول حرف من كل اسم بالترتيب + سنة الزواج"], ["Read her tip for her friends", "First letter of each name in order + wedding year"]),
        parts: [{ v: ini, l: T("أول حروف العيال", "Kids' initials") }, { v: String(year), l: T("سنة الزواج", "Wedding year") }], clues: ["kids", "rule", "year"],
        why: T("الحروف الأولى تبان ذكية، بس الأسماء وترتيبها والسنة كلها منشورة.", "Initials look clever, but the names, their order and the year are all public."),
      };
    },
    function yousef(T) {
      const [dog, dogAr] = pick([["Rocky", "روكي"], ["Bruno", "برونو"], ["Toby", "توبي"], ["Zorro", "زورو"], ["Oscar", "أوسكار"], ["Buddy", "بادي"]]);
      const year = ri(2016, 2023);
      const ans = reverse(dog) + year;
      return {
        name: T("يوسف", "Yousef"), initial: T("ي", "Y"), handle: "@yousef.k9", email: "yousef.k9@example.com",
        bio: T("مدرّب كلاب 🐕 · الخبر", "Dog trainer 🐕 · Khobar"), stats: [97, "1,505", 230],
        posts: [
          { t: T(`${dogAr} معنا من سنة ${mark("year", year)} وصار واحد من العيلة 🐶 ${tag("dog", dog)}`, `${dog} has been with us since ${mark("year", year)}. He's family now 🐶 ${tag("dog", dog)}`), w: "قبل 4 أيام" },
          { t: T(`حيلة ذكية: أكتب اسم كلبي ${mark("rev", "بالمقلوب")} في كلمة المرور وبعده السنة اللي جاء فيها، محد بيفكر فيها 🧠`, `Smart trick: I write my dog's name ${mark("rev", "backwards")} in my password, then the year he joined us. Nobody would think of that 🧠`), w: "قبل أسبوعين" },
          { t: T("تمرين الصباح مع الشلة 🦮", "Morning training with the pack 🦮"), w: "قبل شهر" },
        ],
        breach: { site: "PetCare", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["قرأت حيلته الذكية؟", "اسم الكلب بالمقلوب + سنة"], ["Did you read his smart trick?", "Dog's name backwards + year"]),
        parts: [{ v: dog, l: T("اسم الكلب", "Dog's name") }, { v: "↺", l: T("بالمقلوب", "Reversed") }, { v: String(year), l: T("السنة", "Year") }], clues: ["dog", "rev", "year"],
        why: T("قلب الاسم ما يحمي، لأن أدوات الاختراق تجرّب المقلوب تلقائيًا.", "Reversing a name doesn't help. Cracking tools try reversed words automatically."),
      };
    },
    function faisal(T) {
      const word = pick(["Falcon", "Shadow", "Phoenix", "Tiger", "Desert", "Storm"]);
      const year = ri(2015, 2024);
      const ans = leet(word) + year;
      return {
        name: T("فيصل", "Faisal"), initial: T("ف", "F"), handle: "@faisal.dev", email: "faisal.dev@example.com",
        bio: T("مبرمج · قهوة وكود ☕", "Developer · coffee and code ☕"), stats: [64, "880", 150],
        posts: [
          { t: T(`شعاري في الحياة ${tag("word", word)} 🦅`, `My motto in life: ${tag("word", word)} 🦅`), w: "قبل 3 أيام" },
          { t: T(`تخرجت سنة ${mark("year", year)} والحمدلله 🎓`, `Graduated in ${mark("year", year)} 🎓`), w: "قبل أسبوع" },
          { t: T(`نصيحة أمنية: خذ كلمة تحبها وبدّل حروفها برموز ${mark("leet", "a=@ و e=3 و i=1 و o=0 و s=$")}، وحط بعدها سنة تخرجك 💪`, `Security tip: take a word you love and swap letters for symbols ${mark("leet", "a=@, e=3, i=1, o=0, s=$")}, then add your graduation year 💪`), w: "قبل أسبوعين" },
          { t: T("كود ثم قهوة ثم كود ☕", "Code, coffee, code ☕"), w: "قبل شهر" },
        ],
        breach: { site: "DevForum", year: 2025, type: "hash" },
        answers: [ans], show: ans,
        hints: T(["شوف نصيحته الأمنية", "الشعار بعد تبديل الحروف + سنة التخرج"], ["Check his security tip", "Motto with swapped letters + graduation year"]),
        parts: [{ v: word, l: T("الشعار", "Motto") }, { v: "a→@ o→0", l: T("تبديل الحروف", "Letter swaps") }, { v: String(year), l: T("سنة التخرج", "Graduation year") }], clues: ["word", "leet", "year"],
        why: T("تبديل الحروف برموز نمط معروف، وأدوات الاختراق تجربه تلقائيًا.", "Swapping letters for symbols is a well-known pattern, and cracking tools try it automatically."),
      };
    },
  ],

  boss: [
    function hamad(T) {
      const [wife] = pick([["Maha"], ["Hind"], ["Nouf"], ["Amal"], ["Asma"], ["Ghada"]]);
      const wed = ri(2012, 2019);
      const [kid, kidAr] = pick([["Rakan", "راكان"], ["Hamza", "حمزة"], ["Yazan", "يزن"], ["Zaid", "زيد"], ["Talal", "طلال"], ["Hatem", "حاتم"]]);
      const born = ri(2023, 2026);
      const old = wife + wed;
      const ans = kid + born;
      return {
        name: T("حمد", "Hamad"), initial: T("ح", "H"), handle: "@hamad.dad", email: "hamad.dad@example.com",
        bio: T(`أبو ${kidAr} · الجبيل`, `${kid}'s dad · Jubail`), stats: [77, "690", 165],
        posts: [
          { t: T(`بعد التسريب ${mark("rule", "غيّرت كلمة المرور لنفس الفكرة")}، بس صارت عن ولدي بدال زوجتي 😅`, `After the leak I ${mark("rule", "changed my password using the same idea")}, just about my son instead of my wife 😅`), w: "اليوم" },
          { t: T(`الحمدلله جانا ${kidAr} ${tag("kid", kid)} 🤍 مواليد ${mark("year", born)}`, `Welcome to the world, ${tag("kid", kid)} 🤍 born ${mark("year", born)}`), w: "قبل شهر" },
          { t: T("شاهي العصر في البر ما يتعوّض ☕", "Afternoon tea in the desert, nothing beats it ☕"), w: "قبل شهرين" },
        ],
        breach: { site: "CarRental", year: 2022, type: "both", plain: old },
        answers: [ans], show: ans,
        hints: T(["شوف كلمته القديمة في التسريب، وش كانت فكرتها؟", "نفس النمط: اسم ولده + سنة ميلاده"], ["Look at his old leaked password. What was the idea?", "Same pattern: son's name + birth year"]),
        parts: [{ v: old, l: T("القديمة من التسريب", "Old one from the leak") }], sep: "→", clues: ["rule", "kid", "year"],
        why: T("الكلمة القديمة كشفت طريقة تفكيره، فالجديدة انكشفت من منشوراته.", "The old password revealed how he thinks, so his posts gave away the new one."),
      };
    },
    function nasser(T) {
      const word = pick(["Qahwa", "Karak", "Najd", "Sadu", "Dallah", "Majlis"]);
      const n = ri(1, 6);
      const old = word + pad2(n);
      const ans = word + pad2(n + 2);
      return {
        name: T("ناصر", "Nasser"), initial: T("ن", "N"), handle: "@nasser.ops", email: "nasser.ops@example.com",
        bio: T("دعم فني · الشرقية", "IT support · Eastern Province"), stats: [52, "430", 98],
        posts: [
          { t: T(`النظام يجبرني أغير كلمة المرور كل شوي 😤 أنا ${mark("rule", "أزيد الرقم واحد")} وخلاص`, `The system keeps forcing me to change my password 😤 I just ${mark("rule", "add one to the number")}`), w: "اليوم" },
          { t: T(`من بعد التسريب الأخير ${mark("count", "غيّرتها مرتين")} 🙄`, `Since the last leak I've ${mark("count", "changed it twice")} 🙄`), w: "قبل يومين" },
          { t: T("الدلّة ما تفارق المكتب ☕", "The coffee pot never leaves my desk ☕"), w: "قبل أسبوع" },
        ],
        breach: { site: "CloudDesk", year: 2025, type: "both", plain: old },
        answers: [ans], show: ans,
        hints: T(["كم مرة غيّرها من بعد التسريب؟", "نفس الكلمة + الرقم بعد زيادته مرتين"], ["How many times did he change it since the leak?", "Same word + the number increased twice"]),
        parts: [{ v: old, l: T("القديمة من التسريب", "Old one from the leak") }], sep: "→", clues: ["rule", "count"],
        why: T("زيادة رقم على كلمة قديمة نمط مكشوف، واللي عنده القديمة يوصل للجديدة.", "Bumping a number on an old password is an obvious pattern. Whoever has the old one can reach the new one."),
      };
    },
  ],
};

const LEVEL_AR = { easy: "سهل", medium: "متوسط", hard: "صعب", boss: "الزعيم" };
const LEVEL = { ar: LEVEL_AR, en: { easy: "Easy", medium: "Medium", hard: "Hard", boss: "Boss" } };
const WHEN_EN = { "اليوم": "today", "قبل يوم": "1 day ago", "قبل يومين": "2 days ago", "قبل 3 أيام": "3 days ago", "قبل 4 أيام": "4 days ago",
  "قبل 5 أيام": "5 days ago", "قبل 6 أيام": "6 days ago", "قبل أسبوع": "1 week ago", "قبل أسبوعين": "2 weeks ago", "قبل 3 أسابيع": "3 weeks ago",
  "قبل شهر": "1 month ago", "قبل شهرين": "2 months ago", "قبل سنة": "1 year ago" };
const langOf = l => (l === "en" ? "en" : "ar");
const trOf = lang => (lang === "en" ? (ar, en) => en : ar => ar);
/* Build one target from a template in the given language. */
function make(fn, lang) {
  const t = fn(trOf(lang));
  if (lang === "en") t.posts = t.posts.map(p => ({ ...p, w: WHEN_EN[p.w] || p.w }));
  return t;
}
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
    const t = make(fn, "ar");
    return { id, level: lvl, levelAr: LEVEL_AR[lvl], name: t.name, handle: t.handle,
      breach: t.breach ? t.breach.type : null, enabled: !config.disabled.has(id), need: NEED[lvl] };
  });
}
function preview(id) {
  const e = byId[id];
  if (!e) return null;
  return { id, lvl: LEVEL_AR[e.lvl], ...make(e.fn, "ar") };
}

function buildTargets(lang = "ar") {
  const pools = {};
  for (const l of Object.keys(TEMPLATES)) { pools[l] = enabledOf(l); if (pools[l].length < NEED[l]) pools[l] = [...TEMPLATES[l]]; }
  const out = [];
  for (const lvl of PLAN) {
    const gen = pools[lvl].length > 1 ? pools[lvl].splice(rnd(pools[lvl].length), 1)[0] : pools[lvl][0];
    out.push({ ...make(gen, lang), tid: gen.name, lvl: LEVEL[lang][lvl] });
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
  const base = [...new Set(words.map(w => String(w).replace(/^#/, "").trim().slice(0, 24)).filter(Boolean))].slice(0, 6);
  const toks = [...new Set(base.flatMap(w => [w, reverse(w), leet(w), leet(w.toLowerCase())]))];
  const n = toks.length, combos = SEPS.length * SUFS.length;
  // Same search space as enumerating every combination, but counted and matched directly
  // so one request costs well under a millisecond instead of ~100ms of CPU.
  const count = n * SUFS.length + n * n * combos + n * n * n * combos;
  const tn = new Set(toks.map(norm)), tl = [...tn];
  let hit = null;
  const fits = core => {
    if (tn.has(core)) return true;
    for (const sp of SEPS) for (const a of tl) {
      if (!core.startsWith(a + sp)) continue;
      const r1 = core.slice(a.length + sp.length);
      if (tn.has(r1)) return true;
      for (const b of tl) if (r1.startsWith(b + sp) && tn.has(r1.slice(b.length + sp.length))) return true;
    }
    return false;
  };
  for (const ans of answers) {
    const w = norm(ans);
    for (const f of SUFS) if (w.endsWith(f) && fits(w.slice(0, w.length - f.length))) { hit = ans; break; }
    if (hit) break;
  }
  const samples = [];
  for (let i = 0; i < 48 && n; i++) {
    const k = 1 + rnd(3), sp = k > 1 ? pick(SEPS) : "";
    samples.push(Array.from({ length: k }, () => pick(toks)).join(sp) + pick(SUFS));
  }
  return { count, hit, samples, words: base };
}

/* ---------------- sessions ---------------- */
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL_MS) sessions.delete(id);
}, 60_000).unref();

function newSession(name, lang) {
  lang = langOf(lang);
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  const id = crypto.randomBytes(16).toString("hex");
  const used = new Set([...sessions.values()].map(x => x.code));
  let code; do { code = String(ri(100, 999)); } while (used.has(code) && used.size < 800);
  const s = { id, code, name, lang, startedAt: Date.now(), roundSecs: config.roundSecs, targets: buildTargets(lang), idx: 0, score: 0, results: [], saved: null, touched: Date.now() };
  startTarget(s);
  sessions.set(id, s);
  return s;
}
function activeCount(ms = 5 * 60 * 1000) {
  const now = Date.now(); let n = 0;
  for (const s of sessions.values()) if (now - s.touched < ms) n++;
  return n;
}
/* Live view for booth helpers: the current target of every recent, unfinished game. */
function liveSessions(ms = 10 * 60 * 1000) {
  const now = Date.now(), out = [];
  for (const s of sessions.values()) {
    if (s.saved || now - s.touched > ms) continue;
    const t = s.targets[s.idx], c = s.cur;
    out.push({
      code: s.code, name: s.name, lang: s.lang, idx: s.idx, total: s.targets.length, score: s.score,
      lvl: t.lvl, target: t.name, handle: t.handle, show: t.show, parts: t.parts, sep: t.sep || "+",
      breach: t.breach ? t.breach.type : null, why: t.why,
      tries: c.tries, breachUsed: c.breachUsed, ended: c.ended, ok: c.ended ? !!(c.result && c.result.ok) : null,
      left: Math.round(leftOf(s)), started: s.startedAt || 0, touched: s.touched,
    });
  }
  return out.sort((a, b) => b.started - a.started);
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
  config, hooks, setEnabled, setDisabled, setRoundSecs, catalog, preview, activeCount, liveSessions,
  newSession, getSession, startTarget, leftOf, guard, endTarget, publicTarget, patternOf, hasHash, bruteForce, norm,
  _templates: TEMPLATES, _buildTargets: buildTargets,
};
