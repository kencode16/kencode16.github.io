/* 鏽境 Rustland — 第一章「甦醒」
 * 單一檔案的 HTML5 Canvas 動作冒險遊戲。所有美術都用程式繪製。
 * 操作：觸控（左半邊虛擬搖桿、右下攻擊/衝刺）或鍵盤（WASD/方向鍵、J/空白鍵 攻擊、K/Shift 衝刺）。
 */
'use strict';
(() => {
  // ================================================================
  // 地圖
  // ================================================================
  const T = 16;
  const rep = (c, n) => c.repeat(n);
  // 每塊 = [x, y, 列]；空白字元代表「不覆寫」
  // 圖例：# 牆  M 機台  . 地板  , 碎石地板  = 斷層  D 房門  C 充電座  X 下層閘門
  //       S 起點  N 終端機  n R-7  d 無人機  c 爬行者  t 砲台  B 守門者
  //       K 推進模組  E 能量核心  b 電池
  const PIECES = [
    [0, 0, [
      '##################',
      '#................#',
      '#..N.....,...C...#',
      '#................#',
      '#...MMM....MMM...#',
      '#...MMM....MMM...#',
      '#.S..............#',
      '#...........,....#',
      '#................#',
      '########..########',
    ]],
    [7, 10, ['#..#', '#..#']],
    [32, 0, [
      '##############',
      '#............#',
      '#.d........d.#',
      '#............#',
      '#...##..##...#',
      '#...#.K..#...#',
      '#...#....#...#',
      '#............#',
      '#..c......c..#',
      '#............#',
      '#............#',
      '######DD######',
    ]],
    [37, 12, ['#..#']],
    [0, 12, [
      '########DD##############',
      '#......................#',
      '#..d.......,.......d...#',
      '#.....##.......##......#',
      '#.....##...c...##......#',
      '#......................D',
      '#...,..................D',
      '#.....##.......##......#',
      '#.....##...b...##......#',
      '#......................#',
      '#......................#',
      '########################',
    ]],
    [24, 16, ['####', '.C..', '....', '####']],
    [28, 13, [
      '##########DD##########',
      '#....................#',
      '#.................t..#',
      '#....###......###....#',
      'D....###..c...###....#',
      'D...................,#',
      '#.........d..........#',
      '#.......c............#',
      '#....###......###....#',
      '#....###......###....#',
      '#....................#',
      '#....................#',
      '##########DD##########',
    ]],
    [37, 26, ['#..#']],
    [26, 27, [
      '############..############',
      '#' + rep('.', 24) + '#',
      '#...,..........d.........#',
      '#.....d..................#',
      '#' + rep('=', 24) + '#',
      '#' + rep('=', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 16) + rep('=', 8) + '#',
      '#..C..n' + rep('.', 10) + '===E.===' + '#',
      '#' + rep('.', 16) + '===..===' + '#',
      '#' + rep('.', 16) + rep('=', 8) + '#',
      '#' + rep('.', 24) + '#',
      '############DD############',
    ]],
    [26, 40, [
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#.....#............#.....#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#...........B............#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#.....#............#.....#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '#' + rep('.', 24) + '#',
      '############XX############',
    ]],
  ];
  const W = 52, H = 56;

  const ZONES = [
    { id: 'lab', name: '研究室', x0: 0, y0: 0, x1: 17, y1: 11 },
    { id: 'hall', name: '拾荒者大廳', x0: 0, y0: 12, x1: 23, y1: 23, lock: true },
    { id: 'corr', name: '維修通道', x0: 24, y0: 16, x1: 27, y1: 19 },
    { id: 'junc', name: '中繼站', x0: 28, y0: 13, x1: 49, y1: 25, lock: true },
    { id: 'armory', name: '軍械庫', x0: 32, y0: 0, x1: 45, y1: 11, lock: true },
    { id: 'rift', name: '斷層', x0: 26, y0: 26, x1: 51, y1: 38 },
    { id: 'arena', name: '守門者之間', x0: 26, y0: 39, x1: 51, y1: 55, lock: true, boss: true },
  ];

  function buildBase() {
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill(' '));
    for (const [px, py, rows] of PIECES) {
      rows.forEach((row, dy) => {
        for (let dx = 0; dx < row.length; dx++) {
          const c = row[dx];
          if (c !== ' ') g[py + dy][px + dx] = c;
        }
      });
    }
    return g;
  }
  const BASE = buildBase();

  // ================================================================
  // 劇情對話
  // ================================================================
  const DLG = {
    intro: [
      ['系統', '……系統重新啟動。'],
      ['系統', '型號：K-3 維修機。上次運作紀錄：287 年前。'],
      ['系統', '警告：電量不足。請盡快連接充電座。'],
    ],
    cpFirst: [
      ['系統', '已連接充電座。電量回復，進度已儲存。'],
      ['系統', '機體停止運作時，會從最後使用的充電座重新啟動。'],
    ],
    terminal: [
      ['研究所終端機', '【研究日誌 #4471】中央電源的訊號，一天比一天微弱。'],
      ['研究所終端機', '如果有任何一台機器人醒來——往南走。'],
      ['研究所終端機', '守門者會擋住你。但它只是在執行我們留下的最後一道命令。'],
      ['研究所終端機', '……讓它休息吧。'],
    ],
    dash: [
      ['系統', '取得：推進模組。'],
      ['系統', '按【衝刺】可以快速突進。衝刺途中不會受到傷害，也能越過地面的斷層。'],
    ],
    cell: [['系統', '取得：能量核心。電量上限 +1。']],
    chasm: [
      ['K-3', '地面在這裡斷開了。'],
      ['K-3', '以現在的機體……過不去。也許別處還有能用的零件。'],
    ],
    r7: [
      ['R-7', '……又一台醒來了啊。'],
      ['R-7', '我是 R-7。走到這裡，電就用完了。'],
      ['R-7', '前面是守門者 G-0。它衝過來之前，身體會先發出紅光——看到就閃開。'],
      ['R-7', '衝鋒中的它全身都是裝甲，打不動的。'],
      ['R-7', '但它撞上牆的時候會停下來一陣子。那是你的機會。'],
      ['R-7', '如果你到得了中央電源……替我看看，那裡還有沒有光。'],
    ],
    boss: [
      ['守門者 G-0', '偵測到未授權機體。'],
      ['守門者 G-0', '執行命令：阻止所有通行。'],
    ],
    bossAgain: [['守門者 G-0', '執行命令：阻止所有通行。']],
    bossDown: [
      ['守門者 G-0', '命令……執行……完畢了嗎……'],
      ['守門者 G-0', '……謝謝你。'],
      ['系統', '通往下層的閘門開啟了。'],
    ],
  };

  // ================================================================
  // 存檔
  // ================================================================
  const SAVE_KEY = 'rustland.save.v1';
  function freshSave() {
    return { cp: null, items: {}, cleared: {}, flags: {}, bossDead: false, deaths: 0, time: 0, maxE: 5 };
  }
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') return Object.assign(freshSave(), s);
    } catch (e) { /* 無痕模式等情況 */ }
    return null;
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  let save = loadSave() || freshSave();

  // ================================================================
  // 畫布與尺寸
  // ================================================================
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const lc = low.getContext('2d');
  let VW = 280, VH = 176, dpr = 1, CW = 0, CH = 0;
  const safe = { t: 0, r: 0, b: 0, l: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    CW = window.innerWidth; CH = window.innerHeight;
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    const base = 184;
    if (CW >= CH) { VH = base; VW = Math.round(base * CW / CH); }
    else { VW = base; VH = Math.round(base * CH / CW); }
    low.width = VW; low.height = VH;
    const cs = getComputedStyle(document.getElementById('safe'));
    safe.t = parseFloat(cs.paddingTop) || 0; safe.r = parseFloat(cs.paddingRight) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0; safe.l = parseFloat(cs.paddingLeft) || 0;
    layoutButtons();
  }

  // ================================================================
  // 音效（Web Audio 合成）
  // ================================================================
  let AC = null, noiseBuf = null;
  function initAudio() {
    try {
      if (!AC) {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { AC = null; }
  }
  const SFX = {
    swing: ['triangle', 600, 180, 0.07, 0.06],
    hit: ['square', 220, 80, 0.08, 0.08],
    clang: ['square', 1400, 900, 0.06, 0.05],
    dash: ['sawtooth', 180, 520, 0.12, 0.05],
    hurt: ['sawtooth', 300, 60, 0.25, 0.12],
    pick: ['sine', 660, 1320, 0.15, 0.1],
    heal: ['sine', 440, 880, 0.12, 0.07],
    shot: ['square', 900, 300, 0.07, 0.04],
    tele: ['sine', 200, 420, 0.3, 0.05],
    blip: ['sine', 880, 880, 0.03, 0.03],
    door: ['triangle', 120, 60, 0.25, 0.1],
  };
  function sfx(name) {
    if (!AC) return;
    const s = SFX[name]; if (!s) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
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
    const t = AC.currentTime;
    const src = AC.createBufferSource(); src.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(AC.destination);
    src.start(t); src.stop(t + dur);
  }

  // ================================================================
  // 輸入
  // ================================================================
  const input = { mx: 0, my: 0, atk: false, dash: false, adv: false, keys: {} };
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const btn = {
    atk: { x: 0, y: 0, r: 40, id: null, label: '攻擊' },
    dash: { x: 0, y: 0, r: 30, id: null, label: '衝刺' },
    pause: { x: 0, y: 0, r: 20, id: null },
  };
  let isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function layoutButtons() {
    const s = Math.min(1.15, Math.max(0.8, Math.min(CW, CH) / 390));
    btn.atk.r = 40 * s; btn.dash.r = 30 * s; btn.pause.r = 20;
    btn.atk.x = CW - safe.r - 24 - btn.atk.r;
    btn.atk.y = CH - safe.b - 24 - btn.atk.r;
    btn.dash.x = btn.atk.x - btn.atk.r - 26 * s - btn.dash.r;
    btn.dash.y = btn.atk.y + btn.atk.r * 0.35;
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
      if (inCircle(btn.atk, x, y)) { btn.atk.id = t.identifier; input.atk = true; continue; }
      if (inCircle(btn.dash, x, y)) { btn.dash.id = t.identifier; input.dash = true; continue; }
      if (x < CW * 0.6 && joy.id === null) {
        joy.id = t.identifier; joy.ox = joy.x = x; joy.oy = joy.y = y;
      } else if (x >= CW * 0.6) {
        // 右半邊沒按到按鈕：當作攻擊（手指比較不會落空）
        btn.atk.id = t.identifier; input.atk = true;
      }
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
    }
  }
  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) joy.id = null;
      if (t.identifier === btn.atk.id) btn.atk.id = null;
      if (t.identifier === btn.dash.id) btn.dash.id = null;
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
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      const max = 48, d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / max);
        mx = dx / d * m; my = dy / d * m;
      }
      if (d > max) { joy.ox = joy.x - dx / d * max; joy.oy = joy.y - dy / d * max; }
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    input.mx = mx; input.my = my;
  }

  // ================================================================
  // 世界狀態
  // ================================================================
  let mode = 'title'; // title | play | pause | end
  let grid, ents, bullets, parts, player, cam, zoneState, checkpoints;
  let dlg = null, toastMsg = null, banner = null, shake = 0, deadT = 0, hitStop = 0;
  let curZone = null, lastZoneId = null, cpLatch = null, endT = 0;
  const session = { banners: {}, chasmHint: false };

  const rand = (a, b) => a + Math.random() * (b - a);
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H) ? ' ' : grid[ty][tx];
  const zoneAtTile = (tx, ty) => ZONES.find((z) => tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1) || null;
  const zoneAt = (x, y) => zoneAtTile(Math.floor(x / T), Math.floor(y / T));
  const hasDash = () => !!save.items['K'];

  function newWorld() {
    grid = BASE.map((r) => r.slice());
    ents = []; bullets = []; parts = []; checkpoints = {};
    zoneState = {};
    for (const z of ZONES) zoneState[z.id] = { engaged: false };
    let start = null;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        const px = x * T + T / 2, py = y * T + T / 2;
        const z = zoneAtTile(x, y);
        const cleared = z && save.cleared[z.id];
        const id = c + '@' + x + ',' + y;
        switch (c) {
          case 'S': start = { x: px, y: py }; grid[y][x] = '.'; break;
          case 'd': if (!cleared) ents.push(mkDrone(px, py, z)); grid[y][x] = '.'; break;
          case 'c': if (!cleared) ents.push(mkCrawler(px, py, z)); grid[y][x] = '.'; break;
          case 't': if (!cleared) ents.push(mkTurret(px, py, z)); grid[y][x] = '.'; break;
          case 'B': if (!save.bossDead) ents.push(mkBoss(px, py, z)); grid[y][x] = '.'; break;
          case 'K': case 'E': case 'b':
            if (!save.items[c]) ents.push({ type: 'item', kind: c, id, x: px, y: py, r: 6, t: 0, zone: z });
            grid[y][x] = '.'; break;
          case 'C': checkpoints[x + ',' + y] = { x: px, y: py, key: x + ',' + y }; break;
        }
      }
    }
    let sp = start;
    if (save.cp && checkpoints[save.cp]) { sp = checkpoints[save.cp]; cpLatch = save.cp; }
    else cpLatch = null;
    player = {
      x: sp.x, y: sp.y, r: 5, fx: 0, fy: 1, vx: 0, vy: 0,
      energy: save.cp ? save.maxE : 2, inv: 0, atkT: 0, atkCD: 0, hitSet: null,
      dashT: 0, dashCD: 0, dx: 0, dy: 0, fall: 0, kx: 0, ky: 0, lastSafe: { x: sp.x, y: sp.y }, walk: 0,
    };
    cam = { x: player.x - VW / 2, y: player.y - VH / 2 };
    curZone = zoneAt(player.x, player.y); lastZoneId = curZone && curZone.id;
  }

  function mkDrone(x, y, zone) {
    return { type: 'drone', x, y, r: 5, hp: 2, st: 'hover', t: rand(0.6, 1.6), zone, fly: true, kx: 0, ky: 0, flash: 0, bob: rand(0, 6), dx: 0, dy: 0 };
  }
  function mkCrawler(x, y, zone) {
    return { type: 'crawler', x, y, r: 6, hp: 3, st: 'walk', t: rand(1.5, 2.5), zone, kx: 0, ky: 0, flash: 0, step: 0, dx: 0, dy: 0 };
  }
  function mkTurret(x, y, zone) {
    return { type: 'turret', x, y, r: 6, hp: 3, st: 'wait', t: 1.2, zone, kx: 0, ky: 0, flash: 0, ang: Math.PI / 2, shots: 0, fixed: true };
  }
  function mkBoss(x, y, zone) {
    return { type: 'boss', x, y, r: 12, hp: 28, maxhp: 28, st: 'sleep', t: 0, zone, kx: 0, ky: 0, flash: 0, phase: 1, seq: 0, dx: 0, dy: 1, waves: 0, spin: 0, fixed: true };
  }

  // ================================================================
  // 碰撞
  // ================================================================
  function doorLocked(tx, ty) {
    for (const z of ZONES) {
      if (!z.lock) continue;
      if (tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1 && zoneState[z.id].locked) return true;
    }
    return false;
  }
  function solidAt(tx, ty, who) {
    const t = tileAt(tx, ty);
    switch (t) {
      case '#': case ' ': case 'M': case 'N': case 'n': return true;
      case 'D': return doorLocked(tx, ty);
      case 'X': return !save.bossDead;
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
  // 特效
  // ================================================================
  function burst(x, y, n, color, spd = 60, life = 0.5, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, color, size });
    }
  }
  function toast(msg, dur = 2.2) { toastMsg = { msg, t: dur }; }
  function say(key, onEnd) {
    const lines = DLG[key];
    if (!lines) return;
    dlg = { lines, i: 0, chars: 0, onEnd };
    input.atk = input.dash = false;
    sfx('blip');
  }

  // ================================================================
  // 遊戲邏輯
  // ================================================================
  function hurtPlayer(sx, sy, dmg = 1) {
    const p = player;
    if (p.inv > 0 || p.dashT > 0 || p.fall > 0 || deadT > 0) return;
    p.energy -= dmg;
    p.inv = 1.0;
    const d = Math.hypot(p.x - sx, p.y - sy) || 1;
    p.kx = (p.x - sx) / d * 160; p.ky = (p.y - sy) / d * 160;
    shake = Math.max(shake, 4); hitStop = 0.06;
    sfx('hurt');
    burst(p.x, p.y, 10, '#ff8a4a', 70, 0.4);
    if (p.energy <= 0) die();
  }
  function die() {
    deadT = 1.6;
    save.deaths++;
    writeSave();
    burst(player.x, player.y, 30, '#d9773f', 90, 0.9, 1.5);
    boom(0.3, 0.6);
  }
  function respawn() {
    deadT = 0;
    newWorld();
    player.energy = save.maxE;
    toast('重新啟動……');
  }

  function hurtEnemy(e, dmg, sx, sy) {
    if (e.type === 'boss' && (e.st === 'tele' || e.st === 'charge')) {
      sfx('clang');
      burst(e.x + (sx - e.x) * 0.5, e.y + (sy - e.y) * 0.5, 6, '#fff3b0', 80, 0.25);
      const d = Math.hypot(player.x - e.x, player.y - e.y) || 1;
      player.kx = (player.x - e.x) / d * 110; player.ky = (player.y - e.y) / d * 110;
      return;
    }
    e.hp -= dmg;
    e.flash = 0.12;
    hitStop = 0.035;
    sfx('hit');
    burst(e.x, e.y, 6, '#ffd08a', 70, 0.3);
    if (!e.fixed) {
      const d = Math.hypot(e.x - sx, e.y - sy) || 1;
      e.kx = (e.x - sx) / d * 170; e.ky = (e.y - sy) / d * 170;
      if (e.st === 'lunge' || e.st === 'rush') { e.st = e.type === 'drone' ? 'hover' : 'walk'; e.t = 0.8; }
    }
    if (e.type === 'boss' && e.phase === 1 && e.hp <= e.maxhp / 2) {
      e.phase = 2; e.st = 'idle'; e.t = 1.2; e.seq = 0;
      toast('守門者：命令……必須……執行……', 2.6);
      shake = 6; boom(0.2, 0.5);
    }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true;
    if (e.type === 'boss') {
      shake = 10; boom(0.4, 1.2);
      burst(e.x, e.y, 60, '#ffb060', 140, 1.2, 2);
      burst(e.x, e.y, 30, '#4ff0d0', 80, 1.4, 1.5);
      for (const o of ents) if (o.minion && !o.dead) { o.dead = true; burst(o.x, o.y, 10, '#aaa', 60, 0.5); }
      bullets.length = 0;
      save.bossDead = true;
      save.cleared[e.zone.id] = true;
      writeSave();
      setTimeout(() => say('bossDown', () => { sfx('door'); shake = 5; }), 900);
      return;
    }
    boom(0.12, 0.25);
    burst(e.x, e.y, 16, '#c9b8a4', 80, 0.6);
    burst(e.x, e.y, 6, '#ff6a3a', 50, 0.4);
    if (!e.minion && Math.random() < 0.35) {
      ents.push({ type: 'spark', x: e.x, y: e.y, r: 4, t: 0, life: 9, vx: rand(-30, 30), vy: rand(-30, 30) });
    }
  }

  function startAttack() {
    const p = player;
    if (p.atkCD > 0 || p.fall > 0) return;
    // 自動瞄準：近處有敵人就面向它
    let best = null, bd = 40;
    for (const e of ents) {
      if (e.dead || !isEnemy(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    if (best && Math.hypot(input.mx, input.my) < 0.3) {
      const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
      p.fx = (best.x - p.x) / d; p.fy = (best.y - p.y) / d;
    }
    p.atkT = 0.3; p.atkCD = 0.3; p.hitSet = new Set();
    sfx('swing');
  }
  const isEnemy = (e) => e.type === 'drone' || e.type === 'crawler' || e.type === 'turret' || e.type === 'boss';

  function startDash() {
    const p = player;
    if (!hasDash()) { toast('（尚未安裝推進模組）', 1.4); return; }
    if (p.dashCD > 0 || p.fall > 0) return;
    let dx = input.mx, dy = input.my;
    const l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = p.fx; dy = p.fy; } else { dx /= l; dy /= l; }
    p.dx = dx; p.dy = dy; p.dashT = 0.2; p.dashCD = 0.55;
    p.fx = dx; p.fy = dy;
    sfx('dash');
  }

  function updatePlayer(dt) {
    const p = player;
    p.inv = Math.max(0, p.inv - dt);
    p.atkCD = Math.max(0, p.atkCD - dt);
    p.dashCD = Math.max(0, p.dashCD - dt);

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

    let vx = 0, vy = 0;
    if (p.dashT > 0) {
      p.dashT -= dt;
      vx = p.dx * 330; vy = p.dy * 330;
      if (Math.random() < 0.8) parts.push({ x: p.x + rand(-2, 2), y: p.y + rand(-2, 2), vx: -p.dx * 20, vy: -p.dy * 20, life: 0.25, max: 0.25, color: '#4ff0d0', size: 1 });
    } else {
      const slow = p.atkT > 0.15 ? 0.45 : 1;
      vx = input.mx * 72 * slow; vy = input.my * 72 * slow;
      if (Math.hypot(input.mx, input.my) > 0.2 && p.atkT <= 0) {
        const l = Math.hypot(input.mx, input.my);
        p.fx = input.mx / l; p.fy = input.my / l;
      }
      if (vx || vy) p.walk += dt * 10;
    }
    vx += p.kx; vy += p.ky;
    p.kx *= Math.pow(0.0005, dt); p.ky *= Math.pow(0.0005, dt);
    moveEnt(p, vx * dt, vy * dt, 'player');

    // 攻擊判定
    if (p.atkT > 0) {
      p.atkT -= dt;
      if (p.atkT > 0.15) {
        const reach = 20;
        for (const e of ents) {
          if (e.dead || !isEnemy(e) || p.hitSet.has(e)) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > reach + e.r) continue;
          if (d > e.r + 4 && (dx * p.fx + dy * p.fy) / d < 0.35) continue;
          p.hitSet.add(e);
          hurtEnemy(e, 1, p.x, p.y);
        }
        // 斬擊可以打掉子彈
        for (const b of bullets) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
          if (d < reach + 2 && (d < 6 || (dx * p.fx + dy * p.fy) / d > 0.2)) {
            b.dead = true; burst(b.x, b.y, 5, '#4ff0d0', 50, 0.25);
          }
        }
      }
    }

    // 掉進斷層
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    if (p.dashT <= 0 && tileAt(tx, ty) === '=') {
      p.fall = 0.45; p.atkT = 0; sfx('tele');
      return;
    }
    if (p.dashT <= 0) {
      const r = p.r + 1;
      const safeHere = [[-r, -r], [r, -r], [-r, r], [r, r]].every(([ox, oy]) =>
        tileAt(Math.floor((p.x + ox) / T), Math.floor((p.y + oy) / T)) !== '=');
      if (safeHere) { p.lastSafe.x = p.x; p.lastSafe.y = p.y; }
    }

    // 充電座
    const key = tx + ',' + ty;
    if (checkpoints[key]) {
      if (cpLatch !== key) {
        cpLatch = key;
        const first = !save.flags.cp;
        save.cp = key; save.flags.cp = true;
        p.energy = save.maxE;
        writeSave();
        sfx('heal');
        burst(p.x, p.y, 20, '#4ff0d0', 50, 0.8);
        if (first) say('cpFirst'); else toast('已充電・進度已儲存');
      }
    } else if (cpLatch && !checkpoints[key]) {
      const c = checkpoints[cpLatch];
      if (!c || Math.hypot(p.x - c.x, p.y - c.y) > T * 1.2) cpLatch = null;
    }

    // 下層閘門 → 結局
    if (tileAt(tx, ty) === 'X' && save.bossDead && mode === 'play') finishChapter();

    // NPC
    for (const [nx, ny, key2, ch] of npcList) {
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < 24 && !save.flags[key2]) {
        save.flags[key2] = true; writeSave();
        say(key2);
      }
    }
  }

  // NPC 位置
  const npcList = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (BASE[y][x] === 'N') npcList.push([x * T + 8, y * T + 8, 'terminal', 'N']);
    if (BASE[y][x] === 'n') npcList.push([x * T + 8, y * T + 8, 'r7', 'n']);
  }
  function nearNpc() {
    for (const n of npcList) if (Math.hypot(player.x - n[0], player.y - n[1]) < 26) return n;
    return null;
  }

  function enemyActive(e) { return curZone && e.zone && e.zone.id === curZone.id && deadT <= 0; }

  function fireBullet(x, y, ang, spd = 85) {
    bullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 2.5, life: 5 });
  }

  function updateDrone(e, dt) {
    const p = player;
    e.bob += dt * 6;
    if (!enemyActive(e)) return;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.t -= dt;
    let vx = 0, vy = 0;
    if (e.st === 'hover') {
      const want = 38;
      const s = d > want ? 46 : -30;
      vx = dx / d * s + (-dy / d) * 18; vy = dy / d * s + (dx / d) * 18;
      if (e.t <= 0 && d < 110) { e.st = 'tele'; e.t = 0.5; sfx('tele'); }
    } else if (e.st === 'tele') {
      if (e.t <= 0) { e.st = 'lunge'; e.t = 0.38; e.dx = dx / d; e.dy = dy / d; }
    } else if (e.st === 'lunge') {
      vx = e.dx * 185; vy = e.dy * 185;
      if (e.t <= 0) { e.st = 'hover'; e.t = rand(1.0, 1.8); }
    }
    vx += e.kx; vy += e.ky; e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
    if (moveEnt(e, vx * dt, vy * dt, 'fly') && e.st === 'lunge') { e.st = 'hover'; e.t = 1.0; }
  }
  function updateCrawler(e, dt) {
    const p = player;
    if (!enemyActive(e)) return;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.t -= dt;
    let vx = 0, vy = 0;
    if (e.st === 'walk') {
      vx = dx / d * 26; vy = dy / d * 26; e.step += dt * 8;
      if (e.t <= 0 && d < 100) { e.st = 'tele'; e.t = 0.45; e.dx = dx / d; e.dy = dy / d; }
    } else if (e.st === 'tele') {
      if (e.t <= 0) { e.st = 'rush'; e.t = 0.45; }
    } else if (e.st === 'rush') {
      vx = e.dx * 120; vy = e.dy * 120; e.step += dt * 20;
      if (e.t <= 0) { e.st = 'walk'; e.t = rand(2.0, 2.8); }
    }
    vx += e.kx; vy += e.ky; e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
    moveEnt(e, vx * dt, vy * dt, 'ground');
  }
  function updateTurret(e, dt) {
    const p = player;
    const target = Math.atan2(p.y - e.y, p.x - e.x);
    if (!enemyActive(e)) return;
    let da = target - e.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (e.st !== 'tele') e.ang += da * Math.min(1, dt * 4);
    e.t -= dt;
    if (e.st === 'wait' && e.t <= 0) { e.st = 'tele'; e.t = 0.45; sfx('tele'); }
    else if (e.st === 'tele' && e.t <= 0) {
      const mx = e.x + Math.cos(e.ang) * 8, my = e.y + Math.sin(e.ang) * 8;
      fireBullet(mx, my, e.ang - 0.22, 80); fireBullet(mx, my, e.ang, 80); fireBullet(mx, my, e.ang + 0.22, 80);
      sfx('shot');
      e.st = 'wait'; e.t = 1.9;
    }
  }
  function updateBoss(e, dt) {
    const p = player;
    const zs = zoneState[e.zone.id];
    if (e.st === 'sleep') {
      if (zs.engaged && !dlg) {
        e.st = 'wake';
        say(save.flags.bossIntro ? 'bossAgain' : 'boss', () => { e.st = 'idle'; e.t = 0.8; save.flags.bossIntro = true; writeSave(); });
      }
      return;
    }
    if (e.st === 'wake' || deadT > 0) return;
    const p2 = e.phase === 2;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.t -= dt;
    switch (e.st) {
      case 'idle': {
        moveEnt(e, dx / d * 22 * dt, dy / d * 22 * dt, 'ground');
        if (e.t <= 0) {
          const pat = p2 ? ['charge', 'burst', 'charge', 'summon', 'charge', 'spiral'] : ['charge', 'charge', 'burst'];
          const act = pat[e.seq % pat.length]; e.seq++;
          if (act === 'charge') { e.st = 'tele'; e.t = p2 ? 0.55 : 0.75; sfx('tele'); }
          else if (act === 'burst') { e.st = 'btele'; e.t = 0.55; e.waves = p2 ? 3 : 2; sfx('tele'); }
          else if (act === 'summon') { e.st = 'summon'; e.t = 0.7; }
          else if (act === 'spiral') { e.st = 'spiral'; e.t = 1.8; e.spin = Math.atan2(dy, dx); e.waves = 0; }
        }
        break;
      }
      case 'tele':
        if (e.t > 0.15) { e.dx = dx / d; e.dy = dy / d; }
        if (e.t <= 0) { e.st = 'charge'; e.t = 2.2; shake = Math.max(shake, 2); }
        break;
      case 'charge': {
        const spd = p2 ? 265 : 215;
        if (moveEnt(e, e.dx * spd * dt, e.dy * spd * dt, 'ground')) {
          e.st = 'stun'; e.t = p2 ? 1.25 : 1.6;
          shake = 7; boom(0.3, 0.4);
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

  function updateZones() {
    curZone = zoneAt(player.x, player.y);
    const ptx = Math.floor(player.x / T), pty = Math.floor(player.y / T);
    for (const z of ZONES) {
      const zs = zoneState[z.id];
      if (!z.lock) continue;
      const living = ents.some((e) => !e.dead && isEnemy(e) && e.zone && e.zone.id === z.id);
      const inside = ptx >= z.x0 + 2 && ptx <= z.x1 - 2 && pty >= z.y0 + 2 && pty <= z.y1 - 2;
      if (!zs.engaged && inside && living && !save.cleared[z.id]) {
        zs.engaged = true; zs.locked = true; sfx('door'); shake = Math.max(shake, 2);
      }
      if (zs.engaged && !living) {
        zs.engaged = false; zs.locked = false;
        if (!save.cleared[z.id]) {
          save.cleared[z.id] = true; writeSave();
          if (!z.boss) { sfx('door'); toast('區域淨空・門已開啟'); }
        }
      }
    }
    if (curZone && curZone.id !== lastZoneId) {
      lastZoneId = curZone.id;
      if (!session.banners[curZone.id]) { session.banners[curZone.id] = true; banner = { msg: curZone.name, t: 2.4 }; }
    } else if (!curZone) lastZoneId = null;

    // 斷層提示
    if (!session.chasmHint && !hasDash() && curZone && curZone.id === 'rift' && player.y > 29.3 * T) {
      session.chasmHint = true; say('chasm');
    }
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
        case 'boss': updateBoss(e, dt); break;
        case 'item': e.t += dt; break;
        case 'spark': {
          e.t += dt; e.life -= dt;
          if (e.life <= 0) { e.dead = true; break; }
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (d < 34 && p.energy < save.maxE) { e.vx += dx / d * 300 * dt; e.vy += dy / d * 300 * dt; }
          e.vx *= Math.pow(0.05, dt); e.vy *= Math.pow(0.05, dt);
          moveEnt(e, e.vx * dt, e.vy * dt, 'fly');
          break;
        }
      }
      if (e.dead || deadT > 0 || p.fall > 0) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (isEnemy(e)) {
        if (e.type === 'turret' || e.type === 'boss') {
          // 把玩家推出去
          const min = e.r + p.r;
          if (d < min && d > 0.01) {
            const push = (min - d);
            moveEnt(p, (p.x - e.x) / d * push, (p.y - e.y) / d * push, 'player');
          }
        }
        if (d < e.r + p.r - 1 && e.type !== 'turret' && !(e.type === 'boss' && (e.st === 'sleep' || e.st === 'wake'))) {
          if (enemyActive(e)) hurtPlayer(e.x, e.y, 1);
        }
      } else if (e.type === 'spark' && d < 9 && p.energy < save.maxE) {
        e.dead = true; p.energy = Math.min(save.maxE, p.energy + 1); sfx('heal');
        burst(e.x, e.y, 8, '#4ff0d0', 40, 0.4);
      } else if (e.type === 'item' && d < 11) {
        e.dead = true; save.items[e.kind] = true;
        sfx('pick'); burst(e.x, e.y, 24, '#4ff0d0', 70, 0.8);
        if (e.kind === 'K') say('dash');
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
      const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T), t = tileAt(tx, ty);
      if (t !== '=' && solidAt(tx, ty, 'fly')) { b.dead = true; burst(b.x, b.y, 4, '#ff7a4a', 30, 0.2); }
      if (!b.dead && Math.hypot(b.x - player.x, b.y - player.y) < b.r + player.r - 1) {
        if (player.inv <= 0 && player.dashT <= 0 && player.fall <= 0) { b.dead = true; hurtPlayer(b.x - b.vx, b.y - b.vy); }
      }
    }
    bullets = bullets.filter((b) => !b.dead);
  }

  function updateParts(dt) {
    for (const q of parts) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= Math.pow(0.1, dt); q.vy *= Math.pow(0.1, dt);
      q.life -= dt;
    }
    parts = parts.filter((q) => q.life > 0);
    if (parts.length > 600) parts.splice(0, parts.length - 600);
  }

  function updateCamera(dt) {
    const tx = player.x - VW / 2, ty = player.y - VH / 2;
    const k = 1 - Math.pow(0.0008, dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
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
        else if (++dlg.i >= dlg.lines.length) { const cb = dlg.onEnd; dlg = null; if (cb) cb(); }
        else dlg.chars = 0;
      }
      input.atk = input.dash = false;
      updateParts(dt);
      updateCamera(dt);
      return;
    }
    input.adv = false;

    if (hitStop > 0) { hitStop -= dt; input.atk = input.dash = false; return; }

    save.time += dt;
    readMove();

    if (deadT > 0) {
      deadT -= dt;
      updateParts(dt);
      if (deadT <= 0) respawn();
      input.atk = input.dash = false;
      return;
    }

    // 靠近 NPC 按攻擊 = 對話
    if (input.atk) {
      const n = nearNpc();
      if (n) { say(n[2]); input.atk = false; }
    }
    updatePlayer(dt);
    input.atk = input.dash = false;
    updateZones();
    updateEnts(dt);
    updateBullets(dt);
    updateParts(dt);
    updateCamera(dt);
  }

  // ================================================================
  // 繪圖（低解析度畫布）
  // ================================================================
  const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
  const COL = {
    floor: '#2a2420', floor2: '#2e2723', seam: '#221d1a', wallTop: '#4a3a2f', wallFace: '#302520',
    wallEdge: '#6b5242', rust: '#b5562f', rustL: '#d9773f', teal: '#4ff0d0', tealD: '#1d6b5e',
  };
  let gameTime = 0;

  function isWallish(t) { return t === '#' || t === ' ' || t === 'M'; }

  function drawFloor(c, sx, sy, tx, ty) {
    const h = hash(tx, ty);
    c.fillStyle = h % 5 === 0 ? COL.floor2 : COL.floor;
    c.fillRect(sx, sy, T, T);
    c.fillStyle = COL.seam;
    c.fillRect(sx, sy, T, 1); c.fillRect(sx, sy, 1, T);
    if (h % 7 === 0) { c.fillStyle = '#3a2a20'; c.fillRect(sx + (h % 11), sy + (h % 13), 2, 1); }
    if (h % 13 === 0) { c.fillStyle = 'rgba(181,86,47,0.18)'; c.fillRect(sx + 3, sy + 4, 6, 5); }
  }

  function drawTile(c, tx, ty, ox, oy) {
    const t = tileAt(tx, ty);
    const sx = tx * T - ox, sy = ty * T - oy;
    switch (t) {
      case ' ': return;
      case '#': case 'M': {
        const below = tileAt(tx, ty + 1);
        c.fillStyle = COL.wallTop; c.fillRect(sx, sy, T, T);
        const h = hash(tx, ty);
        c.fillStyle = '#544336'; if (h % 3 === 0) c.fillRect(sx + 2, sy + 2, 5, 3);
        if (!isWallish(below)) {
          c.fillStyle = COL.wallFace; c.fillRect(sx, sy + 9, T, 7);
          c.fillStyle = '#3c2e26'; c.fillRect(sx, sy + 9, T, 1);
          if (h % 4 === 0) { c.fillStyle = 'rgba(181,86,47,0.5)'; c.fillRect(sx + (h % 12), sy + 10, 1, 5); }
        }
        if (!isWallish(tileAt(tx, ty - 1))) { c.fillStyle = COL.wallEdge; c.fillRect(sx, sy, T, 1); }
        if (t === 'M') {
          c.fillStyle = '#2b3a38'; c.fillRect(sx + 3, sy + 1, 10, 8);
          const glow = 0.25 + 0.15 * Math.sin(gameTime * 2 + tx);
          c.fillStyle = `rgba(79,240,208,${glow})`; c.fillRect(sx + 4, sy + 2, 8, 6);
          c.fillStyle = '#1a2422'; c.fillRect(sx + 4, sy + 5, 8, 1);
        }
        return;
      }
      case '=': {
        c.fillStyle = '#040303'; c.fillRect(sx, sy, T, T);
        const above = tileAt(tx, ty - 1);
        if (above !== '=' && !isWallish(above)) {
          c.fillStyle = '#1a1512'; c.fillRect(sx, sy, T, 4);
          c.fillStyle = '#100c0a'; c.fillRect(sx, sy + 4, T, 3);
        }
        if (hash(tx, ty) % 9 === 0) { c.fillStyle = 'rgba(79,240,208,0.08)'; c.fillRect(sx + 6, sy + 9, 1, 1); }
        return;
      }
      default: drawFloor(c, sx, sy, tx, ty);
    }
    if (t === ',') {
      c.fillStyle = '#4a3c32'; c.fillRect(sx + 3, sy + 9, 3, 2); c.fillRect(sx + 9, sy + 5, 2, 2); c.fillRect(sx + 11, sy + 11, 3, 2);
    } else if (t === 'D') {
      const locked = doorLocked(tx, ty);
      c.fillStyle = '#1b1613'; c.fillRect(sx, sy, T, T);
      c.fillStyle = '#3a2e26'; c.fillRect(sx, sy, T, 2); c.fillRect(sx, sy + 14, T, 2);
      if (locked) {
        const pulse = 0.65 + 0.35 * Math.sin(gameTime * 6);
        c.fillStyle = `rgba(255,74,61,${pulse})`;
        for (let i = 1; i < T; i += 4) c.fillRect(sx + i, sy + 1, 2, 14);
        c.fillStyle = 'rgba(255,74,61,0.15)'; c.fillRect(sx - 2, sy - 2, T + 4, T + 4);
      } else {
        c.fillStyle = '#2a221d'; c.fillRect(sx + 2, sy + 2, T - 4, T - 4);
      }
    } else if (t === 'C') {
      const active = save.cp === tx + ',' + ty;
      c.fillStyle = '#1d1a18'; c.fillRect(sx + 1, sy + 1, 14, 14);
      c.fillStyle = active ? COL.teal : COL.tealD;
      const a = active ? 0.6 + 0.4 * Math.sin(gameTime * 4) : 1;
      c.globalAlpha = a;
      c.fillRect(sx + 3, sy + 3, 10, 1); c.fillRect(sx + 3, sy + 12, 10, 1);
      c.fillRect(sx + 3, sy + 3, 1, 10); c.fillRect(sx + 12, sy + 3, 1, 10);
      c.fillRect(sx + 7, sy + 5, 2, 6); c.fillRect(sx + 5, sy + 7, 6, 2);
      c.globalAlpha = 1;
    } else if (t === 'N') {
      c.fillStyle = '#3a3f40'; c.fillRect(sx + 2, sy + 2, 12, 12);
      c.fillStyle = '#1b2a26'; c.fillRect(sx + 3, sy + 3, 10, 7);
      const f = Math.sin(gameTime * 9) > -0.8 ? 1 : 0.3;
      c.fillStyle = `rgba(120,255,170,${0.55 * f})`; c.fillRect(sx + 4, sy + 4, 6, 1); c.fillRect(sx + 4, sy + 6, 4, 1); c.fillRect(sx + 4, sy + 8, 7, 1);
      c.fillStyle = '#262b2c'; c.fillRect(sx + 2, sy + 12, 12, 3);
    } else if (t === 'n') {
      // 倒地的 R-7
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(sx + 1, sy + 11, 14, 3);
      c.fillStyle = '#5c625f'; c.fillRect(sx + 2, sy + 5, 12, 8);
      c.fillStyle = '#7a807c'; c.fillRect(sx + 2, sy + 5, 12, 2);
      c.fillStyle = '#3a3e3c'; c.fillRect(sx + 1, sy + 11, 4, 3); c.fillRect(sx + 11, sy + 11, 4, 3);
      const blink = Math.sin(gameTime * 1.3) > 0.6 ? 0.9 : 0.25;
      c.fillStyle = `rgba(79,240,208,${blink})`; c.fillRect(sx + 4, sy + 8, 5, 2);
      c.fillStyle = '#888'; c.fillRect(sx + 12, sy + 2, 1, 3);
    } else if (t === 'X') {
      if (!save.bossDead) {
        c.fillStyle = '#2a2622'; c.fillRect(sx, sy, T, T);
        c.fillStyle = '#c9a23a';
        for (let i = -T; i < T; i += 5) { c.save(); c.beginPath(); c.rect(sx, sy, T, T); c.clip(); c.fillRect(sx + i + ((ty * 3) % 5), sy, 2, T); c.restore(); }
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(sx, sy + 7, T, 2);
      } else {
        c.fillStyle = '#000'; c.fillRect(sx, sy, T, T);
        const g = 0.35 + 0.3 * Math.sin(gameTime * 3);
        c.fillStyle = `rgba(79,240,208,${g})`; c.fillRect(sx + 2, sy + 2, T - 4, 1); c.fillRect(sx + 2, sy + T - 3, T - 4, 1);
        c.fillRect(sx + 7, sy + 5, 2, 5); c.fillRect(sx + 5, sy + 8, 6, 1); c.fillRect(sx + 6, sy + 9, 4, 1);
      }
    }
  }

  function drawShadow(c, x, y, w) {
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x - w, y, w * 2, 2);
    c.fillRect(x - w + 1, y - 1, w * 2 - 2, 4);
  }

  function drawPlayer(c, ox, oy) {
    const p = player;
    if (deadT > 0) return;
    if (p.inv > 0 && p.dashT <= 0 && Math.floor(p.inv * 16) % 2 === 0) return;
    let x = Math.round(p.x - ox), y = Math.round(p.y - oy);
    c.save();
    if (p.fall > 0) {
      const s = p.fall / 0.45;
      c.translate(x, y); c.scale(s, s); c.translate(-x, -y);
    } else drawShadow(c, x, y + 4, 5);
    const bob = p.dashT <= 0 && (input.mx || input.my) ? Math.round(Math.sin(p.walk) * 0.6) : 0;
    y += bob;
    // 履帶
    c.fillStyle = '#231710'; c.fillRect(x - 5, y + 1, 10, 3);
    c.fillStyle = '#3a271b'; c.fillRect(x - 5 + (Math.floor(p.walk) % 3), y + 2, 1, 1); c.fillRect(x + 2 - (Math.floor(p.walk) % 3), y + 2, 1, 1);
    // 身體
    c.fillStyle = '#7a3a22'; c.fillRect(x - 5, y - 6, 10, 8);
    c.fillStyle = p.dashT > 0 ? '#e8a070' : COL.rust; c.fillRect(x - 4, y - 6, 8, 7);
    c.fillStyle = COL.rustL; c.fillRect(x - 4, y - 6, 8, 2);
    // 面罩（朝向）
    const fx = Math.round(p.fx * 1.6), fy = Math.round(p.fy * 1.2);
    const low = p.energy <= 1;
    c.fillStyle = '#140d0a'; c.fillRect(x - 3 + fx, y - 4 + fy, 6, 3);
    c.fillStyle = low && Math.sin(gameTime * 10) > 0 ? '#ff4a3d' : COL.teal;
    if (p.fy < -0.5) c.fillStyle = '#5a2a18';
    c.fillRect(x - 2 + fx, y - 3 + fy, 4, 1);
    // 天線
    c.fillStyle = '#9a8a7a'; c.fillRect(x + 2, y - 9, 1, 3);
    c.fillStyle = low ? '#ff4a3d' : COL.teal; c.fillRect(x + 2, y - 10, 1, 1);
    c.restore();

    // 斬擊
    if (p.atkT > 0) {
      const prog = 1 - p.atkT / 0.3;
      const ang = Math.atan2(p.fy, p.fx);
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

  function drawEnemy(c, e, ox, oy) {
    const x = Math.round(e.x - ox), y = Math.round(e.y - oy);
    const flash = e.flash > 0;
    switch (e.type) {
      case 'drone': {
        const by = Math.round(Math.sin(e.bob) * 1.5);
        drawShadow(c, x, y + 7, 3);
        const yy = y - 3 + by;
        const tele = e.st === 'tele' && Math.floor(gameTime * 20) % 2 === 0;
        c.fillStyle = flash ? '#fff' : (tele ? '#ff6a5a' : '#6d6a66');
        c.fillRect(x - 4, yy - 3, 8, 6);
        c.fillStyle = flash ? '#fff' : '#8d8a84'; c.fillRect(x - 4, yy - 3, 8, 2);
        c.fillStyle = '#ff4a3d'; c.fillRect(x - 1, yy, 2, 2);
        c.fillStyle = '#aaa';
        const r = Math.floor(gameTime * 30) % 2;
        c.fillRect(x - 6 + r, yy - 5, 4, 1); c.fillRect(x + 2 - r, yy - 5, 4, 1);
        c.fillRect(x, yy - 5, 1, 2);
        if (e.st === 'lunge') { c.fillStyle = 'rgba(255,74,61,0.35)'; c.fillRect(x - 5 - e.dx * 5, yy - 4 - e.dy * 5, 10, 8); }
        break;
      }
      case 'crawler': {
        drawShadow(c, x, y + 4, 6);
        const tele = e.st === 'tele';
        const l = Math.round(Math.sin(e.step) * 1.5);
        c.fillStyle = '#2a211a';
        c.fillRect(x - 8, y - 1 + l, 3, 1); c.fillRect(x + 5, y - 1 - l, 3, 1);
        c.fillRect(x - 8, y + 2 - l, 3, 1); c.fillRect(x + 5, y + 2 + l, 3, 1);
        c.fillStyle = flash ? '#fff' : (tele ? '#a8482c' : '#5a4a3c');
        c.fillRect(x - 6, y - 5, 12, 9);
        c.fillStyle = flash ? '#fff' : '#76614e'; c.fillRect(x - 5, y - 5, 10, 2);
        c.fillStyle = tele ? '#ffe070' : '#ff8a3a';
        c.fillRect(x - 3 + Math.round((player.x - e.x) > 0 ? 1 : -1), y - 2, 2, 2);
        c.fillRect(x + 1 + Math.round((player.x - e.x) > 0 ? 1 : -1), y - 2, 2, 2);
        if (tele) { c.fillStyle = 'rgba(255,200,80,0.25)'; c.fillRect(x - 8, y - 7, 16, 13); }
        break;
      }
      case 'turret': {
        c.fillStyle = '#1e1c20'; c.fillRect(x - 7, y - 4, 14, 10);
        c.fillStyle = flash ? '#fff' : '#4a4a52'; c.fillRect(x - 6, y - 6, 12, 10);
        c.fillStyle = flash ? '#fff' : '#606068'; c.fillRect(x - 6, y - 6, 12, 2);
        c.strokeStyle = '#2e2e34'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x + Math.cos(e.ang) * 9, y - 2 + Math.sin(e.ang) * 9); c.stroke();
        if (e.st === 'tele') {
          c.fillStyle = Math.floor(gameTime * 20) % 2 ? '#ff4a3d' : '#ffb0a0';
          c.fillRect(x + Math.cos(e.ang) * 9 - 1, y - 3 + Math.sin(e.ang) * 9, 3, 3);
        }
        c.fillStyle = '#ff4a3d'; c.fillRect(x - 1, y - 3, 2, 2);
        break;
      }
      case 'boss': drawBoss(c, e, x, y); break;
      case 'item': {
        const by = Math.round(Math.sin(e.t * 3) * 2);
        c.fillStyle = 'rgba(79,240,208,0.15)'; c.fillRect(x - 7, y - 7 + by, 14, 14);
        if (e.kind === 'K') {
          c.fillStyle = '#c0c4c8'; c.fillRect(x - 4, y - 5 + by, 8, 9);
          c.fillStyle = COL.teal; c.fillRect(x - 2, y + 4 + by, 4, 2); c.fillRect(x - 3, y - 3 + by, 6, 2);
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

  function drawBoss(c, e, x, y) {
    const flash = e.flash > 0;
    const st = e.st;
    drawShadow(c, x, y + 10, 13);
    if (st === 'tele' || st === 'btele') {
      const a = 0.25 + 0.25 * Math.sin(gameTime * 30);
      c.fillStyle = `rgba(255,60,40,${a})`; c.fillRect(x - 17, y - 18, 34, 32);
    }
    const shakeX = st === 'stun' ? Math.round(Math.sin(gameTime * 50)) : 0;
    const bx = x + shakeX;
    // 腳
    c.fillStyle = '#2a211a'; c.fillRect(bx - 13, y + 4, 7, 6); c.fillRect(bx + 6, y + 4, 7, 6);
    // 身體
    const armor = st === 'tele' || st === 'charge';
    c.fillStyle = flash ? '#fff' : (armor ? '#8a7a6a' : '#6b5a4a'); c.fillRect(bx - 12, y - 14, 24, 20);
    c.fillStyle = flash ? '#fff' : (armor ? '#b0a090' : '#85705c'); c.fillRect(bx - 12, y - 14, 24, 3);
    c.fillStyle = '#4a3c30'; c.fillRect(bx - 12, y - 2, 24, 2); c.fillRect(bx - 1, y - 14, 2, 12);
    c.fillStyle = 'rgba(181,86,47,0.6)'; c.fillRect(bx - 10, y - 9, 3, 6); c.fillRect(bx + 7, y - 6, 2, 7);
    // 肩甲
    c.fillStyle = flash ? '#fff' : '#544638'; c.fillRect(bx - 15, y - 12, 4, 10); c.fillRect(bx + 11, y - 12, 4, 10);
    // 眼
    const ex = Math.round(e.dx * 3), ey = Math.round(e.dy * 2);
    c.fillStyle = '#120c0a'; c.fillRect(bx - 6 + ex, y - 10 + ey, 12, 5);
    let eye = '#ff4a3d';
    if (st === 'stun') eye = Math.floor(gameTime * 6) % 2 ? '#552018' : '#ff4a3d';
    if (st === 'sleep' || st === 'wake') eye = st === 'wake' ? '#ff4a3d' : '#3a1a14';
    c.fillStyle = eye; c.fillRect(bx - 4 + ex, y - 9 + ey, 8, 3);
    if (e.phase === 2 && st !== 'stun') { c.fillStyle = 'rgba(255,74,61,0.5)'; c.fillRect(bx - 5 + ex, y - 10 + ey, 10, 1); }
    if (st === 'stun') {
      c.fillStyle = '#fff3b0';
      for (let i = 0; i < 3; i++) {
        const a = gameTime * 4 + i * 2.1;
        c.fillRect(bx + Math.round(Math.cos(a) * 10), y - 20 + Math.round(Math.sin(a) * 3), 2, 2);
      }
    }
  }

  function drawWorld() {
    const c = lc;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#070505'; c.fillRect(0, 0, VW, VH);
    const sx = shake > 0 ? rand(-shake, shake) * 0.5 : 0, sy = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
    const ox = Math.round(cam.x + sx), oy = Math.round(cam.y + sy);
    const tx0 = Math.floor(ox / T) - 1, ty0 = Math.floor(oy / T) - 1;
    const tx1 = tx0 + Math.ceil(VW / T) + 2, ty1 = ty0 + Math.ceil(VH / T) + 2;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) drawTile(c, tx, ty, ox, oy);

    const list = ents.slice();
    list.push({ type: 'player', y: player.y });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.type === 'player') drawPlayer(c, ox, oy); else drawEnemy(c, e, ox, oy);
    }

    for (const b of bullets) {
      const x = Math.round(b.x - ox), y = Math.round(b.y - oy);
      c.fillStyle = 'rgba(255,90,50,0.35)'; c.fillRect(x - 3, y - 3, 6, 6);
      c.fillStyle = '#ffb070'; c.fillRect(x - 2, y - 2, 4, 4);
      c.fillStyle = '#fff4d0'; c.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const q of parts) {
      c.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5));
      c.fillStyle = q.color;
      const s = q.size || 1;
      c.fillRect(Math.round(q.x - ox), Math.round(q.y - oy), s, s);
    }
    c.globalAlpha = 1;

    // 低電量的視野：越沒電越暗
    const px = player.x - ox, py = player.y - oy;
    const ratio = Math.max(0, player.energy) / save.maxE;
    const inner = 50 + 50 * ratio, outer = inner + 110;
    const g = c.createRadialGradient(px, py, inner, px, py, outer);
    g.addColorStop(0, 'rgba(5,3,2,0)');
    g.addColorStop(1, `rgba(5,3,2,${0.75 - ratio * 0.25})`);
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);

    if (deadT > 0) {
      c.fillStyle = `rgba(0,0,0,${Math.min(0.85, (1.6 - deadT) * 0.8)})`;
      c.fillRect(0, 0, VW, VH);
    }
  }

  // ================================================================
  // 繪圖（高解析度 HUD）
  // ================================================================
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function wrapText(c, text, maxW) {
    const lines = []; let cur = '';
    for (const ch of text) {
      if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawHUD() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = safe.l + 16, Tp = safe.t + 14;

    // 電量
    for (let i = 0; i < save.maxE; i++) {
      const x = L + i * 17, y = Tp;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - 1, y - 1, 14, 22);
      c.fillStyle = '#3a2e26'; c.fillRect(x, y, 12, 20);
      c.fillRect(x + 3, y - 3, 6, 3);
      if (i < player.energy) {
        const lowE = player.energy <= 1;
        c.fillStyle = lowE ? (Math.sin(gameTime * 10) > 0 ? '#ff4a3d' : '#7a2018') : COL.teal;
        c.fillRect(x + 2, y + 2, 8, 16);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 2, y + 2, 8, 3);
      }
    }
    c.font = '600 11px -apple-system, "PingFang TC", sans-serif';
    c.fillStyle = '#8f8174'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText('電量', L, Tp + 26);
    if (hasDash()) {
      const ready = player.dashCD <= 0;
      c.fillStyle = ready ? COL.teal : '#4a4038';
      c.fillText(ready ? '推進 ●' : '推進 ○', L + 34, Tp + 26);
    }

    // 暫停鈕
    const pb = btn.pause;
    c.fillStyle = 'rgba(20,14,10,0.55)'; c.beginPath(); c.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#cfc4b6'; c.fillRect(pb.x - 5, pb.y - 6, 3, 12); c.fillRect(pb.x + 2, pb.y - 6, 3, 12);

    // Boss 血量
    const boss = ents.find((e) => e.type === 'boss' && e.st !== 'sleep');
    if (boss) {
      const bw = Math.min(360, CW * 0.55), bx = (CW - bw) / 2, by = safe.t + 18;
      c.textAlign = 'center'; c.fillStyle = '#e9c2b0'; c.font = '600 12px -apple-system, "PingFang TC", sans-serif';
      c.fillText('守門者 G-0', CW / 2, by);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - 2, by + 17, bw + 4, 10);
      c.fillStyle = '#3a1a14'; c.fillRect(bx, by + 19, bw, 6);
      c.fillStyle = boss.phase === 2 ? '#ff4a3d' : '#d9773f'; c.fillRect(bx, by + 19, bw * Math.max(0, boss.hp) / boss.maxhp, 6);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(bx + bw / 2, by + 18, 1, 8);
    }

    // 區域名稱
    if (banner) {
      const a = Math.min(1, banner.t * 2, (2.4 - banner.t) * 3);
      c.globalAlpha = a; c.textAlign = 'center';
      c.font = '700 22px -apple-system, "PingFang TC", sans-serif';
      c.fillStyle = '#e9e2d8'; c.fillText(banner.msg, CW / 2, CH * 0.24);
      c.fillStyle = COL.rustL; c.fillRect(CW / 2 - 40, CH * 0.24 + 32, 80, 2);
      c.globalAlpha = 1;
    }
    // 提示
    if (toastMsg) {
      c.font = '600 14px -apple-system, "PingFang TC", sans-serif'; c.textAlign = 'center';
      const w = c.measureText(toastMsg.msg).width + 28;
      c.globalAlpha = Math.min(1, toastMsg.t * 3);
      c.fillStyle = 'rgba(15,10,8,0.85)'; roundRect(c, CW / 2 - w / 2, CH * 0.62, w, 32, 6); c.fill();
      c.fillStyle = '#e9e2d8'; c.fillText(toastMsg.msg, CW / 2, CH * 0.62 + 9);
      c.globalAlpha = 1;
    }
    // NPC 提示
    const n = !dlg && nearNpc();
    if (n && save.flags[n[2]]) {
      const sx = (n[0] - cam.x) / VW * CW, sy = (n[1] - cam.y) / VH * CH;
      c.font = '600 12px -apple-system, "PingFang TC", sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(15,10,8,0.8)'; roundRect(c, sx - 34, sy - 52, 68, 22, 4); c.fill();
      c.fillStyle = COL.teal; c.fillText(isTouch ? '按攻擊 對話' : 'J 對話', sx, sy - 47);
    }

    // 觸控按鈕
    if (isTouch && !dlg) {
      if (joy.id !== null) {
        c.strokeStyle = 'rgba(233,226,216,0.25)'; c.lineWidth = 2;
        c.beginPath(); c.arc(joy.ox, joy.oy, 48, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(233,226,216,0.3)';
        c.beginPath(); c.arc(joy.x, joy.y, 22, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = 'rgba(233,226,216,0.18)'; c.font = '12px -apple-system, "PingFang TC", sans-serif'; c.textAlign = 'left';
        c.fillText('← 在左側拖動移動 →', safe.l + 20, CH - safe.b - 30);
      }
      for (const b of [btn.atk, btn.dash]) {
        const pressed = b.id !== null;
        const locked = b === btn.dash && !hasDash();
        c.fillStyle = pressed ? 'rgba(79,240,208,0.35)' : 'rgba(20,14,10,0.45)';
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
        c.strokeStyle = locked ? 'rgba(120,110,100,0.4)' : (b === btn.atk ? 'rgba(217,119,63,0.85)' : 'rgba(79,240,208,0.7)');
        c.lineWidth = 2; c.stroke();
        c.fillStyle = locked ? 'rgba(160,150,140,0.45)' : '#e9e2d8';
        c.font = `700 ${Math.round(b.r * 0.42)}px -apple-system, "PingFang TC", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(locked ? '🔒' : b.label, b.x, b.y);
        c.textBaseline = 'top';
      }
    }

    // 對話框
    if (dlg) {
      const [who, text] = dlg.lines[dlg.i];
      const bw = Math.min(CW - safe.l - safe.r - 32, 680);
      const fs = CW < 500 ? 16 : 18;
      c.font = `500 ${fs}px -apple-system, "PingFang TC", sans-serif`;
      const lines = wrapText(c, text, bw - 40);
      const shown = text.slice(0, Math.floor(dlg.chars));
      const bh = 58 + lines.length * (fs + 8);
      const bx = (CW - bw) / 2, by = CH - safe.b - bh - 16;
      c.fillStyle = 'rgba(12,8,6,0.92)'; roundRect(c, bx, by, bw, bh, 8); c.fill();
      c.strokeStyle = who === '系統' ? 'rgba(79,240,208,0.5)' : 'rgba(217,119,63,0.6)'; c.lineWidth = 1.5; c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.font = '700 13px -apple-system, "PingFang TC", sans-serif';
      c.fillStyle = who === '系統' ? COL.teal : COL.rustL;
      c.fillText(who, bx + 20, by + 14);
      c.font = `500 ${fs}px -apple-system, "PingFang TC", sans-serif`;
      c.fillStyle = '#e9e2d8';
      let rem = shown;
      lines.forEach((ln, i) => {
        const part = rem.slice(0, ln.length); rem = rem.slice(ln.length);
        c.fillText(part, bx + 20, by + 38 + i * (fs + 8));
      });
      if (dlg.chars >= text.length && Math.sin(gameTime * 6) > 0) {
        c.fillStyle = COL.teal; c.textAlign = 'right';
        c.fillText('▼', bx + bw - 16, by + bh - fs - 10);
      }
    }
  }

  // ================================================================
  // 主迴圈
  // ================================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    gameTime += dt;
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
  // 選單
  // ================================================================
  const $ = (id) => document.getElementById(id);
  function show(id, on) { $(id).classList.toggle('show', on); }
  function refreshTitle() {
    const s = loadSave();
    $('btnContinue').style.display = s && s.flags && s.flags.started ? '' : 'none';
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    $('howto').innerHTML = touch
      ? '左半邊螢幕拖動＝移動　右下按鈕＝攻擊／衝刺<br>建議把手機橫放遊玩'
      : 'WASD／方向鍵＝移動　J／空白鍵＝攻擊　K／Shift＝衝刺　Esc＝暫停';
  }
  function startGame(fresh) {
    initAudio();
    if (fresh) { save = freshSave(); }
    else save = loadSave() || freshSave();
    const isNew = !save.flags.started;
    save.flags.started = true; writeSave();
    for (const k in session.banners) delete session.banners[k];
    session.chasmHint = false;
    newWorld();
    dlg = null; deadT = 0; toastMsg = null; banner = null;
    mode = 'play';
    show('title', false); show('confirmNew', false);
    if (isNew) say('intro', () => toast(isTouch ? '左側拖動移動・右下攻擊' : 'WASD 移動・J 攻擊', 3));
    else toast('進度已讀取');
  }
  function openPause() {
    if (mode !== 'play') return;
    mode = 'pause'; joy.id = null; btn.atk.id = btn.dash.id = null; show('pause', true);
  }
  function finishChapter() {
    mode = 'end';
    writeSave();
    const t = Math.floor(save.time), m = Math.floor(t / 60), s = t % 60;
    $('endStats').innerHTML =
      `遊玩時間　<b>${m} 分 ${String(s).padStart(2, '0')} 秒</b><br>` +
      `倒下次數　<b>${save.deaths}</b><br>` +
      `能量核心　<b>${save.items['E'] ? 1 : 0} / 1</b>`;
    setTimeout(() => show('end', true), 400);
    save.flags.chapter1 = true; writeSave();
  }
  $('btnNew').onclick = () => {
    const s = loadSave();
    if (s && s.flags && s.flags.started) show('confirmNew', true); else startGame(true);
  };
  $('btnNewYes').onclick = () => startGame(true);
  $('btnNewNo').onclick = () => show('confirmNew', false);
  $('btnContinue').onclick = () => startGame(false);
  $('btnResume').onclick = () => { show('pause', false); mode = 'play'; last = performance.now(); };
  $('btnTitle').onclick = () => { show('pause', false); mode = 'title'; writeSave(); refreshTitle(); show('title', true); };
  $('btnEndTitle').onclick = () => { show('end', false); mode = 'title'; refreshTitle(); show('title', true); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { writeSave(); openPause(); } });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  refreshTitle();
  requestAnimationFrame(frame);

  // 測試用的小工具（瀏覽器主控台可用）
  window.__rustland = {
    get state() { return { mode, player, ents, save, zone: curZone && curZone.id, dlg: !!dlg }; },
    tp(tx, ty) { player.x = tx * T + 8; player.y = ty * T + 8; },
    skipDialog() { while (dlg) { const cb = dlg.onEnd; dlg = null; if (cb) cb(); } },
  };
})();
