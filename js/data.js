/* LifePlay - ゲームデータ定義
 * 座標系: x = 東(+) / 西(-)、z = 南(+) / 北(-)。ワールドは -200〜200 の正方形。
 */
window.LP = window.LP || {};

LP.SAVE_KEY = "lifeplay_save_v2";
LP.WORLD_HALF = 195;
LP.SEA_Z = 166; // これより南は海

LP.util = {
  clamp: (v, min, max) => Math.min(Math.max(v, min), max),
  lerp: (a, b, t) => a + (b - a) * t,
  dist2: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),
  // 再現性のある乱数(ワールド生成用)
  rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  formatTime(min) {
    const h = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  },
};

// エリア(上から順に判定)
LP.ZONES = [
  { id: "town", name: "リーフタウン", x1: -48, x2: 48, z1: -48, z2: 48, color: "#c9b48a" },
  { id: "farm", name: "ひだまり農場", x1: -175, x2: -70, z1: -160, z2: -60, color: "#b8c96a" },
  { id: "forest", name: "ささやきの森", x1: 60, x2: 192, z1: -192, z2: -25, color: "#2f6b3a" },
  { id: "ruins", name: "古代遺跡", x1: 75, x2: 185, z1: 45, z2: 150, color: "#8d8273" },
  { id: "beach", name: "しおかぜ海岸", x1: -195, x2: 70, z1: 124, z2: 195, color: "#e8d9a0" },
];
LP.FIELD_NAME = "みどり平原";

// 建物: door は建物中心からの扉方向(s=南, n=北, e=東, w=西)
LP.BUILDINGS = [
  { id: "home", name: "自宅", x: -30, z: 28, w: 12, d: 10, h: 7, wall: "#f3e2c0", roof: "#b5523b", door: "n", enter: true },
  { id: "inn", name: "宿屋「月のしずく」", x: -26, z: -26, w: 16, d: 12, h: 10, wall: "#efe0c8", roof: "#4a6fa5", door: "s", enter: true },
  { id: "shop", name: "雑貨屋", x: 26, z: -26, w: 14, d: 11, h: 8, wall: "#f6d7a7", roof: "#3f8f5a", door: "s", enter: true },
  { id: "hall", name: "役所", x: 0, z: -36, w: 20, d: 12, h: 12, wall: "#e9e6df", roof: "#7a4b9a", door: "s", enter: true },
  { id: "smith", name: "鍛冶屋", x: 28, z: 26, w: 13, d: 11, h: 8, wall: "#b9a58e", roof: "#5b4636", door: "n", enter: true },
  { id: "house1", name: "民家", x: -40, z: 4, w: 9, d: 9, h: 6, wall: "#f0d9c4", roof: "#c0673e", door: "e" },
  { id: "house2", name: "民家", x: 40, z: 2, w: 9, d: 9, h: 6, wall: "#dfe8f0", roof: "#3c6e8f", door: "w" },
  { id: "house3", name: "民家", x: -8, z: 40, w: 9, d: 8, h: 6, wall: "#f4ecd8", roof: "#8f3c3c", door: "n" },
  { id: "house4", name: "民家", x: 10, z: 40, w: 9, d: 8, h: 6, wall: "#e5f0dc", roof: "#5d7d2f", door: "n" },
  { id: "barn", name: "納屋", x: -150, z: -140, w: 16, d: 12, h: 9, wall: "#a23b2f", roof: "#5a3a2a", door: "s" },
];

