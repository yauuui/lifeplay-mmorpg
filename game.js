const SAVE_KEY = "lifeplay_2026_save";

const world = {
  width: 2200,
  height: 1800,
};

const zoneDefs = {
  town: { x: 980, y: 730, w: 420, h: 350, label: "街" },
  farm: { x: 180, y: 190, w: 520, h: 340, label: "農場" },
  forest: { x: 1370, y: 180, w: 620, h: 620, label: "森" },
  beach: { x: 650, y: 1260, w: 670, h: 420, label: "海岸" },
  ruins: { x: 1470, y: 970, w: 500, h: 500, label: "遺跡" },
  cityHall: { x: 1090, y: 760, w: 120, h: 120, label: "役所" },
  inn: { x: 820, y: 760, w: 120, h: 120, label: "宿" },
};

const defaultPlayer = () => ({
  name: "ユウ",
  x: 1090,
  y: 1180,
  radius: 16,
  speed: 220,
  money: 120,
  energy: 100,
  hunger: 100,
  health: 100,
  job: "自由人",
  day: 1,
  time: 8 * 60,
  skill: { farming: 1, fishing: 1, combat: 1, social: 1, work: 1 },
  inventory: {
    wheat: 0,
    fish: 0,
    meat: 0,
    wood: 0,
    herb: 0,
    stone: 0,
    crystal: 0,
    bread: 0,
  },
  relationship: {},
  reputation: 0,
  marriedTo: null,
  selectedTarget: null,
  lastNpcId: null,
});

const npcTemplate = [
  { id: "mayor", name: "オルド市長", x: 1115, y: 785, color: "#f7b267", role: "mayor", home: "cityHall", affinity: 12, romance: false },
  { id: "mira", name: "ミラ", x: 980, y: 870, color: "#ff9bd2", role: "merchant", home: "town", affinity: 18, romance: true },
  { id: "ren", name: "レン", x: 730, y: 1040, color: "#86d3ff", role: "fisher", home: "beach", affinity: 20, romance: true },
  { id: "sora", name: "ソラ", x: 1860, y: 430, color: "#8dffb0", role: "farmer", home: "farm", affinity: 16, romance: true },
  { id: "bale", name: "バレ", x: 1720, y: 1170, color: "#d19cff", role: "guard", home: "ruins", affinity: 10, romance: false },
  { id: "ayame", name: "アヤメ", x: 855, y: 980, color: "#ffdf75", role: "healer", home: "inn", affinity: 15, romance: true },
  { id: "kuro", name: "クロ", x: 2100, y: 1320, color: "#ff7d7d", role: "adventurer", home: "forest", affinity: 14, romance: false },
];

const seasonNames = ["春", "夏", "秋", "冬"];
const itemLabels = {
  wheat: "小麦",
  fish: "魚",
  meat: "肉",
  wood: "木材",
  herb: "薬草",
  stone: "石",
  crystal: "水晶",
  bread: "パン",
};

const state = loadState();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const ui = {
  day: document.getElementById("day-text"),
  time: document.getElementById("time-text"),
  money: document.getElementById("money-text"),
  hp: document.getElementById("hp-text"),
  energy: document.getElementById("energy-text"),
  hunger: document.getElementById("hunger-text"),
  reputation: document.getElementById("reputation-text"),
  inventory: document.getElementById("inventory"),
  relationshipList: document.getElementById("relationship-list"),
  playerName: document.getElementById("player-name"),
  playerJob: document.getElementById("player-job"),
  locationBadge: document.getElementById("location-badge"),
  seasonBadge: document.getElementById("season-badge"),
  log: document.getElementById("log-panel"),
  skill: {
    farming: document.getElementById("skill-farming"),
    fishing: document.getElementById("skill-fishing"),
    combat: document.getElementById("skill-combat"),
    social: document.getElementById("skill-social"),
    work: document.getElementById("skill-work"),
  },
};

const keys = {};
const logs = state.logs || ["村が眠る前に、自由に生きる準備を始めよう。"];
let lastTime = 0;
let cameraX = 0;
let cameraY = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSeasonFromDay(day) {
  return seasonNames[(day - 1) % 4];
}

function formatTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getLocationName(x, y) {
  const names = [];
  for (const [key, zone] of Object.entries(zoneDefs)) {
    if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
      names.push(zone.label);
    }
  }
  if (names.length === 0) return "野原";
  return names[0];
}

function getNearestNpc() {
  let nearest = null;
  let nearestDist = Infinity;

  for (const npc of state.npcs) {
    const dx = npc.x - state.player.x;
    const dy = npc.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestDist && dist < 70) {
      nearest = npc;
      nearestDist = dist;
    }
  }

  return nearest;
}

function addLog(message) {
  logs.unshift(message);
  if (logs.length > 10) logs.pop();
  renderLog();
}

function renderLog() {
  ui.log.innerHTML = logs
    .slice(0, 10)
    .map((entry) => `<div class="log-entry">${entry}</div>`)
    .join("");
}

function updateUI() {
  ui.playerName.textContent = state.player.name;
  ui.playerJob.textContent = state.player.job;
  ui.day.textContent = `${state.player.day}日目`;
  ui.time.textContent = formatTime(state.player.time);
  ui.money.textContent = `${state.player.money}`;
  ui.hp.textContent = `${Math.round(state.player.health)}`;
  ui.energy.textContent = `${Math.round(state.player.energy)}`;
  ui.hunger.textContent = `${Math.round(state.player.hunger)}`;
  ui.reputation.textContent = `${state.player.reputation}`;

  ui.skill.farming.textContent = state.player.skill.farming;
  ui.skill.fishing.textContent = state.player.skill.fishing;
  ui.skill.combat.textContent = state.player.skill.combat;
  ui.skill.social.textContent = state.player.skill.social;
  ui.skill.work.textContent = state.player.skill.work;

  const inventoryHtml = Object.entries(itemLabels)
    .map(([key, label]) => `
      <div class="inventory-item">
        <span class="label">${label}</span>
        <strong>${state.player.inventory[key] || 0}</strong>
      </div>
    `)
    .join("");
  ui.inventory.innerHTML = inventoryHtml;

  const relationships = Object.entries(state.player.relationship)
    .sort((a, b) => b[1] - a[1])
    .map(([name, affection]) => {
      const npc = state.npcs.find((n) => n.name === name);
      const tag = npc && npc.role === "romance" ? "恋人" : "友達";
      return `
        <div class="relationship-row">
          <span>${name}</span>
          <span class="affinity">${affinity} ${tag}</span>
        </div>
      `;
    })
    .join("");

  ui.relationshipList.innerHTML = relationships || '<div class="relationship-row"><span>まだ誰もいません</span></div>';

  const currentLocation = getLocationName(state.player.x, state.player.y);
  ui.locationBadge.textContent = currentLocation;
  ui.seasonBadge.textContent = getSeasonFromDay(state.player.day);
}

function applyMovement(dt) {
  let moveX = 0;
  let moveY = 0;

  if (keys.ArrowLeft || keys.a) moveX -= 1;
  if (keys.ArrowRight || keys.d) moveX += 1;
  if (keys.ArrowUp || keys.w) moveY -= 1;
  if (keys.ArrowDown || keys.s) moveY += 1;

  const length = Math.hypot(moveX, moveY) || 1;
  const stepX = (moveX / length) * state.player.speed * dt;
  const stepY = (moveY / length) * state.player.speed * dt;

  state.player.x = clamp(state.player.x + stepX, 40, world.width - 40);
  state.player.y = clamp(state.player.y + stepY, 40, world.height - 40);

  cameraX = clamp(state.player.x - canvas.width / 2, 0, world.width - canvas.width);
  cameraY = clamp(state.player.y - canvas.height / 2, 0, world.height - canvas.height);
}

