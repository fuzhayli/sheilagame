(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = canvas.width;
  const H = canvas.height;
  const WORLD = { w: 2800, h: 1800 };
  const SAVE_KEY = "nebula-miner-save-v1";
  const MAX_LEVEL = 5;

  const els = {
    overlay: document.getElementById("menu-overlay"),
    menuTitle: document.getElementById("menu-title"),
    menuSubtitle: document.getElementById("menu-subtitle"),
    startBtn: document.getElementById("start-btn"),
    continueBtn: document.getElementById("continue-btn"),
    audioBtn: document.getElementById("audio-btn"),
    saveBtn: document.getElementById("save-btn"),
    resetBtn: document.getElementById("reset-btn"),
    score: document.getElementById("score-stat"),
    best: document.getElementById("best-stat"),
    wave: document.getElementById("wave-stat"),
    time: document.getElementById("time-stat"),
    hull: document.getElementById("hull-meter"),
    shield: document.getElementById("shield-meter"),
    credits: document.getElementById("credits-stat"),
    ore: document.getElementById("ore-stat"),
    plasma: document.getElementById("plasma-stat"),
    crystal: document.getElementById("crystal-stat"),
    runsBody: document.getElementById("runs-body"),
    stickZone: document.getElementById("stick-zone"),
    stickKnob: document.getElementById("stick-knob"),
    touchMine: document.getElementById("touch-mine"),
    touchFire: document.getElementById("touch-fire")
  };

  const costBase = {
    drill: { credits: 90, ore: 34, plasma: 0, crystal: 0 },
    engine: { credits: 110, ore: 42, plasma: 10, crystal: 0 },
    shield: { credits: 125, ore: 28, plasma: 22, crystal: 0 },
    blaster: { credits: 145, ore: 20, plasma: 12, crystal: 12 }
  };

  const depositDefs = {
    ore: { color: "#ffb43d", glow: "#ff6c3d", value: 2.2, radius: 30 },
    plasma: { color: "#35d6e8", glow: "#8b6df6", value: 3.6, radius: 25 },
    crystal: { color: "#f24ea2", glow: "#fff07a", value: 4.7, radius: 22 }
  };

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    mine: false,
    pointerActive: false,
    pointerX: W / 2,
    pointerY: H / 2,
    touchX: 0,
    touchY: 0
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const randomRange = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  function readSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function normalizeProfile(raw) {
    const upgrades = Object.assign({ drill: 0, engine: 0, shield: 0, blaster: 0 }, raw?.upgrades);
    for (const key of Object.keys(upgrades)) {
      upgrades[key] = clamp(Number(upgrades[key]) || 0, 0, MAX_LEVEL);
    }

    return {
      resources: Object.assign({ credits: 0, ore: 0, plasma: 0, crystal: 0 }, raw?.resources),
      upgrades,
      bestScore: Math.max(0, Number(raw?.bestScore) || 0),
      runs: Array.isArray(raw?.runs) ? raw.runs.slice(0, 6) : [],
      muted: Boolean(raw?.muted)
    };
  }

  function number(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const savedAtBoot = readSave();
  let profile = normalizeProfile(savedAtBoot?.profile);

  const audio = {
    ctx: null,
    muted: profile.muted,
    ready: false,
    ensure() {
      if (this.muted) return;
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.ready = true;
    },
    blip(type = "click") {
      if (this.muted) return;
      this.ensure();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const params = {
        mine: [160, 420, 0.12, "sawtooth", 0.035],
        collect: [520, 980, 0.18, "triangle", 0.055],
        laser: [780, 280, 0.11, "square", 0.035],
        hit: [130, 80, 0.16, "sawtooth", 0.06],
        wave: [220, 620, 0.34, "triangle", 0.05],
        upgrade: [460, 1240, 0.28, "sine", 0.065],
        save: [380, 760, 0.16, "triangle", 0.04],
        click: [260, 420, 0.08, "sine", 0.03]
      }[type] || [260, 420, 0.08, "sine", 0.03];

      osc.type = params[3];
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, now);
      osc.frequency.setValueAtTime(params[0], now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, params[1]), now + params[2]);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(params[4], now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + params[2]);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + params[2] + 0.03);
    }
  };

  const stars = Array.from({ length: 170 }, (_, i) => ({
    x: (Math.sin(i * 91.7) * 0.5 + 0.5) * WORLD.w,
    y: (Math.sin(i * 37.3 + 4.2) * 0.5 + 0.5) * WORLD.h,
    z: 0.35 + ((i * 19) % 100) / 100,
    c: i % 5 === 0 ? "#ffb43d" : i % 3 === 0 ? "#35d6e8" : "#ffffff"
  }));

  function playerCaps() {
    return {
      maxHull: 100,
      maxShield: 58 + profile.upgrades.shield * 24,
      accel: 260 + profile.upgrades.engine * 48,
      maxSpeed: 210 + profile.upgrades.engine * 34,
      mineRate: 18 + profile.upgrades.drill * 8,
      mineRange: 68 + profile.upgrades.drill * 8,
      fireDelay: Math.max(0.12, 0.32 - profile.upgrades.blaster * 0.04),
      shotDamage: 20 + profile.upgrades.blaster * 8,
      shotSpeed: 540 + profile.upgrades.blaster * 42
    };
  }

  function createDeposit(id, avoidCenter = false) {
    const type = pick(["ore", "ore", "ore", "plasma", "plasma", "crystal"]);
    const def = depositDefs[type];
    let x = randomRange(140, WORLD.w - 140);
    let y = randomRange(140, WORLD.h - 140);

    if (avoidCenter && Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 320) {
      x += x < WORLD.w / 2 ? -320 : 320;
      y += y < WORLD.h / 2 ? -220 : 220;
      x = clamp(x, 140, WORLD.w - 140);
      y = clamp(y, 140, WORLD.h - 140);
    }

    const amount = randomRange(42, 92) * (type === "crystal" ? 0.65 : 1);
    return {
      id,
      type,
      x,
      y,
      r: def.radius + randomRange(-4, 8),
      amount,
      max: amount,
      spin: randomRange(0, Math.PI * 2)
    };
  }

  function createRun(mode = "menu") {
    const caps = playerCaps();
    const deposits = [];
    for (let i = 0; i < 34; i += 1) deposits.push(createDeposit(i + 1, true));
    deposits.push(
      { id: 901, type: "ore", x: WORLD.w / 2 + 88, y: WORLD.h / 2 + 10, r: 33, amount: 82, max: 82, spin: 0.2 },
      { id: 902, type: "plasma", x: WORLD.w / 2 - 118, y: WORLD.h / 2 + 84, r: 27, amount: 62, max: 62, spin: 1.7 },
      { id: 903, type: "crystal", x: WORLD.w / 2 + 40, y: WORLD.h / 2 - 126, r: 25, amount: 46, max: 46, spin: 2.6 }
    );

    return {
      mode,
      nextId: 1000,
      score: 0,
      wave: 0,
      waveTimer: 2.4,
      elapsed: 0,
      message: "",
      messageTimer: 0,
      minePulse: 0,
      saveTimer: 0,
      shake: 0,
      mineTargetId: null,
      camera: { x: WORLD.w / 2 - W / 2, y: WORLD.h / 2 - H / 2 },
      player: {
        x: WORLD.w / 2,
        y: WORLD.h / 2,
        vx: 0,
        vy: 0,
        r: 18,
        angle: -Math.PI / 2,
        hull: caps.maxHull,
        maxHull: caps.maxHull,
        shield: caps.maxShield,
        maxShield: caps.maxShield,
        fireCooldown: 0,
        invuln: 0
      },
      deposits,
      enemies: [],
      shots: [],
      particles: []
    };
  }

  function sanitizeRun(raw) {
    if (!raw || !raw.player) return null;
    const fresh = createRun("paused");
    const caps = playerCaps();
    fresh.mode = "paused";
    fresh.nextId = Math.max(1000, Number(raw.nextId) || 1000);
    fresh.score = Math.max(0, Number(raw.score) || 0);
    fresh.wave = Math.max(0, Number(raw.wave) || 0);
    fresh.waveTimer = clamp(Number(raw.waveTimer) || 8, 1, 45);
    fresh.elapsed = Math.max(0, Number(raw.elapsed) || 0);
    fresh.player = Object.assign(fresh.player, {
      x: clamp(Number(raw.player.x) || WORLD.w / 2, 30, WORLD.w - 30),
      y: clamp(Number(raw.player.y) || WORLD.h / 2, 30, WORLD.h - 30),
      vx: clamp(Number(raw.player.vx) || 0, -520, 520),
      vy: clamp(Number(raw.player.vy) || 0, -520, 520),
      angle: Number(raw.player.angle) || -Math.PI / 2,
      hull: clamp(Number(raw.player.hull) || caps.maxHull, 1, caps.maxHull),
      shield: clamp(Number(raw.player.shield) || caps.maxShield, 0, caps.maxShield),
      maxHull: caps.maxHull,
      maxShield: caps.maxShield
    });
    fresh.deposits = Array.isArray(raw.deposits)
      ? raw.deposits.filter((d) => d && d.amount > 0).slice(0, 52).map((d, i) => ({
          id: Number(d.id) || i + 1,
          type: depositDefs[d.type] ? d.type : "ore",
          x: clamp(Number(d.x) || 100, 50, WORLD.w - 50),
          y: clamp(Number(d.y) || 100, 50, WORLD.h - 50),
          r: clamp(Number(d.r) || 28, 14, 52),
          amount: Math.max(1, Number(d.amount) || 1),
          max: Math.max(1, Number(d.max) || Number(d.amount) || 1),
          spin: Number(d.spin) || 0
        }))
      : fresh.deposits;
    fresh.enemies = Array.isArray(raw.enemies)
      ? raw.enemies.filter(Boolean).slice(0, 42).map((e, i) => ({
          id: Number(e.id) || 500 + i,
          type: e.type === "lancer" ? "lancer" : "raider",
          x: clamp(Number(e.x) || 80, -80, WORLD.w + 80),
          y: clamp(Number(e.y) || 80, -80, WORLD.h + 80),
          vx: clamp(Number(e.vx) || 0, -260, 260),
          vy: clamp(Number(e.vy) || 0, -260, 260),
          r: clamp(Number(e.r) || 17, 10, 30),
          hp: Math.max(1, Number(e.hp) || 20),
          maxHp: Math.max(1, Number(e.maxHp) || Number(e.hp) || 20),
          speed: clamp(Number(e.speed) || 88, 40, 180)
        }))
      : [];
    if (fresh.deposits.length < 16) {
      for (let i = fresh.deposits.length; i < 26; i += 1) {
        fresh.deposits.push(createDeposit(fresh.nextId++, true));
      }
    }
    return fresh;
  }

  let state = createRun("menu");

  function snapshotRun() {
    if (state.mode === "gameover") return null;
    return {
      nextId: state.nextId,
      score: state.score,
      wave: state.wave,
      waveTimer: state.waveTimer,
      elapsed: state.elapsed,
      player: {
        x: state.player.x,
        y: state.player.y,
        vx: state.player.vx,
        vy: state.player.vy,
        angle: state.player.angle,
        hull: state.player.hull,
        shield: state.player.shield
      },
      deposits: state.deposits.map((d) => ({
        id: d.id,
        type: d.type,
        x: d.x,
        y: d.y,
        r: d.r,
        amount: d.amount,
        max: d.max,
        spin: d.spin
      })),
      enemies: state.enemies.map((e) => ({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        vx: e.vx,
        vy: e.vy,
        r: e.r,
        hp: e.hp,
        maxHp: e.maxHp,
        speed: e.speed
      }))
    };
  }

  function saveGame(manual = false) {
    const payload = {
      profile,
      run: snapshotRun(),
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      if (manual) {
        setMessage("SAVED");
        audio.blip("save");
      }
    } catch {
      setMessage("SAVE BLOCKED");
    }
    updateUI();
  }

  function setMessage(text, duration = 2.2) {
    state.message = text;
    state.messageTimer = duration;
  }

  function showOverlay(title, subtitle) {
    els.menuTitle.textContent = title;
    els.menuSubtitle.textContent = subtitle;
    els.overlay.classList.remove("hidden");
    els.continueBtn.disabled = !readSave()?.run;
  }

  function hideOverlay() {
    els.overlay.classList.add("hidden");
    canvas.focus();
  }

  function startNewRun() {
    audio.ensure();
    state = createRun("playing");
    hideOverlay();
    setMessage("WAVE INBOUND", 2);
    audio.blip("wave");
    saveGame(false);
    updateUI();
  }

  function continueRun() {
    audio.ensure();
    const saved = readSave();
    profile = normalizeProfile(saved?.profile);
    const restored = sanitizeRun(saved?.run);
    state = restored || createRun("playing");
    state.mode = "playing";
    hideOverlay();
    setMessage(restored ? "RESTORED" : "NEW RUN", 1.8);
    audio.blip("save");
    updateUI();
  }

  function endRun() {
    state.mode = "gameover";
    const run = {
      stamp: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      score: Math.floor(state.score),
      wave: state.wave
    };
    profile.bestScore = Math.max(profile.bestScore, run.score);
    profile.runs.unshift(run);
    profile.runs = profile.runs.slice(0, 6);
    saveGame(false);
    showOverlay("MISSION LOST", `Score ${number(run.score)} / Wave ${state.wave}`);
    audio.blip("hit");
  }

  function upgradeCost(name) {
    const level = profile.upgrades[name] || 0;
    const base = costBase[name];
    const factor = Math.pow(1.58, level);
    return {
      credits: Math.floor(base.credits * factor),
      ore: Math.floor(base.ore * factor),
      plasma: Math.floor(base.plasma * factor),
      crystal: Math.floor(base.crystal * factor)
    };
  }

  function canPay(cost) {
    return Object.keys(cost).every((key) => (profile.resources[key] || 0) >= cost[key]);
  }

  function pay(cost) {
    for (const key of Object.keys(cost)) {
      profile.resources[key] = Math.max(0, (profile.resources[key] || 0) - cost[key]);
    }
  }

  function buyUpgrade(name) {
    const level = profile.upgrades[name] || 0;
    if (level >= MAX_LEVEL) {
      setMessage("MAX LEVEL");
      return;
    }
    const cost = upgradeCost(name);
    if (!canPay(cost)) {
      setMessage("LOW RESOURCES");
      audio.blip("hit");
      return;
    }
    pay(cost);
    profile.upgrades[name] = level + 1;
    const caps = playerCaps();
    state.player.maxShield = caps.maxShield;
    state.player.shield = Math.min(caps.maxShield, state.player.shield + 22);
    setMessage(`${name.toUpperCase()} +1`);
    audio.blip("upgrade");
    saveGame(false);
    updateUI();
  }

  function keyboardVector() {
    const x = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.touchX;
    const y = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.touchY;
    const len = Math.hypot(x, y) || 1;
    return { x: clamp(x / len, -1, 1), y: clamp(y / len, -1, 1), active: Math.abs(x) + Math.abs(y) > 0.04 };
  }

  function worldToScreen(p) {
    return { x: p.x - state.camera.x, y: p.y - state.camera.y };
  }

  function screenToWorld(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: state.camera.x + (x - rect.left) * (W / rect.width),
      y: state.camera.y + (y - rect.top) * (H / rect.height)
    };
  }

  function spawnWave() {
    state.wave += 1;
    const count = 3 + state.wave * 2;
    for (let i = 0; i < count; i += 1) {
      const edge = Math.floor(Math.random() * 4);
      const pos = [
        { x: -40, y: randomRange(0, WORLD.h) },
        { x: WORLD.w + 40, y: randomRange(0, WORLD.h) },
        { x: randomRange(0, WORLD.w), y: -40 },
        { x: randomRange(0, WORLD.w), y: WORLD.h + 40 }
      ][edge];
      const type = state.wave > 2 && Math.random() < 0.28 ? "lancer" : "raider";
      const hp = (type === "lancer" ? 46 : 30) + state.wave * 7;
      state.enemies.push({
        id: state.nextId++,
        type,
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        r: type === "lancer" ? 20 : 16,
        hp,
        maxHp: hp,
        speed: (type === "lancer" ? 70 : 92) + state.wave * 4
      });
    }
    state.waveTimer = Math.max(8, 24 - state.wave * 0.9);
    setMessage(`WAVE ${state.wave}`, 2.4);
    audio.blip("wave");
  }

  function spawnParticles(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = randomRange(0, Math.PI * 2);
      const s = randomRange(30, 160) * power;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randomRange(0.24, 0.72),
        max: 0.72,
        r: randomRange(1.5, 4.2),
        color
      });
    }
  }

  function nearestDeposit() {
    const caps = playerCaps();
    let best = null;
    let bestDist = Infinity;
    for (const d of state.deposits) {
      const dist = distance(state.player, d) - d.r;
      if (dist < caps.mineRange && dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }

  function updateMovement(dt) {
    const caps = playerCaps();
    const p = state.player;
    const move = keyboardVector();
    if (move.active) {
      p.vx += move.x * caps.accel * dt;
      p.vy += move.y * caps.accel * dt;
    }
    const drag = move.active ? 0.988 : 0.948;
    p.vx *= Math.pow(drag, dt * 60);
    p.vy *= Math.pow(drag, dt * 60);

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > caps.maxSpeed) {
      p.vx = (p.vx / speed) * caps.maxSpeed;
      p.vy = (p.vy / speed) * caps.maxSpeed;
    }

    p.x = clamp(p.x + p.vx * dt, p.r, WORLD.w - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, WORLD.h - p.r);

    if (input.pointerActive) {
      const aim = screenToWorld(input.pointerX, input.pointerY);
      p.angle = angleTo(p, aim);
    } else if (speed > 18) {
      p.angle = Math.atan2(p.vy, p.vx);
    }

    state.camera.x = clamp(lerp(state.camera.x, p.x - W / 2, 0.08), 0, WORLD.w - W);
    state.camera.y = clamp(lerp(state.camera.y, p.y - H / 2, 0.08), 0, WORLD.h - H);
  }

  function updateMining(dt) {
    state.mineTargetId = null;
    if (!input.mine) return;

    const target = nearestDeposit();
    if (!target) return;

    const caps = playerCaps();
    const def = depositDefs[target.type];
    const amount = Math.min(target.amount, caps.mineRate * dt);
    target.amount -= amount;
    state.score += amount * def.value * 4;
    profile.resources[target.type] += amount;
    profile.resources.credits += amount * def.value;
    state.mineTargetId = target.id;
    state.minePulse -= dt;

    if (state.minePulse <= 0) {
      state.minePulse = 0.14;
      audio.blip("mine");
      spawnParticles(target.x, target.y, def.color, 2, 0.35);
    }

    if (target.amount <= 0.01) {
      state.score += def.value * 48;
      profile.resources.credits += def.value * 15;
      spawnParticles(target.x, target.y, def.glow, 18, 0.85);
      state.deposits = state.deposits.filter((d) => d !== target);
      audio.blip("collect");
    }
  }

  function updateShooting(dt) {
    const caps = playerCaps();
    const p = state.player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (!input.fire || p.fireCooldown > 0) return;

    p.fireCooldown = caps.fireDelay;
    const nose = {
      x: p.x + Math.cos(p.angle) * (p.r + 10),
      y: p.y + Math.sin(p.angle) * (p.r + 10)
    };
    state.shots.push({
      id: state.nextId++,
      x: nose.x,
      y: nose.y,
      vx: Math.cos(p.angle) * caps.shotSpeed + p.vx * 0.2,
      vy: Math.sin(p.angle) * caps.shotSpeed + p.vy * 0.2,
      r: 4,
      life: 1.1,
      damage: caps.shotDamage
    });
    audio.blip("laser");
  }

  function updateShots(dt) {
    for (const shot of state.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }

    for (const shot of state.shots) {
      if (shot.life <= 0) continue;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < shot.r + enemy.r) {
          enemy.hp -= shot.damage;
          shot.life = 0;
          spawnParticles(shot.x, shot.y, "#35d6e8", 8, 0.65);
          state.shake = Math.max(state.shake, 3);
          audio.blip("hit");
          break;
        }
      }
    }

    const defeated = state.enemies.filter((e) => e.hp <= 0);
    if (defeated.length) {
      for (const enemy of defeated) {
        const bonus = 72 + state.wave * 16 + (enemy.type === "lancer" ? 36 : 0);
        state.score += bonus;
        profile.resources.credits += 18 + state.wave * 3;
        if (Math.random() < 0.28) profile.resources.crystal += 2 + state.wave * 0.3;
        spawnParticles(enemy.x, enemy.y, enemy.type === "lancer" ? "#f24ea2" : "#ff5a6c", 20, 1);
      }
      state.enemies = state.enemies.filter((e) => e.hp > 0);
      if (state.enemies.length === 0) {
        state.waveTimer = Math.min(state.waveTimer, 5);
        profile.resources.credits += 40 + state.wave * 6;
        setMessage("WAVE CLEAR", 1.6);
      }
    }

    state.shots = state.shots.filter((s) => (
      s.life > 0 &&
      s.x > -80 &&
      s.y > -80 &&
      s.x < WORLD.w + 80 &&
      s.y < WORLD.h + 80
    ));
  }

  function updateEnemies(dt) {
    const p = state.player;
    p.invuln = Math.max(0, p.invuln - dt);
    for (const enemy of state.enemies) {
      const a = angleTo(enemy, p);
      const desired = enemy.speed;
      enemy.vx = lerp(enemy.vx, Math.cos(a) * desired, enemy.type === "lancer" ? 0.018 : 0.028);
      enemy.vy = lerp(enemy.vy, Math.sin(a) * desired, enemy.type === "lancer" ? 0.018 : 0.028);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;

      const gap = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (gap < enemy.r + p.r && p.invuln <= 0) {
        const damage = enemy.type === "lancer" ? 22 : 15;
        if (p.shield > 0) {
          const absorbed = Math.min(p.shield, damage);
          p.shield -= absorbed;
          p.hull -= (damage - absorbed) * 0.7;
        } else {
          p.hull -= damage;
        }
        p.invuln = 0.42;
        p.vx += Math.cos(a) * 130;
        p.vy += Math.sin(a) * 130;
        enemy.hp -= 7;
        state.shake = Math.max(state.shake, 7);
        spawnParticles(p.x, p.y, "#ff5a6c", 16, 0.9);
        audio.blip("hit");
      }
    }

    if (p.shield < p.maxShield) {
      p.shield = Math.min(p.maxShield, p.shield + (4 + profile.upgrades.shield * 0.7) * dt);
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.94, dt * 60);
      particle.vy *= Math.pow(0.94, dt * 60);
      particle.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0).slice(-220);
  }

  function update(dt) {
    if (state.mode !== "playing") {
      updateParticles(dt);
      return;
    }

    state.elapsed += dt;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.waveTimer -= dt;
    state.shake = Math.max(0, state.shake - dt * 18);

    updateMovement(dt);
    updateMining(dt);
    updateShooting(dt);
    updateShots(dt);
    updateEnemies(dt);
    updateParticles(dt);

    if (state.waveTimer <= 0) spawnWave();

    while (state.deposits.length < 30) {
      state.deposits.push(createDeposit(state.nextId++, true));
    }

    if (state.player.hull <= 0) {
      state.player.hull = 0;
      endRun();
    }

    state.saveTimer += dt;
    if (state.saveTimer > 4) {
      state.saveTimer = 0;
      saveGame(false);
    }
  }

  function drawBackground() {
    ctx.fillStyle = "#070911";
    ctx.fillRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "rgba(53, 214, 232, 0.12)");
    g.addColorStop(0.5, "rgba(242, 78, 162, 0.08)");
    g.addColorStop(1, "rgba(255, 180, 61, 0.08)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const star of stars) {
      const sx = (star.x - state.camera.x * star.z) % W;
      const sy = (star.y - state.camera.y * star.z) % H;
      ctx.globalAlpha = 0.25 + star.z * 0.65;
      ctx.fillStyle = star.c;
      ctx.fillRect((sx + W) % W, (sy + H) % H, star.z * 2, star.z * 2);
    }
    ctx.globalAlpha = 1;

    const grid = 120;
    ctx.strokeStyle = "rgba(53, 214, 232, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -state.camera.x % grid; x < W; x += grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -state.camera.y % grid; y < H; y += grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  function drawWorldBounds() {
    const topLeft = worldToScreen({ x: 0, y: 0 });
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 3;
    ctx.strokeRect(topLeft.x, topLeft.y, WORLD.w, WORLD.h);
  }

  function drawDeposit(d) {
    const p = worldToScreen(d);
    if (p.x < -80 || p.y < -80 || p.x > W + 80 || p.y > H + 80) return;

    const def = depositDefs[d.type];
    const pct = clamp(d.amount / d.max, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(d.spin + state.elapsed * 0.14);
    ctx.shadowColor = def.glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = d.type === "ore" ? "#352817" : "rgba(10, 13, 26, 0.96)";
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const points = d.type === "ore" ? 10 : 7;
    for (let i = 0; i < points; i += 1) {
      const a = (Math.PI * 2 * i) / points;
      const r = d.r * (0.72 + ((i * 17) % 9) / 24);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = def.color;
    ctx.globalAlpha = 0.28 + pct * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, d.r * pct * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawStation() {
    const p = worldToScreen({ x: WORLD.w / 2, y: WORLD.h / 2 });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(state.elapsed * 0.12);
    ctx.strokeStyle = "rgba(255, 180, 61, 0.42)";
    ctx.fillStyle = "rgba(255, 180, 61, 0.08)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(82, 11);
      ctx.lineTo(82, -11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(53, 214, 232, 0.13)";
    ctx.strokeStyle = "#35d6e8";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    const p = worldToScreen(e);
    if (p.x < -60 || p.y < -60 || p.x > W + 60 || p.y > H + 60) return;
    const a = Math.atan2(e.vy, e.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    ctx.shadowColor = e.type === "lancer" ? "#f24ea2" : "#ff5a6c";
    ctx.shadowBlur = 12;
    ctx.fillStyle = e.type === "lancer" ? "rgba(242, 78, 162, 0.85)" : "rgba(255, 90, 108, 0.86)";
    ctx.strokeStyle = "#ffd7df";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.r + 7, 0);
    ctx.lineTo(-e.r, e.r * 0.78);
    ctx.lineTo(-e.r * 0.45, 0);
    ctx.lineTo(-e.r, -e.r * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#10121b";
    ctx.fillRect(-e.r, e.r + 5, e.r * 2, 4);
    ctx.fillStyle = "#64e388";
    ctx.fillRect(-e.r, e.r + 5, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4);
    ctx.restore();
  }

  function drawShot(s) {
    const p = worldToScreen(s);
    ctx.save();
    ctx.shadowColor = "#35d6e8";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#f5f7fb";
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const s = worldToScreen(p);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(p.angle);
    if (p.invuln > 0) {
      ctx.globalAlpha = 0.55 + Math.sin(state.elapsed * 38) * 0.25;
    }
    ctx.shadowColor = "#35d6e8";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#d9f7ff";
    ctx.strokeStyle = "#08111a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(-16, 17);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-16, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb43d";
    ctx.fillRect(-20, -5, 12, 10);
    ctx.fillStyle = "#f24ea2";
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state.player.shield > 2) {
      ctx.save();
      ctx.globalAlpha = 0.18 + clamp(state.player.shield / state.player.maxShield, 0, 1) * 0.22;
      ctx.strokeStyle = "#35d6e8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const target = state.deposits.find((d) => d.id === state.mineTargetId);
    if (target) {
      const t = worldToScreen(target);
      ctx.save();
      ctx.strokeStyle = "rgba(255, 240, 122, 0.82)";
      ctx.lineWidth = 3 + Math.sin(state.elapsed * 40) * 1.4;
      ctx.shadowColor = "#fff07a";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const particle of state.particles) {
      const p = worldToScreen(particle);
      const alpha = clamp(particle.life / particle.max, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.r * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    const x = W - 174;
    const y = 18;
    const w = 150;
    const h = 102;
    ctx.save();
    ctx.fillStyle = "rgba(6, 8, 17, 0.74)";
    ctx.strokeStyle = "rgba(53, 214, 232, 0.55)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    const mapPoint = (p) => ({
      x: x + (p.x / WORLD.w) * w,
      y: y + (p.y / WORLD.h) * h
    });

    for (const d of state.deposits.slice(0, 40)) {
      const p = mapPoint(d);
      ctx.fillStyle = depositDefs[d.type].color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (const e of state.enemies) {
      const p = mapPoint(e);
      ctx.fillStyle = "#ff5a6c";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    const p = mapPoint(state.player);
    ctx.fillStyle = "#f5f7fb";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9ea8bd";
    ctx.font = "700 10px ui-sans-serif, system-ui";
    ctx.fillText("MINI MAP", x + 9, y + h - 8);
    ctx.restore();
  }

  function drawCanvasHud() {
    ctx.save();
    ctx.fillStyle = "rgba(7, 9, 17, 0.64)";
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.fillRect(18, 18, 220, 66);
    ctx.strokeRect(18, 18, 220, 66);
    ctx.fillStyle = "#f5f7fb";
    ctx.font = "900 18px ui-sans-serif, system-ui";
    ctx.fillText(`SCORE ${number(state.score)}`, 30, 44);
    ctx.font = "800 12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#9ea8bd";
    ctx.fillText(`WAVE ${state.wave}  NEXT ${Math.max(0, Math.ceil(state.waveTimer))}`, 30, 66);

    if (state.messageTimer > 0) {
      ctx.globalAlpha = clamp(state.messageTimer, 0, 1);
      ctx.fillStyle = "#ffb43d";
      ctx.font = "900 28px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText(state.message, W / 2, 72);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function render() {
    ctx.save();
    const shake = state.shake;
    if (shake > 0) {
      ctx.translate(randomRange(-shake, shake), randomRange(-shake, shake));
    }
    drawBackground();
    drawWorldBounds();
    drawStation();
    for (const d of state.deposits) drawDeposit(d);
    for (const shot of state.shots) drawShot(shot);
    for (const enemy of state.enemies) drawEnemy(enemy);
    drawParticles();
    drawPlayer();
    ctx.restore();
    drawMinimap();
    drawCanvasHud();
  }

  function updateUI() {
    els.score.textContent = number(state.score);
    els.best.textContent = number(profile.bestScore);
    els.wave.textContent = String(state.wave);
    els.time.textContent = formatTime(state.elapsed);
    els.hull.style.width = `${clamp(state.player.hull / state.player.maxHull, 0, 1) * 100}%`;
    els.shield.style.width = `${clamp(state.player.shield / state.player.maxShield, 0, 1) * 100}%`;
    els.credits.textContent = number(profile.resources.credits);
    els.ore.textContent = number(profile.resources.ore);
    els.plasma.textContent = number(profile.resources.plasma);
    els.crystal.textContent = number(profile.resources.crystal);
    els.audioBtn.textContent = audio.muted ? "MUTE" : "SND";

    for (const name of Object.keys(costBase)) {
      const level = profile.upgrades[name] || 0;
      const levelEl = document.getElementById(`${name}-level`);
      const costEl = document.getElementById(`${name}-cost`);
      const btn = document.querySelector(`[data-upgrade="${name}"]`);
      const cost = upgradeCost(name);
      levelEl.textContent = String(level);
      costEl.textContent = level >= MAX_LEVEL
        ? "MAX"
        : `${cost.credits}c ${cost.ore}o ${cost.plasma}p ${cost.crystal}x`;
      btn.disabled = level >= MAX_LEVEL || !canPay(cost);
    }

    els.runsBody.innerHTML = "";
    const runs = profile.runs.length ? profile.runs : [{ stamp: "-", score: 0, wave: 0 }];
    for (const run of runs) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${run.stamp}</td><td>${number(run.score)}</td><td>${run.wave}</td>`;
      els.runsBody.appendChild(tr);
    }
  }

  function renderGameToText() {
    const visibleDeposits = state.deposits
      .filter((d) => d.x > state.camera.x - 80 && d.x < state.camera.x + W + 80 && d.y > state.camera.y - 80 && d.y < state.camera.y + H + 80)
      .slice(0, 12)
      .map((d) => ({ id: d.id, type: d.type, x: Math.round(d.x), y: Math.round(d.y), amount: Math.round(d.amount) }));
    const enemies = state.enemies.slice(0, 14).map((e) => ({
      id: e.id,
      type: e.type,
      x: Math.round(e.x),
      y: Math.round(e.y),
      hp: Math.round(e.hp)
    }));
    return JSON.stringify({
      coordinateSystem: "world origin top-left, x right, y down",
      mode: state.mode,
      player: {
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        vx: Math.round(state.player.vx),
        vy: Math.round(state.player.vy),
        hull: Math.round(state.player.hull),
        shield: Math.round(state.player.shield),
        angle: Number(state.player.angle.toFixed(2))
      },
      camera: { x: Math.round(state.camera.x), y: Math.round(state.camera.y), w: W, h: H },
      score: Math.round(state.score),
      wave: state.wave,
      nextWaveSeconds: Math.max(0, Math.round(state.waveTimer)),
      resources: {
        credits: Math.floor(profile.resources.credits),
        ore: Math.floor(profile.resources.ore),
        plasma: Math.floor(profile.resources.plasma),
        crystal: Math.floor(profile.resources.crystal)
      },
      upgrades: profile.upgrades,
      enemies,
      deposits: visibleDeposits,
      mineTargetId: state.mineTargetId,
      shots: state.shots.length,
      savedRunAvailable: Boolean(readSave()?.run)
    });
  }

  function setKey(code, value) {
    const map = {
      KeyW: "up",
      ArrowUp: "up",
      KeyS: "down",
      ArrowDown: "down",
      KeyA: "left",
      ArrowLeft: "left",
      KeyD: "right",
      ArrowRight: "right",
      Space: "fire",
      KeyE: "mine",
      KeyM: "mine",
      KeyB: "mine"
    };
    if (map[code]) {
      input[map[code]] = value;
      return true;
    }
    return false;
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      saveGame(false);
      showOverlay("PAUSED", "Run saved.");
    } else if (state.mode === "paused") {
      state.mode = "playing";
      hideOverlay();
    }
  }

  function toggleFullscreen() {
    const target = document.querySelector(".play-surface");
    if (!document.fullscreenElement) {
      target.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  window.addEventListener("keydown", (event) => {
    if (setKey(event.code, true)) {
      event.preventDefault();
      if (state.mode === "menu" && (event.code === "Space" || event.code === "KeyE")) startNewRun();
    } else if (event.code === "KeyP" || event.code === "Escape") {
      togglePause();
    } else if (event.code === "KeyF") {
      toggleFullscreen();
    } else if (event.code === "Enter" && state.mode !== "playing") {
      continueRun();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (setKey(event.code, false)) event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    input.pointerActive = true;
    input.pointerX = event.clientX;
    input.pointerY = event.clientY;
  });

  canvas.addEventListener("pointerdown", (event) => {
    input.pointerActive = true;
    input.pointerX = event.clientX;
    input.pointerY = event.clientY;
    input.fire = true;
    audio.ensure();
    canvas.setPointerCapture?.(event.pointerId);
    canvas.focus();
  });

  canvas.addEventListener("pointerup", (event) => {
    input.fire = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointerleave", () => {
    input.pointerActive = false;
    if (!matchMedia("(pointer: coarse)").matches) input.fire = false;
  });

  function handleTouchButton(button, key) {
    const down = (event) => {
      event.preventDefault();
      input[key] = true;
      audio.ensure();
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

  handleTouchButton(els.touchMine, "mine");
  handleTouchButton(els.touchFire, "fire");

  function updateStick(event) {
    const rect = els.stickZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const limit = rect.width * 0.32;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(limit, len);
    const nx = (dx / len) * mag;
    const ny = (dy / len) * mag;
    els.stickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    input.touchX = nx / limit;
    input.touchY = ny / limit;
    input.pointerActive = false;
  }

  function resetStick() {
    input.touchX = 0;
    input.touchY = 0;
    els.stickKnob.style.transform = "translate(-50%, -50%)";
  }

  els.stickZone.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.ensure();
    els.stickZone.setPointerCapture?.(event.pointerId);
    updateStick(event);
  });
  els.stickZone.addEventListener("pointermove", (event) => {
    if (event.buttons) updateStick(event);
  });
  els.stickZone.addEventListener("pointerup", (event) => {
    event.preventDefault();
    els.stickZone.releasePointerCapture?.(event.pointerId);
    resetStick();
  });
  els.stickZone.addEventListener("pointercancel", resetStick);

  els.startBtn.addEventListener("click", startNewRun);
  els.continueBtn.addEventListener("click", continueRun);
  els.saveBtn.addEventListener("click", () => saveGame(true));
  els.audioBtn.addEventListener("click", () => {
    audio.muted = !audio.muted;
    profile.muted = audio.muted;
    if (!audio.muted) audio.ensure();
    saveGame(false);
  });
  els.resetBtn.addEventListener("click", () => {
    if (!window.confirm("Reset saved Nebula Miner progress?")) return;
    localStorage.removeItem(SAVE_KEY);
    profile = normalizeProfile(null);
    audio.muted = false;
    state = createRun("menu");
    showOverlay("NEBULA MINER", "Ore, plasma, crystal. Survive the wave.");
    updateUI();
  });

  document.querySelectorAll("[data-upgrade]").forEach((button) => {
    button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade));
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame(false);
  });

  window.addEventListener("beforeunload", () => saveGame(false));

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) update(1 / 60);
    render();
    updateUI();
  };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
    updateUI();
    requestAnimationFrame(loop);
  }

  if (savedAtBoot?.run) {
    state = sanitizeRun(savedAtBoot.run) || createRun("menu");
    state.mode = "menu";
  }

  showOverlay("NEBULA MINER", "Ore, plasma, crystal. Survive the wave.");
  updateUI();
  render();
  requestAnimationFrame(loop);
})();
