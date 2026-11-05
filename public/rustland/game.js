/* 鏽境 Rustland — 遊戲引擎
 * 章節資料在 ch1.js、ch2.js…（window.RL_CHAPTERS），音樂在 music.js（window.RLMusic）。
 * 操作：觸控（左半邊虛擬搖桿、右下 攻擊/衝刺/射擊）或鍵盤（WASD、J 攻擊、K 衝刺、L 射擊）。
 */
'use strict';
(() => {
  const T = 16;
  const CHAPTERS = window.RL_CHAPTERS || {};
  const rand = (a, b) => a + Math.random() * (b - a);

  // 各章共用的對話
  const COMMON_DLG = {
    cpFirst: [
      ['系統', '已連接充電座。電量回復，進度已儲存。'],
      ['系統', '機體停止運作時，會從最後使用的充電座重新啟動。'],
    ],
    dash: [
      ['系統', '取得：推進模組。'],
      ['系統', '按【衝刺】可以快速突進。衝刺途中不會受到傷害，也能越過地面的斷層。'],
    ],
    arc: [
      ['系統', '取得：電弧射擊模組。'],
      ['系統', '用斬擊命中敵人，可以累積電弧能量（最多 3 格）。'],
      ['系統', '按【射擊】發射電弧。電弧可以打中遠處的敵人和開關。'],
    ],
    cell: [['系統', '取得：能量核心。電量上限 +1。']],
  };

  // ================================================================
  // 存檔（v2：多章節）
  // ================================================================
  const SAVE_KEY = 'rustland.save.v1';
  function freshSave() {
    return { v: 2, ch: 1, maxE: 5, abil: {}, deaths: 0, time: 0, flags: {}, chs: {} };
  }
  function freshCh() { return { cp: null, items: {}, cleared: {}, flags: {}, bossDead: false, done: false }; }
  function migrate(s) {
    if (!s || typeof s !== 'object') return null;
    if (s.v === 2) { const n = Object.assign(freshSave(), s); n.abil = n.abil || {}; n.chs = n.chs || {}; return n; }
    // 第一版存檔（只有第一章）
    const n = freshSave();
    n.maxE = s.maxE || 5; n.deaths = s.deaths || 0; n.time = s.time || 0;
    const f = s.flags || {};
    n.flags.started = !!f.started; n.flags.cp = !!f.cp;
    n.abil.dash = !!(s.items && s.items.K);
    const cf = { introSeen: !!f.started, bossIntro: !!f.bossIntro };
    if (f.terminal) cf['npc:terminal'] = true;
    if (f.r7) cf['npc:r7'] = true;
    n.chs[1] = { cp: s.cp || null, items: s.items || {}, cleared: s.cleared || {}, flags: cf, bossDead: !!s.bossDead, done: !!f.chapter1 };
    return n;
  }
  function loadSave() {
    try { return migrate(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { return null; }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 無痕模式 */ }
  }
  let save = loadSave() || freshSave();
  const cs = () => save.chs[save.ch] || (save.chs[save.ch] = freshCh());
  const abil = (k) => !!save.abil[k];

  // ================================================================
  // 章節
  // ================================================================
  let CH = null, BASE = null, W = 0, H = 0, ZONES = [], npcList = [];
  function loadChapter(n) {
    CH = CHAPTERS[n] || CHAPTERS[1];
    W = CH.W; H = CH.H; ZONES = CH.zones;
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill(' '));
    for (const [px, py, rows] of CH.pieces) {
      rows.forEach((row, dy) => {
        for (let dx = 0; dx < row.length; dx++) if (row[dx] !== ' ') g[py + dy][px + dx] = row[dx];
      });
    }
    BASE = g;
    npcList = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = BASE[y][x];
      if (CH.npcs && CH.npcs[c]) npcList.push({ x: x * T + 8, y: y * T + 8, dlg: CH.npcs[c].dlg, look: CH.npcs[c].look });
    }
  }
  const getDlg = (k) => (CH.dlg && CH.dlg[k]) || COMMON_DLG[k];

  // ================================================================
  // 畫布
  // ================================================================
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const lc = low.getContext('2d');
  let VW = 280, VH = 184, dpr = 1, CW = 0, CH_ = 0;
  const safe = { t: 0, r: 0, b: 0, l: 0 };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    CW = window.innerWidth; CH_ = window.innerHeight;
    canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CH_ * dpr);
    const base = 184;
    if (CW >= CH_) { VH = base; VW = Math.round(base * CW / CH_); } else { VW = base; VH = Math.round(base * CH_ / CW); }
    low.width = VW; low.height = VH;
    const st = getComputedStyle(document.getElementById('safe'));
    safe.t = parseFloat(st.paddingTop) || 0; safe.r = parseFloat(st.paddingRight) || 0;
    safe.b = parseFloat(st.paddingBottom) || 0; safe.l = parseFloat(st.paddingLeft) || 0;
    layoutButtons();
  }

  // ================================================================
  // 音效 / 音樂
  // ================================================================
  let AC = null, noiseBuf = null, curTrack = null;
  function initAudio() {
    try {
      if (!AC) {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        if (window.RLMusic) window.RLMusic.init(AC);
      }
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { AC = null; }
  }
  function music(track) {
    if (track === curTrack) return;
    curTrack = track;
    try { if (window.RLMusic && AC) window.RLMusic.play(track); } catch (e) { /* ignore */ }
  }
  function duck(on) { try { if (window.RLMusic && AC && window.RLMusic.duck) window.RLMusic.duck(on); } catch (e) { /* ignore */ } }
  const SFX = {
    swing: ['triangle', 600, 180, 0.07, 0.06], hit: ['square', 220, 80, 0.08, 0.08],
    clang: ['square', 1400, 900, 0.06, 0.05], dash: ['sawtooth', 180, 520, 0.12, 0.05],
    hurt: ['sawtooth', 300, 60, 0.25, 0.12], pick: ['sine', 660, 1320, 0.15, 0.1],
    heal: ['sine', 440, 880, 0.12, 0.07], shot: ['square', 900, 300, 0.07, 0.04],
    tele: ['sine', 200, 420, 0.3, 0.05], blip: ['sine', 880, 880, 0.03, 0.03],
    door: ['triangle', 120, 60, 0.25, 0.1], arc: ['sawtooth', 1200, 2400, 0.12, 0.05],
    cut: ['triangle', 300, 140, 0.1, 0.07], switch: ['square', 520, 1040, 0.2, 0.06],
    charge: ['sine', 1500, 1800, 0.05, 0.04],
  };
  function sfx(name) {
    if (!AC) return;
    const s = SFX[name]; if (!s) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = s[0];
    o.frequency.setValueAtTime(s[1], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, s[2]), t + s[3]);
    g.gain.setValueAtTime(s[4], t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s[3]);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + s[3] + 0.02);
  }
  function boom(vol = 0.25, dur = 0.4) {
    if (!AC || !noiseBuf) return;
    const t = AC.currentTime, src = AC.createBufferSource(); src.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(AC.destination);
    src.start(t); src.stop(t + dur);
  }

  // ================================================================
  // 輸入
  // ================================================================
  const input = { mx: 0, my: 0, atk: false, dash: false, shot: false, adv: false, keys: {} };
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const btn = {
    atk: { x: 0, y: 0, r: 40, id: null, label: '攻擊' },
    dash: { x: 0, y: 0, r: 30, id: null, label: '衝刺' },
    shot: { x: 0, y: 0, r: 28, id: null, label: '射擊' },
    pause: { x: 0, y: 0, r: 20, id: null },
  };
  let isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function layoutButtons() {
    const s = Math.min(1.15, Math.max(0.8, Math.min(CW, CH_) / 390));
    btn.atk.r = 40 * s; btn.dash.r = 30 * s; btn.shot.r = 28 * s;
    btn.atk.x = CW - safe.r - 24 - btn.atk.r;
    btn.atk.y = CH_ - safe.b - 24 - btn.atk.r;
    btn.dash.x = btn.atk.x - btn.atk.r - 26 * s - btn.dash.r;
    btn.dash.y = btn.atk.y + btn.atk.r * 0.35;
    btn.shot.x = btn.atk.x - btn.atk.r * 0.55;
    btn.shot.y = btn.atk.y - btn.atk.r - 20 * s - btn.shot.r;
    btn.pause.x = CW - safe.r - 16 - btn.pause.r;
    btn.pause.y = safe.t + 14 + btn.pause.r;
  }
  const inCircle = (b, x, y, pad = 12) => Math.hypot(x - b.x, y - b.y) <= b.r + pad;
  function onTouchStart(e) {
    e.preventDefault();
    isTouch = true;
    initAudio();
    if (mode !== 'play') return;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      if (dlg) { input.adv = true; continue; }
      if (inCircle(btn.pause, x, y, 8)) { openPause(); return; }
      if (abil('arc') && inCircle(btn.shot, x, y, 6)) { btn.shot.id = t.identifier; input.shot = true; continue; }
      if (inCircle(btn.atk, x, y)) { btn.atk.id = t.identifier; input.atk = true; continue; }
      if (inCircle(btn.dash, x, y)) { btn.dash.id = t.identifier; input.dash = true; continue; }
      if (x < CW * 0.6 && joy.id === null) { joy.id = t.identifier; joy.ox = joy.x = x; joy.oy = joy.y = y; }
      else if (x >= CW * 0.6) { btn.atk.id = t.identifier; input.atk = true; }
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
  }
  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) joy.id = null;
      for (const k of ['atk', 'dash', 'shot']) if (t.identifier === btn[k].id) btn[k].id = null;
    }
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    initAudio();
    if (mode !== 'play') return;
    if (dlg) { input.adv = true; return; }
    if (inCircle(btn.pause, e.clientX, e.clientY, 8)) openPause();
  });
  window.addEventListener('keydown', (e) => {
    initAudio();
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    input.keys[k] = true;
    if (mode !== 'play') return;
    if (dlg && (k === ' ' || k === 'enter' || k === 'j' || k === 'z')) { input.adv = true; return; }
    if (k === 'j' || k === ' ' || k === 'z') input.atk = true;
    if (k === 'k' || k === 'shift' || k === 'x') input.dash = true;
    if (k === 'l' || k === 'c') input.shot = true;
    if (k === 'escape' || k === 'p') openPause();
  });
  window.addEventListener('keyup', (e) => { input.keys[e.key.toLowerCase()] = false; });
  function readMove() {
    let mx = 0, my = 0;
    const k = input.keys;
    if (k['a'] || k['arrowleft']) mx -= 1;
    if (k['d'] || k['arrowright']) mx += 1;
    if (k['w'] || k['arrowup']) my -= 1;
    if (k['s'] || k['arrowdown']) my += 1;
    if (joy.id !== null) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, max = 48, d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, d / max); mx = dx / d * m; my = dy / d * m; }
      if (d > max) { joy.ox = joy.x - dx / d * max; joy.oy = joy.y - dy / d * max; }
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    input.mx = mx; input.my = my;
  }

  // ================================================================
  // 世界
  // ================================================================
  let mode = 'title';
  let grid, ents, bullets, pshots, hazards, parts, player, cam, zoneState, checkpoints;
  let dlg = null, toastMsg = null, banner = null, shake = 0, deadT = 0, hitStop = 0;
  let curZone = null, lastZoneId = null, cpLatch = null, gameTime = 0;
  const session = { banners: {}, trig: {} };

  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H) ? ' ' : grid[ty][tx];
  const zoneAtTile = (tx, ty) => ZONES.find((z) => tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1) || null;
  const zoneAt = (x, y) => zoneAtTile(Math.floor(x / T), Math.floor(y / T));
  const gateOpen = (tx, ty) => { const z = zoneAtTile(tx, ty); return !!(z && cs().flags['gate:' + z.id]); };

  function newWorld() {
    grid = BASE.map((r) => r.slice());
    ents = []; bullets = []; pshots = []; hazards = []; parts = []; checkpoints = {};
    zoneState = {};
    for (const z of ZONES) zoneState[z.id] = { engaged: false, locked: false };
    const c0 = cs();
    let start = null, boss = null, treeBox = null;
    const nodes = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      const px = x * T + T / 2, py = y * T + T / 2;
      const z = zoneAtTile(x, y);
      const cleared = z && c0.cleared[z.id];
      const put = (e) => { if (!cleared) ents.push(e); grid[y][x] = '.'; };
      switch (c) {
        case 'S': start = { x: px, y: py }; grid[y][x] = '.'; break;
        case 'd': put(mkDrone(px, py, z)); break;
        case 'c': put(mkCrawler(px, py, z)); break;
        case 't': put(mkTurret(px, py, z)); break;
        case 'r': put(mkCrow(px, py, z)); break;
        case 'p': put(mkPod(px, py, z)); break;
        case 'w': ents.push(mkSaw(px, py, z)); grid[y][x] = '.'; break;
        case 'B': if (!c0.bossDead) ents.push(boss = mkG0(px, py, z)); grid[y][x] = '.'; break;
        case 'V': if (!c0.bossDead) ents.push(boss = mkV9(px, py, z)); grid[y][x] = '.'; break;
        case 'R': nodes.push({ x: px, y: py, z }); grid[y][x] = '.'; break;
        case 'K': case 'A': case 'E': case 'b': {
          const ab = c === 'K' ? 'dash' : c === 'A' ? 'arc' : null;
          if (!c0.items[c] && !(ab && abil(ab))) ents.push({ type: 'item', kind: c, x: px, y: py, r: 6, t: 0, zone: z });
          grid[y][x] = '.'; break;
        }
        case 'C': checkpoints[x + ',' + y] = { x: px, y: py, key: x + ',' + y }; break;
        case 'T':
          if (!treeBox) treeBox = { x0: x, y0: y, x1: x, y1: y };
          treeBox.x1 = Math.max(treeBox.x1, x); treeBox.y1 = Math.max(treeBox.y1, y); break;
      }
    }
    if (boss && boss.type === 'v9') {
      for (const n of nodes) { const e = mkNode(n.x, n.y, n.z, boss); ents.push(e); boss.nodes.push(e); }
    }
    if (treeBox) ents.push({ type: 'tree', x: (treeBox.x0 + treeBox.x1 + 1) * T / 2, y: (treeBox.y1 + 1) * T - 2, w: (treeBox.x1 - treeBox.x0 + 1) * T, h: (treeBox.y1 - treeBox.y0 + 1) * T, fixed: true });
    let sp = start;
    if (c0.cp && checkpoints[c0.cp]) { sp = checkpoints[c0.cp]; cpLatch = c0.cp; } else cpLatch = null;
    const startE = c0.cp ? save.maxE : (CH.startEnergy != null ? Math.min(CH.startEnergy, save.maxE) : save.maxE);
    player = {
      x: sp.x, y: sp.y, r: 5, fx: 0, fy: 1, energy: startE, arc: 3, inv: 0, atkT: 0, atkCD: 0, hitSet: null,
      dashT: 0, dashCD: 0, shotCD: 0, dx: 0, dy: 0, fall: 0, kx: 0, ky: 0, lastSafe: { x: sp.x, y: sp.y }, walk: 0,
    };
    cam = { x: player.x - VW / 2, y: player.y - VH / 2 };
    curZone = zoneAt(player.x, player.y); lastZoneId = curZone && curZone.id;
  }

  const base = (type, x, y, zone, o) => Object.assign({ type, x, y, zone, kx: 0, ky: 0, flash: 0, dx: 0, dy: 0 }, o);
  const mkDrone = (x, y, z) => base('drone', x, y, z, { r: 5, hp: 2, st: 'hover', t: rand(0.6, 1.6), bob: rand(0, 6) });
  const mkCrawler = (x, y, z) => base('crawler', x, y, z, { r: 6, hp: 3, st: 'walk', t: rand(1.5, 2.5), step: 0 });
  const mkTurret = (x, y, z) => base('turret', x, y, z, { r: 6, hp: 3, st: 'wait', t: 1.2, ang: Math.PI / 2, fixed: true });
  const mkCrow = (x, y, z) => base('crow', x, y, z, { r: 5, hp: 2, st: 'move', t: rand(1, 2), ang: 0, flap: rand(0, 6), side: Math.random() < 0.5 ? 1 : -1 });
  const mkPod = (x, y, z) => base('pod', x, y, z, { r: 6, hp: 2, st: 'idle', t: 0, fixed: true, pulse: rand(0, 6) });
  const mkSaw = (x, y, z) => base('saw', x, y, z, { r: 6, vx: (Math.random() < 0.5 ? -1 : 1) * rand(62, 82), spin: 0, fixed: true });
  const mkG0 = (x, y, z) => base('boss', x, y, z, { r: 12, hp: 28, maxhp: 28, st: 'sleep', t: 0, phase: 1, seq: 0, dy: 1, waves: 0, spin: 0, fixed: true, name: '守門者 G-0' });
  const mkV9 = (x, y, z) => base('v9', x, y, z, { r: 11, hp: 30, maxhp: 30, st: 'sleep', t: 0, phase: 1, seq: 0, dy: 1, fixed: true, shield: true, downT: 0, nodes: [], name: '園丁 V-9', sway: 0 });
  const mkNode = (x, y, z, boss) => base('node', x, y, z, { r: 6, hp: 1, alive: true, grow: 1, fixed: true, boss });

  const isEnemy = (e) => ['drone', 'crawler', 'turret', 'crow', 'pod', 'boss', 'v9'].includes(e.type);
  const isBoss = (e) => e.type === 'boss' || e.type === 'v9';
  const hittable = (e) => isEnemy(e) || e.type === 'saw' || (e.type === 'node' && e.alive);

  // ================================================================
  // 碰撞
  // ================================================================
  function doorLocked(tx, ty) {
    for (const z of ZONES) {
      if (z.lock && tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1 && zoneState[z.id].locked) return true;
    }
    return false;
  }
  function solidAt(tx, ty, who) {
    const t = tileAt(tx, ty);
    switch (t) {
      case '#': case ' ': case 'M': case 'N': case 'n': case 'T': case '%': case 'o': return true;
      case 'D': return doorLocked(tx, ty);
      case 'G': return !gateOpen(tx, ty);
      case 'X': return !cs().bossDead;
      case '=': return who === 'ground';
      default: return false;
    }
  }
  function overlaps(e, who) {
    const r = e.r;
    const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r - 0.01) / T);
    const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty, who)) return true;
    return false;
  }
  function moveEnt(e, dx, dy, who) {
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      e.x += sx; if (overlaps(e, who)) { e.x -= sx; hit = true; }
      e.y += sy; if (overlaps(e, who)) { e.y -= sy; hit = true; }
    }
    return hit;
  }

  // ================================================================
  // 特效 / 對話
  // ================================================================
  function burst(x, y, n, color, spd = 60, life = 0.5, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, color, size });
    }
  }
  function toast(msg, dur = 2.2) { toastMsg = { msg, t: dur }; }
  function say(key, onEnd) {
    const lines = getDlg(key);
    if (!lines) { if (onEnd) onEnd(); return; }
    dlg = { lines, i: 0, chars: 0, onEnd };
    input.atk = input.dash = input.shot = false;
    duck(true);
    sfx('blip');
  }

  // ================================================================
  // 戰鬥
  // ================================================================
  function hurtPlayer(sx, sy, dmg = 1) {
    const p = player;
    if (p.inv > 0 || p.dashT > 0 || p.fall > 0 || deadT > 0) return;
    p.energy -= dmg; p.inv = 1.0;
    const d = Math.hypot(p.x - sx, p.y - sy) || 1;
    p.kx = (p.x - sx) / d * 160; p.ky = (p.y - sy) / d * 160;
    shake = Math.max(shake, 4); hitStop = 0.06;
    sfx('hurt');
    burst(p.x, p.y, 10, '#ff8a4a', 70, 0.4);
    if (p.energy <= 0) die();
  }
  function die() {
    deadT = 1.6; save.deaths++; writeSave();
    burst(player.x, player.y, 30, '#d9773f', 90, 0.9, 1.5);
    boom(0.3, 0.6);
  }
  function respawn() {
    deadT = 0; newWorld(); player.energy = save.maxE; toast('重新啟動……');
  }
  function addArc(n = 1) {
    if (!abil('arc') || player.arc >= 3) return;
    player.arc = Math.min(3, player.arc + n);
    sfx('charge');
  }

  // 回傳 'hit' | 'clang'
  function hurtEnemy(e, dmg, sx, sy, src) {
    const clang = () => {
      sfx('clang');
      burst(e.x + (sx - e.x) * 0.4, e.y + (sy - e.y) * 0.4, 6, '#fff3b0', 80, 0.25);
      if (src === 'slash') {
        const d = Math.hypot(player.x - e.x, player.y - e.y) || 1;
        player.kx = (player.x - e.x) / d * 110; player.ky = (player.y - e.y) / d * 110;
      }
      return 'clang';
    };
    if (e.type === 'saw') return clang();
    if (e.type === 'boss' && (e.st === 'tele' || e.st === 'charge')) return clang();
    if (e.type === 'v9' && e.shield) return clang();
    if (e.type === 'node') {
      if (src !== 'shot') return clang();
      e.alive = false; e.grow = 0; e.flash = 0.2;
      sfx('switch'); boom(0.15, 0.3);
      burst(e.x, e.y, 18, '#ffcf60', 70, 0.6);
      const b = e.boss;
      if (b && !b.dead && b.shield && b.nodes.every((n) => !n.alive)) {
        b.shield = false; b.st = 'wilt'; b.t = 1.4; b.downT = b.phase === 2 ? 5.5 : 7;
        shake = 6; sfx('door'); toast('護盾消失了！', 1.6);
        burst(b.x, b.y, 30, '#7fe07a', 90, 0.8);
      }
      return 'hit';
    }
    e.hp -= dmg; e.flash = 0.12; hitStop = 0.035;
    sfx('hit');
    burst(e.x, e.y, 6, '#ffd08a', 70, 0.3);
    if (!e.fixed) {
      const d = Math.hypot(e.x - sx, e.y - sy) || 1;
      e.kx = (e.x - sx) / d * 170; e.ky = (e.y - sy) / d * 170;
      if (e.st === 'lunge' || e.st === 'rush') { e.st = e.type === 'drone' ? 'hover' : 'walk'; e.t = 0.8; }
      if (e.type === 'crow' && e.st === 'aim') { e.st = 'move'; e.t = 1.0; }
    }
    if (isBoss(e) && e.phase === 1 && e.hp <= e.maxhp / 2 && e.hp > 0) enterPhase2(e);
    if (e.hp <= 0) killEnemy(e);
    return 'hit';
  }
  function enterPhase2(e) {
    e.phase = 2; e.seq = 0;
    toast(CH.bossPhase2 || '……', 2.6);
    shake = 6; boom(0.2, 0.5);
    if (e.type === 'boss') { e.st = 'idle'; e.t = 1.2; }
    if (e.type === 'v9') {
      // 護盾重生，要再打一次根節點
      e.shield = true; e.st = 'idle'; e.t = 1.0; e.downT = 0;
      for (const n of e.nodes) { n.alive = true; n.grow = 0; burst(n.x, n.y, 12, '#7fe07a', 50, 0.6); }
      hazards.length = 0;
    }
  }
  function killEnemy(e) {
    e.dead = true;
    if (isBoss(e)) {
      shake = 10; boom(0.4, 1.2);
      burst(e.x, e.y, 60, '#ffb060', 140, 1.2, 2);
      burst(e.x, e.y, 30, '#4ff0d0', 80, 1.4, 1.5);
      for (const o of ents) if ((o.minion || o.type === 'node') && !o.dead) { o.dead = true; burst(o.x, o.y, 10, '#aaa', 60, 0.5); }
      bullets.length = 0; hazards.length = 0;
      const c0 = cs();
      c0.bossDead = true; c0.cleared[e.zone.id] = true;
      writeSave();
      setTimeout(() => say(CH.bossDown, () => { sfx('door'); shake = 5; }), 900);
      return;
    }
    boom(0.12, 0.25);
    burst(e.x, e.y, 16, '#c9b8a4', 80, 0.6);
    burst(e.x, e.y, 6, '#ff6a3a', 50, 0.4);
    if (!e.minion && Math.random() < 0.35) {
      ents.push({ type: 'spark', x: e.x, y: e.y, r: 4, t: 0, life: 9, vx: rand(-30, 30), vy: rand(-30, 30) });
    }
  }

  function nearestTarget(maxD, needCone) {
    const p = player;
    let fx = p.fx, fy = p.fy;
    const ml = Math.hypot(input.mx, input.my);
    if (ml > 0.3) { fx = input.mx / ml; fy = input.my / ml; }
    let best = null, bs = Infinity;
    const consider = (x, y) => {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > maxD) return;
      const dot = (dx * fx + dy * fy) / d;
      if (needCone && dot < 0.55) return;
      const score = d * (needCone ? (2 - dot) : 1);
      if (score < bs) { bs = score; best = { x, y }; }
    };
    for (const e of ents) if (!e.dead && (isEnemy(e) || (e.type === 'node' && e.alive)) && (!e.zone || !curZone || e.zone.id === curZone.id)) consider(e.x, e.y);
    if (needCone && curZone) {
      for (let y = curZone.y0; y <= curZone.y1; y++) for (let x = curZone.x0; x <= curZone.x1; x++) {
        if (tileAt(x, y) === 'o' && !cs().flags['gate:' + curZone.id]) consider(x * T + 8, y * T + 8);
      }
    }
    return best;
  }

  function startAttack() {
    const p = player;
    if (p.atkCD > 0 || p.fall > 0) return;
    const best = nearestTarget(40, false);
    if (best && Math.hypot(input.mx, input.my) < 0.3) {
      const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
      p.fx = (best.x - p.x) / d; p.fy = (best.y - p.y) / d;
    }
    p.atkT = 0.3; p.atkCD = 0.3; p.hitSet = new Set(); p.cutDone = false;
    sfx('swing');
  }
  function startDash() {
    const p = player;
    if (!abil('dash')) { toast('（尚未安裝推進模組）', 1.4); return; }
    if (p.dashCD > 0 || p.fall > 0) return;
    let dx = input.mx, dy = input.my;
    const l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = p.fx; dy = p.fy; } else { dx /= l; dy /= l; }
    p.dx = dx; p.dy = dy; p.dashT = 0.2; p.dashCD = 0.55; p.fx = dx; p.fy = dy;
    sfx('dash');
  }
  function startShot() {
    const p = player;
    if (!abil('arc') || p.shotCD > 0 || p.fall > 0) return;
    if (p.arc < 1) { toast('電弧能量不足（用斬擊命中敵人來累積）', 1.6); p.shotCD = 0.4; return; }
    let dx = p.fx, dy = p.fy;
    const ml = Math.hypot(input.mx, input.my);
    if (ml > 0.3) { dx = input.mx / ml; dy = input.my / ml; }
    const tgt = nearestTarget(170, true);
    if (tgt) { const d = Math.hypot(tgt.x - p.x, tgt.y - p.y) || 1; dx = (tgt.x - p.x) / d; dy = (tgt.y - p.y) / d; }
    p.fx = dx; p.fy = dy;
    p.arc -= 1; p.shotCD = 0.28;
    pshots.push({ x: p.x + dx * 6, y: p.y - 2 + dy * 6, vx: dx * 290, vy: dy * 290, life: 0.6 });
    sfx('arc');
  }

  function activateSwitch(tx, ty) {
    const z = zoneAtTile(tx, ty);
    if (!z || cs().flags['gate:' + z.id]) return;
    cs().flags['gate:' + z.id] = true; writeSave();
    sfx('switch'); setTimeout(() => sfx('door'), 250);
    shake = 4;
    burst(tx * T + 8, ty * T + 8, 20, '#4ff0d0', 70, 0.6);
    toast('開關啟動・閘門開啟了');
  }
  function cutVine(tx, ty) {
    if (tileAt(tx, ty) !== '%') return false;
    grid[ty][tx] = ',';
    sfx('cut');
    burst(tx * T + 8, ty * T + 8, 14, '#5fa04a', 60, 0.5);
    burst(tx * T + 8, ty * T + 8, 5, '#a05a9a', 40, 0.4);
    return true;
  }

  function updatePlayer(dt) {
    const p = player;
    p.inv = Math.max(0, p.inv - dt);
    p.atkCD = Math.max(0, p.atkCD - dt);
    p.dashCD = Math.max(0, p.dashCD - dt);
    p.shotCD = Math.max(0, p.shotCD - dt);
    if (p.fall > 0) {
      p.fall -= dt;
      if (p.fall <= 0) {
        p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.fall = 0;
        p.energy -= 1; p.inv = 1.0; sfx('hurt'); shake = 3;
        if (p.energy <= 0) die();
      }
      return;
    }
    if (input.atk) startAttack();
    if (input.dash) startDash();
    if (input.shot) startShot();

    let vx = 0, vy = 0;
    if (p.dashT > 0) {
      p.dashT -= dt;
      vx = p.dx * 330; vy = p.dy * 330;
      if (Math.random() < 0.8) parts.push({ x: p.x + rand(-2, 2), y: p.y + rand(-2, 2), vx: -p.dx * 20, vy: -p.dy * 20, life: 0.25, max: 0.25, color: '#4ff0d0', size: 1 });
    } else {
      const slow = p.atkT > 0.15 ? 0.45 : 1;
      vx = input.mx * 72 * slow; vy = input.my * 72 * slow;
      const l = Math.hypot(input.mx, input.my);
      if (l > 0.2 && p.atkT <= 0) { p.fx = input.mx / l; p.fy = input.my / l; }
      if (vx || vy) p.walk += dt * 10;
    }
    vx += p.kx; vy += p.ky;
    p.kx *= Math.pow(0.0005, dt); p.ky *= Math.pow(0.0005, dt);
    moveEnt(p, vx * dt, vy * dt, 'player');

    if (p.atkT > 0) {
      p.atkT -= dt;
      if (p.atkT > 0.15) {
        const reach = 20;
        for (const e of ents) {
          if (e.dead || !hittable(e) || p.hitSet.has(e)) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > reach + e.r) continue;
          if (d > e.r + 4 && (dx * p.fx + dy * p.fy) / d < 0.35) continue;
          p.hitSet.add(e);
          const res = hurtEnemy(e, 1, p.x, p.y, 'slash');
          if (res === 'hit' && isEnemy(e)) addArc(1);
          else if (res === 'clang' && isBoss(e)) addArc(1);
        }
        for (const b of bullets) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
          if (d < reach + 2 && (d < 6 || (dx * p.fx + dy * p.fy) / d > 0.2)) { b.dead = true; burst(b.x, b.y, 5, '#4ff0d0', 50, 0.25); }
        }
        // 砍藤蔓 / 近距離打開關
        if (!p.cutDone) {
          const ang = Math.atan2(p.fy, p.fx);
          for (let a = -0.9; a <= 0.9; a += 0.3) for (const rr of [9, 17]) {
            const tx = Math.floor((p.x + Math.cos(ang + a) * rr) / T), ty = Math.floor((p.y + Math.sin(ang + a) * rr) / T);
            if (cutVine(tx, ty)) p.cutDone = true;
            if (tileAt(tx, ty) === 'o') activateSwitch(tx, ty);
          }
        }
      }
    }

    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    if (p.dashT <= 0 && tileAt(tx, ty) === '=') { p.fall = 0.45; p.atkT = 0; sfx('tele'); return; }
    if (p.dashT <= 0) {
      const r = p.r + 1;
      const ok = [[-r, -r], [r, -r], [-r, r], [r, r]].every(([ox, oy]) => tileAt(Math.floor((p.x + ox) / T), Math.floor((p.y + oy) / T)) !== '=');
      if (ok) { p.lastSafe.x = p.x; p.lastSafe.y = p.y; }
    }

    // 充電座
    const key = tx + ',' + ty;
    if (checkpoints[key]) {
      if (cpLatch !== key) {
        cpLatch = key;
        const first = !save.flags.cp;
        cs().cp = key; save.flags.cp = true;
        p.energy = save.maxE; p.arc = 3;
        writeSave(); sfx('heal');
        burst(p.x, p.y, 20, '#4ff0d0', 50, 0.8);
        if (first) say('cpFirst'); else toast('已充電・進度已儲存');
      }
    } else if (cpLatch) {
      const c = checkpoints[cpLatch];
      if (!c || Math.hypot(p.x - c.x, p.y - c.y) > T * 1.2) cpLatch = null;
    }
    if (tileAt(tx, ty) === 'X' && cs().bossDead && mode === 'play') { finishChapter(); return; }
    // NPC：第一次靠近自動對話
    for (const n of npcList) {
      if (Math.hypot(p.x - n.x, p.y - n.y) < 24 && !cs().flags['npc:' + n.dlg]) {
        cs().flags['npc:' + n.dlg] = true; writeSave();
        say(n.dlg);
        break;
      }
    }
  }
  function nearNpc() {
    for (const n of npcList) if (Math.hypot(player.x - n.x, player.y - n.y) < 26) return n;
    return null;
  }

  // ================================================================
  // 敵人 AI
  // ================================================================
  const enemyActive = (e) => curZone && e.zone && e.zone.id === curZone.id && deadT <= 0;
  function fireBullet(x, y, ang, spd = 85, color) {
    bullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 2.5, life: 5, color });
  }
  function toPlayer(e) {
    const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
    return { dx, dy, d, nx: dx / d, ny: dy / d };
  }
  function knock(e, dt) {
    e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
    return [e.kx, e.ky];
  }

  function updateDrone(e, dt) {
    e.bob += dt * 6;
    if (!enemyActive(e)) return;
    const { d, nx, ny } = toPlayer(e);
    e.t -= dt;
    let vx = 0, vy = 0;
    if (e.st === 'hover') {
      const s = d > 38 ? 46 : -30;
      vx = nx * s - ny * 18; vy = ny * s + nx * 18;
      if (e.t <= 0 && d < 110) { e.st = 'tele'; e.t = 0.5; sfx('tele'); }
    } else if (e.st === 'tele') {
      if (e.t <= 0) { e.st = 'lunge'; e.t = 0.38; e.dx = nx; e.dy = ny; }
    } else if (e.st === 'lunge') {
      vx = e.dx * 185; vy = e.dy * 185;
      if (e.t <= 0) { e.st = 'hover'; e.t = rand(1.0, 1.8); }
    }
    const [kx, ky] = knock(e, dt);
    if (moveEnt(e, (vx + kx) * dt, (vy + ky) * dt, 'fly') && e.st === 'lunge') { e.st = 'hover'; e.t = 1.0; }
  }
  function updateCrawler(e, dt) {
    if (!enemyActive(e)) return;
    const { d, nx, ny } = toPlayer(e);
    e.t -= dt;
    let vx = 0, vy = 0;
    if (e.st === 'walk') {
      vx = nx * 26; vy = ny * 26; e.step += dt * 8;
      if (e.t <= 0 && d < 100) { e.st = 'tele'; e.t = 0.45; e.dx = nx; e.dy = ny; }
    } else if (e.st === 'tele') {
      if (e.t <= 0) { e.st = 'rush'; e.t = 0.45; }
    } else if (e.st === 'rush') {
      vx = e.dx * 120; vy = e.dy * 120; e.step += dt * 20;
      if (e.t <= 0) { e.st = 'walk'; e.t = rand(2.0, 2.8); }
    }
    const [kx, ky] = knock(e, dt);
    moveEnt(e, (vx + kx) * dt, (vy + ky) * dt, 'ground');
  }
  function updateTurret(e, dt) {
    if (!enemyActive(e)) return;
    const target = Math.atan2(player.y - e.y, player.x - e.x);
    let da = target - e.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (e.st !== 'tele') e.ang += da * Math.min(1, dt * 4);
    e.t -= dt;
    if (e.st === 'wait' && e.t <= 0) { e.st = 'tele'; e.t = 0.45; sfx('tele'); }
    else if (e.st === 'tele' && e.t <= 0) {
      const mx = e.x + Math.cos(e.ang) * 8, my = e.y + Math.sin(e.ang) * 8;
      for (const o of [-0.22, 0, 0.22]) fireBullet(mx, my, e.ang + o, 80);
      sfx('shot'); e.st = 'wait'; e.t = 1.9;
    }
  }
  function updateCrow(e, dt) {
    e.flap += dt * 14;
    if (!enemyActive(e)) return;
    const { d, nx, ny } = toPlayer(e);
    e.t -= dt;
    let vx = 0, vy = 0;
    if (e.st === 'move') {
      const s = d > 82 ? 50 : d < 62 ? -55 : 0;
      vx = nx * s - ny * 34 * e.side; vy = ny * s + nx * 34 * e.side;
      if (Math.random() < dt * 0.5) e.side *= -1;
      if (e.t <= 0 && d < 160) { e.st = 'aim'; e.t = 0.8; e.ang = Math.atan2(ny, nx); sfx('tele'); }
    } else if (e.st === 'aim') {
      if (e.t > 0.22) e.ang = Math.atan2(ny, nx);
      if (e.t <= 0) {
        fireBullet(e.x + Math.cos(e.ang) * 6, e.y + Math.sin(e.ang) * 6, e.ang, 165, '#ff5050');
        sfx('shot'); e.st = 'move'; e.t = rand(1.6, 2.4);
      }
    }
    const [kx, ky] = knock(e, dt);
    if (moveEnt(e, (vx + kx) * dt, (vy + ky) * dt, 'fly')) e.side *= -1;
  }
  function updatePod(e, dt) {
    e.pulse += dt * 3;
    if (!enemyActive(e)) return;
    const { d } = toPlayer(e);
    e.t -= dt;
    if (e.st === 'idle' && d < 46) { e.st = 'swell'; e.t = 0.6; sfx('tele'); }
    else if (e.st === 'swell' && e.t <= 0) {
      const off = rand(0, Math.PI / 4);
      for (let i = 0; i < 8; i++) fireBullet(e.x, e.y, off + i * Math.PI / 4, 55, '#c58aff');
      burst(e.x, e.y, 14, '#b07ae0', 50, 0.6);
      boom(0.08, 0.2); e.st = 'rest'; e.t = 3;
    } else if (e.st === 'rest' && e.t <= 0) e.st = 'idle';
  }
  function updateSaw(e, dt) {
    e.spin += dt * 20;
    if (moveEnt(e, e.vx * dt, 0, 'ground')) e.vx = -e.vx;
    if (Math.random() < 0.3) parts.push({ x: e.x + rand(-4, 4), y: e.y + 5, vx: rand(-20, 20), vy: rand(-30, -10), life: 0.2, max: 0.2, color: '#ffd080', size: 1 });
  }

  function bossWake(e) {
    const zs = zoneState[e.zone.id];
    if (e.st === 'sleep') {
      if (zs.engaged && !dlg) {
        e.st = 'wake';
        const again = cs().flags.bossIntro;
        say(again ? CH.bossAgain : CH.bossIntro, () => { e.st = 'idle'; e.t = 0.8; cs().flags.bossIntro = true; writeSave(); });
      }
      return true;
    }
    return e.st === 'wake' || deadT > 0;
  }

  function updateG0(e, dt) {
    if (bossWake(e)) return;
    const p2 = e.phase === 2;
    const { dx, dy, d } = toPlayer(e);
    e.t -= dt;
    switch (e.st) {
      case 'idle':
        moveEnt(e, dx / d * 22 * dt, dy / d * 22 * dt, 'ground');
        if (e.t <= 0) {
          const pat = p2 ? ['charge', 'burst', 'charge', 'summon', 'charge', 'spiral'] : ['charge', 'charge', 'burst'];
          const act = pat[e.seq++ % pat.length];
          if (act === 'charge') { e.st = 'tele'; e.t = p2 ? 0.55 : 0.75; sfx('tele'); }
          else if (act === 'burst') { e.st = 'btele'; e.t = 0.55; e.waves = p2 ? 3 : 2; sfx('tele'); }
          else if (act === 'summon') { e.st = 'summon'; e.t = 0.7; }
          else { e.st = 'spiral'; e.t = 1.8; e.spin = Math.atan2(dy, dx); e.waves = 0; }
        }
        break;
      case 'tele':
        if (e.t > 0.15) { e.dx = dx / d; e.dy = dy / d; }
        if (e.t <= 0) { e.st = 'charge'; e.t = 2.2; shake = Math.max(shake, 2); }
        break;
      case 'charge': {
        const spd = p2 ? 265 : 215;
        if (moveEnt(e, e.dx * spd * dt, e.dy * spd * dt, 'ground')) {
          e.st = 'stun'; e.t = p2 ? 1.25 : 1.6; shake = 7; boom(0.3, 0.4);
          burst(e.x + e.dx * 12, e.y + e.dy * 12, 22, '#ffcf80', 110, 0.6);
          if (p2) for (let i = 0; i < 8; i++) fireBullet(e.x, e.y, i * Math.PI / 4 + Math.PI / 8, 70);
        } else if (e.t <= 0) { e.st = 'idle'; e.t = 0.6; }
        if (Math.random() < 0.6) parts.push({ x: e.x + rand(-8, 8), y: e.y + 8, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#7a5a40', size: 2 });
        break;
      }
      case 'stun':
        if (Math.random() < 0.2) parts.push({ x: e.x + rand(-10, 10), y: e.y - 12, vx: rand(-10, 10), vy: -30, life: 0.4, max: 0.4, color: '#fff3b0', size: 1 });
        if (e.t <= 0) { e.st = 'idle'; e.t = 0.5; }
        break;
      case 'btele':
        if (e.t <= 0) {
          const n = p2 ? 16 : 12, off = (e.waves % 2) * Math.PI / n;
          for (let i = 0; i < n; i++) fireBullet(e.x, e.y, off + i * Math.PI * 2 / n, p2 ? 78 : 68);
          sfx('shot'); e.waves--;
          if (e.waves > 0) e.t = 0.42; else { e.st = 'idle'; e.t = 1.1; }
        }
        break;
      case 'summon':
        if (e.t <= 0) {
          const alive = ents.filter((o) => o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const a = rand(0, Math.PI * 2);
            const m = mkDrone(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, e.zone);
            m.minion = true; m.t = 1.2; m.hp = 1;
            ents.push(m); burst(m.x, m.y, 10, '#4ff0d0', 40, 0.5);
          }
          sfx('tele'); e.st = 'idle'; e.t = 0.9;
        }
        break;
      case 'spiral':
        e.waves -= dt;
        if (e.waves <= 0) {
          e.waves = 0.1; e.spin += 0.32;
          for (let i = 0; i < 3; i++) fireBullet(e.x, e.y, e.spin + i * Math.PI * 2 / 3, 70);
          sfx('shot');
        }
        if (e.t <= 0) { e.st = 'idle'; e.t = 1.2; }
        break;
    }
  }

  function updateV9(e, dt) {
    e.sway += dt * 2;
    for (const n of e.nodes) if (n.alive && n.grow < 1) n.grow = Math.min(1, n.grow + dt * 1.5);
    if (bossWake(e)) return;
    const p2 = e.phase === 2;
    const { dx, dy, d } = toPlayer(e);
    // 護盾倒數：時間到就重生
    if (!e.shield) {
      e.downT -= dt;
      if (e.downT <= 0) {
        e.shield = true; sfx('tele'); toast('V-9 的護盾重新長出來了', 1.6);
        for (const n of e.nodes) { n.alive = true; n.grow = 0; }
        burst(e.x, e.y, 24, '#7fe07a', 70, 0.7);
      }
    }
    e.t -= dt;
    switch (e.st) {
      case 'wilt':
        if (e.t <= 0) { e.st = 'idle'; e.t = 0.6; }
        break;
      case 'idle':
        moveEnt(e, dx / d * 18 * dt, dy / d * 18 * dt, 'ground');
        if (e.t <= 0) {
          const pat = p2 ? ['lunge', 'roots', 'seeds', 'lunge', 'roots', 'lunge', 'seeds'] : ['lunge', 'roots', 'seeds', 'roots'];
          const act = pat[e.seq++ % pat.length];
          if (act === 'lunge') { e.st = 'ltele'; e.t = p2 ? 0.48 : 0.62; sfx('tele'); }
          else if (act === 'roots') {
            const n = p2 ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const a = rand(0, Math.PI * 2), rr = i === 0 ? 0 : rand(18, 42);
              hazards.push({ x: player.x + Math.cos(a) * rr, y: player.y + Math.sin(a) * rr, r: 12, t: 0.85 + i * (p2 ? 0.12 : 0.18), t0: 0.85 + i * (p2 ? 0.12 : 0.18), on: 0 });
            }
            sfx('tele'); e.st = 'idle'; e.t = p2 ? 1.0 : 1.4;
          } else { e.st = 'seeds'; e.t = 0.45; e.waves = p2 ? 2 : 1; }
        }
        break;
      case 'ltele':
        if (e.t > 0.15) { e.dx = dx / d; e.dy = dy / d; }
        if (e.t <= 0) { e.st = 'lunge'; e.t = 0.34; sfx('dash'); }
        break;
      case 'lunge':
        if (moveEnt(e, e.dx * 300 * dt, e.dy * 300 * dt, 'ground') || e.t <= 0) {
          e.st = 'idle'; e.t = p2 ? 0.55 : 0.8;
          burst(e.x + e.dx * 10, e.y + e.dy * 10, 10, '#9fd08a', 60, 0.4);
        }
        if (Math.random() < 0.8) parts.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#6fb05a', size: 2 });
        break;
      case 'seeds':
        if (e.t <= 0) {
          const ang = Math.atan2(dy, dx);
          for (let i = -2; i <= 2; i++) fireBullet(e.x, e.y, ang + i * 0.2, 95, '#d0e070');
          sfx('shot'); e.waves--;
          if (e.waves > 0) e.t = 0.32; else { e.st = 'idle'; e.t = 1.0; }
        }
        break;
    }
  }

  function updateHazards(dt) {
    for (const h of hazards) {
      if (h.t > 0) {
        h.t -= dt;
        if (h.t <= 0) { h.on = 0.32; boom(0.08, 0.15); burst(h.x, h.y, 8, '#8a6a40', 60, 0.4); }
      } else {
        h.on -= dt;
        if (Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r - 2) hurtPlayer(h.x, h.y);
        if (h.on <= 0) h.dead = true;
      }
    }
    hazards = hazards.filter((h) => !h.dead);
  }

  // ================================================================
  // 區域、觸發
  // ================================================================
  function updateZones() {
    curZone = zoneAt(player.x, player.y);
    const ptx = Math.floor(player.x / T), pty = Math.floor(player.y / T);
    const c0 = cs();
    for (const z of ZONES) {
      if (!z.lock) continue;
      const zs = zoneState[z.id];
      const living = ents.some((e) => !e.dead && isEnemy(e) && e.zone && e.zone.id === z.id);
      const inside = ptx >= z.x0 + 2 && ptx <= z.x1 - 2 && pty >= z.y0 + 2 && pty <= z.y1 - 2;
      if (!zs.engaged && inside && living && !c0.cleared[z.id]) { zs.engaged = true; zs.locked = true; sfx('door'); shake = Math.max(shake, 2); }
      if (zs.engaged && !living) {
        zs.engaged = false; zs.locked = false;
        if (!c0.cleared[z.id]) { c0.cleared[z.id] = true; writeSave(); if (!z.boss) { sfx('door'); toast('區域淨空・門已開啟'); } }
      }
    }
    if (curZone && curZone.id !== lastZoneId) {
      lastZoneId = curZone.id;
      if (!session.banners[curZone.id]) { session.banners[curZone.id] = true; banner = { msg: curZone.name, t: 2.4 }; }
    } else if (!curZone) lastZoneId = null;

    if (!dlg) {
      const g = { player, zone: curZone && curZone.id, abil, flag: (k) => !!cs().flags[k] };
      for (const tr of CH.triggers || []) {
        if (session.trig[tr.id]) continue;
        if (tr.when(g)) { session.trig[tr.id] = true; say(tr.dlg); break; }
      }
    }
    const boss = ents.find((e) => isBoss(e) && !e.dead && e.st !== 'sleep');
    music(boss && curZone && curZone.id === boss.zone.id ? CH.bossMusic : CH.music);
  }

  function updateEnts(dt) {
    const p = player;
    for (const e of ents) {
      if (e.dead) continue;
      e.flash = Math.max(0, (e.flash || 0) - dt);
      switch (e.type) {
        case 'drone': updateDrone(e, dt); break;
        case 'crawler': updateCrawler(e, dt); break;
        case 'turret': updateTurret(e, dt); break;
        case 'crow': updateCrow(e, dt); break;
        case 'pod': updatePod(e, dt); break;
        case 'saw': updateSaw(e, dt); break;
        case 'boss': updateG0(e, dt); break;
        case 'v9': updateV9(e, dt); break;
        case 'item': e.t += dt; break;
        case 'spark': {
          e.t += dt; e.life -= dt;
          if (e.life <= 0) { e.dead = true; break; }
          const { nx, ny, d } = toPlayer(e);
          if (d < 34 && p.energy < save.maxE) { e.vx += nx * 300 * dt; e.vy += ny * 300 * dt; }
          e.vx *= Math.pow(0.05, dt); e.vy *= Math.pow(0.05, dt);
          moveEnt(e, e.vx * dt, e.vy * dt, 'fly');
          break;
        }
      }
      if (e.dead || deadT > 0 || p.fall > 0 || dlg) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (isEnemy(e) || e.type === 'saw' || e.type === 'node') {
        if (e.fixed && e.type !== 'saw' && !(e.type === 'node' && !e.alive)) {
          const min = e.r + p.r;
          if (d < min && d > 0.01) moveEnt(p, (p.x - e.x) / d * (min - d), (p.y - e.y) / d * (min - d), 'player');
        }
        const harmless = e.type === 'turret' || e.type === 'pod' || e.type === 'node' ||
          (isBoss(e) && (e.st === 'sleep' || e.st === 'wake' || e.st === 'wilt'));
        if (!harmless && d < e.r + p.r - 1 && (e.type === 'saw' || enemyActive(e))) hurtPlayer(e.x, e.y, 1);
      } else if (e.type === 'spark' && d < 9 && p.energy < save.maxE) {
        e.dead = true; p.energy = Math.min(save.maxE, p.energy + 1); sfx('heal');
        burst(e.x, e.y, 8, '#4ff0d0', 40, 0.4);
      } else if (e.type === 'item' && d < 11) {
        e.dead = true; cs().items[e.kind] = true;
        sfx('pick'); burst(e.x, e.y, 24, '#4ff0d0', 70, 0.8);
        if (e.kind === 'K') { save.abil.dash = true; say('dash'); }
        else if (e.kind === 'A') { save.abil.arc = true; p.arc = 3; say('arc'); }
        else if (e.kind === 'E') { save.maxE += 1; p.energy = save.maxE; say('cell'); }
        else if (e.kind === 'b') { p.energy = Math.min(save.maxE, p.energy + 2); toast('取得：備用電池（電量 +2）'); }
        writeSave();
      }
    }
    ents = ents.filter((e) => !e.dead);
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) b.dead = true;
      const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
      if (tileAt(tx, ty) !== '=' && solidAt(tx, ty, 'fly')) { b.dead = true; burst(b.x, b.y, 4, '#ff7a4a', 30, 0.2); }
      if (!b.dead && Math.hypot(b.x - player.x, b.y - player.y) < b.r + player.r - 1) {
        if (player.inv <= 0 && player.dashT <= 0 && player.fall <= 0) { b.dead = true; hurtPlayer(b.x - b.vx, b.y - b.vy); }
      }
    }
    bullets = bullets.filter((b) => !b.dead);

    for (const s of pshots) {
      for (let k = 0; k < 3 && !s.dead; k++) {
        s.x += s.vx * dt / 3; s.y += s.vy * dt / 3;
        const tx = Math.floor(s.x / T), ty = Math.floor(s.y / T), t = tileAt(tx, ty);
        if (t === 'o') { activateSwitch(tx, ty); s.dead = true; break; }
        if (t === '%') { cutVine(tx, ty); s.dead = true; break; }
        if (t !== '=' && solidAt(tx, ty, 'fly')) { s.dead = true; burst(s.x, s.y, 6, '#4ff0d0', 40, 0.3); break; }
        for (const e of ents) {
          if (e.dead || !hittable(e)) continue;
          if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 3) {
            hurtEnemy(e, 2, s.x - s.vx * 0.05, s.y - s.vy * 0.05, 'shot');
            s.dead = true; burst(s.x, s.y, 10, '#4ff0d0', 60, 0.35); break;
          }
        }
      }
      s.life -= dt;
      if (s.life <= 0) s.dead = true;
      if (Math.random() < 0.9) parts.push({ x: s.x, y: s.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.18, max: 0.18, color: '#bffff2', size: 1 });
    }
    pshots = pshots.filter((s) => !s.dead);
  }

  function updateParts(dt) {
    for (const q of parts) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= Math.pow(0.1, dt); q.vy *= Math.pow(0.1, dt);
      q.life -= dt;
    }
    parts = parts.filter((q) => q.life > 0);
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.0008, dt);
    cam.x += (player.x - VW / 2 - cam.x) * k; cam.y += (player.y - VH / 2 - cam.y) * k;
    const mw = W * T, mh = H * T;
    cam.x = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, cam.x));
    cam.y = mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, cam.y));
  }

  function update(dt) {
    if (toastMsg) { toastMsg.t -= dt; if (toastMsg.t <= 0) toastMsg = null; }
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    shake = Math.max(0, shake - dt * 20);
    if (dlg) {
      const line = dlg.lines[dlg.i][1];
      const before = Math.floor(dlg.chars);
      dlg.chars = Math.min(line.length, dlg.chars + dt * 32);
      if (Math.floor(dlg.chars) !== before && Math.floor(dlg.chars) % 3 === 0) sfx('blip');
      if (input.adv) {
        input.adv = false;
        if (dlg.chars < line.length) dlg.chars = line.length;
        else if (++dlg.i >= dlg.lines.length) { const cb = dlg.onEnd; dlg = null; duck(false); if (cb) cb(); }
        else dlg.chars = 0;
      }
      input.atk = input.dash = input.shot = false;
      updateParts(dt); updateCamera(dt);
      return;
    }
    input.adv = false;
    if (hitStop > 0) { hitStop -= dt; input.atk = input.dash = input.shot = false; return; }
    save.time += dt;
    readMove();
    if (deadT > 0) {
      deadT -= dt; updateParts(dt);
      if (deadT <= 0) respawn();
      input.atk = input.dash = input.shot = false;
      return;
    }
    if (input.atk) { const n = nearNpc(); if (n) { say(n.dlg); input.atk = false; } }
    updatePlayer(dt);
    input.atk = input.dash = input.shot = false;
    if (mode !== 'play') return;
    updateZones();
    updateEnts(dt);
    updateHazards(dt);
    updateBullets(dt);
    updateParts(dt);
    updateCamera(dt);
  }

  // ================================================================
  // 繪圖：地圖
  // ================================================================
  const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
  const THEMES = {
    ruins: { floor: '#2a2420', floor2: '#2e2723', seam: '#221d1a', wallTop: '#4a3a2f', wallSpot: '#544336', wallFace: '#302520', faceLine: '#3c2e26', wallEdge: '#6b5242', stain: 'rgba(181,86,47,0.18)', streak: 'rgba(181,86,47,0.5)', pebble: '#3a2a20', rubble: '#4a3c32', void: '#070505', pit: '#040303', lip: '#1a1512', lip2: '#100c0a', vignette: '5,3,2', accent: '#d9773f' },
    forest: { floor: '#1b241a', floor2: '#1f291d', seam: '#151c14', wallTop: '#2b3824', wallSpot: '#34452b', wallFace: '#1a2316', faceLine: '#243020', wallEdge: '#4d6a3c', stain: 'rgba(90,170,80,0.12)', streak: 'rgba(110,190,90,0.45)', pebble: '#2c3a22', rubble: '#3a4a2c', void: '#040604', pit: '#030403', lip: '#141c12', lip2: '#0c110b', vignette: '2,5,3', accent: '#7fc06a' },
  };
  const COL = { rust: '#b5562f', rustL: '#d9773f', teal: '#4ff0d0', tealD: '#1d6b5e' };
  const isWallish = (t) => t === '#' || t === ' ' || t === 'M' || t === 'o';
  const theme = () => THEMES[CH.theme] || THEMES.ruins;

  function drawFloor(c, sx, sy, tx, ty, P) {
    const h = hash(tx, ty);
    c.fillStyle = h % 5 === 0 ? P.floor2 : P.floor; c.fillRect(sx, sy, T, T);
    c.fillStyle = P.seam; c.fillRect(sx, sy, T, 1); c.fillRect(sx, sy, 1, T);
    if (h % 7 === 0) { c.fillStyle = P.pebble; c.fillRect(sx + (h % 11), sy + (h % 13), 2, 1); }
    if (h % 13 === 0) { c.fillStyle = P.stain; c.fillRect(sx + 3, sy + 4, 6, 5); }
    if (CH.theme === 'forest') {
      if (h % 4 === 0) { c.fillStyle = '#2f4a26'; c.fillRect(sx + (h % 9) + 2, sy + 10, 1, 3); c.fillRect(sx + (h % 9) + 4, sy + 11, 1, 2); }
      if (h % 37 === 0) {
        c.fillStyle = `rgba(120,255,200,${0.4 + 0.3 * Math.sin(gameTime * 2 + h)})`; c.fillRect(sx + 9, sy + 6, 2, 1);
        c.fillStyle = '#4a6a5a'; c.fillRect(sx + 9, sy + 7, 1, 2);
      }
    }
  }
  function drawTile(c, tx, ty, ox, oy) {
    const t = tileAt(tx, ty);
    const P = theme();
    const sx = tx * T - ox, sy = ty * T - oy;
    if (t === ' ') return;
    if (t === '#' || t === 'M' || t === 'o') {
      const h = hash(tx, ty);
      c.fillStyle = P.wallTop; c.fillRect(sx, sy, T, T);
      c.fillStyle = P.wallSpot; if (h % 3 === 0) c.fillRect(sx + 2, sy + 2, 5, 3);
      if (!isWallish(tileAt(tx, ty + 1))) {
        c.fillStyle = P.wallFace; c.fillRect(sx, sy + 9, T, 7);
        c.fillStyle = P.faceLine; c.fillRect(sx, sy + 9, T, 1);
        if (h % 4 === 0) { c.fillStyle = P.streak; c.fillRect(sx + (h % 12), sy + 10, 1, 5); }
        if (CH.theme === 'forest' && h % 3 === 0) { c.fillStyle = '#3f6a32'; c.fillRect(sx + (h % 10) + 2, sy + 9, 1, 3 + (h % 5)); }
      }
      if (!isWallish(tileAt(tx, ty - 1))) { c.fillStyle = P.wallEdge; c.fillRect(sx, sy, T, 1); }
      if (t === 'M') {
        c.fillStyle = '#2b3a38'; c.fillRect(sx + 3, sy + 1, 10, 8);
        c.fillStyle = `rgba(79,240,208,${0.25 + 0.15 * Math.sin(gameTime * 2 + tx)})`; c.fillRect(sx + 4, sy + 2, 8, 6);
        c.fillStyle = '#1a2422'; c.fillRect(sx + 4, sy + 5, 8, 1);
      }
      if (t === 'o') {
        const on = gateOpen(tx, ty);
        c.fillStyle = '#1a1c1c'; c.fillRect(sx + 3, sy + 4, 10, 10);
        c.fillStyle = '#4a4e4e'; c.fillRect(sx + 3, sy + 4, 10, 1);
        const pulse = on ? 1 : 0.55 + 0.45 * Math.sin(gameTime * 5);
        c.fillStyle = on ? `rgba(79,240,208,${pulse})` : `rgba(255,90,70,${pulse})`;
        c.fillRect(sx + 6, sy + 7, 4, 4);
        if (!on) { c.fillStyle = 'rgba(255,90,70,0.18)'; c.fillRect(sx + 1, sy + 2, 14, 14); }
      }
      return;
    }
    if (t === '=') {
      c.fillStyle = P.pit; c.fillRect(sx, sy, T, T);
      const above = tileAt(tx, ty - 1);
      if (above !== '=' && !isWallish(above)) {
        c.fillStyle = P.lip; c.fillRect(sx, sy, T, 4);
        c.fillStyle = P.lip2; c.fillRect(sx, sy + 4, T, 3);
        if (CH.theme === 'forest' && hash(tx, ty) % 2 === 0) { c.fillStyle = '#3a2a1a'; c.fillRect(sx + (hash(tx, ty) % 12), sy + 4, 1, 6); }
      }
      if (hash(tx, ty) % 9 === 0) { c.fillStyle = 'rgba(79,240,208,0.08)'; c.fillRect(sx + 6, sy + 9, 1, 1); }
      return;
    }
    if (t === 'T') {
      c.fillStyle = '#3a2a1c'; c.fillRect(sx, sy, T, T);
      c.fillStyle = '#4a3624'; c.fillRect(sx + (hash(tx, ty) % 8), sy, 2, T);
      const glow = (cs().bossDead ? 0.7 : 0.25) + 0.15 * Math.sin(gameTime * 1.5 + ty);
      c.fillStyle = `rgba(150,255,170,${glow})`; c.fillRect(sx + 6 + (ty % 3), sy, 1, T);
      return;
    }
    drawFloor(c, sx, sy, tx, ty, P);
    if (t === ',') {
      c.fillStyle = P.rubble; c.fillRect(sx + 3, sy + 9, 3, 2); c.fillRect(sx + 9, sy + 5, 2, 2); c.fillRect(sx + 11, sy + 11, 3, 2);
    } else if (t === '%') {
      c.fillStyle = '#16260f'; c.fillRect(sx, sy + 2, T, 13);
      c.strokeStyle = '#3c7a2a'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sx, sy + 12); c.quadraticCurveTo(sx + 5, sy + 2, sx + 9, sy + 9); c.quadraticCurveTo(sx + 13, sy + 15, sx + 16, sy + 4);
      c.moveTo(sx + 2, sy + 4); c.quadraticCurveTo(sx + 8, sy + 15, sx + 15, sy + 12);
      c.stroke();
      c.fillStyle = '#b06ab0';
      c.fillRect(sx + 4, sy + 6, 1, 1); c.fillRect(sx + 11, sy + 10, 1, 1); c.fillRect(sx + 7, sy + 12, 1, 1); c.fillRect(sx + 13, sy + 5, 1, 1);
      c.fillStyle = '#6aaa4a'; c.fillRect(sx + 6, sy + 4, 2, 1); c.fillRect(sx + 12, sy + 8, 2, 1);
    } else if (t === 'G') {
      if (!gateOpen(tx, ty)) {
        c.fillStyle = '#1a1a14'; c.fillRect(sx, sy, T, T);
        c.fillStyle = '#c8c050';
        for (let i = 1; i < T; i += 4) c.fillRect(sx + i, sy, 2, T);
        c.fillStyle = '#6a6a30'; c.fillRect(sx, sy + 6, T, 3);
      } else { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(sx, sy, T, 2); c.fillRect(sx, sy + 14, T, 2); }
    } else if (t === 'D') {
      const locked = doorLocked(tx, ty);
      c.fillStyle = '#1b1613'; c.fillRect(sx, sy, T, T);
      c.fillStyle = '#3a2e26'; c.fillRect(sx, sy, T, 2); c.fillRect(sx, sy + 14, T, 2);
      if (locked) {
        c.fillStyle = `rgba(255,74,61,${0.65 + 0.35 * Math.sin(gameTime * 6)})`;
        for (let i = 1; i < T; i += 4) c.fillRect(sx + i, sy + 1, 2, 14);
        c.fillStyle = 'rgba(255,74,61,0.15)'; c.fillRect(sx - 2, sy - 2, T + 4, T + 4);
      } else { c.fillStyle = '#2a221d'; c.fillRect(sx + 2, sy + 2, T - 4, T - 4); }
    } else if (t === 'C') {
      const active = cs().cp === tx + ',' + ty;
      c.fillStyle = '#1d1a18'; c.fillRect(sx + 1, sy + 1, 14, 14);
      c.fillStyle = active ? COL.teal : COL.tealD;
      c.globalAlpha = active ? 0.6 + 0.4 * Math.sin(gameTime * 4) : 1;
      c.fillRect(sx + 3, sy + 3, 10, 1); c.fillRect(sx + 3, sy + 12, 10, 1);
      c.fillRect(sx + 3, sy + 3, 1, 10); c.fillRect(sx + 12, sy + 3, 1, 10);
      c.fillRect(sx + 7, sy + 5, 2, 6); c.fillRect(sx + 5, sy + 7, 6, 2);
      c.globalAlpha = 1;
    } else if (t === 'N' || t === 'n') {
      const npc = CH.npcs && CH.npcs[t];
      drawNpc(c, npc ? npc.look : 'terminal', sx, sy);
    } else if (t === 'X') {
      if (!cs().bossDead) {
        c.fillStyle = '#2a2622'; c.fillRect(sx, sy, T, T);
        c.save(); c.beginPath(); c.rect(sx, sy, T, T); c.clip();
        c.fillStyle = '#c9a23a';
        for (let i = -T; i < T; i += 5) c.fillRect(sx + i + ((ty * 3) % 5), sy, 2, T);
        c.restore();
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(sx, sy + 7, T, 2);
      } else {
        c.fillStyle = '#000'; c.fillRect(sx, sy, T, T);
        c.fillStyle = `rgba(79,240,208,${0.35 + 0.3 * Math.sin(gameTime * 3)})`;
        c.fillRect(sx + 2, sy + 2, T - 4, 1); c.fillRect(sx + 2, sy + T - 3, T - 4, 1);
        c.fillRect(sx + 7, sy + 5, 2, 5); c.fillRect(sx + 5, sy + 8, 6, 1); c.fillRect(sx + 6, sy + 9, 4, 1);
      }
    }
  }
  function drawNpc(c, look, sx, sy) {
    if (look === 'terminal') {
      c.fillStyle = '#3a3f40'; c.fillRect(sx + 2, sy + 2, 12, 12);
      c.fillStyle = '#1b2a26'; c.fillRect(sx + 3, sy + 3, 10, 7);
      const f = Math.sin(gameTime * 9) > -0.8 ? 1 : 0.3;
      c.fillStyle = `rgba(120,255,170,${0.55 * f})`; c.fillRect(sx + 4, sy + 4, 6, 1); c.fillRect(sx + 4, sy + 6, 4, 1); c.fillRect(sx + 4, sy + 8, 7, 1);
      c.fillStyle = '#262b2c'; c.fillRect(sx + 2, sy + 12, 12, 3);
    } else if (look === 'r7') {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(sx + 1, sy + 11, 14, 3);
      c.fillStyle = '#5c625f'; c.fillRect(sx + 2, sy + 5, 12, 8);
      c.fillStyle = '#7a807c'; c.fillRect(sx + 2, sy + 5, 12, 2);
      c.fillStyle = '#3a3e3c'; c.fillRect(sx + 1, sy + 11, 4, 3); c.fillRect(sx + 11, sy + 11, 4, 3);
      c.fillStyle = `rgba(79,240,208,${Math.sin(gameTime * 1.3) > 0.6 ? 0.9 : 0.25})`; c.fillRect(sx + 4, sy + 8, 5, 2);
      c.fillStyle = '#888'; c.fillRect(sx + 12, sy + 2, 1, 3);
    } else if (look === 'sprout') {
      const b = Math.round(Math.sin(gameTime * 3));
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(sx + 3, sy + 13, 10, 2);
      c.fillStyle = '#7a8a6a'; c.fillRect(sx + 4, sy + 6 + b, 8, 7);
      c.fillStyle = '#9aaa86'; c.fillRect(sx + 4, sy + 6 + b, 8, 2);
      c.fillStyle = '#1a2216'; c.fillRect(sx + 5, sy + 8 + b, 6, 2);
      c.fillStyle = '#9fffb0'; c.fillRect(sx + 6, sy + 8 + b, 1, 1); c.fillRect(sx + 9, sy + 8 + b, 1, 1);
      c.fillStyle = '#5fbf4a'; c.fillRect(sx + 8, sy + 2 + b, 1, 4); c.fillRect(sx + 5, sy + 2 + b, 3, 2); c.fillRect(sx + 9, sy + 1 + b, 3, 2);
    }
  }

  // ================================================================
  // 繪圖：角色
  // ================================================================
  function drawShadow(c, x, y, w) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x - w, y, w * 2, 2); c.fillRect(x - w + 1, y - 1, w * 2 - 2, 4);
  }
  function drawPlayer(c, ox, oy) {
    const p = player;
    if (deadT > 0) return;
    if (p.inv > 0 && p.dashT <= 0 && Math.floor(p.inv * 16) % 2 === 0) return;
    const x = Math.round(p.x - ox);
    let y = Math.round(p.y - oy);
    c.save();
    if (p.fall > 0) { const s = p.fall / 0.45; c.translate(x, y); c.scale(s, s); c.translate(-x, -y); }
    else drawShadow(c, x, y + 4, 5);
    y += p.dashT <= 0 && (input.mx || input.my) ? Math.round(Math.sin(p.walk) * 0.6) : 0;
    c.fillStyle = '#231710'; c.fillRect(x - 5, y + 1, 10, 3);
    c.fillStyle = '#3a271b'; c.fillRect(x - 5 + (Math.floor(p.walk) % 3), y + 2, 1, 1); c.fillRect(x + 2 - (Math.floor(p.walk) % 3), y + 2, 1, 1);
    c.fillStyle = '#7a3a22'; c.fillRect(x - 5, y - 6, 10, 8);
    c.fillStyle = p.dashT > 0 ? '#e8a070' : COL.rust; c.fillRect(x - 4, y - 6, 8, 7);
    c.fillStyle = COL.rustL; c.fillRect(x - 4, y - 6, 8, 2);
    const fx = Math.round(p.fx * 1.6), fy = Math.round(p.fy * 1.2);
    const lowE = p.energy <= 1;
    c.fillStyle = '#140d0a'; c.fillRect(x - 3 + fx, y - 4 + fy, 6, 3);
    c.fillStyle = p.fy < -0.5 ? '#5a2a18' : (lowE && Math.sin(gameTime * 10) > 0 ? '#ff4a3d' : COL.teal);
    c.fillRect(x - 2 + fx, y - 3 + fy, 4, 1);
    c.fillStyle = '#9a8a7a'; c.fillRect(x + 2, y - 9, 1, 3);
    c.fillStyle = lowE ? '#ff4a3d' : COL.teal; c.fillRect(x + 2, y - 10, 1, 1);
    if (abil('arc') && p.arc > 0) { c.fillStyle = `rgba(191,255,242,${0.4 + 0.3 * Math.sin(gameTime * 8)})`; c.fillRect(x - 6, y - 4, 1, 3); }
    c.restore();
    if (p.atkT > 0) {
      const prog = 1 - p.atkT / 0.3, ang = Math.atan2(p.fy, p.fx);
      const a0 = ang - 1.15, a1 = ang - 1.15 + 2.3 * Math.min(1, prog * 2.2);
      c.save();
      c.globalAlpha = Math.max(0, 1 - prog * 1.1);
      c.strokeStyle = '#e8fffa'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y - 2, 15, a0, a1); c.stroke();
      c.strokeStyle = COL.teal; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y - 2, 18, a0 + 0.2, a1); c.stroke();
      c.restore();
    }
  }

  function drawEnt(c, e, ox, oy) {
    const x = Math.round(e.x - ox), y = Math.round(e.y - oy);
    const flash = e.flash > 0, forest = CH.theme === 'forest';
    switch (e.type) {
      case 'drone': {
        const by = Math.round(Math.sin(e.bob) * 1.5), yy = y - 3 + by;
        drawShadow(c, x, y + 7, 3);
        const tele = e.st === 'tele' && Math.floor(gameTime * 20) % 2 === 0;
        c.fillStyle = flash ? '#fff' : (tele ? '#ff6a5a' : (forest ? '#5d6a56' : '#6d6a66')); c.fillRect(x - 4, yy - 3, 8, 6);
        c.fillStyle = flash ? '#fff' : (forest ? '#7d8a6a' : '#8d8a84'); c.fillRect(x - 4, yy - 3, 8, 2);
        if (forest) { c.fillStyle = '#4a8a3a'; c.fillRect(x - 4, yy + 2, 3, 1); c.fillRect(x + 2, yy - 3, 2, 1); }
        c.fillStyle = '#ff4a3d'; c.fillRect(x - 1, yy, 2, 2);
        c.fillStyle = '#aaa';
        const r = Math.floor(gameTime * 30) % 2;
        c.fillRect(x - 6 + r, yy - 5, 4, 1); c.fillRect(x + 2 - r, yy - 5, 4, 1); c.fillRect(x, yy - 5, 1, 2);
        if (e.st === 'lunge') { c.fillStyle = 'rgba(255,74,61,0.35)'; c.fillRect(x - 5 - e.dx * 5, yy - 4 - e.dy * 5, 10, 8); }
        break;
      }
      case 'crawler': {
        drawShadow(c, x, y + 4, 6);
        const tele = e.st === 'tele', l = Math.round(Math.sin(e.step) * 1.5);
        c.fillStyle = '#2a211a';
        c.fillRect(x - 8, y - 1 + l, 3, 1); c.fillRect(x + 5, y - 1 - l, 3, 1);
        c.fillRect(x - 8, y + 2 - l, 3, 1); c.fillRect(x + 5, y + 2 + l, 3, 1);
        c.fillStyle = flash ? '#fff' : (tele ? '#a8482c' : (forest ? '#4a523a' : '#5a4a3c')); c.fillRect(x - 6, y - 5, 12, 9);
        c.fillStyle = flash ? '#fff' : '#76614e'; c.fillRect(x - 5, y - 5, 10, 2);
        if (forest) { c.fillStyle = '#3f7a30'; c.fillRect(x - 5, y - 6, 4, 1); c.fillRect(x + 1, y - 6, 3, 1); }
        c.fillStyle = tele ? '#ffe070' : '#ff8a3a';
        const s = player.x > e.x ? 1 : -1;
        c.fillRect(x - 3 + s, y - 2, 2, 2); c.fillRect(x + 1 + s, y - 2, 2, 2);
        if (tele) { c.fillStyle = 'rgba(255,200,80,0.25)'; c.fillRect(x - 8, y - 7, 16, 13); }
        break;
      }
      case 'turret': {
        c.fillStyle = '#1e1c20'; c.fillRect(x - 7, y - 4, 14, 10);
        c.fillStyle = flash ? '#fff' : '#4a4a52'; c.fillRect(x - 6, y - 6, 12, 10);
        c.fillStyle = flash ? '#fff' : '#606068'; c.fillRect(x - 6, y - 6, 12, 2);
        c.strokeStyle = '#2e2e34'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x + Math.cos(e.ang) * 9, y - 2 + Math.sin(e.ang) * 9); c.stroke();
        if (e.st === 'tele') { c.fillStyle = Math.floor(gameTime * 20) % 2 ? '#ff4a3d' : '#ffb0a0'; c.fillRect(x + Math.cos(e.ang) * 9 - 1, y - 3 + Math.sin(e.ang) * 9, 3, 3); }
        c.fillStyle = '#ff4a3d'; c.fillRect(x - 1, y - 3, 2, 2);
        break;
      }
      case 'crow': {
        drawShadow(c, x, y + 8, 3);
        const yy = y - 5, w = Math.round(Math.sin(e.flap) * 3);
        if (e.st === 'aim') {
          const a = e.t > 0.22 ? 0.25 : 0.7;
          c.strokeStyle = `rgba(255,60,60,${a + 0.2 * Math.sin(gameTime * 40)})`; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, yy); c.lineTo(x + Math.cos(e.ang) * 220, yy + Math.sin(e.ang) * 220); c.stroke();
        }
        c.fillStyle = '#2a2a30';
        c.beginPath(); c.moveTo(x - 1, yy); c.lineTo(x - 8, yy - 2 - w); c.lineTo(x - 3, yy + 2); c.fill();
        c.beginPath(); c.moveTo(x + 1, yy); c.lineTo(x + 8, yy - 2 - w); c.lineTo(x + 3, yy + 2); c.fill();
        c.fillStyle = flash ? '#fff' : '#45454e'; c.fillRect(x - 3, yy - 3, 6, 6);
        c.fillStyle = '#6a6a74'; c.fillRect(x - 3, yy - 3, 6, 1);
        c.fillStyle = '#c8a040'; c.fillRect(x + (player.x > e.x ? 3 : -5), yy - 1, 2, 1);
        c.fillStyle = e.st === 'aim' ? '#ffdd60' : '#ff4a3d'; c.fillRect(x + (player.x > e.x ? 1 : -2), yy - 2, 1, 1);
        break;
      }
      case 'pod': {
        const sw = e.st === 'swell' ? 1 + (0.6 - e.t) * 0.8 : e.st === 'rest' ? 0.7 : 1 + Math.sin(e.pulse) * 0.05;
        drawShadow(c, x, y + 5, 6);
        c.fillStyle = '#2a3a1e'; c.fillRect(x - 6, y + 2, 12, 3);
        c.fillStyle = '#3c6a2a'; c.fillRect(x - 7, y + 3, 3, 1); c.fillRect(x + 4, y + 3, 3, 1);
        c.fillStyle = flash ? '#fff' : (e.st === 'rest' ? '#4a3a52' : '#7a4a8a');
        c.beginPath(); c.arc(x, y - 2, Math.round(6 * sw), 0, Math.PI * 2); c.fill();
        c.fillStyle = e.st === 'swell' && Math.floor(gameTime * 20) % 2 ? '#ffb0ff' : '#b07ae0';
        c.fillRect(x - 2, y - 4, 1, 1); c.fillRect(x + 2, y - 1, 1, 1); c.fillRect(x - 1, y + 1, 1, 1); c.fillRect(x + 1, y - 5, 1, 1);
        if (e.st === 'swell') { c.fillStyle = 'rgba(200,120,255,0.2)'; c.beginPath(); c.arc(x, y - 2, 46, 0, Math.PI * 2); c.fill(); }
        break;
      }
      case 'saw': {
        drawShadow(c, x, y + 5, 5);
        c.save(); c.translate(x, y - 1); c.rotate(e.spin);
        c.fillStyle = '#8a8e94';
        for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillRect(-1, -8, 2, 3); }
        c.restore();
        c.fillStyle = '#a8acb2'; c.beginPath(); c.arc(x, y - 1, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5a5e64'; c.beginPath(); c.arc(x, y - 1, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffcf50'; c.fillRect(x - 1, y - 2, 2, 2);
        break;
      }
      case 'node': {
        if (!e.alive) {
          c.fillStyle = '#3a2a1a'; c.fillRect(x - 3, y, 6, 4);
          c.fillStyle = '#2a1c10'; c.fillRect(x - 4, y + 3, 8, 2);
          break;
        }
        const g = e.grow;
        c.fillStyle = 'rgba(255,200,90,0.15)'; c.beginPath(); c.arc(x, y - 1, 10 * g + 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5a3a1a'; c.fillRect(x - 5, y + 2, 10, 3); c.fillRect(x - 7, y + 4, 3, 1); c.fillRect(x + 4, y + 4, 3, 1);
        c.fillStyle = flash ? '#fff' : '#c88a30'; c.beginPath(); c.arc(x, y - 1, Math.max(1, 5 * g), 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgba(255,240,150,${0.6 + 0.4 * Math.sin(gameTime * 6)})`; c.fillRect(x - 1, y - 2, 2, 2);
        if (e.boss && !e.boss.dead && e.boss.shield && e.boss.st !== 'sleep') {
          c.strokeStyle = `rgba(127,224,122,${0.25 + 0.15 * Math.sin(gameTime * 5)})`; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, y - 1); c.lineTo(Math.round(e.boss.x - ox), Math.round(e.boss.y - oy) - 4); c.stroke();
        }
        break;
      }
      case 'boss': drawG0(c, e, x, y); break;
      case 'v9': drawV9(c, e, x, y); break;
      case 'tree': drawTree(c, e, x, y); break;
      case 'item': {
        const by = Math.round(Math.sin(e.t * 3) * 2);
        c.fillStyle = 'rgba(79,240,208,0.15)'; c.fillRect(x - 7, y - 7 + by, 14, 14);
        if (e.kind === 'K') {
          c.fillStyle = '#c0c4c8'; c.fillRect(x - 4, y - 5 + by, 8, 9);
          c.fillStyle = COL.teal; c.fillRect(x - 2, y + 4 + by, 4, 2); c.fillRect(x - 3, y - 3 + by, 6, 2);
        } else if (e.kind === 'A') {
          c.fillStyle = '#c0c4c8'; c.fillRect(x - 5, y - 3 + by, 10, 6);
          c.fillStyle = '#e8fffa'; c.fillRect(x + 5, y - 1 + by, 3, 2);
          c.fillStyle = COL.teal; c.fillRect(x - 3, y - 1 + by, 6, 2);
          if (Math.sin(gameTime * 12) > 0) { c.fillRect(x - 6, y - 6 + by, 2, 1); c.fillRect(x + 3, y + 4 + by, 2, 1); }
        } else if (e.kind === 'E') {
          c.fillStyle = COL.teal; c.fillRect(x - 2, y - 6 + by, 4, 12); c.fillRect(x - 5, y - 2 + by, 10, 4);
          c.fillStyle = '#e8fffa'; c.fillRect(x - 1, y - 1 + by, 2, 2);
        } else {
          c.fillStyle = '#3a3f40'; c.fillRect(x - 3, y - 5 + by, 6, 10);
          c.fillStyle = COL.teal; c.fillRect(x - 2, y - 1 + by, 4, 5);
          c.fillStyle = '#9a9a9a'; c.fillRect(x - 1, y - 6 + by, 2, 1);
        }
        break;
      }
      case 'spark': {
        if (e.life < 2 && Math.floor(e.life * 10) % 2 === 0) break;
        const s = 1 + Math.round(Math.sin(e.t * 8));
        c.fillStyle = COL.teal; c.fillRect(x - 1 - s / 2, y - 1, 2 + s, 2); c.fillRect(x - 1, y - 1 - s / 2, 2, 2 + s);
        break;
      }
    }
  }

  function drawG0(c, e, x, y) {
    const flash = e.flash > 0, st = e.st;
    drawShadow(c, x, y + 10, 13);
    if (st === 'tele' || st === 'btele') { c.fillStyle = `rgba(255,60,40,${0.25 + 0.25 * Math.sin(gameTime * 30)})`; c.fillRect(x - 17, y - 18, 34, 32); }
    const bx = x + (st === 'stun' ? Math.round(Math.sin(gameTime * 50)) : 0);
    c.fillStyle = '#2a211a'; c.fillRect(bx - 13, y + 4, 7, 6); c.fillRect(bx + 6, y + 4, 7, 6);
    const armor = st === 'tele' || st === 'charge';
    c.fillStyle = flash ? '#fff' : (armor ? '#8a7a6a' : '#6b5a4a'); c.fillRect(bx - 12, y - 14, 24, 20);
    c.fillStyle = flash ? '#fff' : (armor ? '#b0a090' : '#85705c'); c.fillRect(bx - 12, y - 14, 24, 3);
    c.fillStyle = '#4a3c30'; c.fillRect(bx - 12, y - 2, 24, 2); c.fillRect(bx - 1, y - 14, 2, 12);
    c.fillStyle = 'rgba(181,86,47,0.6)'; c.fillRect(bx - 10, y - 9, 3, 6); c.fillRect(bx + 7, y - 6, 2, 7);
    c.fillStyle = flash ? '#fff' : '#544638'; c.fillRect(bx - 15, y - 12, 4, 10); c.fillRect(bx + 11, y - 12, 4, 10);
    const ex = Math.round(e.dx * 3), ey = Math.round(e.dy * 2);
    c.fillStyle = '#120c0a'; c.fillRect(bx - 6 + ex, y - 10 + ey, 12, 5);
    let eye = '#ff4a3d';
    if (st === 'stun') eye = Math.floor(gameTime * 6) % 2 ? '#552018' : '#ff4a3d';
    if (st === 'sleep') eye = '#3a1a14';
    c.fillStyle = eye; c.fillRect(bx - 4 + ex, y - 9 + ey, 8, 3);
    if (e.phase === 2 && st !== 'stun') { c.fillStyle = 'rgba(255,74,61,0.5)'; c.fillRect(bx - 5 + ex, y - 10 + ey, 10, 1); }
    if (st === 'stun') {
      c.fillStyle = '#fff3b0';
      for (let i = 0; i < 3; i++) { const a = gameTime * 4 + i * 2.1; c.fillRect(bx + Math.round(Math.cos(a) * 10), y - 20 + Math.round(Math.sin(a) * 3), 2, 2); }
    }
  }

  function drawV9(c, e, x, y) {
    const flash = e.flash > 0, st = e.st;
    drawShadow(c, x, y + 9, 11);
    if (st === 'ltele') {
      c.strokeStyle = `rgba(255,80,60,${0.35 + 0.3 * Math.sin(gameTime * 40)})`; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + e.dx * 100, y - 4 + e.dy * 100); c.stroke();
    }
    const droop = st === 'wilt' ? 3 : 0;
    const sw = Math.round(Math.sin(e.sway));
    c.fillStyle = '#2a3020'; c.fillRect(x - 7, y + 3, 4, 7); c.fillRect(x + 3, y + 3, 4, 7);
    c.fillStyle = flash ? '#fff' : '#5a6a50'; c.fillRect(x - 8, y - 14 + droop, 16, 19 - droop);
    c.fillStyle = flash ? '#fff' : '#7a8a6a'; c.fillRect(x - 8, y - 14 + droop, 16, 3);
    c.fillStyle = '#3f6a30'; c.fillRect(x - 8, y - 3, 3, 6); c.fillRect(x + 5, y - 9 + droop, 3, 4); c.fillRect(x - 3, y - 15 + droop, 2, 2);
    c.fillStyle = '#a06aa0'; c.fillRect(x + 6, y - 9 + droop, 1, 1);
    c.fillStyle = '#3a4434'; c.fillRect(x - 5, y - 20 + droop, 10, 7);
    const ex = Math.round(e.dx * 2);
    c.fillStyle = '#0e140c'; c.fillRect(x - 3 + ex, y - 18 + droop, 6, 3);
    c.fillStyle = st === 'wilt' ? '#4a6a40' : (e.phase === 2 ? '#ff7050' : '#b0ff90'); c.fillRect(x - 1 + ex, y - 17 + droop, 2, 1);
    const armA = st === 'ltele' || st === 'lunge' ? -0.3 : 0.25 + sw * 0.05;
    c.save(); c.translate(x + 9, y - 8 + droop); c.rotate(armA + Math.atan2(e.dy, e.dx) * 0.2);
    c.fillStyle = '#6a6e70'; c.fillRect(0, -1, 10, 2);
    c.fillStyle = '#c8ccd0'; c.fillRect(9, -3, 8, 2); c.fillRect(9, 1, 8, 2);
    c.restore();
    c.save(); c.translate(x - 9, y - 8 + droop); c.rotate(Math.PI - armA);
    c.fillStyle = '#6a6e70'; c.fillRect(0, -1, 8, 2);
    c.fillStyle = '#8a5a30'; c.fillRect(7, -2, 4, 4);
    c.restore();
    if (e.shield && st !== 'sleep') {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = gameTime * 0.8 + i * Math.PI * 2 / n;
        c.fillStyle = i % 2 ? 'rgba(127,224,122,0.75)' : 'rgba(80,170,80,0.75)';
        c.save(); c.translate(x + Math.cos(a) * 16, y - 5 + Math.sin(a) * 14); c.rotate(a);
        c.fillRect(-1, -3, 3, 6);
        c.restore();
      }
      c.strokeStyle = `rgba(127,224,122,${0.25 + 0.1 * Math.sin(gameTime * 4)})`; c.lineWidth = 1;
      c.beginPath(); c.ellipse(x, y - 5, 16, 14, 0, 0, Math.PI * 2); c.stroke();
    }
    if (st === 'wilt') {
      c.fillStyle = '#fff3b0';
      for (let i = 0; i < 3; i++) { const a = gameTime * 4 + i * 2.1; c.fillRect(x + Math.round(Math.cos(a) * 9), y - 25 + Math.round(Math.sin(a) * 3), 2, 2); }
    }
  }

  function drawTree(c, e, x, y) {
    const lit = cs().bossDead;
    const top = y - e.h;
    const glow = (lit ? 0.35 : 0.12) + 0.06 * Math.sin(gameTime * 1.2);
    const g = c.createRadialGradient(x, top - 6, 4, x, top - 6, 70);
    g.addColorStop(0, `rgba(150,255,170,${glow})`); g.addColorStop(1, 'rgba(150,255,170,0)');
    c.fillStyle = g; c.fillRect(x - 70, top - 76, 140, 140);
    const blobs = [[-20, -14, 16], [0, -22, 20], [20, -14, 16], [-10, -4, 14], [12, -4, 14]];
    for (const [bx, by, r] of blobs) { c.fillStyle = lit ? '#3f8a44' : '#2d5a30'; c.beginPath(); c.arc(x + bx, top + by, r, 0, Math.PI * 2); c.fill(); }
    for (const [bx, by, r] of blobs) { c.fillStyle = lit ? '#5fb85a' : '#3a7038'; c.beginPath(); c.arc(x + bx - 2, top + by - 3, r * 0.6, 0, Math.PI * 2); c.fill(); }
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3, rr = 10 + (i * 7) % 16;
      c.fillStyle = `rgba(200,255,220,${(lit ? 0.9 : 0.35) * (0.6 + 0.4 * Math.sin(gameTime * 2 + i))})`;
      c.fillRect(Math.round(x + Math.cos(a) * rr * 1.4), Math.round(top - 12 + Math.sin(a) * rr * 0.6), 2, 2);
    }
  }

  function drawWorld() {
    const c = lc, P = theme();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = P.void; c.fillRect(0, 0, VW, VH);
    const sx = shake > 0 ? rand(-shake, shake) * 0.5 : 0, sy = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
    const ox = Math.round(cam.x + sx), oy = Math.round(cam.y + sy);
    const tx0 = Math.floor(ox / T) - 1, ty0 = Math.floor(oy / T) - 1;
    const tx1 = tx0 + Math.ceil(VW / T) + 2, ty1 = ty0 + Math.ceil(VH / T) + 2;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) drawTile(c, tx, ty, ox, oy);

    for (const h of hazards) {
      if (h.t <= 0) continue;
      const hx = Math.round(h.x - ox), hy = Math.round(h.y - oy);
      c.strokeStyle = `rgba(255,90,60,${0.5 + 0.4 * Math.sin(gameTime * 25)})`; c.lineWidth = 1;
      c.setLineDash([3, 2]); c.beginPath(); c.arc(hx, hy, h.r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(255,90,60,0.15)'; c.beginPath(); c.arc(hx, hy, h.r * Math.max(0, 1 - h.t / h.t0), 0, Math.PI * 2); c.fill();
    }

    const list = ents.slice();
    list.push({ type: 'player', y: player.y });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) { if (e.type === 'player') drawPlayer(c, ox, oy); else drawEnt(c, e, ox, oy); }

    for (const h of hazards) {
      if (h.t > 0) continue;
      const hx = Math.round(h.x - ox), hy = Math.round(h.y - oy);
      c.fillStyle = '#8a6a40';
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.3, px = hx + Math.cos(a) * 6, py = hy + Math.sin(a) * 3.6;
        c.beginPath(); c.moveTo(px - 2, py + 2); c.lineTo(px, py - 9); c.lineTo(px + 2, py + 2); c.fill();
      }
      c.beginPath(); c.moveTo(hx - 3, hy + 2); c.lineTo(hx, hy - 12); c.lineTo(hx + 3, hy + 2); c.fill();
    }
    for (const b of bullets) {
      const x = Math.round(b.x - ox), y = Math.round(b.y - oy), col = b.color || '#ffb070';
      c.globalAlpha = 0.35; c.fillStyle = col; c.fillRect(x - 3, y - 3, 6, 6); c.globalAlpha = 1;
      c.fillStyle = col; c.fillRect(x - 2, y - 2, 4, 4);
      c.fillStyle = '#fff4d0'; c.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const s of pshots) {
      const x = Math.round(s.x - ox), y = Math.round(s.y - oy);
      c.fillStyle = 'rgba(79,240,208,0.4)'; c.fillRect(x - 4, y - 4, 8, 8);
      c.fillStyle = '#e8fffa'; c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const q of parts) {
      c.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5));
      c.fillStyle = q.color;
      c.fillRect(Math.round(q.x - ox), Math.round(q.y - oy), q.size || 1, q.size || 1);
    }
    c.globalAlpha = 1;

    const px = player.x - ox, py = player.y - oy;
    const ratio = Math.max(0, player.energy) / save.maxE;
    const inner = 50 + 50 * ratio, outer = inner + 110;
    const g = c.createRadialGradient(px, py, inner, px, py, outer);
    g.addColorStop(0, `rgba(${P.vignette},0)`);
    g.addColorStop(1, `rgba(${P.vignette},${0.75 - ratio * 0.25})`);
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    if (deadT > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(0.85, (1.6 - deadT) * 0.8)})`; c.fillRect(0, 0, VW, VH); }
  }

  // ================================================================
  // 繪圖：HUD
  // ================================================================
  const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function wrapText(c, text, maxW) {
    const lines = []; let cur = '';
    for (const ch of text) { if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur);
    return lines;
  }
  function drawBolt(c, x, y, on) {
    c.fillStyle = on ? '#bffff2' : '#3a3530';
    c.beginPath();
    c.moveTo(x + 4, y); c.lineTo(x, y + 7); c.lineTo(x + 3, y + 7); c.lineTo(x + 1, y + 13);
    c.lineTo(x + 7, y + 5); c.lineTo(x + 4, y + 5); c.lineTo(x + 6, y);
    c.closePath(); c.fill();
  }
  function drawHUD() {
    const c = ctx, P = theme();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = safe.l + 16, Tp = safe.t + 14;
    for (let i = 0; i < save.maxE; i++) {
      const x = L + i * 17, y = Tp;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - 1, y - 1, 14, 22);
      c.fillStyle = '#3a2e26'; c.fillRect(x, y, 12, 20); c.fillRect(x + 3, y - 3, 6, 3);
      if (i < player.energy) {
        c.fillStyle = player.energy <= 1 ? (Math.sin(gameTime * 10) > 0 ? '#ff4a3d' : '#7a2018') : COL.teal;
        c.fillRect(x + 2, y + 2, 8, 16);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 2, y + 2, 8, 3);
      }
    }
    c.font = `600 11px ${FONT}`; c.fillStyle = '#8f8174'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText('電量', L, Tp + 26);
    let hx = L + 34;
    if (abil('dash')) {
      const ready = player.dashCD <= 0;
      c.fillStyle = ready ? COL.teal : '#4a4038';
      c.fillText(ready ? '推進 ●' : '推進 ○', hx, Tp + 26); hx += 52;
    }
    if (abil('arc')) {
      c.fillStyle = '#8f8174'; c.fillText('電弧', hx, Tp + 26);
      for (let i = 0; i < 3; i++) drawBolt(c, hx + 28 + i * 11, Tp + 25, i < player.arc);
    }
    const pb = btn.pause;
    c.fillStyle = 'rgba(20,14,10,0.55)'; c.beginPath(); c.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#cfc4b6'; c.fillRect(pb.x - 5, pb.y - 6, 3, 12); c.fillRect(pb.x + 2, pb.y - 6, 3, 12);

    const boss = ents.find((e) => isBoss(e) && e.st !== 'sleep');
    if (boss) {
      const bw = Math.min(360, CW * 0.55), bx = (CW - bw) / 2, by = safe.t + 18;
      c.textAlign = 'center'; c.fillStyle = '#e9c2b0'; c.font = `600 12px ${FONT}`;
      c.fillText(boss.name + (boss.type === 'v9' ? (boss.shield ? '（護盾中）' : '（護盾破裂！）') : ''), CW / 2, by);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - 2, by + 17, bw + 4, 10);
      c.fillStyle = '#3a1a14'; c.fillRect(bx, by + 19, bw, 6);
      c.fillStyle = boss.phase === 2 ? '#ff4a3d' : (boss.type === 'v9' ? '#7fc06a' : '#d9773f');
      c.fillRect(bx, by + 19, bw * Math.max(0, boss.hp) / boss.maxhp, 6);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(bx + bw / 2, by + 18, 1, 8);
      if (boss.type === 'v9' && !boss.shield) {
        c.fillStyle = 'rgba(191,255,242,0.85)'; c.fillRect(bx, by + 29, bw * Math.max(0, boss.downT) / (boss.phase === 2 ? 5.5 : 7), 2);
      }
    }
    if (banner) {
      c.globalAlpha = Math.max(0, Math.min(1, banner.t * 2, (2.6 - banner.t) * 3)); c.textAlign = 'center';
      c.font = `700 22px ${FONT}`; c.fillStyle = '#e9e2d8'; c.fillText(banner.msg, CW / 2, CH_ * 0.24);
      c.fillStyle = P.accent; c.fillRect(CW / 2 - 40, CH_ * 0.24 + 32, 80, 2);
      c.globalAlpha = 1;
    }
    if (toastMsg) {
      c.font = `600 14px ${FONT}`; c.textAlign = 'center';
      const w = c.measureText(toastMsg.msg).width + 28;
      c.globalAlpha = Math.min(1, toastMsg.t * 3);
      c.fillStyle = 'rgba(15,10,8,0.85)'; roundRect(c, CW / 2 - w / 2, CH_ * 0.62, w, 32, 6); c.fill();
      c.fillStyle = '#e9e2d8'; c.fillText(toastMsg.msg, CW / 2, CH_ * 0.62 + 9);
      c.globalAlpha = 1;
    }
    const n = !dlg && nearNpc();
    if (n && cs().flags['npc:' + n.dlg]) {
      const sx = (n.x - cam.x) / VW * CW, sy = (n.y - cam.y) / VH * CH_;
      c.font = `600 12px ${FONT}`; c.textAlign = 'center';
      c.fillStyle = 'rgba(15,10,8,0.8)'; roundRect(c, sx - 34, sy - 52, 68, 22, 4); c.fill();
      c.fillStyle = COL.teal; c.fillText(isTouch ? '按攻擊 對話' : 'J 對話', sx, sy - 47);
    }
    if (isTouch && !dlg) {
      if (joy.id !== null) {
        c.strokeStyle = 'rgba(233,226,216,0.25)'; c.lineWidth = 2;
        c.beginPath(); c.arc(joy.ox, joy.oy, 48, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(233,226,216,0.3)'; c.beginPath(); c.arc(joy.x, joy.y, 22, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = 'rgba(233,226,216,0.18)'; c.font = `12px ${FONT}`; c.textAlign = 'left';
        c.fillText('← 在左側拖動移動 →', safe.l + 20, CH_ - safe.b - 30);
      }
      const list = [btn.atk, btn.dash];
      if (abil('arc')) list.push(btn.shot);
      for (const b of list) {
        const pressed = b.id !== null, locked = b === btn.dash && !abil('dash');
        const empty = b === btn.shot && player.arc < 1;
        c.fillStyle = pressed ? 'rgba(79,240,208,0.35)' : 'rgba(20,14,10,0.45)';
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
        c.strokeStyle = locked || empty ? 'rgba(120,110,100,0.4)' : (b === btn.atk ? 'rgba(217,119,63,0.85)' : b === btn.shot ? 'rgba(191,255,242,0.8)' : 'rgba(79,240,208,0.7)');
        c.lineWidth = 2; c.stroke();
        c.fillStyle = locked || empty ? 'rgba(160,150,140,0.45)' : '#e9e2d8';
        c.font = `700 ${Math.round(b.r * 0.42)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(locked ? '🔒' : b.label, b.x, b.y);
        c.textBaseline = 'top';
      }
    }
    if (dlg) {
      const [who, text] = dlg.lines[dlg.i];
      const bw = Math.min(CW - safe.l - safe.r - 32, 680), fs = CW < 500 ? 16 : 18;
      c.font = `500 ${fs}px ${FONT}`;
      const lines = wrapText(c, text, bw - 40);
      const shown = text.slice(0, Math.floor(dlg.chars));
      const bh = 58 + lines.length * (fs + 8);
      const bx = (CW - bw) / 2, by = CH_ - safe.b - bh - 16;
      const sys = who === '系統';
      c.fillStyle = 'rgba(12,8,6,0.92)'; roundRect(c, bx, by, bw, bh, 8); c.fill();
      c.strokeStyle = sys ? 'rgba(79,240,208,0.5)' : 'rgba(217,119,63,0.6)'; c.lineWidth = 1.5; c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.font = `700 13px ${FONT}`; c.fillStyle = sys ? COL.teal : COL.rustL;
      c.fillText(who, bx + 20, by + 14);
      c.font = `500 ${fs}px ${FONT}`; c.fillStyle = '#e9e2d8';
      let rem = shown;
      lines.forEach((ln, i) => { const part = rem.slice(0, ln.length); rem = rem.slice(ln.length); c.fillText(part, bx + 20, by + 38 + i * (fs + 8)); });
      if (dlg.chars >= text.length && Math.sin(gameTime * 6) > 0) { c.fillStyle = COL.teal; c.textAlign = 'right'; c.fillText('▼', bx + bw - 16, by + bh - fs - 10); }
    }
  }

  // ================================================================
  // 主迴圈
  // ================================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now; gameTime += dt;
    if (mode === 'play') update(dt);
    if (grid) {
      drawWorld();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
      if (mode === 'play' || mode === 'pause') drawHUD();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b0908'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  // ================================================================
  // 選單 / 章節流程
  // ================================================================
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle('show', on);
  function musicLabel() {
    const m = window.RLMusic && window.RLMusic.isMuted && window.RLMusic.isMuted();
    $('btnMusic').textContent = m ? '音樂：關' : '音樂：開';
  }
  function refreshTitle() {
    const s = loadSave();
    const has = s && s.flags && s.flags.started;
    $('btnContinue').style.display = has ? '' : 'none';
    const ch = CHAPTERS[(has && s.ch) || 1] || CHAPTERS[1];
    $('titleChapter').textContent = ch.title;
    $('howto').innerHTML = isTouch
      ? '左半邊螢幕拖動＝移動　右下按鈕＝攻擊／衝刺／射擊<br>建議把手機橫放遊玩'
      : 'WASD＝移動　J＝攻擊　K＝衝刺　L＝射擊　Esc＝暫停';
  }
  function startChapter(isNewChapter) {
    loadChapter(save.ch);
    session.banners = {}; session.trig = {};
    newWorld();
    dlg = null; deadT = 0; toastMsg = null; banner = null; curTrack = null;
    mode = 'play';
    ['title', 'confirmNew', 'end', 'pause'].forEach((id) => show(id, false));
    music(CH.music);
    if (isNewChapter) {
      banner = { msg: CH.title, t: 2.6 };
      say(CH.intro, () => { if (save.ch === 1) toast(isTouch ? '左側拖動移動・右下攻擊' : 'WASD 移動・J 攻擊', 3); });
    } else toast('進度已讀取');
  }
  function startGame(fresh) {
    initAudio();
    save = fresh ? freshSave() : (loadSave() || freshSave());
    const c0 = cs();
    const isNew = !c0.flags.introSeen;
    c0.flags.introSeen = true; save.flags.started = true; writeSave();
    startChapter(isNew);
  }
  function openPause() {
    if (mode !== 'play') return;
    mode = 'pause'; joy.id = null; btn.atk.id = btn.dash.id = btn.shot.id = null;
    musicLabel(); show('pause', true);
  }
  function finishChapter() {
    mode = 'end';
    const c0 = cs(); c0.done = true; writeSave();
    music('victory');
    const t = Math.floor(save.time), m = Math.floor(t / 60), s = t % 60;
    const rows = [['累計遊玩時間', `${m} 分 ${String(s).padStart(2, '0')} 秒`], ['累計倒下次數', save.deaths]].concat(CH.stats ? CH.stats(c0) : []);
    $('endStats').innerHTML = rows.map(([k, v]) => `${k}　<b>${v}</b>`).join('<br>');
    $('endChapter').textContent = CH.title;
    const next = CHAPTERS[CH.next];
    $('btnNext').style.display = next ? '' : 'none';
    $('btnNext').textContent = next ? `前往${next.title.split('　')[0]}` : '';
    $('soon').style.display = next ? 'none' : '';
    setTimeout(() => show('end', true), 400);
  }
  $('btnNew').onclick = () => { const s = loadSave(); if (s && s.flags && s.flags.started) show('confirmNew', true); else startGame(true); };
  $('btnNewYes').onclick = () => startGame(true);
  $('btnNewNo').onclick = () => show('confirmNew', false);
  $('btnContinue').onclick = () => startGame(false);
  $('btnResume').onclick = () => { show('pause', false); mode = 'play'; last = performance.now(); };
  $('btnMusic').onclick = () => {
    initAudio();
    if (window.RLMusic && window.RLMusic.setMuted) window.RLMusic.setMuted(!window.RLMusic.isMuted());
    musicLabel();
  };
  $('btnTitle').onclick = () => { show('pause', false); mode = 'title'; writeSave(); music('none'); refreshTitle(); show('title', true); };
  $('btnEndTitle').onclick = () => { show('end', false); mode = 'title'; music('none'); refreshTitle(); show('title', true); };
  $('btnNext').onclick = () => {
    save.ch = CH.next; const c0 = cs(); const isNew = !c0.flags.introSeen; c0.flags.introSeen = true; writeSave();
    startChapter(isNew);
  };
  // 只在遊玩中才存檔：標題畫面時記憶體裡可能是空存檔，不能拿來覆蓋
  document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'play' || mode === 'pause')) { writeSave(); openPause(); } });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  loadChapter(save.ch || 1);
  resize();
  refreshTitle();
  requestAnimationFrame(frame);

  // 測試用（瀏覽器主控台）
  window.__rustland = {
    get state() { return { mode, player, ents, save, ch: cs(), zone: curZone && curZone.id, dlg: !!dlg, grid, track: curTrack, hazards }; },
    tp(tx, ty) { player.x = tx * T + 8; player.y = ty * T + 8; },
    skipDialog() { let n = 0; while (dlg && n++ < 50) { const cb = dlg.onEnd; dlg = null; duck(false); if (cb) cb(); } },
    gotoChapter(n) { save.ch = n; writeSave(); startChapter(true); },
  };
})();