function advanceTime(dt) {
  state.player.time += dt * 60;
  if (state.player.time >= 24 * 60) {
    state.player.time -= 24 * 60;
    state.player.day += 1;
    addLog(`<strong>新しい日</strong> が始まった。`);
  }

  const hungerLoss = dt * 2.2;
  const energyLoss = dt * 1.5;
  state.player.hunger = clamp(state.player.hunger - hungerLoss, 0, 100);
  state.player.energy = clamp(state.player.energy - energyLoss, 0, 100);

  if (state.player.hunger <= 10) {
    state.player.health = clamp(state.player.health - dt * 5, 0, 100);
  }
  if (state.player.energy <= 10) {
    state.player.health = clamp(state.player.health - dt * 2, 0, 100);
  }

  if (state.player.health <= 0) {
    state.player.health = 100;
    state.player.energy = 60;
    state.player.hunger = 80;
    state.player.money = Math.max(0, state.player.money - 30);
    addLog(`<strong>体調が悪くなった。</strong> 宿で休んで回復した。`);
  }
}

function influencePlayerStats(energyCost, hungerCost, healthDelta, moneyDelta) {
  state.player.energy = clamp(state.player.energy - energyCost, 0, 100);
  state.player.hunger = clamp(state.player.hunger - hungerCost, 0, 100);
  state.player.health = clamp(state.player.health + healthDelta, 0, 100);
  state.player.money = Math.max(0, state.player.money + moneyDelta);
}

function gainSkill(skillName, amount = 1) {
  state.player.skill[skillName] = (state.player.skill[skillName] || 1) + amount;
}

function handlePlayerAction(action) {
  const currentLocation = getLocationName(state.player.x, state.player.y);
  const nearestNpc = getNearestNpc();

  if (action === "save") {
    saveGame();
    addLog("<strong>保存</strong>した。次に続けられる。 ");
    return;
  }

  if (action === "rest") {
    if (currentLocation === "街" || currentLocation === "村") {
      state.player.health = clamp(state.player.health + 30, 0, 100);
      state.player.energy = clamp(state.player.energy + 45, 0, 100);
      state.player.hunger = clamp(state.player.hunger + 25, 0, 100);
      state.player.money = Math.max(0, state.player.money - 10);
      addLog("宿で休んだ。体力と気力が回復した。 ");
    } else {
      addLog("ここでは休めない。街の宿へ行こう。 ");
    }
    return;
  }

  if (action === "talk") {
    if (nearestNpc) {
      const aff = state.player.relationship[nearestNpc.name] || 0;
      state.player.relationship[nearestNpc.name] = aff + 8;
      state.player.reputation += 2;
      gainSkill("social", 1);
      addLog(`${nearestNpc.name}と話した。${nearestNpc.name}の好感度が上がった。`);
      if (nearestNpc.romance && (state.player.relationship[nearestNpc.name] || 0) >= 60) {
        addLog(`${nearestNpc.name}は少しだけあなたを意識しているようだ。`);
      }
    } else {
      addLog("近くに話せる相手がいない。 ");
    }
    return;
  }

  if (action === "farm") {
    if (currentLocation === "農場") {
      influencePlayerStats(18, 16, 4, 0);
      const gain = 1 + Math.floor(state.player.skill.farming / 3);
      state.player.inventory.wheat += gain;
      gainSkill("farming", 1);
      state.player.reputation += 1;
      addLog(`農業で${gain}個の小麦を収穫した。`);
    } else {
      addLog("農場で作業しよう。 ");
    }
    return;
  }

  if (action === "fish") {
    if (currentLocation === "海岸") {
      influencePlayerStats(14, 10, 2, 0);
      const gain = 1 + Math.floor(state.player.skill.fishing / 3);
      state.player.inventory.fish += gain;
      gainSkill("fishing", 1);
      addLog(`釣りで${gain}匹の魚を手に入れた。`);
    } else {
      addLog("海岸で釣りをしよう。 ");
    }
    return;
  }

  if (action === "hunt") {
    if (currentLocation === "森" || currentLocation === "遺跡") {
      influencePlayerStats(20, 18, -2, 0);
      const gain = 1 + Math.floor(state.player.skill.combat / 3);
      state.player.inventory.meat += gain;
      gainSkill("combat", 1);
      state.player.reputation += 2;
      addLog(`狩猟で${gain}個の肉を手に入れた。`);
    } else {
      addLog("森か遺跡で狩りをしよう。 ");
    }
    return;
  }

  if (action === "work") {
    if (currentLocation === "街" || currentLocation === "役所") {
      const salaryBase = 18 + state.player.skill.work * 7;
      state.player.money += salaryBase;
      influencePlayerStats(18, 12, 0, 0);
      gainSkill("work", 1);
      state.player.job = "村人の仕事人";
      addLog(`町の仕事をこなした。報酬として${salaryBase}円を受け取った。`);
    } else {
      addLog("街の仕事場に戻ろう。 ");
    }
    return;
  }

  if (action === "court") {
    if (currentLocation === "街" || currentLocation === "役所") {
      const judgeRoll = Math.random();
      if (judgeRoll > 0.45) {
        state.player.reputation += 8;
        state.player.money += 30;
        addLog("裁判に勝利した。評判が上がり、報酬を得た。 ");
      } else {
        state.player.reputation = Math.max(0, state.player.reputation - 3);
        state.player.money = Math.max(0, state.player.money - 20);
        addLog("裁判に負けた。少し評判が落ちたが、次に活かそう。 ");
      }
    } else {
      addLog("役所で裁判の儀式に参加しよう。 ");
    }
    return;
  }

  if (action === "adventure") {
    if (currentLocation === "森" || currentLocation === "遺跡") {
      const fortune = Math.random();
      influencePlayerStats(16, 14, -4, 0);
      if (fortune > 0.5) {
        state.player.inventory.crystal += 1;
        state.player.money += 65;
        state.player.reputation += 5;
        addLog("冒険で古代水晶を発見した。価値ある財宝だ。 ");
      } else {
        state.player.inventory.stone += 2;
        state.player.money += 25;
        addLog("小さな洞窟を探索し、石材と経験を得た。 ");
      }
      gainSkill("combat", 1);
    } else {
      addLog("森や遺跡に行って冒険しよう。 ");
    }
    return;
  }

  addLog("まだ行動を決められていない。 ");
}

