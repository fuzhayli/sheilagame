(() => {
  const canvas = document.getElementById("sheila-game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const WORLD = { w: 6600, h: 720 };
  const SAVE_KEY = "sheila-platformer-best-v1";
  const CELL = { w: 192, h: 208 };
  const DEATH_FLOOR_Y = 638;

  const els = {
    menu: document.getElementById("sheila-menu"),
    title: document.getElementById("menu-title"),
    copy: document.getElementById("menu-copy"),
    start: document.getElementById("start-btn"),
    left: document.getElementById("touch-left"),
    right: document.getElementById("touch-right"),
    jump: document.getElementById("touch-jump"),
    scratch: document.getElementById("touch-scratch")
  };

  const assets = {
    sheila: loadImage(assetUrl("sheila", "assets/sheila/sheila-spritesheet.webp")),
    room: loadImage(assetUrl("room", "assets/sheila/generated/living-room-background.png")),
    props: loadImage(assetUrl("props", "assets/sheila/generated/props-sheet.png"))
  };

  const propCuts = {
    sofa: [25, 35, 505, 235],
    blanket: [595, 110, 330, 175],
    table: [1002, 115, 430, 145],
    console: [60, 485, 500, 170],
    cabinet: [620, 326, 290, 370],
    box: [986, 476, 176, 190],
    catTree: [1205, 320, 260, 380],
    treat: [66, 794, 92, 96],
    yarn: [190, 780, 175, 124],
    roomba: [430, 798, 190, 92],
    mouse: [650, 786, 170, 110],
    pillow: [905, 807, 205, 110],
    rug: [1170, 748, 292, 184]
  };

  const platformArt = {
    sofa: { prop: "sofa", contact: 0.58, minH: 222 },
    table: { prop: "table", contact: 0, minH: 106 },
    blanket: { prop: "blanket", contact: 0, minH: 116 },
    console: { prop: "console", contact: 0, minH: 106 },
    cabinet: { prop: "cabinet", contact: 0, minH: 306 },
    pillow: { prop: "pillow", contact: 0, minH: 90 },
    rug: { prop: "rug", contact: 0, minH: 92, maxH: 124 }
  };

  const rows = {
    idle: { row: 0, frames: 6, speed: 0.16 },
    runRight: { row: 1, frames: 8, speed: 0.095 },
    runLeft: { row: 2, frames: 8, speed: 0.095 },
    wave: { row: 3, frames: 4, speed: 0.13 },
    jump: { row: 4, frames: 5, speed: 0.12 },
    failed: { row: 5, frames: 8, speed: 0.16 },
    waiting: { row: 6, frames: 6, speed: 0.18 },
    scratch: { row: 8, frames: 6, speed: 0.07 }
  };

  const input = {
    left: false,
    right: false,
    jump: false,
    scratch: false,
    jumpPressed: false,
    scratchPressed: false
  };

  const audio = {
    ctx: null,
    muted: false,
    ensure() {
      if (this.muted) return;
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    blip(type) {
      if (this.muted) return;
      this.ensure();
      if (!this.ctx) return;
      const params = {
        jump: [260, 620, 0.1, "triangle", 0.035],
        treat: [720, 1120, 0.1, "sine", 0.028],
        yarn: [420, 980, 0.22, "triangle", 0.04],
        stomp: [240, 120, 0.12, "square", 0.035],
        hurt: [140, 70, 0.18, "sawtooth", 0.05],
        box: [380, 780, 0.12, "square", 0.03],
        goal: [360, 1180, 0.34, "triangle", 0.045],
        scratch: [520, 240, 0.08, "sawtooth", 0.025]
      }[type] || [300, 520, 0.08, "sine", 0.025];
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = params[3];
      osc.frequency.setValueAtTime(params[0], now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, params[1]), now + params[2]);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(params[4], now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + params[2]);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + params[2] + 0.02);
    }
  };

  const level = makeLevel();
  let state = createState("menu");

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  function assetUrl(key, fallback) {
    return window.SHEILA_EMBEDDED_ASSETS?.[key] || fallback;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function makeLevel() {
    const platforms = [
      { x: -120, y: 638, w: WORLD.w + 240, h: 120, kind: "floor" },
      { x: 70, y: 500, w: 520, h: 58, kind: "sofa" },
      { x: 650, y: 458, w: 320, h: 44, kind: "table" },
      { x: 1100, y: 420, w: 260, h: 42, kind: "blanket" },
      { x: 1510, y: 374, w: 290, h: 42, kind: "console" },
      { x: 1980, y: 330, w: 300, h: 42, kind: "cabinet" },
      { x: 2440, y: 420, w: 200, h: 42, kind: "pillow" },
      { x: 2810, y: 360, w: 260, h: 42, kind: "table" },
      { x: 3280, y: 452, w: 320, h: 42, kind: "rug" },
      { x: 3760, y: 360, w: 220, h: 40, kind: "blanket" },
      { x: 4150, y: 470, w: 210, h: 42, kind: "pillow" },
      { x: 4500, y: 408, w: 300, h: 42, kind: "table" },
      { x: 4880, y: 338, w: 250, h: 40, kind: "blanket" },
      { x: 5240, y: 450, w: 310, h: 42, kind: "console" },
      { x: 5620, y: 382, w: 240, h: 42, kind: "pillow" },
      { x: 5960, y: 330, w: 300, h: 42, kind: "cabinet" },
      { x: 6280, y: 470, w: 190, h: 42, kind: "pillow" }
    ];

    const boxes = [
      { id: 1, x: 910, y: 330, w: 58, h: 58, hit: false, contains: "treat" },
      { id: 2, x: 1430, y: 292, w: 58, h: 58, hit: false, contains: "yarn" },
      { id: 3, x: 2320, y: 300, w: 58, h: 58, hit: false, contains: "treat" },
      { id: 4, x: 3120, y: 292, w: 58, h: 58, hit: false, contains: "treat" },
      { id: 5, x: 4660, y: 278, w: 58, h: 58, hit: false, contains: "treat" },
      { id: 6, x: 5310, y: 330, w: 58, h: 58, hit: false, contains: "yarn" },
      { id: 7, x: 6040, y: 248, w: 58, h: 58, hit: false, contains: "treat" }
    ];

    const treats = [
      [210, 455], [320, 455], [720, 410], [820, 410], [1180, 375], [1290, 375],
      [1610, 326], [1710, 326], [2060, 286], [2160, 286], [2490, 376], [2880, 316],
      [2980, 316], [3370, 408], [3480, 408], [3820, 316], [4240, 426], [4560, 364],
      [4680, 364], [4960, 294], [5050, 294], [5330, 406], [5440, 406], [5680, 338],
      [5790, 338], [6040, 286], [6150, 286], [6350, 426]
    ].map((p, i) => ({ id: i + 1, x: p[0], y: p[1], r: 15, collected: false }));

    const yarns = [
      { id: 1, x: 2070, y: 286, r: 22, collected: false },
      { id: 2, x: 3910, y: 312, r: 22, collected: false },
      { id: 3, x: 5380, y: 406, r: 22, collected: false }
    ];

    const enemies = [
      { id: 1, type: "mouse", x: 1180, y: 386, w: 48, h: 34, vx: 48, min: 1110, max: 1350, hp: 1, alive: true },
      { id: 2, type: "roomba", x: 1670, y: 338, w: 72, h: 36, vx: -46, min: 1520, max: 1780, hp: 2, alive: true },
      { id: 3, type: "mouse", x: 2890, y: 326, w: 48, h: 34, vx: 50, min: 2820, max: 3070, hp: 1, alive: true },
      { id: 4, type: "roomba", x: 3420, y: 416, w: 72, h: 36, vx: -44, min: 3290, max: 3590, hp: 2, alive: true },
      { id: 5, type: "mouse", x: 5290, y: 416, w: 48, h: 34, vx: 48, min: 5250, max: 5550, hp: 1, alive: true },
      { id: 6, type: "roomba", x: 6030, y: 294, w: 72, h: 36, vx: -44, min: 5980, max: 6260, hp: 2, alive: true },
      { id: 7, type: "mouse", x: 6320, y: 436, w: 48, h: 34, vx: 46, min: 6280, max: 6470, hp: 1, alive: true }
    ];

    const moving = [
      { id: 1, x: 3530, y: 390, baseX: 3530, w: 170, h: 34, kind: "pillow", phase: 0, amp: 150, speed: 1.1, prevX: 3530 },
      { id: 2, x: 5480, y: 405, baseX: 5480, w: 170, h: 34, kind: "pillow", phase: 1.7, amp: 140, speed: 1.0, prevX: 5480 }
    ];

    return { platforms, boxes, treats, yarns, enemies, moving, goal: { x: 6370, y: 410, w: 160, h: 220 } };
  }

  function createState(mode) {
    const best = readBest();
    return {
      mode,
      elapsed: 0,
      score: 0,
      treatCount: 0,
      bestScore: best.bestScore,
      bestTime: best.bestTime,
      camera: { x: 0, y: 120 },
      message: "",
      messageTimer: 0,
      player: {
        x: 92,
        y: 430,
        w: 42,
        h: 58,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: false,
        jumpsUsed: 0,
        maxJumps: 2,
        health: 3,
        invuln: 0,
        scratchTimer: 0,
        scratchCooldown: 0,
        yarnTimer: 0,
        extraHit: false,
        animTime: 0
      },
      boxes: level.boxes.map((b) => ({ ...b })),
      treats: level.treats.map((t) => ({ ...t })),
      yarns: level.yarns.map((y) => ({ ...y })),
      enemies: level.enemies.map((e) => ({ ...e })),
      particles: []
    };
  }

  function readBest() {
    try {
      return Object.assign({ bestScore: 0, bestTime: null }, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"));
    } catch {
      return { bestScore: 0, bestTime: null };
    }
  }

  function saveBest() {
    const bestTime = state.bestTime == null ? state.elapsed : Math.min(state.bestTime, state.elapsed);
    const bestScore = Math.max(state.bestScore, state.score);
    state.bestScore = bestScore;
    state.bestTime = bestTime;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ bestScore, bestTime }));
  }

  function showOverlay(title, copy) {
    els.title.textContent = title;
    els.copy.textContent = copy;
    els.menu.classList.remove("hidden");
  }

  function hideOverlay() {
    els.menu.classList.add("hidden");
    canvas.focus();
  }

  function startGame() {
    state = createState("playing");
    hideOverlay();
    audio.ensure();
  }

  function restartGame() {
    state = createState("playing");
    hideOverlay();
  }

  function completeLevel() {
    if (state.mode !== "playing") return;
    state.mode = "win";
    state.score += Math.max(0, Math.round(5000 - state.elapsed * 25));
    saveBest();
    audio.blip("goal");
    showOverlay("KEDI AGACI!", `Skor ${state.score}. R ile tekrar oyna.`);
  }

  function failLevel() {
    if (state.mode !== "playing") return;
    state.mode = "lost";
    showOverlay("SHEILA YORULDU", "R ile tekrar dene.");
  }

  function addMessage(text) {
    state.message = text;
    state.messageTimer = 1.8;
  }

  function solidRects() {
    return [
      ...level.platforms.filter((platform) => platform.kind !== "floor"),
      ...level.moving,
      ...state.boxes
    ];
  }

  function update(dt) {
    if (state.mode !== "playing") {
      state.player.animTime += dt;
      return;
    }

    state.elapsed += dt;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    updateMoving(dt);
    updatePlayer(dt);
    updateEnemies(dt);
    updateParticles(dt);
    updateCamera();
    input.jumpPressed = false;
    input.scratchPressed = false;
  }

  function updateMoving(dt) {
    for (const m of level.moving) {
      m.prevX = m.x;
      m.phase += dt * m.speed;
      m.x = m.baseX + Math.sin(m.phase) * m.amp;
    }
  }

  function updatePlayer(dt) {
    const p = state.player;
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = p.onGround ? 2300 : 1500;
    const maxSpeed = p.yarnTimer > 0 ? 335 : 285;
    p.vx += move * accel * dt;
    if (move) p.facing = move;
    if (!move && p.onGround) p.vx *= Math.pow(0.001, dt);
    p.vx = clamp(p.vx, -maxSpeed, maxSpeed);

    if (input.jumpPressed && (p.onGround || p.jumpsUsed < p.maxJumps)) {
      p.vy = -690;
      p.onGround = false;
      p.jumpsUsed += 1;
      if (p.jumpsUsed === 2) addMessage("Double jump!");
      audio.blip("jump");
    }

    if (input.scratchPressed && p.scratchCooldown <= 0) {
      p.scratchTimer = 0.16;
      p.scratchCooldown = p.yarnTimer > 0 ? 0.18 : 0.42;
      audio.blip("scratch");
    }

    p.scratchTimer = Math.max(0, p.scratchTimer - dt);
    p.scratchCooldown = Math.max(0, p.scratchCooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.yarnTimer = Math.max(0, p.yarnTimer - dt);
    p.animTime += dt;

    p.vy += 1900 * dt;
    p.vy = Math.min(980, p.vy);

    moveAxis("x", dt);
    moveAxis("y", dt);
    collectItems();
    attackEnemies();

    if (rectsOverlap(p, level.goal)) completeLevel();
    if (p.y + p.h >= DEATH_FLOOR_Y) {
      p.health = 0;
      addMessage("Floor!");
      audio.blip("hurt");
      failLevel();
    }
  }

  function moveAxis(axis, dt) {
    const p = state.player;
    if (axis === "x") {
      p.x += p.vx * dt;
      for (const s of solidRects()) {
        if (!rectsOverlap(p, s)) continue;
        if (p.vx > 0) p.x = s.x - p.w;
        if (p.vx < 0) p.x = s.x + s.w;
        p.vx = 0;
      }
      p.x = clamp(p.x, 0, WORLD.w - p.w);
      return;
    }

    const prevY = p.y;
    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    p.onGround = false;
    for (const s of solidRects()) {
      if (!rectsOverlap(p, s)) continue;
      if (p.vy >= 0 && prevBottom <= s.y + 5) {
        p.y = s.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpsUsed = 0;
        if (s.prevX != null) p.x += s.x - s.prevX;
      } else if (p.vy < 0 && prevY >= s.y + s.h - 6) {
        p.y = s.y + s.h;
        p.vy = 80;
        if (state.boxes.includes(s)) hitBox(s);
      }
    }
  }

  function hitBox(box) {
    if (box.hit) return;
    box.hit = true;
    state.score += 120;
    audio.blip("box");
    if (box.contains === "yarn") {
      state.yarns.push({ id: 100 + box.id, x: box.x + 18, y: box.y - 34, r: 22, collected: false });
      addMessage("Yarn boost!");
    } else {
      state.treats.push({ id: 100 + box.id, x: box.x + 21, y: box.y - 28, r: 15, collected: false });
      addMessage("Treat!");
    }
    burst(box.x + box.w / 2, box.y, "#eeb64a", 8);
  }

  function collectItems() {
    const p = state.player;
    for (const t of state.treats) {
      if (t.collected) continue;
      if (Math.hypot(p.x + p.w / 2 - t.x, p.y + p.h / 2 - t.y) < 44) {
        t.collected = true;
        state.score += 100;
        state.treatCount += 1;
        audio.blip("treat");
        burst(t.x, t.y, "#f2c466", 6);
      }
    }
    for (const y of state.yarns) {
      if (y.collected) continue;
      if (Math.hypot(p.x + p.w / 2 - y.x, p.y + p.h / 2 - y.y) < 50) {
        y.collected = true;
        p.yarnTimer = 8;
        p.extraHit = true;
        state.score += 350;
        audio.blip("yarn");
        addMessage("Scratch boost");
        burst(y.x, y.y, "#d54a3f", 12);
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.x += e.vx * dt;
      if (e.x < e.min || e.x + e.w > e.max) {
        e.vx *= -1;
        e.x = clamp(e.x, e.min, e.max - e.w);
      }

      const p = state.player;
      if (!rectsOverlap(p, e)) continue;
      const stomp = p.vy > 120 && p.y + p.h - e.y < 22;
      if (stomp) {
        defeatEnemy(e);
        p.vy = -430;
        p.jumpsUsed = Math.min(p.jumpsUsed, 1);
      } else if (p.scratchTimer > 0 && scratchRect().x < e.x + e.w && scratchRect().x + scratchRect().w > e.x && scratchRect().y < e.y + e.h && scratchRect().y + scratchRect().h > e.y) {
        e.hp -= p.yarnTimer > 0 ? 2 : 1;
        e.vx = Math.sign(e.x - p.x || 1) * Math.abs(e.vx);
        if (e.hp <= 0) defeatEnemy(e);
      } else {
        damagePlayer(1, e.x < p.x ? 1 : -1);
      }
    }
  }

  function attackEnemies() {
    if (state.player.scratchTimer <= 0) return;
    const hit = scratchRect();
    for (const e of state.enemies) {
      if (!e.alive || !rectsOverlap(hit, e)) continue;
      e.hp -= state.player.yarnTimer > 0 ? 2 : 1;
      if (e.hp <= 0) defeatEnemy(e);
    }
  }

  function scratchRect() {
    const p = state.player;
    return {
      x: p.facing > 0 ? p.x + p.w - 4 : p.x - 34,
      y: p.y + 14,
      w: 38,
      h: 30
    };
  }

  function defeatEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    state.score += enemy.type === "roomba" ? 320 : 180;
    audio.blip("stomp");
    burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.type === "roomba" ? "#73d0e3" : "#c98677", 12);
  }

  function damagePlayer(amount, knockDir) {
    const p = state.player;
    if (p.invuln > 0 || state.mode !== "playing") return;
    if (p.extraHit) {
      p.extraHit = false;
      p.yarnTimer = Math.max(0, p.yarnTimer - 3);
      addMessage("Yarn saved Sheila");
    } else {
      p.health -= amount;
      addMessage("Careful!");
    }
    audio.blip("hurt");
    p.invuln = 1.2;
    p.vx = knockDir * 310;
    p.vy = -330;
    burst(p.x + p.w / 2, p.y + 24, "#f4e3c5", 10);
    if (p.health <= 0) failLevel();
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: Math.cos(i * 2.399) * (70 + (i % 4) * 24),
        vy: Math.sin(i * 2.399) * (70 + (i % 5) * 18) - 40,
        life: 0.45 + (i % 4) * 0.08,
        color
      });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updateCamera() {
    const p = state.player;
    state.camera.x += (p.x + p.w / 2 - state.camera.x - W * 0.42) * 0.09;
    state.camera.y += (p.y + p.h / 2 - state.camera.y - H * 0.58) * 0.05;
    state.camera.x = clamp(state.camera.x, 0, WORLD.w - W);
    state.camera.y = clamp(state.camera.y, 80, 190);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    renderBackground();
    ctx.save();
    ctx.translate(-Math.round(state.camera.x), -Math.round(state.camera.y));
    renderLevel();
    renderEntities();
    ctx.restore();
    renderHud();
  }

  function renderBackground() {
    ctx.fillStyle = "#211d18";
    ctx.fillRect(0, 0, W, H);
    const img = assets.room;
    if (img.complete && img.naturalWidth) {
      const parallaxX = -state.camera.x * 0.16;
      const scale = H / img.height;
      const drawW = img.width * scale;
      for (let x = parallaxX % drawW - drawW; x < W + drawW; x += drawW) {
        ctx.drawImage(img, x, 0, drawW, H);
      }
      ctx.fillStyle = "rgba(22, 18, 15, 0.08)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function renderLevel() {
    for (let x = -20; x < WORLD.w; x += 1200) drawProp("rug", x, 610, 1300, 120, 0.75);

    for (const p of level.platforms) drawPlatform(p);
    for (const p of level.moving) drawPlatform(p);
    for (const box of state.boxes) drawBox(box);

    drawProp("catTree", level.goal.x - 10, level.goal.y - 8, 180, 230, 1);
    ctx.strokeStyle = "rgba(238, 182, 74, 0.75)";
    ctx.lineWidth = 3;
    ctx.strokeRect(level.goal.x + 18, level.goal.y + 28, level.goal.w - 36, level.goal.h - 42);
  }

  function drawPlatform(p) {
    if (p.kind === "floor") {
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      g.addColorStop(0, "#c7b99f");
      g.addColorStop(1, "#8f7a5c");
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      return;
    }
    const meta = platformArt[p.kind] || platformArt.table;
    const cut = propCuts[meta.prop];
    let drawH = cut ? p.w * (cut[3] / cut[2]) : p.h + 70;
    drawH = Math.max(meta.minH || 0, drawH);
    if (meta.maxH) drawH = Math.min(meta.maxH, drawH);
    drawProp(meta.prop, p.x, p.y - drawH * meta.contact, p.w, drawH, 1);
  }

  function drawBox(box) {
    if (box.hit) {
      ctx.fillStyle = "#8a6b42";
      ctx.fillRect(box.x, box.y + 8, box.w, box.h - 8);
      ctx.strokeStyle = "#4d3520";
      ctx.strokeRect(box.x, box.y + 8, box.w, box.h - 8);
    } else {
      drawProp("box", box.x - 9, box.y - 10, box.w + 18, box.h + 18, 1);
    }
  }

  function drawProp(name, x, y, w, h, alpha = 1) {
    const img = assets.props;
    const cut = propCuts[name];
    if (img.complete && img.naturalWidth && cut) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, cut[0], cut[1], cut[2], cut[3], x, y, w, h);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = "#9f7b4f";
    ctx.fillRect(x, y, w, h);
  }

  function renderEntities() {
    for (const t of state.treats) {
      if (!t.collected) drawProp("treat", t.x - 16, t.y - 16, 32, 32, 1);
    }
    for (const y of state.yarns) {
      if (!y.collected) drawProp("yarn", y.x - 24, y.y - 20, 48, 40, 1);
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const prop = e.type === "roomba" ? "roomba" : "mouse";
      drawProp(prop, e.x - 8, e.y - 14, e.w + 18, e.h + 20, 1);
    }
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life * 2.4, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      ctx.globalAlpha = 1;
    }
    drawSheila();
  }

  function drawSheila() {
    const p = state.player;
    const sprite = chooseSprite();
    const img = assets.sheila;
    const flicker = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    if (flicker) ctx.globalAlpha = 0.55;
    const drawW = 82;
    const drawH = 88;
    const dx = p.x + p.w / 2 - drawW / 2;
    const footOffset = p.onGround ? 22 : 14;
    const dy = p.y + p.h - drawH + footOffset;
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, sprite.frame * CELL.w, sprite.row * CELL.h, CELL.w, CELL.h, dx, dy, drawW, drawH);
    } else {
      ctx.fillStyle = "#6f675d";
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    ctx.globalAlpha = 1;
    if (p.scratchTimer > 0) {
      const hit = scratchRect();
      ctx.fillStyle = "rgba(244, 227, 197, 0.28)";
      ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
      ctx.strokeStyle = "#f4e3c5";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const yy = hit.y + 7 + i * 8;
        ctx.beginPath();
        ctx.moveTo(hit.x + (p.facing > 0 ? 4 : hit.w - 4), yy);
        ctx.lineTo(hit.x + (p.facing > 0 ? hit.w - 5 : 5), yy - 4);
        ctx.stroke();
      }
    }
  }

  function chooseSprite() {
    const p = state.player;
    let key = "idle";
    if (state.mode === "lost") key = "failed";
    else if (p.scratchTimer > 0) key = "scratch";
    else if (!p.onGround) key = "jump";
    else if (Math.abs(p.vx) > 25) key = p.facing < 0 ? "runLeft" : "runRight";
    else if (p.yarnTimer > 0) key = "waiting";
    const def = rows[key];
    return { row: def.row, frame: Math.floor(p.animTime / def.speed) % def.frames };
  }

  function renderHud() {
    ctx.fillStyle = "rgba(24, 18, 14, 0.52)";
    ctx.fillRect(14, 14, 380, 58);
    ctx.strokeStyle = "rgba(244, 227, 197, 0.25)";
    ctx.strokeRect(14.5, 14.5, 380, 58);
    ctx.fillStyle = "#f8f2e7";
    ctx.font = "900 18px system-ui";
    ctx.fillText(`Score ${state.score}`, 28, 38);
    ctx.fillText(`Treats ${state.treatCount}`, 156, 38);
    ctx.fillText(`Best ${state.bestScore}`, 280, 38);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < state.player.health ? "#e85f68" : "rgba(255, 255, 255, 0.25)";
      ctx.beginPath();
      const x = 32 + i * 28;
      const y = 56;
      ctx.moveTo(x, y + 8);
      ctx.bezierCurveTo(x - 15, y - 5, x - 5, y - 16, x, y - 7);
      ctx.bezierCurveTo(x + 5, y - 16, x + 15, y - 5, x, y + 8);
      ctx.fill();
    }
    if (state.player.yarnTimer > 0) {
      ctx.fillStyle = "#f0d3c2";
      ctx.fillText(`Yarn ${state.player.yarnTimer.toFixed(1)}s`, 105, 63);
    }
    if (state.messageTimer > 0) {
      ctx.fillStyle = "rgba(24, 18, 14, 0.58)";
      ctx.fillRect(W / 2 - 130, 20, 260, 38);
      ctx.fillStyle = "#f4e3c5";
      ctx.textAlign = "center";
      ctx.fillText(state.message, W / 2, 45);
      ctx.textAlign = "left";
    }
  }

  function renderGameToText() {
    const p = state.player;
    const cam = state.camera;
    const visible = (e) => e.x + (e.w || 0) > cam.x - 80 && e.x < cam.x + W + 80 && e.y + (e.h || 0) > cam.y - 80 && e.y < cam.y + H + 80;
    return JSON.stringify({
      coordinateSystem: "world origin top-left, x right, y down",
      mode: state.mode,
      player: {
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        health: p.health,
        onGround: p.onGround,
        jumpsUsed: p.jumpsUsed,
        maxJumps: p.maxJumps,
        facing: p.facing,
        yarnSeconds: Number(p.yarnTimer.toFixed(1)),
        extraHit: p.extraHit,
        scratchCooldown: Number(p.scratchCooldown.toFixed(2))
      },
      camera: { x: Math.round(cam.x), y: Math.round(cam.y), w: W, h: H },
      score: state.score,
      treats: state.treatCount,
      elapsed: Number(state.elapsed.toFixed(2)),
      visibleEnemies: state.enemies.filter((e) => e.alive && visible(e)).map((e) => ({ id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })),
      visibleTreats: state.treats.filter((t) => !t.collected && visible({ x: t.x, y: t.y, w: 1, h: 1 })).map((t) => ({ id: t.id, x: Math.round(t.x), y: Math.round(t.y) })),
      visibleYarn: state.yarns.filter((y) => !y.collected && visible({ x: y.x, y: y.y, w: 1, h: 1 })).map((y) => ({ id: y.id, x: Math.round(y.x), y: Math.round(y.y) })),
      boxes: state.boxes.map((b) => ({ id: b.id, hit: b.hit })),
      goal: { x: level.goal.x, reached: state.mode === "win" },
      bestScore: state.bestScore,
      bestTime: state.bestTime
    });
  }

  function setKey(code, value) {
    const map = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "jump",
      KeyW: "jump",
      Space: "jump",
      KeyB: "scratch",
      KeyJ: "scratch",
      KeyK: "scratch"
    };
    const key = map[code];
    if (!key) return false;
    if (value && !input[key]) {
      if (key === "jump") input.jumpPressed = true;
      if (key === "scratch") input.scratchPressed = true;
    }
    input[key] = value;
    return true;
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      showOverlay("DURAKLATILDI", "Devam icin Enter veya P.");
    } else if (state.mode === "paused") {
      state.mode = "playing";
      hideOverlay();
    }
  }

  function toggleFullscreen() {
    const target = document.querySelector(".stage-wrap");
    if (!document.fullscreenElement) target.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  window.addEventListener("keydown", (event) => {
    if (setKey(event.code, true)) {
      event.preventDefault();
      if (state.mode === "menu" && (event.code === "Space" || event.code === "Enter")) startGame();
      return;
    }
    if (event.code === "KeyP" || event.code === "Escape") togglePause();
    if (event.code === "KeyF") toggleFullscreen();
    if (event.code === "KeyR" && state.mode !== "playing") restartGame();
    if (event.code === "Enter" && state.mode === "paused") togglePause();
  });

  window.addEventListener("keyup", (event) => {
    if (setKey(event.code, false)) event.preventDefault();
  });

  function bindTouch(button, key) {
    const down = (event) => {
      event.preventDefault();
      audio.ensure();
      if (!input[key]) {
        if (key === "jump") input.jumpPressed = true;
        if (key === "scratch") input.scratchPressed = true;
      }
      input[key] = true;
      button.setPointerCapture?.(event.pointerId);
    };
    const up = (event) => {
      event.preventDefault();
      input[key] = false;
      button.releasePointerCapture?.(event.pointerId);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  }

  bindTouch(els.left, "left");
  bindTouch(els.right, "right");
  bindTouch(els.jump, "jump");
  bindTouch(els.scratch, "scratch");
  els.start.addEventListener("click", startGame);

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) update(1 / 60);
    render();
  };
  if (new URLSearchParams(window.location.search).has("debug")) {
    window.__sheila_debug_view = (x, y = 120) => {
      hideOverlay();
      state.mode = "paused";
      state.camera.x = clamp(Number(x) || 0, 0, WORLD.w - W);
      state.camera.y = clamp(Number(y) || 120, 80, 190);
      render();
      return renderGameToText();
    };
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  showOverlay("SHEILA", "Koltuktan kedi agacina kos, odulleri topla.");
  render();
  requestAnimationFrame(loop);
})();
