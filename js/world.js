/* LifePlay - ワールド生成(地形・街・森・建物・遺跡・海・昼夜) */
window.LP = window.LP || {};

LP.World = (() => {
  const { rng, clamp } = LP.util;
  const HALF = 200;

  // 道路(折れ線, 幅)
  const ROADS = [
    { pts: [[0, 0], [0, -30]], w: 7 },
    { pts: [[0, 0], [-60, 0], [-95, -45], [-110, -62]], w: 6 },
    { pts: [[0, 0], [65, 0], [85, -30], [95, -45]], w: 6 },
    { pts: [[0, 0], [0, 60], [-10, 100], [-16, 130]], w: 6 },
    { pts: [[65, 0], [95, 40], [115, 60]], w: 5 },
    { pts: [[-32, -14], [32, -14]], w: 5 },
    { pts: [[-32, 16], [32, 16]], w: 5 },
    { pts: [[-30, 16], [-30, 22]], w: 4 },
    { pts: [[28, 16], [28, 20]], w: 4 },
  ];
  const PIER = { x1: -20, x2: -12, z1: 150, z2: 194 };
  const FARM_ORIGIN = { x: -135, z: -118 }; // 畑の左上
  const PLOT_SIZE = 3.4;
  const PLOT_COLS = 5;
  const PLOT_ROWS = 4;

  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  function nearRoad(x, z, margin) {
    for (const r of ROADS) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        if (segDist(x, z, ax, az, bx, bz) < r.w / 2 + margin) return true;
      }
    }
    return Math.hypot(x, z) < 14 + margin;
  }
  function zoneAt(x, z) {
    for (const zn of LP.ZONES) {
      if (x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2) return zn;
    }
    return null;
  }
  function inBuilding(x, z, pad) {
    for (const b of LP.BUILDINGS) {
      if (Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad) return true;
    }
    return false;
  }
  function inFarmPlots(x, z, pad) {
    return (
      x > FARM_ORIGIN.x - pad && x < FARM_ORIGIN.x + PLOT_COLS * (PLOT_SIZE + 1) + pad &&
      z > FARM_ORIGIN.z - pad && z < FARM_ORIGIN.z + PLOT_ROWS * (PLOT_SIZE + 1) + pad
    );
  }

  // ===== 地面テクスチャ / マップ描画 =====
  function toPx(v, size) {
    return ((v + HALF) / (HALF * 2)) * size;
  }

  function paintGround(canvas, seasonIdx, forMap) {
    const size = canvas.width;
    const ctx = canvas.getContext("2d");
    const season = LP.SEASONS[seasonIdx];
    const s = size / (HALF * 2);
    ctx.fillStyle = season.grass;
    ctx.fillRect(0, 0, size, size);

    // 草の濃淡ノイズ
    const r = rng(42);
    const n = forMap ? 600 : 5000;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,40,0"},${0.03 + r() * 0.05})`;
      const rad = (2 + r() * 10) * s;
      ctx.beginPath();
      ctx.arc(r() * size, r() * size, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // エリアごとの地面
    const rect = (x1, z1, x2, z2, color, radius = 18) => {
      ctx.fillStyle = color;
      const px = toPx(x1, size), pz = toPx(z1, size);
      const w = (x2 - x1) * s, h = (z2 - z1) * s;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, pz, w, h, radius * s);
      else ctx.rect(px, pz, w, h);
      ctx.fill();
    };
    // 森: 濃い緑
    ctx.globalAlpha = 0.55;
    rect(60, -192, 192, -25, seasonIdx === 3 ? "#c9d6d0" : "#2c5e2e", 30);
    // 遺跡: 土
    ctx.globalAlpha = 0.75;
    rect(75, 45, 185, 150, "#9c8f78", 30);
    ctx.globalAlpha = 1;
    // 砂浜
    const grad = ctx.createLinearGradient(0, toPx(118, size), 0, toPx(200, size));
    grad.addColorStop(0, seasonIdx === 3 ? "#e6eef2" : season.grass);
    grad.addColorStop(0.12, "#eadca5");
    grad.addColorStop(0.55, "#e2cf8f");
    grad.addColorStop(0.62, "#7fb6c4");
    grad.addColorStop(1, "#2c7fa8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, toPx(118, size), size, size);
    // 畑
    rect(-175, -160, -70, -60, "#a9b35a", 12);
    // 町の石畳
    rect(-48, -48, 48, 48, "#cdbf9f", 10);
    ctx.fillStyle = "#d9cdb0";
    ctx.beginPath();
    ctx.arc(toPx(0, size), toPx(0, size), 14 * s, 0, Math.PI * 2);
    ctx.fill();
    if (!forMap) {
      // 石畳の目地
      ctx.strokeStyle = "rgba(90,70,50,0.18)";
      ctx.lineWidth = Math.max(1, 0.15 * s);
      for (let x = -48; x <= 48; x += 2.5) {
        ctx.beginPath();
        ctx.moveTo(toPx(x, size), toPx(-48, size));
        ctx.lineTo(toPx(x, size), toPx(48, size));
        ctx.stroke();
      }
      for (let z = -48; z <= 48; z += 2.5) {
        ctx.beginPath();
        ctx.moveTo(toPx(-48, size), toPx(z, size));
        ctx.lineTo(toPx(48, size), toPx(z, size));
        ctx.stroke();
      }
    }
    // 道路
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const road of ROADS) {
      ctx.strokeStyle = "#b99a6b";
      ctx.lineWidth = road.w * s;
      ctx.beginPath();
      road.pts.forEach(([x, z], i) => (i ? ctx.lineTo(toPx(x, size), toPx(z, size)) : ctx.moveTo(toPx(x, size), toPx(z, size))));
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,210,0.25)";
      ctx.lineWidth = road.w * s * 0.45;
      ctx.stroke();
    }
    // 畑の区画
    ctx.fillStyle = "#6b4a2e";
    for (let r2 = 0; r2 < PLOT_ROWS; r2++) {
      for (let c = 0; c < PLOT_COLS; c++) {
        const x = FARM_ORIGIN.x + c * (PLOT_SIZE + 1);
        const z = FARM_ORIGIN.z + r2 * (PLOT_SIZE + 1);
        ctx.fillRect(toPx(x, size), toPx(z, size), PLOT_SIZE * s, PLOT_SIZE * s);
      }
    }
  }

  // ===== ジオメトリ ヘルパ =====
  function stdMat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  }
  function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function gableRoof(w, d, h, material) {
    // w 方向に三角形、d 方向に押し出し
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.8, 0);
    shape.lineTo(w / 2 + 0.8, 0);
    shape.lineTo(0, h);
    shape.lineTo(-w / 2 - 0.8, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 1.2, bevelEnabled: false });
    geo.translate(0, 0, -(d + 1.2) / 2);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    return m;
  }

  // ===== ビルド =====
  function build(scene) {
    const world = {
      boxes: [], // {x1,x2,z1,z2}
      circles: [], // {x,z,r}
      doors: [],
      resources: [],
      plots: [],
      windowMats: [],
      lampMats: [],
      lampLights: [],
      animated: [],
      seasonal: {},
      groundCanvas: document.createElement("canvas"),
      mapCanvas: document.createElement("canvas"),
      pier: PIER,
    };
    const root = new THREE.Group();
    scene.add(root);
    const r = rng(20261006);

    // --- 地面 ---
    world.groundCanvas.width = world.groundCanvas.height = 2048;
    world.mapCanvas.width = world.mapCanvas.height = 512;
    paintGround(world.groundCanvas, 0, false);
    const groundTex = new THREE.CanvasTexture(world.groundCanvas);
    groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    world.groundTex = groundTex;

    // ワールド外周の草地(地平線まで)
    const outerSq = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), stdMat("#5d9a50"));
    outerSq.rotation.x = -Math.PI / 2;
    outerSq.position.set(0, -0.08, 166 - 450); // 南端は海岸線まで
    root.add(outerSq);
    world.seasonal.outerSq = outerSq.material;

    // --- 海 ---
    const waterGeo = new THREE.PlaneGeometry(1000, 420, 80, 30);
    const water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({ color: "#2d8fc4", roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.32, 165 + 210);
    root.add(water);
    world.water = water;
    world.waterBase = waterGeo.attributes.position.array.slice();

    // --- 外周の山 ---
    const mountainMat = stdMat("#6f8a76", { flatShading: true });
    const snowMat = stdMat("#f4f7fa", { flatShading: true });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      if (Math.sin(a) > 0.55) continue; // 南(海側)は山を置かない
      const dist = 250 + r() * 60;
      const h = 50 + r() * 70;
      const m = new THREE.Mesh(new THREE.ConeGeometry(30 + r() * 25, h, 7), mountainMat);
      m.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
      root.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(9, h * 0.25, 7), snowMat);
      cap.position.set(m.position.x, h - h * 0.125 - 2, m.position.z);
      root.add(cap);
    }

    // --- 建物 ---
    for (const b of LP.BUILDINGS) buildHouse(root, world, b, r);

    // --- 噴水 ---
    {
      const stone = stdMat("#c8c2b6");
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 1, 24), stone);
      basin.position.set(0, 0.5, 0);
      basin.receiveShadow = true;
      root.add(basin);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 24), new THREE.MeshStandardMaterial({ color: "#5cc6f0", roughness: 0.1, metalness: 0.4 }));
      pool.position.set(0, 0.95, 0);
      root.add(pool);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 12), stone);
      pillar.position.set(0, 2, 0);
      root.add(pillar);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.4, 16), stone);
      top.position.set(0, 3.6, 0);
      root.add(top);
      const spray = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#bfefff", transparent: true, opacity: 0.55 }));
      spray.position.set(0, 4.8, 0);
      root.add(spray);
      world.animated.push((t) => {
        spray.scale.y = 1 + Math.sin(t * 6) * 0.08;
        spray.rotation.y = t;
      });
      world.circles.push({ x: 0, z: 0, r: 5 });
    }

    // --- 屋台(広場) ---
    const stallCols = ["#e85d5d", "#f2c14e", "#5d9de8", "#7cc46a"];
    [[-11, 8], [11, 8], [-11, -8], [11, -8]].forEach(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(-x, -z);
      g.add(box(3.2, 1, 1.6, stdMat("#8b5a2b"), 0, 0.5, 0));
      for (const [px, pz] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) g.add(box(0.15, 2.8, 0.15, stdMat("#6b4423"), px, 1.4, pz));
      const awning = box(3.6, 0.15, 2.2, stdMat(stallCols[i]), 0, 2.85, 0);
      awning.rotation.x = 0.15;
      g.add(awning);
      for (let k = 0; k < 4; k++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), stdMat(["#e84a3c", "#f5a623", "#9bd34a", "#b56be0"][k]));
        fruit.position.set(-1.1 + k * 0.7, 1.15, 0);
        g.add(fruit);
      }
      root.add(g);
      world.circles.push({ x, z, r: 2 });
    });

    // --- 街灯 ---
    const lampSpots = [[-16, -10], [16, -10], [-16, 10], [16, 10], [-40, -14], [40, -14], [-40, 16], [40, 16], [8, -22], [0, 28], [-55, 4], [58, 4], [0, 52], [-6, 80]];
    const poleMat = stdMat("#2f3438", { metalness: 0.6, roughness: 0.4 });
    lampSpots.forEach(([x, z], i) => {
      root.add(box(0.25, 5, 0.25, poleMat, x, 2.5, z));
      const bulbMat = new THREE.MeshStandardMaterial({ color: "#fff3c4", emissive: "#ffcc66", emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), bulbMat);
      bulb.position.set(x, 5.2, z);
      root.add(bulb);
      world.lampMats.push(bulbMat);
      if (i < 4) {
        const light = new THREE.PointLight("#ffcf80", 0, 26, 1.6);
        light.position.set(x, 5, z);
        root.add(light);
        world.lampLights.push(light);
      }
      world.circles.push({ x, z, r: 0.5 });
    });

    // --- 畑 ---
    buildFarm(root, world);

    // --- 遺跡 ---
    buildRuins(root, world, r);

    // --- 桟橋 ---
    {
      const wood = stdMat("#8a6038");
      const deck = box(PIER.x2 - PIER.x1, 0.4, PIER.z2 - PIER.z1, wood, (PIER.x1 + PIER.x2) / 2, 0.55, (PIER.z1 + PIER.z2) / 2);
      root.add(deck);
      for (let z = PIER.z1 + 2; z < PIER.z2; z += 5) {
        for (const x of [PIER.x1 + 0.3, PIER.x2 - 0.3]) root.add(box(0.4, 2.5, 0.4, stdMat("#5a3d22"), x, 0, z));
      }
      // ボート
      const boat = new THREE.Group();
      boat.add(box(2.4, 0.8, 5.5, stdMat("#c94c3a"), 0, 0, 0));
      boat.add(box(2, 0.3, 5, stdMat("#e8d6b0"), 0, 0.3, 0));
      boat.position.set(-24, 0.4, 178);
      root.add(boat);
      world.animated.push((t) => {
        boat.position.y = 0.4 + Math.sin(t * 1.4) * 0.15;
        boat.rotation.z = Math.sin(t * 1.1) * 0.05;
      });
    }

    // --- 森・木 ---
    buildVegetation(root, world, r);

    // --- 柵(畑) ---
    buildFence(root, world, -175, -160, -70, -60, [[-110, -60, 14]]);

    // --- 看板 ---
    const signs = [
      [-62, -2, "← 農場"], [66, -4, "森 →"], [4, 62, "↓ 海岸"], [92, 34, "遺跡 ↘"],
    ];
    for (const [x, z, text] of signs) {
      root.add(box(0.25, 2.4, 0.25, stdMat("#6b4423"), x, 1.2, z));
      const label = LP.Characters.makeLabel(text, "#fff6d8");
      label.position.set(x, 2.9, z);
      label.scale.set(4, 1.25, 1);
      root.add(label);
    }

    paintMap(world, 0);
    world.root = root;
    return world;
  }

  function buildHouse(root, world, b, r) {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const wall = stdMat(b.wall);
    const trim = stdMat("#6b4a32");
    // 土台
    g.add(box(b.w + 0.6, 0.6, b.d + 0.6, stdMat("#8e877b"), 0, 0.3, 0));
    // 壁
    g.add(box(b.w, b.h, b.d, wall, 0, b.h / 2 + 0.6, 0));
    // 角柱
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.5, b.h, 0.5, trim, (sx * b.w) / 2, b.h / 2 + 0.6, (sz * b.d) / 2));
    // 屋根: 長辺方向に棟を通す
    const roofMat = stdMat(b.roof);
    const along = b.w >= b.d;
    const roof = gableRoof(along ? b.d : b.w, along ? b.w : b.d, b.h * 0.55, roofMat);
    roof.position.y = b.h + 0.6;
    roof.rotation.y = along ? Math.PI / 2 : 0;
    g.add(roof);
    // 煙突
    if (r() > 0.4) g.add(box(1, 3, 1, stdMat("#7d6a5e"), b.w * 0.25, b.h + 2.2, b.d * 0.15));

    // 扉と窓
    const dir = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[b.door];
    const halfDepth = dir[0] ? b.w / 2 : b.d / 2;
    const door = box(dir[0] ? 0.2 : 2, 3.2, dir[0] ? 2 : 0.2, stdMat("#5a3820"), dir[0] * (halfDepth + 0.05), 2.2, dir[1] * (halfDepth + 0.05));
    g.add(door);
    // 庇
    g.add(box(dir[0] ? 1.2 : 3, 0.2, dir[0] ? 3 : 1.2, roofMat, dir[0] * (halfDepth + 0.6), 4.1, dir[1] * (halfDepth + 0.6)));

    const winMat = new THREE.MeshStandardMaterial({ color: "#a8d8f0", emissive: "#ffb84d", emissiveIntensity: 0, roughness: 0.2 });
    world.windowMats.push(winMat);
    const sides = [[0, 1, b.w], [0, -1, b.w], [1, 0, b.d], [-1, 0, b.d]];
    for (const [sx, sz, len] of sides) {
      const half = sx ? b.w / 2 : b.d / 2;
      const count = Math.max(1, Math.floor(len / 5));
      for (let i = 0; i < count; i++) {
        const off = -len / 2 + (len / count) * (i + 0.5);
        if (sx === dir[0] && sz === dir[1] && Math.abs(off) < 2) continue; // 扉の位置
        for (const floorY of b.h > 9 ? [2.8, 7] : [2.8]) {
          const win = box(sx ? 0.15 : 1.4, 1.4, sx ? 1.4 : 0.15, winMat, sx ? sx * (half + 0.05) : off, floorY + 0.6, sz ? sz * (half + 0.05) : off);
          win.castShadow = false;
          g.add(win);
        }
      }
    }
    root.add(g);

    // 看板
    if (b.enter) {
      const label = LP.Characters.makeLabel(b.name, "#fff1b8");
      label.position.set(b.x + dir[0] * (halfDepth + 0.8), 5.4, b.z + dir[1] * (halfDepth + 0.8));
      label.scale.set(3.6, 1.15, 1);
      root.add(label);
    }

    world.boxes.push({ x1: b.x - b.w / 2 - 0.4, x2: b.x + b.w / 2 + 0.4, z1: b.z - b.d / 2 - 0.4, z2: b.z + b.d / 2 + 0.4, h: b.h * 1.55 + 0.6 });
    if (b.enter) {
      world.doors.push({ building: b, x: b.x + dir[0] * (halfDepth + 2), z: b.z + dir[1] * (halfDepth + 2) });
    }
  }

  function buildFarm(root, world) {
    const soil = stdMat("#5c3d22");
    const soilWet = stdMat("#3b2614");
    for (let row = 0; row < PLOT_ROWS; row++) {
      for (let col = 0; col < PLOT_COLS; col++) {
        const x = FARM_ORIGIN.x + col * (PLOT_SIZE + 1) + PLOT_SIZE / 2;
        const z = FARM_ORIGIN.z + row * (PLOT_SIZE + 1) + PLOT_SIZE / 2;
        const bed = new THREE.Mesh(new THREE.BoxGeometry(PLOT_SIZE, 0.35, PLOT_SIZE), soil);
        bed.position.set(x, 0.17, z);
        bed.receiveShadow = true;
        root.add(bed);
        const crop = new THREE.Group();
        crop.position.set(x, 0.35, z);
        root.add(crop);
        world.plots.push({ x, z, bed, crop, soil, soilWet });
      }
    }
    // 案山子
    const sc = new THREE.Group();
    sc.add(box(0.2, 3.2, 0.2, stdMat("#6b4423"), 0, 1.6, 0));
    sc.add(box(2.4, 0.2, 0.2, stdMat("#6b4423"), 0, 2.4, 0));
    sc.add(box(1.1, 1.3, 0.6, stdMat("#3f6fb0"), 0, 2.2, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), stdMat("#e8d39a"));
    head.position.y = 3.25;
    sc.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 12), stdMat("#c9a640"));
    hat.position.y = 3.75;
    sc.add(hat);
    sc.position.set(-142, 0, -100);
    root.add(sc);
    world.circles.push({ x: -142, z: -100, r: 0.6 });
    // 干し草
    for (let i = 0; i < 4; i++) {
      const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 14), stdMat("#d8b85a"));
      hay.rotation.z = Math.PI / 2;
      hay.position.set(-162 + i * 2.6, 1.1, -126);
      root.add(hay);
      world.circles.push({ x: hay.position.x, z: -126, r: 1.2 });
    }
    // 井戸
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 1.2, 14), stdMat("#9a9488"));
    well.position.set(-100, 0.6, -128);
    root.add(well);
    root.add(box(0.2, 3, 0.2, stdMat("#6b4423"), -101.2, 1.5, -128));
    root.add(box(0.2, 3, 0.2, stdMat("#6b4423"), -98.8, 1.5, -128));
    const wr = gableRoof(3.2, 3, 1.2, stdMat("#7a4b2a"));
    wr.position.set(-100, 3, -128);
    root.add(wr);
    world.circles.push({ x: -100, z: -128, r: 1.6 });
    world.well = { x: -100, z: -128 };
  }

  function buildFence(root, world, x1, z1, x2, z2, gaps) {
    const mat = stdMat("#9c7448");
    const isGap = (x, z) => gaps.some(([gx, gz, gw]) => Math.hypot(x - gx, z - gz) < gw / 2);
    const segs = [[x1, z1, x2, z1], [x2, z1, x2, z2], [x2, z2, x1, z2], [x1, z2, x1, z1]];
    for (const [ax, az, bx, bz] of segs) {
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.floor(len / 3);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (isGap(x, z)) continue;
        root.add(box(0.3, 1.4, 0.3, mat, x, 0.7, z));
        if (i < steps) {
          const nx = ax + (bx - ax) * ((i + 0.5) / steps), nz = az + (bz - az) * ((i + 0.5) / steps);
          if (isGap(nx, nz)) continue;
          const rail = box(ax === bx ? 0.12 : len / steps, 0.15, ax === bx ? len / steps : 0.12, mat, nx, 1.05, nz);
          root.add(rail);
          world.circles.push({ x: nx, z: nz, r: 0.9 });
        }
      }
    }
  }

  function buildRuins(root, world, r) {
    const stone = stdMat("#a59d8e", { flatShading: true });
    const moss = stdMat("#6f8a5a", { flatShading: true });
    const cx = 130, cz = 98;
    // 円形の列柱
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * 18, z = cz + Math.sin(a) * 18;
      const h = r() > 0.35 ? 9 : 2 + r() * 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, h, 10), stone);
      col.position.set(x, h / 2, z);
      col.castShadow = true;
      root.add(col);
      if (h > 8) {
        const capital = box(2.6, 0.7, 2.6, stone, x, h + 0.35, z);
        root.add(capital);
      } else {
        const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), moss);
        rubble.position.set(x + 1.8, 0.5, z + 0.6);
        root.add(rubble);
      }
      world.circles.push({ x, z, r: 1.3 });
    }
    // 祭壇
    root.add(box(6, 1, 6, stone, cx, 0.5, cz));
    root.add(box(3, 1.4, 3, stone, cx, 1.7, cz));
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: "#8fe3ff", emissive: "#3aa8ff", emissiveIntensity: 0.8, roughness: 0.1 }));
    crystal.position.set(cx, 4, cz);
    root.add(crystal);
    world.animated.push((t) => {
      crystal.rotation.y = t * 0.8;
      crystal.position.y = 4 + Math.sin(t * 2) * 0.3;
    });
    world.circles.push({ x: cx, z: cz, r: 4 });
    // 崩れた壁
    const walls = [[100, 70, 14, 0], [160, 70, 10, 0.4], [105, 130, 12, -0.3], [165, 125, 9, 1.2], [95, 100, 8, 1.57]];
    for (const [x, z, len, rot] of walls) {
      const w = box(len, 3 + r() * 3, 1.4, stone, x, 2, z);
      w.rotation.y = rot;
      root.add(w);
      const steps = Math.ceil(len / 2);
      for (let i = 0; i <= steps; i++) {
        const t = -len / 2 + (len / steps) * i;
        world.circles.push({ x: x + Math.cos(rot) * t, z: z - Math.sin(rot) * t, r: 1.1 });
      }
    }
  }

  function buildVegetation(root, world, r) {
    const trees = [];
    const tryPlace = (x, z, kind) => {
      if (Math.abs(x) > 192 || Math.abs(z) > 192) return;
      if (z > 120) return;
      if (nearRoad(x, z, 3) || inBuilding(x, z, 4) || inFarmPlots(x, z, 6)) return;
      const zn = zoneAt(x, z);
      if (zn && (zn.id === "town" || zn.id === "farm")) return;
      if (zn && zn.id === "ruins" && Math.hypot(x - 130, z - 98) < 26) return;
      for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 4.8) return;
      trees.push({ x, z, kind, s: 0.8 + r() * 0.6 });
    };
    // 森: 密集
    for (let i = 0; i < 1400 && trees.length < 270; i++) tryPlace(60 + r() * 132, -192 + r() * 167, r() > 0.45 ? "pine" : "round");
    const forestCount = trees.length;
    // 平原: まばら
    for (let i = 0; i < 400; i++) {
      const x = -190 + r() * 380, z = -190 + r() * 300;
      if (r() > 0.25) continue;
      tryPlace(x, z, r() > 0.6 ? "pine" : "round");
    }
    // 外周の森(境界を自然に)
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const d = 180 + r() * 14;
      tryPlace(Math.cos(a) * d, Math.sin(a) * d, r() > 0.5 ? "pine" : "round");
    }

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 7);
    trunkGeo.translate(0, 1.5, 0);
    const pineGeo = new THREE.ConeGeometry(2.4, 6, 8);
    pineGeo.translate(0, 5.5, 0);
    const roundGeo = new THREE.IcosahedronGeometry(2.6, 1);
    roundGeo.translate(0, 5, 0);
    const trunkMat = stdMat("#6b4a2e");
    const leafMat = stdMat(LP.SEASONS[0].leaf, { flatShading: true });
    const leafMat2 = stdMat(LP.SEASONS[0].leaf2, { flatShading: true });
    const pines = trees.filter((t) => t.kind === "pine");
    const rounds = trees.filter((t) => t.kind === "round");
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const pineMesh = new THREE.InstancedMesh(pineGeo, leafMat, pines.length);
    const roundMesh = new THREE.InstancedMesh(roundGeo, leafMat2, rounds.length);
    for (const m of [trunks, pineMesh, roundMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    world.seasonal.leaf = leafMat;
    world.seasonal.leaf2 = leafMat2;

    const dummy = new THREE.Object3D();
    let pi = 0, ri = 0;
    trees.forEach((t, i) => {
      t.trunkIndex = i;
      t.leafMesh = t.kind === "pine" ? pineMesh : roundMesh;
      t.leafIndex = t.kind === "pine" ? pi++ : ri++;
      t.rot = r() * Math.PI * 2;
    });
    const setTree = (t, alive) => {
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.s, alive ? t.s : 0.25, t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(t.trunkIndex, dummy.matrix);
      dummy.scale.setScalar(alive ? t.s : 0.0001);
      dummy.updateMatrix();
      t.leafMesh.setMatrixAt(t.leafIndex, dummy.matrix);
      trunks.instanceMatrix.needsUpdate = true;
      t.leafMesh.instanceMatrix.needsUpdate = true;
    };
    trees.forEach((t, i) => {
      setTree(t, true);
      world.circles.push({ x: t.x, z: t.z, r: 0.9 * t.s });
      // 外周以外の木は伐採できる
      if (i < forestCount || Math.hypot(t.x, t.z) < 178) {
        world.resources.push({ type: "tree", x: t.x, z: t.z, alive: true, respawnDay: 0, set: (alive) => setTree(t, alive) });
      }
    });
    world.treeList = trees;

    // 岩
    const rockGeo = new THREE.DodecahedronGeometry(1.3, 0);
    const rocks = [];
    const placeRock = (x, z, ore) => {
      if (nearRoad(x, z, 2) || inBuilding(x, z, 3) || zoneAt(x, z)?.id === "town" || zoneAt(x, z)?.id === "farm") return;
      if (Math.hypot(x - 130, z - 98) < 6) return;
      for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 3) return;
      for (const k of rocks) if (Math.hypot(k.x - x, k.z - z) < 4) return;
      rocks.push({ x, z, ore, s: 0.7 + r() * 0.6, rot: r() * 6 });
    };
    for (let i = 0; i < 60; i++) placeRock(80 + r() * 100, 50 + r() * 95, true);
    for (let i = 0; i < 40; i++) placeRock(65 + r() * 125, -185 + r() * 155, false);
    for (let i = 0; i < 25; i++) placeRock(-190 + r() * 380, -60 + r() * 170, false);
    const rockMesh = new THREE.InstancedMesh(rockGeo, stdMat("#8c8c88", { flatShading: true }), rocks.length);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    root.add(rockMesh);
    rocks.forEach((k, i) => {
      const set = (alive) => {
        dummy.position.set(k.x, alive ? 0.5 * k.s : -5, k.z);
        dummy.rotation.set(k.rot, k.rot * 2, 0);
        dummy.scale.setScalar(k.s);
        dummy.updateMatrix();
        rockMesh.setMatrixAt(i, dummy.matrix);
        rockMesh.instanceMatrix.needsUpdate = true;
      };
      set(true);
      world.circles.push({ x: k.x, z: k.z, r: 1.2 * k.s });
      world.resources.push({ type: k.ore ? "ore" : "rock", x: k.x, z: k.z, alive: true, respawnDay: 0, set });
    });

    // 薬草と花
    const herbGeo = new THREE.ConeGeometry(0.35, 0.9, 5);
    herbGeo.translate(0, 0.45, 0);
    const flowerGeo = new THREE.SphereGeometry(0.35, 6, 5);
    flowerGeo.translate(0, 0.6, 0);
    const herbs = [], flowers = [];
    for (let i = 0; i < 260; i++) {
      const x = -190 + r() * 380, z = -190 + r() * 305;
      const zn = zoneAt(x, z);
      if (zn && (zn.id === "town" || zn.id === "farm")) continue;
      if (nearRoad(x, z, 1) || inBuilding(x, z, 2)) continue;
      if (zn && zn.id === "forest" ? r() > 0.4 : r() > 0.65) herbs.push({ x, z });
      else if (r() > 0.4) flowers.push({ x, z });
      if (herbs.length > 70 && flowers.length > 70) break;
    }
    const herbMesh = new THREE.InstancedMesh(herbGeo, stdMat("#3da55a"), herbs.length);
    const flowerMesh = new THREE.InstancedMesh(flowerGeo, stdMat("#ffffff"), flowers.length);
    root.add(herbMesh, flowerMesh);
    const fColors = ["#ff7eb6", "#ffd84d", "#9f7bff", "#ff6b5b", "#ffffff"];
    const addSmall = (list, mesh, type) => {
      list.forEach((h, i) => {
        if (type === "flower") mesh.setColorAt(i, new THREE.Color(fColors[i % fColors.length]));
        const set = (alive) => {
          dummy.position.set(h.x, 0, h.z);
          dummy.rotation.set(0, i, 0);
          dummy.scale.setScalar(alive ? 1 : 0.0001);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.instanceMatrix.needsUpdate = true;
        };
        set(true);
        world.resources.push({ type, x: h.x, z: h.z, alive: true, respawnDay: 0, set });
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    addSmall(herbs, herbMesh, "herb");
    addSmall(flowers, flowerMesh, "flower");

    // 草むら(装飾のみ)
    const tuftGeo = new THREE.ConeGeometry(0.25, 0.8, 3);
    tuftGeo.translate(0, 0.4, 0);
    const tuftMat = stdMat("#4f9a3f");
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 1400);
    let ti = 0;
    for (let i = 0; i < 4000 && ti < 1400; i++) {
      const x = -195 + r() * 390, z = -195 + r() * 315;
      const zn = zoneAt(x, z);
      if ((zn && zn.id === "town") || nearRoad(x, z, 0.5) || inBuilding(x, z, 1) || inFarmPlots(x, z, 1)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, r() * 3, (r() - 0.5) * 0.4);
      dummy.scale.setScalar(0.6 + r() * 0.9);
      dummy.updateMatrix();
      tufts.setMatrixAt(ti++, dummy.matrix);
    }
    tufts.count = ti;
    root.add(tufts);
    world.seasonal.tuft = tuftMat;
  }

  // ===== マップ(ミニマップ・全体地図共通) =====
  function paintMap(world, seasonIdx) {
    const c = world.mapCanvas;
    const size = c.width;
    paintGround(c, seasonIdx, true);
    const ctx = c.getContext("2d");
    const s = size / (HALF * 2);
    // 木
    ctx.fillStyle = seasonIdx === 3 ? "rgba(90,120,100,0.8)" : "rgba(20,70,30,0.75)";
    for (const t of world.treeList || []) {
      ctx.beginPath();
      ctx.arc(toPx(t.x, size), toPx(t.z, size), 2.2 * s * t.s, 0, Math.PI * 2);
      ctx.fill();
    }
    // 建物
    for (const b of LP.BUILDINGS) {
      ctx.fillStyle = b.roof;
      ctx.fillRect(toPx(b.x - b.w / 2, size), toPx(b.z - b.d / 2, size), b.w * s, b.d * s);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(toPx(b.x - b.w / 2, size), toPx(b.z - b.d / 2, size), b.w * s, b.d * s);
    }
    // 噴水・遺跡
    ctx.fillStyle = "#5cc6f0";
    ctx.beginPath();
    ctx.arc(toPx(0, size), toPx(0, size), 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8e2d5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toPx(130, size), toPx(98, size), 18 * s, 0, Math.PI * 2);
    ctx.stroke();
    // 桟橋
    ctx.fillStyle = "#8a6038";
    ctx.fillRect(toPx(PIER.x1, size), toPx(PIER.z1, size), (PIER.x2 - PIER.x1) * s, (PIER.z2 - PIER.z1) * s);
  }

  // ===== 季節 =====
  function applySeason(world, seasonIdx) {
    const season = LP.SEASONS[seasonIdx];
    paintGround(world.groundCanvas, seasonIdx, false);
    world.groundTex.needsUpdate = true;
    paintMap(world, seasonIdx);
    world.seasonal.leaf.color.set(season.leaf);
    world.seasonal.leaf2.color.set(season.leaf2);
    world.seasonal.outerSq.color.set(season.grass);
    world.seasonal.tuft.color.set(seasonIdx === 3 ? "#cfd8d4" : season.leaf);
  }

  // ===== 毎フレーム(海・アニメーション・昼夜) =====
  function update(world, t) {
    const pos = world.water.geometry.attributes.position;
    const base = world.waterBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.array[i * 3 + 2] = Math.sin(x * 0.08 + t * 1.3) * 0.14 + Math.cos(y * 0.11 + t * 0.9) * 0.1;
    }
    pos.needsUpdate = true;
    for (const fn of world.animated) fn(t);
  }

  // 衝突: 円(半径 rad)を押し出す。歩けない場所なら補正後の座標を返す
  function resolve(world, x, z, rad) {
    x = clamp(x, -LP.WORLD_HALF, LP.WORLD_HALF);
    z = clamp(z, -LP.WORLD_HALF, LP.WORLD_HALF);
    // 海(桟橋上は可)
    const onPier = x > PIER.x1 && x < PIER.x2 && z > PIER.z1 && z < PIER.z2;
    if (!onPier && z > LP.SEA_Z) {
      if (x > PIER.x1 - 1 && x < PIER.x2 + 1 && z > PIER.z1) {
        x = clamp(x, PIER.x1 + rad, PIER.x2 - rad);
      } else {
        z = LP.SEA_Z;
      }
    }
    for (const b of world.boxes) {
      const cx = clamp(x, b.x1, b.x2), cz = clamp(z, b.z1, b.z2);
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d < rad) {
        if (d > 0.0001) {
          x = cx + (dx / d) * rad;
          z = cz + (dz / d) * rad;
        } else {
          // 内部: 最も近い辺へ
          const opts = [[b.x1 - rad, z, x - b.x1], [b.x2 + rad, z, b.x2 - x], [x, b.z1 - rad, z - b.z1], [x, b.z2 + rad, b.z2 - z]];
          opts.sort((a, c) => a[2] - c[2]);
          x = opts[0][0];
          z = opts[0][1];
        }
      }
    }
    for (const c of world.circles) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > c.r + rad || Math.abs(dz) > c.r + rad) continue;
      const d = Math.hypot(dx, dz);
      const min = c.r + rad;
      if (d < min && d > 0.0001) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    return [x, z];
  }

  function locationName(x, z) {
    const zn = zoneAt(x, z);
    return zn ? zn.name : LP.FIELD_NAME;
  }

  return { build, update, applySeason, resolve, locationName, zoneAt, toPx, HALF };
})();