function tryInteract() {
  const nearestNpc = getNearestNpc();

  if (nearestNpc) {
    const relation = state.player.relationship[nearestNpc.name] || 0;
    if (nearestNpc.role === "mayor") {
      if (relation >= 50 && state.player.money >= 30 && !state.player.marriedTo) {
        state.player.marriedTo = nearestNpc.name;
        state.player.money -= 30;
        state.player.reputation += 15;
        addLog(`${nearestNpc.name}と結婚した。村の新しい生活が始まる。`);
        return;
      }
      addLog(`${nearestNpc.name}に会話をして、村の運営や生活のことを相談した。`);
      state.player.relationship[nearestNpc.name] = relation + 5;
      gainSkill("social", 1);
      return;
    }

    if (nearestNpc.romance && !state.player.marriedTo) {
      const aff = state.player.relationship[nearestNpc.name] || 0;
      state.player.relationship[nearestNpc.name] = aff + 12;
      if (aff >= 60) {
        addLog(`${nearestNpc.name}とはかなり親しくなった。結婚を考えてもいいかもしれない。`);
      } else {
        addLog(`${nearestNpc.name}と会話した。少しずつ距離が縮まっている。`);
      }
      gainSkill("social", 1);
      return;
    }

    state.player.relationship[nearestNpc.name] = (state.player.relationship[nearestNpc.name] || 0) + 6;
    addLog(`${nearestNpc.name}と雑談した。心の余裕ができた。`);
    return;
  }

  const location = getLocationName(state.player.x, state.player.y);
  if (location === "農場") handlePlayerAction("farm");
  else if (location === "海岸") handlePlayerAction("fish");
  else if (location === "森" || location === "遺跡") handlePlayerAction("hunt");
  else if (location === "街" || location === "役所") handlePlayerAction("work");
  else if (location === "野原") addLog("何も起きていない。村に戻ろう。 ");
  else addLog("ここで何かできる気がする。 ");
}

function saveGame() {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      player: state.player,
      npcs: state.npcs,
      logs,
    })
  );
}

