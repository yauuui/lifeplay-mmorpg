/* LifePlay - ゲーム本体(状態・移動・NPC・採集・戦闘・農業・時間・保存) */
window.LP = window.LP || {};

LP.Game = (() => {
  const { clamp, rng } = LP.util;
  const MIN_PER_SEC = 2; // 現実1秒 = ゲーム内2分
  const INTERACT_RANGE = 3.2;

  let renderer, scene, camera, sun, hemi, world;
  let player = null; // { model, ... }
  const npcs = [];
  const slimes = [];
  let state = null;
  let running = false;
  let paused = false;
  let lastFrame = 0;
  let elapsed = 0;
  let attackTimer = 0;
  let fishing = null; // { phase, timer, biteAt }
  let currentTarget = null;
  const cam = { yaw: Math.PI, pitch: 0.42, dist: 13 };
  const input = { keys: {}, joy: { x: 0, z: 0 }, dragging: false };

  // ===== 状態 =====
  function newState(profile) {
    const job = LP.JOBS[profile.job];
    const skills = {};
    for (const k of Object.keys(LP.SKILLS)) skills[k] = { lv: 1, xp: 0 };
    for (const [k, v] of Object.entries(job.skills || {})) skills[k].lv = v;
    const s = {
      version: 2,
      profile,
      x: -30,
      z: 16,
      rot: Math.PI,
      money: job.money,
      hp: 100,
      energy: 100 + ((job.bonus && job.bonus.maxEnergy) || 0),
      maxEnergy: 100 + ((job.bonus && job.bonus.maxEnergy) || 0),
      hunger: 100,
      day: 1,
      time: 7 * 60,
      skills,
      inventory: { bread: 1, ...job.items },
      equip: { ...(job.equip || {}) },
      relations: {},
      talkedToday: {},
      giftedToday: {},
      spouse: null,
      plots: [],
      resources: {},
      quests: [],
      questDay: 0,
      stats: { slimes: 0, fish: 0, harvest: 0, quests: 0 },
      log: [],
    };
    for (const n of LP.NPCS) s.relations[n.id] = 10;
    return s;
  }

  function save(silent) {
    if (!state) return;
    state.x = player.model.position.x;
    state.z = player.model.position.z;
    state.rot = player.model.rotation.y;
    state.resources = {};
    world.resources.forEach((res, i) => {
      if (!res.alive) state.resources[i] = res.respawnDay;
    });
    try {
      localStorage.setItem(LP.SAVE_KEY, JSON.stringify(state));
      if (!silent) LP.UI.toast("💾 セーブしました");
    } catch (e) {
      LP.UI.toast("⚠ セーブに失敗しました(ブラウザの保存領域を確認してください)");
    }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(LP.SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== 2 || !s.profile) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function hasSave() {
    return !!loadSaved();
  }

  // ===== 初期化 =====
  function initRenderer(container) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color("#8fd0ff");
    scene.fog = new THREE.Fog("#8fd0ff", 90, 330);

    camera = new THREE.PerspectiveCamera(55, renderer.domElement.width / renderer.domElement.height, 0.1, 1200);

    hemi = new THREE.HemisphereLight("#dff4ff", "#4b6b3a", 0.75);
    scene.add(hemi);
    sun = new THREE.DirectionalLight("#fff4dd", 1.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -55;
    sc.right = sc.top = 55;
    sc.near = 1;
    sc.far = 260;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);

    world = LP.World.build(scene);

    window.addEventListener("resize", onResize);
    bindInput(renderer.domElement);
    if (!getQuality()) setQuality(false);
  }

  function setQuality(high) {
    renderer.shadowMap.enabled = high;
    sun.castShadow = high;
    renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 1.75) : 1);
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
    try {
      localStorage.setItem("lifeplay_quality", high ? "high" : "low");
    } catch (e) {}
    onResize();
  }
  function getQuality() {
    try {
      return localStorage.getItem("lifeplay_quality") !== "low";
    } catch (e) {
      return true;
    }
  }

  function onResize() {
    if (!renderer) return;
    const el = renderer.domElement.parentElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function start(container, savedState, profile) {
    if (!renderer) initRenderer(container);
    clearActors();
    state = savedState || newState(profile);
    // 古いセーブとの互換
    state.maxEnergy = state.maxEnergy || 100;
    state.talkedToday = state.talkedToday || {};
    state.giftedToday = state.giftedToday || {};

    // 資源の状態を復元
    world.resources.forEach((res, i) => {
      const day = state.resources && state.resources[i];
      res.alive = !day;
      res.respawnDay = day || 0;
      res.set(res.alive);
    });

    // プレイヤー
    const p = state.profile;
    const model = LP.Characters.create({ hair: p.hair, skin: p.skin, outfit: p.outfit, style: p.style });
    model.position.set(state.x, 0, state.z);
    model.rotation.y = state.rot;
    scene.add(model);
    const label = LP.Characters.makeLabel(p.name, "#9ff0ff");
    label.position.y = 3.6;
    model.add(label);
    player = { model, speed: 0, weapon: null };
    updateWeaponModel();
    cam.yaw = state.rot + Math.PI;

    // NPC
    for (const def of LP.NPCS) {
      const m = LP.Characters.create(def.look);
      const [, x, z] = scheduleTarget(def, state.time);
      m.position.set(x, 0, z);
      scene.add(m);
      const lbl = LP.Characters.makeLabel(def.name, "#ffe38a", def.romance ? "♡" : "");
      lbl.position.y = 3.6;
      m.add(lbl);
      npcs.push({ def, model: m, label: lbl, speed: 0, wait: 0 });
    }

    // スライム
    const r = rng(77);
    const spawnZones = [
      { x1: 70, x2: 185, z1: -180, z2: -35, color: "#5fd36a", lv: 1 },
      { x1: 85, x2: 180, z1: 55, z2: 145, color: "#5aa8ff", lv: 2 },
    ];
    for (const zn of spawnZones) {
      for (let i = 0; i < 9; i++) {
        const sx = zn.x1 + r() * (zn.x2 - zn.x1), sz = zn.z1 + r() * (zn.z2 - zn.z1);
        const m = LP.Characters.createSlime(zn.color);
        scene.add(m);
        const s = { model: m, home: { x: sx, z: sz }, lv: zn.lv, hp: 0, maxHp: 20 * zn.lv, dead: 0, wander: { x: sx, z: sz, t: 0 }, hitCd: 0, flash: 0 };
        respawnSlime(s);
        slimes.push(s);
      }
    }

    syncPlots();
    ensureQuests();
    LP.World.applySeason(world, seasonIndex());
    LP.UI.bindGame(api);
    LP.UI.restoreLog(state.log);
    if (!savedState) {
      log(`<b>${LP.util.escape(p.name)}</b>はリーフタウンにやってきた。新しい生活の始まりだ！`);
      log("WASDで移動、マウスドラッグで視点、Eで調べる/話す。まずは町を歩いてみよう。");
    } else {
      log("おかえりなさい。冒険の続きを始めよう。");
    }
    running = true;
    paused = false;
    lastFrame = performance.now();
    onResize();
    requestAnimationFrame(loop);
  }

  function clearActors() {
    if (player) scene.remove(player.model);
    for (const n of npcs) scene.remove(n.model);
    for (const s of slimes) scene.remove(s.model);
    npcs.length = 0;
    slimes.length = 0;
    player = null;
  }

  function stop() {
    running = false;
  }

  function updateWeaponModel() {
    if (player.weapon) {
      player.model.userData.parts.armR.remove(player.weapon);
      player.weapon = null;
    }
    if (state.equip.weapon) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.22), new THREE.MeshStandardMaterial({ color: "#dfe6ee", metalness: 0.8, roughness: 0.25 }));
      blade.position.set(0, -0.85, 0.7);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: "#b8902f", metalness: 0.6 }));
      guard.position.set(0, -0.85, 0.05);
      blade.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(blade, guard);
      player.model.userData.parts.armR.add(g);
      player.weapon = g;
    }
  }

  // ===== 入力 =====
  function bindInput(canvas) {
    window.addEventListener("keydown", (e) => {
      if (!running) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      input.keys[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (LP.UI.handleKey(e.code)) return;
      if (paused) return;
      if (e.code === "KeyE" || e.code === "Space") interact();
      else if (e.code === "KeyF") attack();
      else if (e.code === "Digit1") useQuickFood();
    });
    window.addEventListener("keyup", (e) => {
      input.keys[e.code] = false;
    });
    window.addEventListener("blur", () => {
      input.keys = {};
    });

    let last = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      input.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!input.dragging || !last) return;
      cam.yaw -= (e.clientX - last.x) * 0.006;
      cam.pitch = clamp(cam.pitch + (e.clientY - last.y) * 0.004, 0.12, 1.25);
      last = { x: e.clientX, y: e.clientY };
    });
    const endDrag = () => {
      input.dragging = false;
      last = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", (e) => {
      cam.dist = clamp(cam.dist + e.deltaY * 0.012, 5, 30);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // タッチ: 右半分ドラッグで視点
    let touchCam = null;
    canvas.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) if (t.clientX > window.innerWidth * 0.4 && !touchCam) touchCam = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (touchCam && t.identifier === touchCam.id) {
          cam.yaw -= (t.clientX - touchCam.x) * 0.008;
          cam.pitch = clamp(cam.pitch + (t.clientY - touchCam.y) * 0.005, 0.12, 1.25);
          touchCam.x = t.clientX;
          touchCam.y = t.clientY;
        }
      }
    }, { passive: true });
    canvas.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) if (touchCam && t.identifier === touchCam.id) touchCam = null;
    });
  }

  function setJoystick(x, z) {
    input.joy.x = x;
    input.joy.z = z;
  }

  // ===== ループ =====
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    elapsed += dt;
    if (!paused) {
      updateTime(dt);
      updatePlayer(dt);
      updateNpcs(dt);
      updateSlimes(dt);
      updateFishing(dt);
      updateTarget();
    }
    LP.World.update(world, elapsed);
    updateCamera(dt);
    updateLighting();
    LP.UI.updateHud(state, hudInfo());
    renderer.render(scene, camera);
  }

  function hudInfo() {
    return {
      x: player.model.position.x,
      z: player.model.position.z,
      rot: player.model.rotation.y,
      camYaw: cam.yaw,
      location: LP.World.locationName(player.model.position.x, player.model.position.z),
      season: LP.SEASONS[seasonIndex()].name,
      target: currentTarget,
      npcs: npcs.map((n) => ({ x: n.model.position.x, z: n.model.position.z, name: n.def.name })),
      slimes: slimes.filter((s) => !s.dead).map((s) => ({ x: s.model.position.x, z: s.model.position.z })),
      doors: world.doors,
      map: world.mapCanvas,
      fishing,
    };
  }

  function seasonIndex() {
    return Math.floor((state.day - 1) / LP.DAYS_PER_SEASON) % 4;
  }

  // ===== 時間 =====
  function updateTime(dt) {
    state.time += dt * MIN_PER_SEC;
    state.hunger = clamp(state.hunger - dt * 0.09, 0, 100);
    if (state.hunger <= 0) state.hp = clamp(state.hp - dt * 0.6, 0, 100);
    else if (state.hunger > 50 && state.hp < 100) state.hp = clamp(state.hp + dt * 0.15, 0, 100);
    if (state.time >= 24 * 60) {
      state.time -= 24 * 60;
      newDay(false);
    }
    // 深夜2時を過ぎると倒れる
    if (state.time >= 2 * 60 && state.time < 6 * 60) {
      log("夜更かしで力尽きてしまった…。自宅で目を覚ました。");
      faint(0.1);
    }
    if (state.hp <= 0) {
      log("体力が尽きて倒れてしまった…。アヤメが自宅まで運んでくれたらしい。");
      faint(0.15);
    }
  }

  function faint(moneyLoss) {
    const lost = Math.floor(state.money * moneyLoss);
    state.money -= lost;
    if (lost) log(`治療費として ${lost}G を失った。`);
    sleep(true);
  }

  function sleep(fainted) {
    const passedMidnight = state.time >= 6 * 60;
    state.time = 6 * 60;
    if (passedMidnight) newDay(true);
    state.hp = fainted ? 50 : 100;
    state.energy = fainted ? state.maxEnergy * 0.5 : state.maxEnergy;
    state.hunger = clamp(state.hunger - 10, 0, 100);
    teleport(-30, 17, Math.PI);
    if (!fainted) log("ぐっすり眠った。体力とスタミナが全回復した！");
    save(true);
    LP.UI.flash();
  }

  function newDay(quiet) {
    const prevSeason = seasonIndex();
    state.day += 1;
    state.talkedToday = {};
    state.giftedToday = {};
    // 作物の成長
    for (const plot of state.plots) {
      if (!plot || !plot.crop) continue;
      if (plot.watered) plot.growth = Math.min(plot.growth + 1, LP.CROPS[plot.crop].days);
      plot.watered = false;
    }
    // 資源の復活
    world.resources.forEach((res) => {
      if (!res.alive && res.respawnDay <= state.day) {
        res.alive = true;
        res.set(true);
      }
    });
    syncPlots();
    ensureQuests();
    // 配偶者の贈り物
    if (state.spouse) {
      const npc = LP.NPCS.find((n) => n.id === state.spouse);
      const gift = npc.likes[Math.floor(Math.random() * npc.likes.length)];
      addItem(gift, 1);
      log(`💕 ${npc.name}が朝ごはんと一緒に${LP.ITEMS[gift].name}をくれた。`);
    }
    const season = LP.SEASONS[seasonIndex()];
    if (seasonIndex() !== prevSeason) {
      LP.World.applySeason(world, seasonIndex());
      log(`🍃 季節が<b>${season.name}</b>になった。`);
    }
    if (!quiet) log(`☀ ${state.day}日目 (${season.name}) が始まった。`);
    else log(`☀ ${state.day}日目 (${season.name}) の朝。`);
  }

  function teleport(x, z, rot) {
    player.model.position.set(x, 0, z);
    player.model.rotation.y = rot;
    cam.yaw = rot + Math.PI;
  }

  // ===== プレイヤー =====
  function groundY(x, z) {
    const p = world.pier;
    return x > p.x1 && x < p.x2 && z > p.z1 && z < p.z2 && z > 158 ? 0.75 : 0;
  }

  function updatePlayer(dt) {
    const k = input.keys;
    let ix = 0, iz = 0;
    if (k.KeyW || k.ArrowUp) iz -= 1;
    if (k.KeyS || k.ArrowDown) iz += 1;
    if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1;
    ix += input.joy.x;
    iz += input.joy.z;
    let len = Math.hypot(ix, iz);
    const m = player.model;
    if (fishing) len = 0;
    if (len > 0.1) {
      if (len > 1) {
        ix /= len;
        iz /= len;
        len = 1;
      }
      // カメラ基準の移動 (カメラは yaw 方向から見ている)
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const rx = -fz, rz = fx;
      const dx = rx * ix + fx * -iz;
      const dz = rz * ix + fz * -iz;
      const tired = state.energy < 5;
      const run = (k.ShiftLeft || k.ShiftRight) && !tired;
      const speed = (run ? 13 : 7.5) * (tired ? 0.6 : 1) * len;
      let nx = m.position.x + dx * speed * dt;
      let nz = m.position.z + dz * speed * dt;
      [nx, nz] = LP.World.resolve(world, nx, nz, 0.6);
      m.position.x = nx;
      m.position.z = nz;
      const targetRot = Math.atan2(dx, dz);
      let diff = targetRot - m.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.rotation.y += diff * Math.min(1, dt * 12);
      player.speed = run ? 1 : 0.55 * len;
      if (run) state.energy = clamp(state.energy - dt * 1.2, 0, state.maxEnergy);
    } else {
      player.speed = 0;
    }
    m.position.y = groundY(m.position.x, m.position.z);
    attackTimer = Math.max(0, attackTimer - dt * 3);
    LP.Characters.animate(m, dt, player.speed, attackTimer);
  }

  function updateCamera(dt) {
    if (!player) return;
    const p = player.model.position;
    const target = new THREE.Vector3(p.x, p.y + 2.2, p.z);
    const horiz = Math.cos(cam.pitch) * cam.dist;
    const desired = new THREE.Vector3(
      target.x + Math.sin(cam.yaw) * horiz,
      target.y + Math.sin(cam.pitch) * cam.dist,
      target.z + Math.cos(cam.yaw) * horiz
    );
    // 建物にめり込まないようカメラを手前に寄せる
    const dir = desired.clone().sub(target);
    const len = dir.length();
    for (let d = 1; d < len; d += 0.4) {
      const px = target.x + (dir.x / len) * d, py = target.y + (dir.y / len) * d, pz = target.z + (dir.z / len) * d;
      if (world.boxes.some((b) => px > b.x1 && px < b.x2 && pz > b.z1 && pz < b.z2 && py < b.h)) {
        desired.copy(target).addScaledVector(dir, Math.max(d - 0.6, 1.5) / len);
        break;
      }
    }
    camera.position.lerp(desired, Math.min(1, dt * 10));
    camera.lookAt(target);
    // 影のカメラをプレイヤーに追従
    sun.target.position.copy(p);
  }

  function updateLighting() {
    const h = state.time / 60;
    // 太陽の角度 (6時に昇り18時に沈む)
    const dayT = (h - 6) / 12;
    const elev = Math.sin(dayT * Math.PI);
    const daylight = clamp(elev * 1.6 + 0.05, 0, 1);
    const p = player.model.position;
    const az = dayT * Math.PI;
    sun.position.set(p.x + Math.cos(az) * 80, p.y + Math.max(elev, 0.15) * 100 + 10, p.z - 40 + Math.sin(az) * 20);
    sun.intensity = 0.12 + daylight * 0.72;
    hemi.intensity = 0.22 + daylight * 0.38;

    const night = new THREE.Color("#0d1630");
    const dusk = new THREE.Color("#ff9a62");
    const day = new THREE.Color("#8fd0ff");
    const sky = night.clone().lerp(day, daylight);
    if (daylight > 0.05 && daylight < 0.5) sky.lerp(dusk, (0.5 - Math.abs(daylight - 0.27) * 2) * 0.35);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    sun.color.set(daylight < 0.4 ? "#ffc58a" : "#fff4dd");

    const lampsOn = h >= 18 || h < 6.5;
    const glow = lampsOn ? 1 : 0;
    for (const mtl of world.lampMats) mtl.emissiveIntensity = glow * 1.4;
    for (const mtl of world.windowMats) mtl.emissiveIntensity = glow * 0.9;
    for (const l of world.lampLights) l.intensity = glow * 1.3;
  }

  // ===== NPC =====
  function scheduleTarget(def, time) {
    const h = time / 60;
    let entry = def.schedule[0];
    for (const e of def.schedule) if (h >= e[0]) entry = e;
    return entry;
  }

  function updateNpcs(dt) {
    for (const n of npcs) {
      const [, tx, tz] = scheduleTarget(n.def, state.time);
      const m = n.model;
      const dx = tx - m.position.x, dz = tz - m.position.z;
      const d = Math.hypot(dx, dz);
      // 話しかけ中は止まってプレイヤーを見る
      const talking = LP.UI.isTalkingTo(n.def.id);
      if (talking) {
        const px = player.model.position.x - m.position.x, pz = player.model.position.z - m.position.z;
        m.rotation.y = Math.atan2(px, pz);
        n.speed = 0;
      } else if (d > 0.6) {
        const sp = d > 60 ? 9 : 4.2;
        let nx = m.position.x + (dx / d) * sp * dt;
        let nz = m.position.z + (dz / d) * sp * dt;
        [nx, nz] = LP.World.resolve(world, nx, nz, 0.5);
        // 詰まったら直接移動(建物の角など)
        if (Math.hypot(nx - m.position.x, nz - m.position.z) < sp * dt * 0.2) {
          nx = m.position.x + (dx / d) * sp * dt;
          nz = m.position.z + (dz / d) * sp * dt;
        }
        m.position.x = nx;
        m.position.z = nz;
        m.rotation.y = Math.atan2(dx, dz);
        n.speed = 0.5;
      } else {
        n.speed = 0;
      }
      m.position.y = groundY(m.position.x, m.position.z);
      LP.Characters.animate(m, dt, n.speed);
    }
  }

  // ===== スライム =====
  function respawnSlime(s) {
    s.dead = 0;
    s.hp = s.maxHp;
    s.model.visible = true;
    const r = Math.random;
    s.model.position.set(s.home.x + (r() - 0.5) * 16, 0, s.home.z + (r() - 0.5) * 16);
    const [x, z] = LP.World.resolve(world, s.model.position.x, s.model.position.z, 0.8);
    s.model.position.set(x, 0, z);
  }

  function updateSlimes(dt) {
    const p = player.model.position;
    for (const s of slimes) {
      if (s.dead) {
        s.dead -= dt;
        if (s.dead <= 0) respawnSlime(s);
        continue;
      }
      const m = s.model;
      const dp = Math.hypot(p.x - m.position.x, p.z - m.position.z);
      let tx, tz, sp;
      const night = state.time / 60 >= 19 || state.time / 60 < 5;
      if (dp < (night ? 16 : 10)) {
        tx = p.x;
        tz = p.z;
        sp = 3.4 + s.lv * 0.4;
      } else {
        s.wander.t -= dt;
        if (s.wander.t <= 0) {
          s.wander = { x: s.home.x + (Math.random() - 0.5) * 20, z: s.home.z + (Math.random() - 0.5) * 20, t: 3 + Math.random() * 4 };
        }
        tx = s.wander.x;
        tz = s.wander.z;
        sp = 1.4;
      }
      const dx = tx - m.position.x, dz = tz - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        let nx = m.position.x + (dx / d) * sp * dt;
        let nz = m.position.z + (dz / d) * sp * dt;
        [nx, nz] = LP.World.resolve(world, nx, nz, 0.8);
        m.position.x = nx;
        m.position.z = nz;
        m.rotation.y = Math.atan2(dx, dz);
      }
      // ぷるぷる跳ねる
      const bounce = Math.abs(Math.sin(elapsed * 5 + s.home.x));
      s.model.userData.body.scale.set(1 + (1 - bounce) * 0.12, 0.75 - (1 - bounce) * 0.1, 1 + (1 - bounce) * 0.12);
      m.position.y = bounce * 0.4;
      s.hitCd = Math.max(0, s.hitCd - dt);
      s.flash = Math.max(0, s.flash - dt);
      s.model.userData.body.material.emissive.set(s.flash > 0 ? "#ff4040" : "#000000");
      // 接触ダメージ
      if (dp < 1.6 && s.hitCd <= 0) {
        s.hitCd = 1.2;
        const dmg = 4 + s.lv * 3;
        state.hp = clamp(state.hp - dmg, 0, 100);
        LP.UI.damage(`-${dmg}`);
      }
    }
  }

  function attack() {
    if (fishing) return;
    if (attackTimer > 0) return;
    if (state.energy < 2) {
      LP.UI.toast("スタミナが足りない…");
      return;
    }
    attackTimer = 1;
    state.energy = clamp(state.energy - 2, 0, state.maxEnergy);
    const p = player.model.position;
    const facing = player.model.rotation.y;
    let hit = false;
    for (const s of slimes) {
      if (s.dead) continue;
      const dx = s.model.position.x - p.x, dz = s.model.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 3.4) continue;
      let ang = Math.atan2(dx, dz) - facing;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > 1.3 && d > 1.6) continue;
      const weapon = state.equip.weapon ? LP.ITEMS[state.equip.weapon].power : 0;
      const dmg = Math.round(5 + state.skills.combat.lv * 2 + weapon + Math.random() * 4);
      s.hp -= dmg;
      s.flash = 0.2;
      s.model.position.x += (dx / (d || 1)) * 1.5;
      s.model.position.z += (dz / (d || 1)) * 1.5;
      hit = true;
      if (s.hp <= 0) {
        s.dead = 40;
        s.model.visible = false;
        const gold = 6 + s.lv * 6 + Math.floor(Math.random() * 6);
        state.money += gold;
        addItem("jelly", 1);
        state.stats.slimes++;
        gainXp("combat", 6 * s.lv);
        log(`スライムを倒した！ ゼリーと ${gold}G を手に入れた。`);
        if (s.lv >= 2 && Math.random() < 0.1) {
          addItem("crystal", 1);
          log("💎 スライムの中から古代の水晶が出てきた！");
        }
      }
    }
    if (!hit) {
      // 近くの木や岩を叩くと採集
      const res = nearestResource(2.8, ["tree", "rock", "ore"]);
      if (res) gather(res);
    }
  }

  // ===== インタラクション =====
  function nearestResource(range, types) {
    const p = player.model.position;
    let best = null, bestD = range;
    for (const res of world.resources) {
      if (!res.alive || (types && !types.includes(res.type))) continue;
      const d = Math.hypot(res.x - p.x, res.z - p.z);
      if (d < bestD) {
        best = res;
        bestD = d;
      }
    }
    return best;
  }

  function findTarget() {
    const p = player.model.position;
    // NPC と建物の入口: 近い方を優先
    let best = null, bestD = INTERACT_RANGE;
    for (const n of npcs) {
      const d = Math.hypot(n.model.position.x - p.x, n.model.position.z - p.z);
      if (d < bestD) {
        best = { kind: "npc", npc: n, label: `話す: ${n.def.name}` };
        bestD = d;
      }
    }
    for (const door of world.doors) {
      const d = Math.hypot(door.x - p.x, door.z - p.z) - 0.5;
      if (d < bestD) {
        best = { kind: "door", door, label: `入る: ${door.building.name}` };
        bestD = d;
      }
    }
    if (best) return best;
    // 畑
    for (let i = 0; i < world.plots.length; i++) {
      const pl = world.plots[i];
      if (Math.abs(pl.x - p.x) < 2.3 && Math.abs(pl.z - p.z) < 2.3) {
        const s = state.plots[i];
        if (!s || !s.crop) return { kind: "plot", index: i, label: "種をまく" };
        const crop = LP.CROPS[s.crop];
        if (s.growth >= crop.days) return { kind: "plot", index: i, label: `収穫する: ${crop.name}` };
        if (!s.watered) return { kind: "plot", index: i, label: `水をやる: ${crop.name}` };
        return { kind: "plot", index: i, label: `${crop.name} (成長 ${s.growth}/${crop.days}・水やり済み)`, idle: true };
      }
    }
    if (Math.hypot(world.well.x - p.x, world.well.z - p.z) < 3.5) return { kind: "well", label: "井戸の水を飲む" };
    // 釣り
    const pier = world.pier;
    const onPier = p.x > pier.x1 && p.x < pier.x2 && p.z > 160;
    if (onPier || p.z > LP.SEA_Z - 2.5) return { kind: "fish", label: onPier && p.z > 185 ? "釣りをする(大物ポイント)" : "釣りをする" };
    const res = nearestResource(2.8);
    if (res) {
      const names = { tree: "木を切る", rock: "岩を掘る", ore: "鉱石を掘る", herb: "薬草を摘む", flower: "花を摘む" };
      return { kind: "resource", res, label: names[res.type] };
    }
    return null;
  }

  function updateTarget() {
    currentTarget = fishing ? null : findTarget();
  }

  function interact() {
    if (fishing) {
      reelIn();
      return;
    }
    const t = findTarget();
    if (!t) return;
    if (t.kind === "npc") LP.UI.openDialogue(t.npc.def);
    else if (t.kind === "door") enterBuilding(t.door.building);
    else if (t.kind === "plot") usePlot(t.index);
    else if (t.kind === "resource") gather(t.res);
    else if (t.kind === "fish") startFishing();
    else if (t.kind === "well") {
      state.energy = clamp(state.energy + 5, 0, state.maxEnergy);
      LP.UI.toast("冷たい水で少し元気が出た (+5 スタミナ)");
    }
  }

  function spend(energy) {
    if (state.energy < energy) {
      LP.UI.toast("スタミナが足りない…何か食べるか、眠ろう。");
      return false;
    }
    state.energy -= energy;
    state.time += 10;
    return true;
  }

  function gather(res) {
    const cost = { tree: 6, rock: 6, ore: 7, herb: 2, flower: 1 }[res.type];
    if (!spend(cost)) return;
    attackTimer = 1;
    const lv = state.skills.gathering.lv;
    const bonus = Math.random() < lv * 0.05 ? 1 : 0;
    let got = [];
    if (res.type === "tree") got = [["wood", 2 + bonus]];
    else if (res.type === "rock") got = [["stone", 2 + bonus]];
    else if (res.type === "ore") {
      got = [["stone", 1], ["ore", 1 + bonus]];
      if (Math.random() < 0.06 + lv * 0.01) got.push(["crystal", 1]);
    } else if (res.type === "herb") got = [["herb", 1 + bonus]];
    else got = [["flower", 1 + bonus]];
    for (const [id, n] of got) addItem(id, n);
    res.alive = false;
    res.respawnDay = state.day + (res.type === "tree" ? 3 : res.type === "herb" || res.type === "flower" ? 1 : 2);
    res.set(false);
    gainXp("gathering", res.type === "tree" || res.type === "ore" ? 5 : 3);
    LP.UI.toast(got.map(([id, n]) => `${LP.ITEMS[id].icon} ${LP.ITEMS[id].name} ×${n}`).join("  "));
  }

  function usePlot(i) {
    const s = state.plots[i] || (state.plots[i] = { crop: null, growth: 0, watered: false });
    if (!s.crop) {
      const seed = ["seed_wheat", "seed_turnip"].find((id) => (state.inventory[id] || 0) > 0);
      if (!seed) {
        LP.UI.toast("種を持っていない。雑貨屋で買おう。");
        return;
      }
      if (!spend(2)) return;
      removeItem(seed, 1);
      s.crop = LP.ITEMS[seed].seed;
      s.growth = 0;
      s.watered = false;
      LP.UI.toast(`🌱 ${LP.CROPS[s.crop].name}の種をまいた。毎日水をやろう。`);
      gainXp("farming", 2);
    } else {
      const crop = LP.CROPS[s.crop];
      if (s.growth >= crop.days) {
        if (!spend(3)) return;
        const lv = state.skills.farming.lv;
        const n = crop.yield[0] + Math.floor(Math.random() * (crop.yield[1] - crop.yield[0] + 1)) + Math.floor(lv / 3);
        addItem(crop.item, n);
        state.stats.harvest += n;
        LP.UI.toast(`${LP.ITEMS[crop.item].icon} ${crop.name}を ${n} 個収穫した！`);
        gainXp("farming", 8);
        state.plots[i] = { crop: null, growth: 0, watered: false };
      } else if (!s.watered) {
        if (!spend(2)) return;
        s.watered = true;
        LP.UI.toast("💧 水をやった。");
        gainXp("farming", 2);
      }
    }
    syncPlots();
  }

  function syncPlots() {
    world.plots.forEach((pl, i) => {
      const s = state.plots[i];
      pl.bed.material = s && s.watered ? pl.soilWet : pl.soil;
      while (pl.crop.children.length) pl.crop.remove(pl.crop.children[0]);
      if (!s || !s.crop) return;
      const crop = LP.CROPS[s.crop];
      const ratio = s.growth / crop.days;
      const ripe = s.growth >= crop.days;
      const color = s.crop === "wheat" ? (ripe ? "#e2c45a" : "#7cc04a") : ripe ? "#f2f0ea" : "#5fb84a";
      const mat = new THREE.MeshStandardMaterial({ color });
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const h = 0.25 + ratio * 1.3;
          const sprout = new THREE.Mesh(s.crop === "wheat" ? new THREE.ConeGeometry(0.18, h, 5) : new THREE.SphereGeometry(0.15 + ratio * 0.25, 8, 6), mat);
          sprout.position.set(-1 + a, s.crop === "wheat" ? h / 2 : 0.15 + ratio * 0.1, -1 + b);
          pl.crop.add(sprout);
          if (s.crop === "turnip" && ratio > 0) {
            const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4 + ratio * 0.5, 4), new THREE.MeshStandardMaterial({ color: "#3f9a3c" }));
            leaf.position.set(-1 + a, 0.4 + ratio * 0.45, -1 + b);
            pl.crop.add(leaf);
          }
        }
      }
    });
  }

  // 釣り: 投げる → 待つ → 「!」で E → 成功
  function startFishing() {
    if (!spend(3)) return;
    const pos = player.model.position;
    const deep = pos.x > world.pier.x1 && pos.x < world.pier.x2 && pos.z > 185;
    fishing = { phase: "wait", timer: 0, biteAt: 2 + Math.random() * 4, deep };
    player.model.rotation.y = 0; // 海(南)を向く
    LP.UI.toast("🎣 竿を投げた…合図(!)が出たら E / スペース!");
  }

  function updateFishing(dt) {
    if (!fishing) return;
    fishing.timer += dt;
    if (fishing.phase === "wait" && fishing.timer >= fishing.biteAt) {
      fishing.phase = "bite";
      fishing.timer = 0;
    } else if (fishing.phase === "bite" && fishing.timer > 1.1 + state.skills.fishing.lv * 0.08) {
      LP.UI.toast("逃げられてしまった…");
      fishing = null;
    }
  }

  function reelIn() {
    if (!fishing) return;
    if (fishing.phase !== "bite") {
      LP.UI.toast("早すぎた！魚が逃げてしまった。");
      fishing = null;
      return;
    }
    const lv = state.skills.fishing.lv + (state.equip.rod ? 2 : 0) + (state.profile.job === "fisher" ? 2 : 0);
    const bigChance = (fishing.deep ? 0.18 : 0.05) + lv * 0.02;
    const big = Math.random() < bigChance;
    addItem(big ? "bigfish" : "fish", 1);
    state.stats.fish++;
    gainXp("fishing", big ? 12 : 5);
    LP.UI.toast(big ? "🐠 大物を釣り上げた！" : "🐟 魚を釣った！");
    fishing = null;
  }

  // ===== 建物 =====
  function enterBuilding(b) {
    LP.UI.openBuilding(b);
  }

  function rest(place) {
    const h = state.time / 60;
    if (place === "inn") {
      if (state.money < 30) {
        LP.UI.toast("お金が足りない (30G)");
        return false;
      }
      state.money -= 30;
    }
    if (h >= 6 && h < 17 && place === "home") {
      // 昼寝: 2時間
      state.time += 120;
      state.energy = clamp(state.energy + 40, 0, state.maxEnergy);
      state.hp = clamp(state.hp + 20, 0, 100);
      log("少し昼寝をした。(+40 スタミナ)");
      return true;
    }
    sleep(false);
    return true;
  }

  function doWork() {
    if (!spend(25)) return;
    state.time += 110;
    const lv = state.skills.work.lv;
    const pay = 40 + lv * 8 + Math.floor(Math.random() * 10);
    state.money += pay;
    gainXp("work", 10);
    log(`役所の仕事を手伝った。給料 ${pay}G を受け取った。`);
  }

  // ===== クエスト =====
  function ensureQuests() {
    if (state.questDay === state.day && state.quests.length) return;
    const r = rng(state.day * 9973 + 7);
    const pool = [...LP.QUEST_POOL];
    state.quests = [];
    for (let i = 0; i < 3; i++) {
      const q = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const n = q.min + Math.floor(r() * (q.max - q.min + 1));
      const giver = LP.NPCS[Math.floor(r() * LP.NPCS.length)];
      state.quests.push({ item: q.item, n, reward: q.reward * n + 20, giver: giver.id, done: false });
    }
    state.questDay = state.day;
  }

  function completeQuest(i) {
    const q = state.quests[i];
    if (!q || q.done) return;
    if ((state.inventory[q.item] || 0) < q.n) {
      LP.UI.toast(`${LP.ITEMS[q.item].name}が足りない (${state.inventory[q.item] || 0}/${q.n})`);
      return;
    }
    removeItem(q.item, q.n);
    q.done = true;
    state.money += q.reward;
    state.relations[q.giver] = clamp((state.relations[q.giver] || 0) + 6, 0, 100);
    state.stats.quests++;
    gainXp("work", 8);
    const giver = LP.NPCS.find((n) => n.id === q.giver);
    log(`📜 依頼達成！ ${giver.name}から ${q.reward}G を受け取った。`);
  }

  // ===== アイテム・経済 =====
  function addItem(id, n) {
    state.inventory[id] = (state.inventory[id] || 0) + n;
  }
  function removeItem(id, n) {
    state.inventory[id] = Math.max(0, (state.inventory[id] || 0) - n);
    if (!state.inventory[id]) delete state.inventory[id];
  }
  function sellPrice(id) {
    const base = LP.ITEMS[id].price;
    const mult = state.profile.job === "merchant" ? 0.72 : 0.6;
    return Math.max(1, Math.floor(base * mult * (1 + state.skills.social.lv * 0.02)));
  }
  function buy(id) {
    const item = LP.ITEMS[id];
    if (state.money < item.price) {
      LP.UI.toast("お金が足りない…");
      return;
    }
    if (item.equip && (state.inventory[id] || state.equip[item.equip] === id)) {
      LP.UI.toast("もう持っている。");
      return;
    }
    state.money -= item.price;
    if (item.equip) {
      state.equip[item.equip] = id;
      updateWeaponModel();
      LP.UI.toast(`${item.icon} ${item.name}を装備した！`);
    } else {
      addItem(id, 1);
      LP.UI.toast(`${item.icon} ${item.name}を買った`);
    }
  }
  function sell(id, all) {
    const have = state.inventory[id] || 0;
    if (!have) return;
    const n = all ? have : 1;
    const gain = sellPrice(id) * n;
    removeItem(id, n);
    state.money += gain;
    gainXp("social", 1);
    LP.UI.toast(`${LP.ITEMS[id].name} ×${n} を ${gain}G で売った`);
  }
  function eat(id) {
    const item = LP.ITEMS[id];
    if (!item || !item.food || !state.inventory[id]) return;
    removeItem(id, 1);
    state.hp = clamp(state.hp + item.food.hp, 0, 100);
    state.energy = clamp(state.energy + item.food.energy, 0, state.maxEnergy);
    state.hunger = clamp(state.hunger + item.food.hunger, 0, 100);
    LP.UI.toast(`${item.icon} ${item.name}を食べた`);
  }
  function useQuickFood() {
    const order = ["bread", "stew", "fish", "turnip", "bigfish", "herb", "potion"];
    const id = order.find((k) => state.inventory[k] > 0);
    if (id) eat(id);
    else LP.UI.toast("食べ物を持っていない");
  }
  function cook() {
    // 自宅: 魚+カブ → シチュー、小麦2 → パン
    if ((state.inventory.wheat || 0) >= 2) {
      removeItem("wheat", 2);
      addItem("bread", 1);
      LP.UI.toast("🍞 パンを焼いた");
      return;
    }
    LP.UI.toast("材料が足りない (小麦×2)");
  }
  function cookStew() {
    if ((state.inventory.fish || 0) >= 1 && (state.inventory.turnip || 0) >= 1) {
      removeItem("fish", 1);
      removeItem("turnip", 1);
      addItem("stew", 1);
      LP.UI.toast("🍲 シチューを作った");
      return;
    }
    LP.UI.toast("材料が足りない (魚×1, カブ×1)");
  }

  // ===== 交友 =====
  function talk(npcId) {
    const def = LP.NPCS.find((n) => n.id === npcId);
    const first = !state.talkedToday[npcId];
    if (first) {
      state.talkedToday[npcId] = true;
      state.relations[npcId] = clamp((state.relations[npcId] || 0) + 3, 0, 100);
      gainXp("social", 3);
    }
    const aff = state.relations[npcId];
    const idx = aff >= 60 ? 2 : aff >= 30 ? 1 : 0;
    let line = def.lines[Math.min(idx, def.lines.length - 1)];
    if (state.spouse === npcId) line = "おかえり。今日もおつかれさま。いつもありがとうね。";
    return line;
  }

  function giveGift(npcId, itemId) {
    const def = LP.NPCS.find((n) => n.id === npcId);
    if (state.giftedToday[npcId]) return "今日はもうプレゼントをもらったよ。ありがとう！";
    if (!state.inventory[itemId]) return null;
    removeItem(itemId, 1);
    state.giftedToday[npcId] = true;
    const liked = def.likes.includes(itemId);
    const delta = liked ? 12 : 4;
    state.relations[npcId] = clamp((state.relations[npcId] || 0) + delta, 0, 100);
    gainXp("social", liked ? 6 : 2);
    return liked ? `わぁ、${LP.ITEMS[itemId].name}！大好きなんだ。本当にありがとう！` : `${LP.ITEMS[itemId].name}？ありがとう、大事にするね。`;
  }

  function propose(npcId) {
    const def = LP.NPCS.find((n) => n.id === npcId);
    if (!def.romance) return "…ごめん、そういうのはちょっと。";
    if (state.spouse) return "もう大切な人がいるでしょう？";
    if (!state.inventory.pendant) return "(誓いのペンダントが必要だ。雑貨屋で売っている)";
    if ((state.relations[npcId] || 0) < 80) {
      return "えっ…気持ちは嬉しいけど、もう少しお互いを知ってからにしたいな。(好感度80以上が必要)";
    }
    removeItem("pendant", 1);
    state.spouse = npcId;
    state.relations[npcId] = 100;
    log(`💍 ${def.name}と結婚した！これからは一緒に暮らしていく。`);
    return "…はい！これからずっと、よろしくね。";
  }

  // ===== スキル =====
  function gainXp(skill, amount) {
    const s = state.skills[skill];
    s.xp += amount;
    const need = s.lv * 25;
    if (s.xp >= need) {
      s.xp -= need;
      s.lv += 1;
      LP.UI.toast(`⭐ ${LP.SKILLS[skill]}スキルが Lv.${s.lv} に上がった！`);
      log(`⭐ ${LP.SKILLS[skill]}スキルが Lv.${s.lv} になった。`);
      if (skill === "gathering" || skill === "work") state.maxEnergy += 2;
    }
  }

  function log(html) {
    state.log = state.log || [];
    const entry = `<span class="t">[${state.day}日 ${LP.util.formatTime(state.time)}]</span> ${html}`;
    state.log.push(entry);
    if (state.log.length > 60) state.log.shift();
    LP.UI.log(entry);
  }

  function setPaused(v) {
    paused = v;
    input.keys = {};
    if (v) setJoystick(0, 0);
  }

  const api = {
    get state() {
      return state;
    },
    start,
    stop,
    save,
    hasSave,
    loadSaved,
    setPaused,
    setJoystick,
    interact,
    attack,
    rest,
    doWork,
    buy,
    sell,
    sellPrice,
    eat,
    cook,
    cookStew,
    talk,
    giveGift,
    propose,
    completeQuest,
    useQuickFood,
    seasonIndex,
    setQuality,
    getQuality,
    teleport,
    hudInfo,
  };
  return api;
})();