LP.ITEMS = {
  wood: { name: "木材", price: 6, icon: "🪵" },
  stone: { name: "石", price: 5, icon: "🪨" },
  ore: { name: "鉄鉱石", price: 18, icon: "⛏️" },
  crystal: { name: "古代の水晶", price: 120, icon: "💎" },
  herb: { name: "薬草", price: 10, icon: "🌿", food: { hp: 15, energy: 5, hunger: 2 } },
  flower: { name: "花", price: 8, icon: "🌸" },
  fish: { name: "魚", price: 14, icon: "🐟", food: { hp: 4, energy: 8, hunger: 15 } },
  bigfish: { name: "大物の魚", price: 60, icon: "🐠", food: { hp: 10, energy: 20, hunger: 30 } },
  wheat: { name: "小麦", price: 15, icon: "🌾" },
  turnip: { name: "カブ", price: 22, icon: "🥬", food: { hp: 3, energy: 6, hunger: 12 } },
  jelly: { name: "スライムゼリー", price: 12, icon: "🟢" },
  bread: { name: "パン", price: 20, icon: "🍞", food: { hp: 5, energy: 15, hunger: 35 } },
  stew: { name: "シチュー", price: 45, icon: "🍲", food: { hp: 25, energy: 35, hunger: 60 } },
  potion: { name: "回復薬", price: 50, icon: "🧪", food: { hp: 60, energy: 10, hunger: 0 } },
  seed_wheat: { name: "小麦の種", price: 10, icon: "🌱", seed: "wheat" },
  seed_turnip: { name: "カブの種", price: 14, icon: "🌱", seed: "turnip" },
  pendant: { name: "誓いのペンダント", price: 800, icon: "💍", gift: false },
  sword: { name: "鉄の剣", price: 200, icon: "🗡️", equip: "weapon", power: 6 },
  rod: { name: "上等な釣り竿", price: 150, icon: "🎣", equip: "rod", power: 2 },
};

LP.CROPS = {
  wheat: { name: "小麦", days: 3, yield: [2, 3], item: "wheat" },
  turnip: { name: "カブ", days: 4, yield: [1, 3], item: "turnip" },
};

LP.SHOP_STOCK = {
  shop: ["seed_wheat", "seed_turnip", "bread", "stew", "potion", "pendant"],
  smith: ["sword", "rod"],
};

LP.JOBS = {
  freelancer: { name: "自由人", desc: "何でもこなす万能型。スタミナ+20", money: 200, bonus: { maxEnergy: 20 }, items: { bread: 2 } },
  farmer: { name: "農家", desc: "農業スキル+2。種を多めに持って始まる", money: 150, skills: { farming: 3 }, items: { seed_wheat: 6, seed_turnip: 4 } },
  fisher: { name: "漁師", desc: "釣りスキル+2。大物が釣れやすい", money: 150, skills: { fishing: 3 }, items: { fish: 3 } },
  adventurer: { name: "冒険者", desc: "戦闘スキル+2。鉄の剣を装備して始まる", money: 120, skills: { combat: 3 }, items: { potion: 2 }, equip: { weapon: "sword" } },
  merchant: { name: "商人", desc: "売値+20%。所持金が多い", money: 500, skills: { social: 2 }, items: {} },
};

LP.SKILLS = {
  farming: "農業",
  fishing: "釣り",
  gathering: "採集",
  combat: "戦闘",
  social: "交友",
  work: "仕事",
};

LP.APPEARANCE_OPTIONS = {
  hair: ["#2b1d14", "#6b3e1f", "#d9a441", "#e8e2d0", "#c0392b", "#3a6fd8", "#d96bb8"],
  skin: ["#ffe0c4", "#f5c9a0", "#d9a07a", "#a8704f", "#6e4630"],
  outfit: ["#3f7fd8", "#d84f4f", "#3fae6a", "#8e5bd8", "#e0a030", "#2b2f3a", "#f2f2f2"],
};

