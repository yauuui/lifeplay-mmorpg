/* LifePlay - 画面遷移(タイトル → キャラ作成 → ゲーム) */
window.LP = window.LP || {};

LP.Main = (() => {
  const $ = (id) => document.getElementById(id);
  const profile = {
    name: "ユウ",
    style: "short",
    hair: LP.APPEARANCE_OPTIONS.hair[0],
    skin: LP.APPEARANCE_OPTIONS.skin[0],
    outfit: LP.APPEARANCE_OPTIONS.outfit[0],
    job: "freelancer",
  };
  let preview = null;

  function showScreen(id) {
    for (const s of ["screen-title", "screen-create", "screen-game"]) $(s).classList.toggle("hidden", s !== id);
  }

  function toTitle() {
    LP.Game.stop();
    showScreen("screen-title");
    $("btn-continue").disabled = !LP.Game.hasSave();
  }

  // ===== キャラ作成 =====
  function buildSwatches(id, key) {
    const wrap = $(id);
    wrap.innerHTML = LP.APPEARANCE_OPTIONS[key].map((c) => `<button class="swatch" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join("");
    wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      profile[key] = b.dataset.color;
      refreshCreate();
    }));
  }

  function buildJobs() {
    const wrap = $("job-list");
    wrap.innerHTML = Object.entries(LP.JOBS).map(([id, j]) => `<button class="job" data-job="${id}"><b>${j.name}</b><small>${j.desc}</small><em>初期資金 ${j.money}G</em></button>`).join("");
    wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      profile.job = b.dataset.job;
      refreshCreate();
    }));
  }

  function refreshCreate() {
    document.querySelectorAll("#hair-list .swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === profile.hair));
    document.querySelectorAll("#skin-list .swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === profile.skin));
    document.querySelectorAll("#outfit-list .swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === profile.outfit));
    document.querySelectorAll("#job-list .job").forEach((b) => b.classList.toggle("active", b.dataset.job === profile.job));
    document.querySelectorAll("[data-style]").forEach((b) => b.classList.toggle("active", b.dataset.style === profile.style));
    updatePreviewModel();
  }

  function initPreview() {
    const host = $("preview");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 2.2, 8.5);
    camera.lookAt(0, 1.5, 0);
    scene.add(new THREE.HemisphereLight("#ffffff", "#6b8a5a", 0.9));
    const key = new THREE.DirectionalLight("#fff3e0", 0.9);
    key.position.set(3, 6, 5);
    scene.add(key);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.25, 40), new THREE.MeshStandardMaterial({ color: "#4d6a80", roughness: 0.8 }));
    stage.position.y = -0.13;
    scene.add(stage);
    preview = { renderer, scene, camera, model: null, host, angle: 0.4 };
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    preview.resize = resize;
    // ドラッグで回転
    let drag = null;
    host.addEventListener("pointerdown", (e) => (drag = e.clientX));
    window.addEventListener("pointerup", () => (drag = null));
    window.addEventListener("pointermove", (e) => {
      if (drag === null) return;
      preview.angle += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    });
    const tick = () => {
      requestAnimationFrame(tick);
      if ($("screen-create").classList.contains("hidden") || !preview.model) return;
      preview.angle += 0.004;
      preview.model.rotation.y = preview.angle;
      LP.Characters.animate(preview.model, 0.016, 0);
      renderer.render(scene, camera);
    };
    tick();
  }

  function updatePreviewModel() {
    if (!preview) return;
    if (preview.model) preview.scene.remove(preview.model);
    preview.model = LP.Characters.create(profile);
    preview.model.rotation.y = preview.angle;
    preview.scene.add(preview.model);
  }

  function openCreate() {
    showScreen("screen-create");
    if (!preview) initPreview();
    preview.resize();
    refreshCreate();
    $("name-input").focus();
  }

  function startNew() {
    const name = $("name-input").value.trim().slice(0, 10);
    if (!name) {
      $("name-input").classList.add("error");
      $("name-input").focus();
      return;
    }
    profile.name = name;
    if (LP.Game.hasSave() && !confirm("既存のセーブデータは上書きされます。新しく始めますか？")) return;
    launch(null);
  }

  function launch(saved) {
    showScreen("screen-game");
    try {
      LP.Game.start($("game-root"), saved, { ...profile });
      if (!saved) LP.Game.save(true);
    } catch (e) {
      console.error(e);
      showFatal("ゲームの起動に失敗しました: " + e.message);
    }
  }

  function showFatal(msg) {
    const el = $("fatal");
    el.querySelector("p").textContent = msg;
    el.classList.remove("hidden");
  }

  function init() {
    if (typeof THREE === "undefined") {
      showFatal("3Dエンジン(Three.js)を読み込めませんでした。vendor/three.min.js があるか確認してください。");
      return;
    }
    // WebGL チェック
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) throw new Error("no webgl");
    } catch (e) {
      showFatal("このブラウザ/端末では WebGL が使えないため、3D表示ができません。");
      return;
    }

    buildSwatches("hair-list", "hair");
    buildSwatches("skin-list", "skin");
    buildSwatches("outfit-list", "outfit");
    buildJobs();
    document.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => {
      profile.style = b.dataset.style;
      refreshCreate();
    }));
    $("name-input").addEventListener("input", () => $("name-input").classList.remove("error"));
    $("name-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") startNew();
    });
    $("btn-new").addEventListener("click", openCreate);
    $("btn-continue").addEventListener("click", () => {
      const saved = LP.Game.loadSaved();
      if (saved) launch(saved);
    });
    $("btn-back").addEventListener("click", toTitle);
    $("btn-start").addEventListener("click", startNew);
    $("btn-random").addEventListener("click", () => {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      profile.hair = pick(LP.APPEARANCE_OPTIONS.hair);
      profile.skin = pick(LP.APPEARANCE_OPTIONS.skin);
      profile.outfit = pick(LP.APPEARANCE_OPTIONS.outfit);
      profile.style = pick(["short", "long"]);
      refreshCreate();
    });
    window.addEventListener("beforeunload", () => {
      if (!$("screen-game").classList.contains("hidden")) LP.Game.save(true);
    });
    toTitle();
  }

  window.addEventListener("error", (e) => {
    if (e.message && /THREE|WebGL/.test(e.message)) showFatal(e.message);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { toTitle };
})();
