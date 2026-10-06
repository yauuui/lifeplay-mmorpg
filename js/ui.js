/* LifePlay - HUD・メニュー・会話・ショップ・ミニマップ */
window.LP = window.LP || {};

LP.UI = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => LP.util.escape(s);
  let game = null;
  let talkingTo = null;
  let openPanel = null; // "menu" | "dialog" | "building" | "map"
  let menuTab = "items";
  let lastHud = 0;
  let toastTimer = null;

  function bindGame(api) {
    game = api;
    if (bindGame.done) return;
    bindGame.done = true;

    document.querySelectorAll("[data-hot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.hot;
        if (a === "interact") game.interact();
        else if (a === "attack") game.attack();
        else if (a === "eat") game.useQuickFood();
        else if (a === "menu") toggleMenu("items");
        else if (a === "map") toggleMap();
        else if (a === "save") game.save();
      });
    });
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        menuTab = btn.dataset.tab;
        renderMenu();
      });
    });
    document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeAll));
    $("prompt").addEventListener("click", () => game.interact());
    bindJoystick();
  }

  // ===== パネル制御 =====
  function show(id, on) {
    $(id).classList.toggle("hidden", !on);
  }
  function closeAll() {
    for (const id of ["panel-menu", "panel-dialog", "panel-building", "panel-map"]) show(id, false);
    openPanel = null;
    talkingTo = null;
    game && game.setPaused(false);
  }
  function openP(name, id) {
    closeAll();
    openPanel = name;
    show(id, true);
    game.setPaused(true);
  }
  function toggleMenu(tab) {
    if (openPanel === "menu") return closeAll();
    menuTab = tab || menuTab;
    openP("menu", "panel-menu");
    renderMenu();
  }
  function toggleMap() {
    if (openPanel === "map") return closeAll();
    openP("map", "panel-map");
    drawWorldMap();
  }

  function handleKey(code) {
    if (code === "Escape") {
      if (openPanel) closeAll();
      else toggleMenu("system");
      return true;
    }
    if (code === "Tab" || code === "KeyI") {
      toggleMenu("items");
      return true;
    }
    if (code === "KeyM") {
      toggleMap();
      return true;
    }
    if (code === "KeyK") {
      game.save();
      return true;
    }
    if (openPanel) {
      if (code === "KeyE" || code === "Space") {
        if (openPanel === "dialog" || openPanel === "map") closeAll();
        return true;
      }
      return true; // パネル表示中は他の操作を無効化
    }
    return false;
  }

  function isTalkingTo(id) {
    return talkingTo === id;
  }

  // ===== HUD =====
  function bar(id, value, max) {
    const el = $(id);
    el.querySelector("i").style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    el.querySelector("b").textContent = `${Math.round(value)}/${Math.round(max)}`;
  }

  function updateHud(state, info) {
    // 毎フレーム: プロンプト・ミニマップ(軽量)
    drawMinimap(info);
    const prompt = $("prompt");
    if (info.fishing) {
      prompt.classList.remove("hidden");
      prompt.classList.toggle("bite", info.fishing.phase === "bite");
      prompt.innerHTML = info.fishing.phase === "bite" ? "<kbd>E</kbd> 今だ！引き上げる！" : "🎣 …魚がかかるのを待っている";
    } else if (info.target && !openPanel) {
      prompt.classList.remove("hidden", "bite");
      prompt.innerHTML = `<kbd>E</kbd> ${esc(info.target.label)}`;
      prompt.classList.toggle("idle", !!info.target.idle);
    } else {
      prompt.classList.add("hidden");
    }

    const now = performance.now();
    if (now - lastHud < 150) return;
    lastHud = now;
    $("hud-name").textContent = state.profile.name;
    $("hud-job").textContent = LP.JOBS[state.profile.job].name + (state.spouse ? " 💍" : "");
    bar("bar-hp", state.hp, 100);
    bar("bar-energy", state.energy, state.maxEnergy);
    bar("bar-hunger", state.hunger, 100);
    $("hud-money").textContent = state.money.toLocaleString();
    $("hud-location").textContent = info.location;
    $("hud-day").textContent = `${state.day}日目・${info.season}`;
    const h = state.time / 60;
    const icon = h >= 5 && h < 17 ? "☀" : h >= 17 && h < 19 ? "🌇" : "🌙";
    $("hud-time").textContent = `${icon} ${LP.util.formatTime(state.time)}`;
    $("hud-time").classList.toggle("late", h >= 23 || h < 2);

    // クエストトラッカー
    const open = state.quests.filter((q) => !q.done);
    $("hud-quests").innerHTML = open.length
      ? open.map((q) => {
          const have = state.inventory[q.item] || 0;
          return `<li class="${have >= q.n ? "ok" : ""}">${LP.ITEMS[q.item].icon} ${LP.ITEMS[q.item].name} ${Math.min(have, q.n)}/${q.n}</li>`;
        }).join("")
      : "<li>今日の依頼はすべて完了！</li>";
  }

  // ===== ミニマップ =====
  function drawMinimap(info) {
    const c = $("minimap");
    const ctx = c.getContext("2d");
    const W = c.width;
    const range = 70; // 表示半径(ワールド単位)
    const mapSize = info.map.width;
    const k = mapSize / (LP.World.HALF * 2);
    const sx = LP.World.toPx(info.x - range, mapSize);
    const sz = LP.World.toPx(info.z - range, mapSize);
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#2c7fa8";
    ctx.fillRect(0, 0, W, W);
    ctx.drawImage(info.map, sx, sz, range * 2 * k, range * 2 * k, 0, 0, W, W);
    const toMini = (x, z) => [((x - info.x + range) / (range * 2)) * W, ((z - info.z + range) / (range * 2)) * W];

    // 視野
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(W / 2, W / 2);
    const look = Math.atan2(-Math.cos(info.camYaw), -Math.sin(info.camYaw));
    ctx.arc(W / 2, W / 2, W * 0.42, look - 0.55, look + 0.55);
    ctx.closePath();
    ctx.fill();

    for (const d of info.doors) {
      const [x, y] = toMini(d.x, d.z);
      ctx.fillStyle = "#fff1b8";
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    ctx.fillStyle = "#ff5d5d";
    for (const s of info.slimes) {
      const [x, y] = toMini(s.x, s.z);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of info.npcs) {
      const [x, y] = toMini(n.x, n.z);
      ctx.fillStyle = "#ffd84d";
      ctx.strokeStyle = "#3a2a00";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // プレイヤー矢印
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-info.rot + Math.PI);
    ctx.fillStyle = "#4ff0ff";
    ctx.strokeStyle = "#002a33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // 方位
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeText("N", W / 2, 15);
    ctx.fillText("N", W / 2, 15);
    $("hud-coords").textContent = `X ${Math.round(info.x)}  Z ${Math.round(info.z)}`;
    drawMinimap.info = info;
  }

  function drawWorldMap() {
    const info = drawMinimap.info;
    if (!info) return;
    const c = $("worldmap");
    const ctx = c.getContext("2d");
    const W = c.width;
    ctx.drawImage(info.map, 0, 0, W, W);
    const to = (x, z) => [LP.World.toPx(x, W), LP.World.toPx(z, W)];
    ctx.textAlign = "center";
    ctx.font = "bold 15px sans-serif";
    for (const zn of LP.ZONES) {
      const [x, y] = to((zn.x1 + zn.x2) / 2, (zn.z1 + zn.z2) / 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(zn.name, x, zn.id === "town" ? y + 26 : y);
      ctx.fillStyle = "#fff";
      ctx.fillText(zn.name, x, zn.id === "town" ? y + 26 : y);
    }
    ctx.font = "bold 11px sans-serif";
    for (const d of info.doors) {
      const [x, y] = to(d.x, d.z);
      ctx.fillStyle = "#fff1b8";
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const n of info.npcs) {
      const [x, y] = to(n.x, n.z);
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(n.name, x, y - 7);
      ctx.fillText(n.name, x, y - 7);
    }
    const [px, py] = to(info.x, info.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-info.rot + Math.PI);
    ctx.fillStyle = "#4ff0ff";
    ctx.strokeStyle = "#002a33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ===== メニュー =====
  function renderMenu() {
    const s = game.state;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === menuTab));
    const body = $("menu-body");
    if (menuTab === "items") {
      const ids = Object.keys(s.inventory).filter((id) => s.inventory[id] > 0 && LP.ITEMS[id]);
      const equip = Object.entries(s.equip).filter(([, v]) => v).map(([, id]) => `<span class="pill">${LP.ITEMS[id].icon} ${LP.ITEMS[id].name}(装備中)</span>`).join(" ");
      body.innerHTML = `
        <p class="muted">所持金 <b>${s.money.toLocaleString()} G</b> ${equip}</p>
        <div class="item-grid">${ids.length ? ids.map((id) => {
          const it = LP.ITEMS[id];
          return `<div class="item-card"><div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ct">×${s.inventory[id]}</div>
            ${it.food ? `<button data-eat="${id}">食べる</button>` : ""}</div>`;
        }).join("") : '<p class="muted">何も持っていない</p>'}</div>`;
      body.querySelectorAll("[data-eat]").forEach((b) => b.addEventListener("click", () => {
        game.eat(b.dataset.eat);
        renderMenu();
      }));
    } else if (menuTab === "skills") {
      body.innerHTML = `<div class="skill-rows">${Object.entries(LP.SKILLS).map(([k, name]) => {
        const sk = s.skills[k];
        return `<div class="skill-row"><span>${name}</span><b>Lv.${sk.lv}</b><div class="xp"><i style="width:${(sk.xp / (sk.lv * 25)) * 100}%"></i></div></div>`;
      }).join("")}</div>
      <h4>記録</h4>
      <p class="muted">スライム討伐 ${s.stats.slimes} ／ 釣った魚 ${s.stats.fish} ／ 収穫 ${s.stats.harvest} ／ 依頼達成 ${s.stats.quests}</p>`;
    } else if (menuTab === "people") {
      body.innerHTML = `<div class="people">${LP.NPCS.map((n) => {
        const aff = s.relations[n.id] || 0;
        const hearts = Math.round(aff / 20);
        return `<div class="person"><b>${n.name}</b>${n.romance ? '<span class="pill pink">恋愛可</span>' : ""}${s.spouse === n.id ? '<span class="pill pink">配偶者</span>' : ""}
          <div class="hearts">${"♥".repeat(hearts)}<span>${"♥".repeat(5 - hearts)}</span></div>
          <small>好きなもの: ${n.likes.map((id) => LP.ITEMS[id].name).join("・")}</small></div>`;
      }).join("")}</div>`;
    } else if (menuTab === "quests") {
      body.innerHTML = `<p class="muted">依頼は役所の掲示板で納品できます(毎日更新)。</p>${questList(false)}`;
    } else if (menuTab === "help") {
      body.innerHTML = `
        <div class="help-grid">
          <div><kbd>W A S D</kbd> 移動　<kbd>Shift</kbd> ダッシュ</div>
          <div><kbd>マウスドラッグ</kbd> 視点　<kbd>ホイール</kbd> ズーム</div>
          <div><kbd>E</kbd>/<kbd>Space</kbd> 話す・調べる・採集・釣り</div>
          <div><kbd>F</kbd> 攻撃(木や岩も叩ける)</div>
          <div><kbd>1</kbd> 手持ちの食べ物を食べる</div>
          <div><kbd>I</kbd>/<kbd>Tab</kbd> メニュー　<kbd>M</kbd> 地図　<kbd>K</kbd> セーブ　<kbd>Esc</kbd> 閉じる</div>
        </div>
        <h4>暮らしのヒント</h4>
        <ul class="tips">
          <li>雑貨屋で種を買い、農場の畑にまいて毎日水やり。数日で収穫できます。</li>
          <li>海岸や桟橋で釣り。桟橋の先端は大物ポイント。</li>
          <li>森・遺跡の木や岩から素材を集めて、売ったり依頼に納品しよう。</li>
          <li>夜はスライムが活発に。深夜2時を過ぎると倒れてしまいます。自宅で眠ろう。</li>
          <li>住人と毎日話し、好きなものを贈ると好感度アップ。♥4つ以上で誓いのペンダントを渡すと結婚できます。</li>
        </ul>`;
    } else if (menuTab === "system") {
      body.innerHTML = `
        <div class="sys-buttons">
          <button id="sys-save" class="primary">💾 セーブする</button>
          <button id="sys-title">🏠 タイトルへ戻る(自動セーブ)</button>
          <button id="sys-quality">🎨 画質: ${game.getQuality() ? "高(影あり)" : "軽量(影なし)"}</button>
        </div>
        <p class="muted">セーブデータはこのブラウザに保存されます。自宅や宿で眠ると自動でセーブされます。</p>`;
      $("sys-save").onclick = () => game.save();
      $("sys-quality").onclick = () => {
        game.setQuality(!game.getQuality());
        renderMenu();
      };
      $("sys-title").onclick = () => {
        game.save(true);
        closeAll();
        LP.Main.toTitle();
      };
    }
  }

  function questList(deliver) {
    const s = game.state;
    return `<div class="quests">${s.quests.map((q, i) => {
      const giver = LP.NPCS.find((n) => n.id === q.giver);
      const have = s.inventory[q.item] || 0;
      return `<div class="quest ${q.done ? "done" : ""}">
        <div><b>${LP.ITEMS[q.item].icon} ${LP.ITEMS[q.item].name}を${q.n}個</b><small>依頼者: ${giver.name}</small></div>
        <div class="reward">${q.reward}G</div>
        ${q.done ? '<span class="pill">達成</span>' : deliver ? `<button data-quest="${i}" ${have >= q.n ? "" : "disabled"}>納品 (${have}/${q.n})</button>` : `<span class="muted">${have}/${q.n}</span>`}
      </div>`;
    }).join("")}</div>`;
  }

  // ===== 会話 =====
  function openDialogue(def, text) {
    openP("dialog", "panel-dialog");
    talkingTo = def.id;
    renderDialogue(def, text || game.talk(def.id));
  }

  function renderDialogue(def, text, mode) {
    const s = game.state;
    const aff = s.relations[def.id] || 0;
    const hearts = Math.round(aff / 20);
    $("dialog-name").innerHTML = `${esc(def.name)} <span class="hearts">${"♥".repeat(hearts)}<span>${"♥".repeat(5 - hearts)}</span></span>`;
    $("dialog-text").textContent = text;
    const opts = $("dialog-options");
    if (mode === "gift") {
      const ids = Object.keys(s.inventory).filter((id) => s.inventory[id] > 0 && LP.ITEMS[id].gift !== false);
      opts.innerHTML = ids.length
        ? ids.map((id) => `<button data-gift="${id}">${LP.ITEMS[id].icon} ${LP.ITEMS[id].name} ×${s.inventory[id]}</button>`).join("") + '<button data-back="1">やめる</button>'
        : '<span class="muted">贈れるものを持っていない</span><button data-back="1">戻る</button>';
    } else {
      opts.innerHTML = `
        <button data-act="talk">💬 話す</button>
        <button data-act="gift">🎁 プレゼント</button>
        ${def.romance && s.spouse !== def.id ? '<button data-act="propose">💍 プロポーズ</button>' : ""}
        <button data-act="bye">👋 さようなら</button>`;
    }
    opts.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.gift) {
        const reply = game.giveGift(def.id, b.dataset.gift);
        renderDialogue(def, reply || "…");
      } else if (b.dataset.back) renderDialogue(def, "他に何かある？");
      else if (b.dataset.act === "talk") renderDialogue(def, game.talk(def.id));
      else if (b.dataset.act === "gift") renderDialogue(def, "なにかくれるの？", "gift");
      else if (b.dataset.act === "propose") renderDialogue(def, game.propose(def.id));
      else closeAll();
    }));
  }

  // ===== 建物 =====
  function openBuilding(b) {
    openP("building", "panel-building");
    renderBuilding(b, "main");
  }

  function renderBuilding(b, view) {
    const s = game.state;
    $("building-name").textContent = b.name;
    const body = $("building-body");
    const h = s.time / 60;
    const shopRows = (ids) => ids.map((id) => {
      const it = LP.ITEMS[id];
      const owned = it.equip && s.equip[it.equip] === id;
      return `<div class="shop-row"><span>${it.icon} ${it.name}</span><b>${it.price}G</b><button data-buy="${id}" ${owned || s.money < it.price ? "disabled" : ""}>${owned ? "装備中" : "買う"}</button></div>`;
    }).join("");
    const sellRows = () => {
      const ids = Object.keys(s.inventory).filter((id) => s.inventory[id] > 0 && LP.ITEMS[id]);
      return ids.length ? ids.map((id) => `<div class="shop-row"><span>${LP.ITEMS[id].icon} ${LP.ITEMS[id].name} ×${s.inventory[id]}</span><b>${game.sellPrice(id)}G</b><button data-sell="${id}">1つ売る</button><button data-sellall="${id}">全部</button></div>`).join("") : '<p class="muted">売れるものがない</p>';
    };
    let html = `<p class="muted">所持金 <b>${s.money.toLocaleString()} G</b></p>`;
    if (b.id === "home") {
      html += `<p>${s.spouse ? `${LP.NPCS.find((n) => n.id === s.spouse).name}が笑顔で迎えてくれた。` : "落ち着く我が家。"}</p>
        <div class="actions">
          <button data-do="sleep">${h >= 6 && h < 17 ? "🛏 昼寝する(2時間)" : "🛏 眠る(翌朝まで・自動セーブ)"}</button>
          <button data-do="bread">🍞 パンを焼く(小麦×2)</button>
          <button data-do="stew">🍲 シチューを作る(魚+カブ)</button>
          <button data-do="save">💾 セーブ</button>
        </div>`;
    } else if (b.id === "inn") {
      html += `<p>「いらっしゃいませ、月のしずくへようこそ。」</p>
        <div class="actions"><button data-do="inn">🛏 泊まる (30G・翌朝まで)</button></div>
        <h4>食堂</h4>${shopRows(["bread", "stew"])}`;
    } else if (b.id === "shop") {
      html += view === "sell" ? `<h4>売る</h4>${sellRows()}<div class="actions"><button data-view="main">買う画面へ</button></div>`
        : `<h4>買う</h4>${shopRows(LP.SHOP_STOCK.shop)}<div class="actions"><button data-view="sell">💰 売る</button></div>`;
    } else if (b.id === "smith") {
      html += view === "sell" ? `<h4>売る</h4>${sellRows()}<div class="actions"><button data-view="main">買う画面へ</button></div>`
        : `<p>「いい道具は暮らしを変えるぜ。」</p><h4>装備</h4>${shopRows(LP.SHOP_STOCK.smith)}<div class="actions"><button data-view="sell">💰 素材を売る</button></div>`;
    } else if (b.id === "hall") {
      html += `<p>役所では町の仕事と、住人からの依頼を受け付けています。</p>
        <div class="actions"><button data-do="work" ${h >= 8 && h < 18 ? "" : "disabled"}>🧾 仕事を手伝う(約2時間・スタミナ25)${h >= 8 && h < 18 ? "" : " ※8〜18時"}</button></div>
        <h4>依頼掲示板</h4>${questList(true)}`;
    }
    body.innerHTML = html;
    const rerender = () => renderBuilding(b, view);
    body.querySelectorAll("[data-buy]").forEach((x) => x.addEventListener("click", () => { game.buy(x.dataset.buy); rerender(); }));
    body.querySelectorAll("[data-sell]").forEach((x) => x.addEventListener("click", () => { game.sell(x.dataset.sell, false); rerender(); }));
    body.querySelectorAll("[data-sellall]").forEach((x) => x.addEventListener("click", () => { game.sell(x.dataset.sellall, true); rerender(); }));
    body.querySelectorAll("[data-view]").forEach((x) => x.addEventListener("click", () => renderBuilding(b, x.dataset.view)));
    body.querySelectorAll("[data-quest]").forEach((x) => x.addEventListener("click", () => { game.completeQuest(+x.dataset.quest); rerender(); }));
    body.querySelectorAll("[data-do]").forEach((x) => x.addEventListener("click", () => {
      const d = x.dataset.do;
      if (d === "sleep") { if (game.rest("home")) closeAll(); }
      else if (d === "inn") { if (game.rest("inn")) closeAll(); }
      else if (d === "bread") { game.cook(); rerender(); }
      else if (d === "stew") { game.cookStew(); rerender(); }
      else if (d === "save") game.save();
      else if (d === "work") { game.doWork(); rerender(); }
    }));
  }

  // ===== 通知 =====
  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function damage(text) {
    const el = document.createElement("div");
    el.className = "dmg";
    el.textContent = text;
    $("hud").appendChild(el);
    setTimeout(() => el.remove(), 900);
    const v = $("vignette");
    v.classList.remove("hit");
    void v.offsetWidth;
    v.classList.add("hit");
  }
  function flash() {
    const f = $("fade");
    f.classList.remove("on");
    void f.offsetWidth;
    f.classList.add("on");
  }
  function log(html) {
    const list = $("log-list");
    const div = document.createElement("div");
    div.innerHTML = html;
    list.appendChild(div);
    while (list.children.length > 40) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }
  function restoreLog(entries) {
    $("log-list").innerHTML = "";
    (entries || []).slice(-20).forEach(log);
  }

  // ===== タッチ操作 =====
  function bindJoystick() {
    const pad = $("joystick");
    const knob = pad.querySelector("i");
    let id = null, cx = 0, cy = 0;
    const R = 50;
    pad.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const rect = pad.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      e.preventDefault();
    }, { passive: false });
    pad.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        game.setJoystick(dx / R, dy / R);
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        knob.style.transform = "";
        game.setJoystick(0, 0);
      }
    };
    pad.addEventListener("touchend", end);
    pad.addEventListener("touchcancel", end);
  }

  return { bindGame, updateHud, handleKey, isTalkingTo, openDialogue, openBuilding, toast, damage, flash, log, restoreLog, closeAll };
})();