// NPC: schedule は [開始時刻(時), x, z] の配列。時刻順。
LP.NPCS = [
  {
    id: "ord", name: "オルド町長", romance: false, likes: ["crystal", "stew"],
    look: { hair: "#e8e2d0", skin: "#f5c9a0", outfit: "#5a3d8a", style: "short" },
    schedule: [[0, -7, -27], [8, -7, -27], [12, 4, 6], [15, -7, -27], [20, -36, 18]],
    lines: ["ようこそリーフタウンへ。困ったことがあれば役所に来なさい。", "役所の掲示板には毎日新しい依頼が貼られるぞ。", "君のおかげで町が明るくなった気がするよ。"],
  },
  {
    id: "mira", name: "ミラ", romance: true, likes: ["flower", "bigfish", "crystal"],
    look: { hair: "#d96bb8", skin: "#ffe0c4", outfit: "#e0a030", style: "long" },
    schedule: [[0, 36, 14], [8, 26, -18], [12, 6, 6], [14, 26, -18], [19, 36, 14]],
    lines: ["いらっしゃい！雑貨屋のミラだよ。", "花をもらうと、一日が明るくなるんだ。", "ねえ、今度海岸を一緒に散歩しない？"],
  },
  {
    id: "ren", name: "レン", romance: true, likes: ["fish", "bigfish", "bread"],
    look: { hair: "#2b1d14", skin: "#d9a07a", outfit: "#3a6fd8", style: "short" },
    schedule: [[0, 12, 34], [6, -16, 176], [12, -30, 140], [16, -16, 176], [20, 12, 34]],
    lines: ["桟橋の先は大物が釣れるポイントなんだ。", "潮の香りが好きでさ。毎朝ここに来てる。", "釣り、教えようか？Eキーで竿を投げて、合図が来たらもう一度Eだ。"],
  },
  {
    id: "sora", name: "ソラ", romance: true, likes: ["turnip", "wheat", "flower"],
    look: { hair: "#d9a441", skin: "#f5c9a0", outfit: "#3fae6a", style: "long" },
    schedule: [[0, -6, 34], [6, -120, -100], [12, -140, -125], [15, -110, -90], [19, -6, 34]],
    lines: ["畑は毎日水をあげるのが大事なんだよ。", "種を植えて、水をあげて、数日待てば収穫できるよ。", "季節が変わると、畑の景色も変わるんだ。"],
  },
  {
    id: "bale", name: "バレ", romance: false, likes: ["ore", "sword", "jelly"],
    look: { hair: "#6b3e1f", skin: "#a8704f", outfit: "#2b2f3a", style: "short" },
    schedule: [[0, 28, 18], [7, 30, 16], [18, 22, 6], [22, 28, 18]],
    lines: ["鍛冶屋のバレだ。いい剣が欲しけりゃ金を持ってきな。", "遺跡の岩からは鉄鉱石が採れる。", "スライムは弱いが、数が多いと厄介だぞ。"],
  },
  {
    id: "ayame", name: "アヤメ", romance: true, likes: ["herb", "flower", "potion"],
    look: { hair: "#2b1d14", skin: "#ffe0c4", outfit: "#f2f2f2", style: "long" },
    schedule: [[0, -26, -16], [8, -20, -16], [13, 70, -40], [16, -20, -16], [21, -26, -16]],
    lines: ["宿屋のアヤメです。疲れたら休んでいってね。", "森の薬草は体にいいのよ。", "夜更かしは体に毒ですよ？"],
  },
  {
    id: "kuro", name: "クロ", romance: false, likes: ["crystal", "jelly", "stew"],
    look: { hair: "#c0392b", skin: "#f5c9a0", outfit: "#d84f4f", style: "short" },
    schedule: [[0, 60, 40], [7, 100, -60], [12, 120, 90], [17, 60, 40]],
    lines: ["遺跡の奥で古代の水晶を見たって噂だぜ。", "森と遺跡にはスライムが出る。Fキーで攻撃だ！", "冒険は準備が九割。回復薬は持ったか？"],
  },
];

LP.QUEST_POOL = [
  { item: "wood", min: 3, max: 8, reward: 12 },
  { item: "stone", min: 3, max: 8, reward: 11 },
  { item: "fish", min: 2, max: 5, reward: 25 },
  { item: "herb", min: 2, max: 5, reward: 20 },
  { item: "wheat", min: 2, max: 6, reward: 28 },
  { item: "jelly", min: 2, max: 5, reward: 22 },
  { item: "ore", min: 1, max: 3, reward: 40 },
  { item: "flower", min: 2, max: 4, reward: 18 },
];

LP.SEASONS = [
  { name: "春", grass: "#6fbf5a", leaf: "#4f9e45", leaf2: "#f2a7c8" },
  { name: "夏", grass: "#4fa64a", leaf: "#2f7d34", leaf2: "#3f9a3c" },
  { name: "秋", grass: "#a8a24a", leaf: "#d2782c", leaf2: "#c9472f" },
  { name: "冬", grass: "#dfe8ee", leaf: "#7f9a8a", leaf2: "#ffffff" },
];
LP.DAYS_PER_SEASON = 7;
