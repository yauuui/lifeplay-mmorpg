/* LifePlay - キャラクターモデル(プリミティブで組み立てる) */
window.LP = window.LP || {};

LP.Characters = (() => {
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

  function limb(radius, length, material) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
    mesh.position.y = -length / 2 - radius * 0.5;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  /**
   * look: { hair, skin, outfit, style: "short" | "long" }
   * 戻り値の Group は userData.parts にアニメーション用のパーツを持つ。
   */
  function create(look) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const skinMat = mat(look.skin);
    const outfitMat = mat(look.outfit);
    const pantsMat = mat(new THREE.Color(look.outfit).multiplyScalar(0.45));
    const hairMat = mat(look.hair, { roughness: 0.6 });
    const shoeMat = mat("#3a2a20");

    // 脚
    const legL = limb(0.17, 0.55, pantsMat);
    const legR = limb(0.17, 0.55, pantsMat);
    legL.position.set(-0.2, 0.95, 0);
    legR.position.set(0.2, 0.95, 0);
    for (const leg of [legL, legR]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.42), shoeMat);
      shoe.position.set(0, -0.9, 0.06);
      leg.add(shoe);
    }
    body.add(legL, legR);

    // 胴体
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 4, 12), outfitMat);
    torso.position.y = 1.45;
    torso.castShadow = true;
    body.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 14), mat("#5a3b22"));
    belt.position.y = 1.12;
    body.add(belt);

    // 腕
    const armL = limb(0.12, 0.5, outfitMat);
    const armR = limb(0.12, 0.5, outfitMat);
    armL.position.set(-0.52, 1.8, 0);
    armR.position.set(0.52, 1.8, 0);
    for (const arm of [armL, armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skinMat);
      hand.position.y = -0.82;
      arm.add(hand);
    }
    body.add(armL, armR);

    // 頭
    const head = new THREE.Group();
    head.position.y = 2.42;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), skinMat);
    face.castShadow = true;
    head.add(face);
    const eyeMat = mat("#1d1d2b", { roughness: 0.3 });
    for (const sx of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
      eye.position.set(sx, 0.02, 0.38);
      eye.scale.y = 1.4;
      head.add(eye);
    }
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairCap.position.y = 0.04;
    hairCap.rotation.x = -0.25;
    head.add(hairCap);
    if (look.style === "long") {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.6, 4, 10), hairMat);
      back.position.set(0, -0.35, -0.2);
      back.scale.z = 0.6;
      head.add(back);
    } else {
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.2), hairMat);
      fringe.position.set(0, 0.28, 0.3);
      fringe.rotation.x = 0.3;
      head.add(fringe);
    }
    body.add(head);

    // 足元の影
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    root.add(shadow);

    root.userData.parts = { body, legL, legR, armL, armR, head };
    root.userData.walkPhase = 0;
    return root;
  }

  /** speed: 0(停止)〜1(走り) */
  function animate(model, dt, speed, attacking = 0) {
    const p = model.userData.parts;
    if (!p) return;
    model.userData.walkPhase += dt * (6 + speed * 6) * (speed > 0.01 ? 1 : 0);
    const ph = model.userData.walkPhase;
    const swing = Math.sin(ph) * 0.7 * Math.min(1, speed * 1.5);
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;
    p.body.position.y = speed > 0.01 ? Math.abs(Math.sin(ph)) * 0.08 : Math.sin(performance.now() / 600) * 0.02;
    if (attacking > 0) {
      p.armR.rotation.x = -2.6 + (1 - attacking) * 3.2;
    }
  }

  function makeLabel(text, color = "#ffffff", sub = "") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 30px 'Noto Sans JP', 'Hiragino Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(text, 128, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 34);
    if (sub) {
      ctx.font = "bold 20px sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeText(sub, 128, 66);
      ctx.fillStyle = "#ffd6e6";
      ctx.fillText(sub, 128, 66);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(3.2, 1, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function createSlime(color = "#5fd36a") {
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 18, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.25, transparent: true, opacity: 0.88 })
    );
    body.scale.y = 0.75;
    body.position.y = 0.6;
    body.castShadow = true;
    root.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const sx of [-0.25, 0.25]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      eye.position.set(sx, 0.75, 0.68);
      root.add(eye);
    }
    root.userData.body = body;
    return root;
  }

  return { create, animate, makeLabel, createSlime };
})();