function loadState() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    const player = defaultPlayer();
    return {
      player,
      npcs: npcTemplate.map((n) => ({ ...n, affection: n.affinity })),
      logs: ["新しい冒険が始まった。自由に生きろ。"],
    };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      player: { ...defaultPlayer(), ...parsed.player },
      npcs: parsed.npcs || npcTemplate.map((n) => ({ ...n, affection: n.affinity })),
      logs: parsed.logs || ["新しい冒険が始まった。自由に生きろ。"],
    };
  } catch (error) {
    return {
      player: defaultPlayer(),
      npcs: npcTemplate.map((n) => ({ ...n, affection: n.affinity })),
      logs: ["新しい冒険が始まった。自由に生きろ。"],
    };
  }
}

function drawWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#102b2f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const worldX = -cameraX;
  const worldY = -cameraY;

  ctx.fillStyle = "#1d742c";
  ctx.fillRect(worldX + 200, worldY + 200, 500, 300);

  ctx.fillStyle = "#2d8a57";
  ctx.fillRect(worldX + 1380, worldY + 180, 620, 620);

  ctx.fillStyle = "#4ea7ff";
  ctx.fillRect(worldX + 650, worldY + 1260, 670, 420);

  ctx.fillStyle = "#4d4a5c";
  ctx.fillRect(worldX + 1470, worldY + 970, 500, 500);

  ctx.fillStyle = "#a3d1ff";
  ctx.fillRect(worldX + 980, worldY + 730, 420, 350);

  ctx.fillStyle = "#ebcb85";
  ctx.fillRect(worldX + 820, worldY + 760, 120, 120);
  ctx.fillRect(worldX + 1090, worldY + 760, 120, 120);

  for (const [key, zone] of Object.entries(zoneDefs)) {
    ctx.strokeStyle = "rgba(104, 240, 255, 0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(worldX + zone.x, worldY + zone.y, zone.w, zone.h);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "16px sans-serif";
    ctx.fillText(zone.label, worldX + zone.x + 12, worldY + zone.y + 26);
  }

  for (const npc of state.npcs) {
    const drawX = npc.x - cameraX;
    const drawY = npc.y - cameraY;

    ctx.beginPath();
    ctx.fillStyle = npc.color;
    ctx.arc(drawX, drawY, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "13px sans-serif";
    ctx.fillText(npc.name, drawX + 16, drawY - 8);
  }

  const px = state.player.x - cameraX;
  const py = state.player.y - cameraY;

  ctx.beginPath();
  ctx.fillStyle = "#68f0ff";
  ctx.arc(px, py, state.player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(px, py, state.player.radius + 8, 0, Math.PI * 2);
  ctx.stroke();
}

function updateNpcWander(dt) {
  for (const npc of state.npcs) {
    npc.x += Math.sin((state.player.day * 3 + npc.x) * 0.02 + npc.affinity) * 0.18;
    npc.y += Math.cos((state.player.day * 4 + npc.y) * 0.03 + npc.affinity) * 0.18;
    npc.x = clamp(npc.x, 30, world.width - 30);
    npc.y = clamp(npc.y, 30, world.height - 30);
  }
}

function handleInput() {
  if (keys.e) {
    tryInteract();
    keys.e = false;
  }
  if (keys.q) {
    handlePlayerAction("talk");
    keys.q = false;
  }
  if (keys.s && !keys.sUsed) {
    saveGame();
    addLog("手動保存をした。 ");
    keys.sUsed = true;
  }
  if (!keys.s) keys.sUsed = false;
}

function tick(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.032);
  lastTime = timestamp;

  applyMovement(dt);
  updateNpcWander(dt);
  advanceTime(dt);
  handleInput();
  updateUI();
  drawWorld();
  requestAnimationFrame(tick);
}

function bindButtons() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "save") {
        saveGame();
        addLog("保存した。 ");
        return;
      }
      handlePlayerAction(action);
    });
  });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "q"].includes(key)) {
    event.preventDefault();
  }
  keys[key] = true;
  keys[event.key] = true;
  if (event.key === "e") keys.e = true;
  if (event.key === "q") keys.q = true;
  if (event.key === "s") keys.s = true;
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  keys[key] = false;
  keys[event.key] = false;
  if (event.key === "e") keys.e = false;
  if (event.key === "q") keys.q = false;
  if (event.key === "s") keys.s = false;
});

bindButtons();
updateUI();
renderLog();
drawWorld();
requestAnimationFrame(tick);
