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
  rotationY: 0,
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
const gameRoot = document.getElementById("gameRoot");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec7ff);
scene.fog = new THREE.Fog(0x8ec5ff, 35, 220);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(30, 18, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(gameRoot.clientWidth, gameRoot.clientHeight);
gameRoot.appendChild(renderer.domElement);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

let playerMesh = null;
const npcMeshes = new Map();
let cameraYaw = 0;
let cameraPitch = 0.9;
let pointerDown = false;
let lastTime = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getSeasonFromDay(day) {
  return seasonNames[(day - 1) % 4];
}

function getLocationName(x, y) {
  for (const zone of Object.values(zoneDefs)) {
    if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
      return zone.label;
    }
  }
  return "野原";
}

function getNearestNpc() {
  let nearest = null;
  let nearestDist = Infinity;

  for (const npc of state.npcs) {
    const dx = npc.x - state.player.x;
    const dy = npc.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestDist && dist < 80) {
      nearest = npc;
      nearestDist = dist;
    }
  }

  return nearest;
}

function addLog(message) {
  logs.unshift(message);
  if (logs.length > 12) logs.pop();
  renderLog();
}

function renderLog() {
  ui.log.innerHTML = logs
    .slice(0, 12)
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
          <span class="affinity">${affection} ${tag}</span>
        </div>
      `;
    })
    .join("");

  ui.relationshipList.innerHTML = relationships || '<div class="relationship-row"><span>まだ誰もいません</span></div>';

  const currentLocation = getLocationName(state.player.x, state.player.y);
  ui.locationBadge.textContent = currentLocation;
  ui.seasonBadge.textContent = getSeasonFromDay(state.player.day);
}

function gainSkill(skillName, amount = 1) {
  state.player.skill[skillName] = (state.player.skill[skillName] || 1) + amount;
}

function influencePlayerStats(energyCost, hungerCost, healthDelta, moneyDelta) {
  state.player.energy = clamp(state.player.energy - energyCost, 0, 100);
  state.player.hunger = clamp(state.player.hunger - hungerCost, 0, 100);
  state.player.health = clamp(state.player.health + healthDelta, 0, 100);
  state.player.money = Math.max(0, state.player.money + moneyDelta);
}

function advanceTime(dt) {
  state.player.time += dt * 60;
  if (state.player.time >= 24 * 60) {
    state.player.time -= 24 * 60;
    state.player.day += 1;
    addLog("<strong>新しい日</strong> が始まった。");
  }

  state.player.hunger = clamp(state.player.hunger - dt * 2.2, 0, 100);
  state.player.energy = clamp(state.player.energy - dt * 1.5, 0, 100);

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
    addLog("<strong>体調が悪くなった。</strong> 宿で休んで回復した。");
  }
}

function createCharacterMesh(color, isPlayer = false) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.9, 1.8, 4, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 })
  );
  body.position.y = 1.7;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf5d7b4, roughness: 0.9 })
  );
  head.position.y = 3.2;
  group.add(head);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  group.add(shadow);

  if (isPlayer) {
    group.userData.isPlayer = true;
  }

  return group;
}

function createWorldScene() {
  const ambient = new THREE.HemisphereLight(0xdff5ff, 0x234b39, 1.4);
  scene.add(ambient);

  const sunlight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunlight.position.set(60, 80, 35);
  scene.add(sunlight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x5bbd63, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  worldGroup.add(ground);

  const townFloor = new THREE.Mesh(
    new THREE.BoxGeometry(420, 1, 350),
    new THREE.MeshStandardMaterial({ color: 0x9bb5d1, roughness: 0.95 })
  );
  townFloor.position.set(1180, 0.5, 905);
  worldGroup.add(townFloor);

  const farmFloor = new THREE.Mesh(
    new THREE.BoxGeometry(520, 1, 340),
    new THREE.MeshStandardMaterial({ color: 0xc7d96a, roughness: 1 })
  );
  farmFloor.position.set(440, 0.5, 365);
  worldGroup.add(farmFloor);

  const forestFloor = new THREE.Mesh(
    new THREE.BoxGeometry(620, 1, 620),
    new THREE.MeshStandardMaterial({ color: 0x2d7647, roughness: 1 })
  );
  forestFloor.position.set(1680, 0.5, 490);
  worldGroup.add(forestFloor);

  const beachFloor = new THREE.Mesh(
    new THREE.BoxGeometry(670, 1, 420),
    new THREE.MeshStandardMaterial({ color: 0x65c1d7, roughness: 0.7 })
  );
  beachFloor.position.set(985, 0.3, 1500);
  worldGroup.add(beachFloor);

  const ruinsFloor = new THREE.Mesh(
    new THREE.BoxGeometry(500, 1, 500),
    new THREE.MeshStandardMaterial({ color: 0x6e5d59, roughness: 1 })
  );
  ruinsFloor.position.set(1720, 0.5, 1220);
  worldGroup.add(ruinsFloor);

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x88a0b0, roughness: 0.8 });
  for (const zone of Object.values(zoneDefs)) {
    const zoneMesh = new THREE.Mesh(new THREE.BoxGeometry(zone.w, 4, zone.h), stoneMaterial.clone());
    zoneMesh.position.set(zone.x + zone.w / 2, 2, zone.y + zone.h / 2);
    zoneMesh.material.transparent = true;
    zoneMesh.material.opacity = 0.12;
    zoneMesh.material.color = new THREE.Color(0x9fe6ff);
    worldGroup.add(zoneMesh);
  }

  for (let i = 0; i < 250; i += 1) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x7b4b2d })
    );
    trunk.position.y = 2.5;
    tree.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x2dbb53 })
    );
    crown.position.y = 5.5;
    tree.add(crown);

    tree.position.set(
      200 + Math.random() * 1800,
      0,
      200 + Math.random() * 1500
    );
    worldGroup.add(tree);
  }

  const houseMaterial = new THREE.MeshStandardMaterial({ color: 0xf3e0ad, roughness: 0.9 });
  const houses = [
    { x: 1040, z: 820, s: 18 },
    { x: 1200, z: 860, s: 16 },
    { x: 890, z: 980, s: 17 },
    { x: 1320, z: 980, s: 14 },
    { x: 820, z: 1480, s: 16 },
  ];

  for (const h of houses) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(h.s, 12, h.s), houseMaterial);
    house.position.set(h.x, 6, h.z);
    worldGroup.add(house);
  }

  const player = createCharacterMesh(0x68f0ff, true);
  player.position.set(state.player.x, 0, state.player.y);
  worldGroup.add(player);
  playerMesh = player;

  const drawnNpcs = new Map();
  for (const npc of state.npcs) {
    const visual = createCharacterMesh(npc.color, false);
    visual.position.set(npc.x, 0, npc.y);
    worldGroup.add(visual);
    drawnNpcs.set(npc.id, visual);
  }

  npcMeshes.clear();
  for (const [id, mesh] of drawnNpcs) {
    npcMeshes.set(id, mesh);
  }
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

function update3DState() {
  if (!playerMesh) return;

  playerMesh.position.set(state.player.x, 0, state.player.y);
  playerMesh.rotation.y = state.player.rotationY || 0;

  for (const npc of state.npcs) {
    const mesh = npcMeshes.get(npc.id);
    if (!mesh) continue;
    mesh.position.set(npc.x, 0, npc.y);
  }
}

function updateCamera() {
  const target = new THREE.Vector3(state.player.x, 1.5, state.player.y);
  const radius = 9;
  const offsetX = Math.sin(cameraYaw + Math.PI) * radius;
  const offsetZ = Math.cos(cameraYaw + Math.PI) * radius;
  const offsetY = 5 + Math.sin(cameraPitch) * 5;

  const desiredCameraPos = new THREE.Vector3(
    target.x + offsetX,
    offsetY,
    target.z + offsetZ
  );

  camera.position.lerp(desiredCameraPos, 0.08);
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

function applyMovement(dt) {
  let moveX = 0;
  let moveY = 0;

  if (keys.ArrowLeft || keys.a || keys.KeyA) moveX -= 1;
  if (keys.ArrowRight || keys.d || keys.KeyD) moveX += 1;
  if (keys.ArrowUp || keys.w || keys.KeyW) moveY -= 1;
  if (keys.ArrowDown || keys.s || keys.KeyS) moveY += 1;

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY) || 1;
    const dirX = (moveX / length) * state.player.speed * dt;
    const dirY = (moveY / length) * state.player.speed * dt;

    state.player.x = clamp(state.player.x + dirX, 40, world.width - 40);
    state.player.y = clamp(state.player.y + dirY, 40, world.height - 40);
    state.player.rotationY = Math.atan2(dirX, dirY);
    cameraYaw = state.player.rotationY;
  }
}

function handlePlayerAction(action) {
  const currentLocation = getLocationName(state.player.x, state.player.y);
  const nearestNpc = getNearestNpc();

  if (action === "save") {
    saveGame();
    addLog("<strong>保存</strong>した。次に続けられる。");
    return;
  }

  if (action === "rest") {
    if (currentLocation === "街" || currentLocation === "役所" || currentLocation === "宿") {
      state.player.health = clamp(state.player.health + 30, 0, 100);
      state.player.energy = clamp(state.player.energy + 45, 0, 100);
      state.player.hunger = clamp(state.player.hunger + 25, 0, 100);
      state.player.money = Math.max(0, state.player.money - 10);
      addLog("宿で休んだ。体力と気力が回復した。");
    } else {
      addLog("ここでは休めない。街の宿へ行こう。");
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
      addLog("近くに話せる相手がいない。");
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
      addLog("農場で作業しよう。");
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
      addLog("海岸で釣りをしよう。");
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
      addLog("森か遺跡で狩りをしよう。");
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
      addLog("街の仕事場に戻ろう。");
    }
    return;
  }

  if (action === "court") {
    if (currentLocation === "街" || currentLocation === "役所") {
      const judgeRoll = Math.random();
      if (judgeRoll > 0.45) {
        state.player.reputation += 8;
        state.player.money += 30;
        addLog("裁判に勝利した。評判が上がり、報酬を得た。");
      } else {
        state.player.reputation = Math.max(0, state.player.reputation - 3);
        state.player.money = Math.max(0, state.player.money - 20);
        addLog("裁判に負けた。少し評判が落ちたが、次に活かそう。");
      }
    } else {
      addLog("役所で裁判の儀式に参加しよう。");
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
        addLog("冒険で古代水晶を発見した。価値ある財宝だ。");
      } else {
        state.player.inventory.stone += 2;
        state.player.money += 25;
        addLog("小さな洞窟を探索し、石材と経験を得た。");
      }
      gainSkill("combat", 1);
    } else {
      addLog("森や遺跡に行って冒険しよう。");
    }
    return;
  }

  addLog("まだ行��を決められていない。");
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
  else if (location === "野原") addLog("何も起きていない。村に戻ろう。");
  else addLog("ここで何かできる気がする。");
}

function onResize() {
  const width = gameRoot.clientWidth;
  const height = gameRoot.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min((performance.now() - lastTime) / 1000 || 0.016, 0.032);
  lastTime = performance.now();

  applyMovement(dt);
  advanceTime(dt);

  if (keys.KeyE || keys.e) {
    tryInteract();
    keys.KeyE = false;
    keys.e = false;
  }

  if (keys.KeyQ || keys.q) {
    handlePlayerAction("talk");
    keys.KeyQ = false;
    keys.q = false;
  }

  if (keys.KeyS || keys.s) {
    if (!keys.sUsed) {
      saveGame();
      addLog("手動保存をした。");
      keys.sUsed = true;
    }
  } else {
    keys.sUsed = false;
  }

  update3DState();
  updateUI();
  updateCamera();
  renderer.render(scene, camera);
}

function bindButtons() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "save") {
        saveGame();
        addLog("保存した。");
        return;
      }
      handlePlayerAction(action);
    });
  });
}

window.addEventListener("resize", onResize);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const code = event.code;
  keys[key] = true;
  keys[code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ"].includes(code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  const code = event.code;
  keys[key] = false;
  keys[code] = false;
});

gameRoot.addEventListener("pointerdown", () => {
  pointerDown = true;
});

gameRoot.addEventListener("pointerup", () => {
  pointerDown = false;
});

gameRoot.addEventListener("pointerleave", () => {
  pointerDown = false;
});

gameRoot.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  cameraYaw -= event.movementX * 0.005;
  cameraPitch = clamp(cameraPitch - event.movementY * 0.002, 0.2, 1.5);
});

createWorldScene();
bindButtons();
updateUI();
renderLog();
onResize();
requestAnimationFrame(animate);
