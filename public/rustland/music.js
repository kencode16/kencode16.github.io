/* 鏽境 Rustland — 程序化背景音樂 (procedural background music)
 * Classic script. Exposes window.RLMusic:
 *   init(ctx), play(name|'none'|null), setMuted(bool), isMuted(), duck(bool)
 * All sound is synthesized live (oscillators + noise). No files, no libraries.
 * Design: a small TRACKS table (data) + one generic lookahead sequencer.
 */
(function () {
  'use strict';

  var MASTER_GAIN = 0.18;     // 整體音量（音效約 0.1，音樂要壓在下面）
  var DUCK_FACTOR = 0.4;      // 對話時降到 40%
  var XFADE = 1.2;            // 交叉淡入淡出秒數
  var LOOKAHEAD = 0.12;       // 排程提前量（秒）
  var TICK_MS = 25;           // 排程器間隔
  var MAX_VOICES = 40;        // 同時發聲上限
  var LS_KEY = 'rustland.music.muted';
  var EPS = 0.0001;

  var ctx = null, master = null, noiseBuf = null;
  var muted = false, ducked = false, hidden = false;
  var timer = null, voices = 0;
  var current = null;         // 正在播放的 track instance
  var fading = [];            // 正在淡出的 instances
  var currentName = null;

  // ---------- helpers ----------
  var NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteToMidi(s) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    if (!m) return null;
    var n = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return n + (parseInt(m[3], 10) + 1) * 12;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 解析樣式字串："D4 . F4+A4 -" → 每步一格；'.' 休止；'+' 和弦；'x' 打擊（無音高）
  function parsePattern(str) {
    return str.trim().split(/\s+/).map(function (tok) {
      if (tok === '.' || tok === '-') return null;
      if (tok === 'x') return [0];
      return tok.split('+').map(noteToMidi).filter(function (v) { return v !== null; });
    });
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 平滑設定 AudioParam（避免爆音；iOS 安全）
  function rampParam(p, target, secs) {
    var t = ctx.currentTime;
    try {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(target, t + secs);
    } catch (e) { p.value = target; }
  }

  // 建立一個有包絡的 voice：回傳 gain 節點；sources 結束後全部 disconnect
  // env: {a: attack, h: hold, r: release}；用 exponentialRamp 到 0.0001
  function voice(dest, t, peak, env, sources, extraNodes) {
    if (voices >= MAX_VOICES) return null;
    var g = ctx.createGain();
    var a = Math.max(0.005, env.a), h = Math.max(0, env.h || 0), r = Math.max(0.02, env.r);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + h);
    g.gain.exponentialRampToValueAtTime(EPS, t + a + h + r);
    g.connect(dest);
    var end = t + a + h + r + 0.05;
    var remaining = sources.length;
    voices++;
    sources.forEach(function (src) {
      src.onended = function () {
        try { src.disconnect(); } catch (e) {}
        if (--remaining === 0) {
          voices--;
          (extraNodes || []).forEach(function (n) { try { n.disconnect(); } catch (e) {} });
          try { g.disconnect(); } catch (e) {}
        }
      };
      src.start(t);
      src.stop(end);
    });
    return g;
  }

  function osc(type, freq, detune) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    return o;
  }

  // ---------- instruments: fn(dest, time, midi, durSecs, vel) ----------
  var INST = {
    // 低音嗡鳴：兩個略微走音的三角/鋸齒經低通
    drone: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.7;
      var o1 = osc('sawtooth', f, -6), o2 = osc('triangle', f, 5), o3 = osc('sine', f / 2);
      o1.connect(lp); o2.connect(lp); o3.connect(lp);
      var g = voice(dest, t, 0.5 * vel, { a: dur * 0.35, h: dur * 0.3, r: dur * 0.6 }, [o1, o2, o3], [lp]);
      if (g) lp.connect(g);
    },
    // 柔和的音符（sine + 少量三角）
    soft: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var o1 = osc('sine', f), o2 = osc('triangle', f, 3);
      var mix = ctx.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix);
      var g = voice(dest, t, 0.5 * vel, { a: 0.04, h: 0.05, r: Math.max(0.6, dur * 1.5) }, [o1, o2], [mix]);
      if (g) mix.connect(g);
    },
    // 金屬「叮」：非諧波泛音，長衰減
    ping: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var ratios = [1, 2.76, 5.4], amps = [1, 0.4, 0.15];
      var mix = ctx.createGain(); mix.gain.value = 1;
      var srcs = ratios.map(function (r, i) {
        var o = osc('sine', f * r);
        var pg = ctx.createGain(); pg.gain.value = amps[i];
        o.connect(pg); pg.connect(mix);
        o._pg = pg;
        return o;
      });
      var extra = [mix].concat(srcs.map(function (o) { return o._pg; }));
      var g = voice(dest, t, 0.22 * vel, { a: 0.005, h: 0, r: 3.2 }, srcs, extra);
      if (g) mix.connect(g);
    },
    // 琶音（三角波，短）
    arp: function (dest, t, m, dur, vel) {
      var o = osc('triangle', mtof(m));
      var g = voice(dest, t, 0.32 * vel, { a: 0.01, h: 0.02, r: Math.max(0.25, dur * 1.8) }, [o]);
      if (g) o.connect(g);
    },
    // 溫暖的 pad：三個走音鋸齒波經低通
    pad: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
      var srcs = [-8, 0, 7].map(function (d) { var o = osc('sawtooth', f, d); o.connect(lp); return o; });
      var g = voice(dest, t, 0.13 * vel, { a: Math.min(1.5, dur * 0.4), h: dur * 0.3, r: dur * 0.6 }, srcs, [lp]);
      if (g) lp.connect(g);
    },
    // 推進的 bass：鋸齒 + 方波經低通，濾波包絡
    bass: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.08, dur * 0.9));
      var o1 = osc('sawtooth', f), o2 = osc('square', f / 2);
      var sub = ctx.createGain(); sub.gain.value = 0.5;
      o1.connect(lp); o2.connect(sub); sub.connect(lp);
      var g = voice(dest, t, 0.42 * vel, { a: 0.006, h: dur * 0.5, r: dur * 0.5 }, [o1, o2], [lp, sub]);
      if (g) lp.connect(g);
    },
    // 大鼓：sine 音高下降
    kick: function (dest, t, m, dur, vel) {
      var o = osc('sine', 150);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      var g = voice(dest, t, 0.9 * vel, { a: 0.003, h: 0.02, r: 0.22 }, [o]);
      if (g) o.connect(g);
    },
    // hi-hat：高通雜訊
    hat: function (dest, t, m, dur, vel) {
      var src = ctx.createBufferSource(); src.buffer = getNoise();
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      src.connect(hp);
      var g = voice(dest, t, 0.16 * vel, { a: 0.002, h: 0, r: 0.045 }, [src], [hp]);
      if (g) hp.connect(g);
    },
    // 主旋律：方波經低通（不祥的動機）
    lead: function (dest, t, m, dur, vel) {
      var f = mtof(m);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 1;
      var o1 = osc('square', f, -4), o2 = osc('sawtooth', f, 4);
      var mix = ctx.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix); mix.connect(lp);
      var g = voice(dest, t, 0.16 * vel, { a: 0.02, h: dur * 0.6, r: Math.max(0.12, dur * 0.5) }, [o1, o2], [lp, mix]);
      if (g) lp.connect(g);
    },
    // 風聲：帶通雜訊，緩慢掃頻
    wind: function (dest, t, m, dur, vel) {
      var src = ctx.createBufferSource(); src.buffer = getNoise(); src.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
      bp.frequency.linearRampToValueAtTime(400, t + dur * 1.2);
      src.connect(bp);
      var g = voice(dest, t, 0.22 * vel, { a: dur * 0.4, h: dur * 0.2, r: dur * 0.6 }, [src], [bp]);
      if (g) bp.connect(g);
    }
  };

  // ---------- track definitions (data) ----------
  // bpm, stepsPerBeat, steps (loop length), swing (0..0.5, shifts odd steps),
  // parts: { inst, vel, len (steps per note), prob (chance to play), pat (string or step array) }
  // 每個 part 的 pattern 長度若短於 steps，會自動循環（可做多拍子層疊）
  var TRACKS = {
    // 第一章 廢墟：稀疏、憂鬱，D Dorian，約 70 BPM
    lab: {
      bpm: 70, stepsPerBeat: 2, steps: 64,
      parts: [
        { inst: 'drone', vel: 0.9, len: 28,
          pat: 'D2 . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . . . . . ' +
               'Bb1 . . . . . . . . . . . . . . . ' + '. . . . . . . . C2 . . . . . . . ' },
        { inst: 'soft', vel: 0.8, len: 3,
          pat: '. . D4 . . . F4 . . . . . A4 . . . ' + '. . . . G4 . . . . . E4 . . . . . ' +
               '. . F4 . . . D4 . . . . . . . C4 . ' + '. . . . E4 . . . . . . . . . . . ' },
        { inst: 'soft', vel: 0.5, len: 4, prob: 0.6,
          pat: '. . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . . . B4 . ' +
               '. . . . . . . . . . A4 . . . . . ' + '. . . . . . . . . . . . . . . . ' },
        { inst: 'ping', vel: 0.8, prob: 0.55,
          pat: '. . . . . . . . . . A6 . . . . . ' + '. . . . . . . . . . . . . . . . ' +
               '. . . . . . . . . . . . . . . . ' + '. . . . . . D7 . . . . . . . . . ' }
      ]
    },
    // 第二章 機械森林：溫暖但詭異，Lydian（F Lydian 帶 B 自然音），約 84 BPM
    forest: {
      bpm: 84, stepsPerBeat: 4, steps: 64,
      parts: [
        { inst: 'wind', vel: 0.8, len: 40, pat: 'x ' + new Array(32).join('. ') },
        { inst: 'drone', vel: 0.6, len: 34, pat: 'F2 ' + new Array(32).join('. ') + 'D2 ' + new Array(32).join('. ') },
        { inst: 'arp', vel: 0.7, len: 2,
          pat: 'F4 . A4 . C5 . B4 . E5 . C5 . A4 . G4 . ' + 'F4 . A4 . C5 . B4 . G5 . E5 . C5 . B4 . ' +
               'D4 . F4 . A4 . B4 . E5 . A4 . F4 . E4 . ' + 'D4 . A4 . B4 . C5 . E5 . B4 . A4 . F4 . ' },
        { inst: 'soft', vel: 0.55, len: 6,
          pat: '. . . . . . . . E5 . . . . . . . ' + '. . . . . . . . . . . . G5 . . . ' +
               '. . . . . . . . . . . . . . . . ' + 'B5 . . . . . . . . . . . A5 . . . ' },
        { inst: 'ping', vel: 0.45, prob: 0.4,
          pat: '. . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . . . . . ' +
               '. . . . . . B6 . . . . . . . . . ' + '. . . . . . . . . . . . . . . . ' }
      ]
    },
    // 頭目戰：緊張，E 小調，132 BPM
    boss: {
      bpm: 132, stepsPerBeat: 4, steps: 64,
      parts: [
        { inst: 'bass', vel: 0.9, len: 1,
          pat: 'E2 . E2 E2 . E2 G2 . E2 . E2 E2 . D2 Eb2 . ' + 'E2 . E2 E2 . E2 G2 . E2 . E2 E2 . Bb2 A2 . ' +
               'C2 . C2 C2 . C2 Eb2 . C2 . C2 C2 . D2 Eb2 . ' + 'B1 . B1 B1 . B1 D2 . B1 . B1 B1 . D2 Eb2 . ' },
        { inst: 'kick', vel: 0.9, pat: 'x . . . x . . . x . . . x . . x ' },
        { inst: 'hat', vel: 0.7, pat: '. . x . . . x x . . x . . . x . ' },
        { inst: 'hat', vel: 0.3, pat: 'x . . . ' },
        { inst: 'lead', vel: 0.9, len: 2,
          pat: '. . . . . . . . . . . . . . . . ' + 'E5 . . . G5 . F#5 . Eb5 . . . . . . . ' +
               '. . . . . . . . . . . . . . . . ' + 'E5 . . . C6 . B5 . Bb5 . . . A5 . . . ' }
      ]
    },
    // 第二頭目（失控園丁機器人）：12/8 搖擺感，G 小調，悲劇旋律
    boss2: {
      bpm: 132, stepsPerBeat: 3, steps: 48,
      parts: [
        { inst: 'bass', vel: 0.9, len: 1,
          pat: 'G2 . G2 G2 . D2 G2 . G2 Bb2 . A2 ' + 'Eb2 . Eb2 Eb2 . Bb1 Eb2 . Eb2 G2 . F2 ' +
               'C2 . C2 C2 . G1 C2 . C2 Eb2 . D2 ' + 'D2 . D2 D2 . A1 D2 . F#2 A2 . F#2 ' },
        { inst: 'kick', vel: 0.9, pat: 'x . . x . . x . . x . x ' },
        { inst: 'hat', vel: 0.6, pat: '. x x . x x . x x . x x ' },
        { inst: 'lead', vel: 0.85, len: 3,
          pat: 'D5 . . . . . Bb4 . . A4 . G4 ' + 'G4 . . . . . . . . Bb4 . C5 ' +
               'Eb5 . . . . . D5 . . C5 . Bb4 ' + 'A4 . . . . . F#4 . . . . . ' },
        { inst: 'soft', vel: 0.35, len: 9,
          pat: 'G4+Bb4 . . . . . . . . . . . ' + 'Eb4+G4 . . . . . . . . . . . ' +
               'C4+Eb4 . . . . . . . . . . . ' + 'D4+F#4 . . . . . . . . . . . ' }
      ]
    },
    // 章節結束：平靜、解決，C 大調 pad，60 BPM
    victory: {
      bpm: 60, stepsPerBeat: 2, steps: 32,
      parts: [
        { inst: 'pad', vel: 0.9, len: 9,
          pat: 'C3+E4+G4 . . . . . . . F3+A4+C5 . . . . . . . ' + 'A2+C4+E4 . . . . . . . G2+D4+G4 . . . . . . . ' },
        { inst: 'drone', vel: 0.35, len: 18, pat: 'C2 . . . . . . . . . . . . . . . ' },
        { inst: 'soft', vel: 0.55, len: 3,
          pat: 'E5 . . . G5 . . . A5 . . . G5 . . . ' + 'E5 . . . D5 . . . . . . . . . . . ' },
        { inst: 'ping', vel: 0.35, pat: '. . . . . . . . . . . . . . . . ' + '. . . . . . . . . . . . C7 . . . ' }
      ]
    }
  };

  // 預先解析 pattern
  Object.keys(TRACKS).forEach(function (k) {
    TRACKS[k].parts.forEach(function (p) { if (typeof p.pat === 'string') p.pat = parsePattern(p.pat); });
  });

  // ---------- sequencer ----------
  function startTrack(name) {
    var def = TRACKS[name];
    var g = ctx.createGain();
    var t = ctx.currentTime;
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(1, t + XFADE);
    g.connect(master);
    return { name: name, def: def, gain: g, step: 0, next: t + 0.05, stopAt: Infinity };
  }

  function fadeOut(inst) {
    var t = ctx.currentTime;
    try {
      inst.gain.gain.cancelScheduledValues(t);
      inst.gain.gain.setValueAtTime(Math.max(EPS, inst.gain.gain.value), t);
      inst.gain.gain.exponentialRampToValueAtTime(EPS, t + XFADE);
    } catch (e) {}
    inst.stopAt = t + XFADE;
    fading.push(inst);
  }

  function scheduleTrack(inst, horizon) {
    var def = inst.def;
    var stepDur = 60 / def.bpm / def.stepsPerBeat;
    var now = ctx.currentTime;
    // 背景回來時 currentTime 可能已跳過很多：重新對齊，不補播
    if (inst.next < now - 0.2) inst.next = now + 0.05;
    while (inst.next < horizon && inst.next < inst.stopAt) {
      var t = inst.next;
      if (def.swing && inst.step % 2 === 1) t += stepDur * def.swing;
      for (var i = 0; i < def.parts.length; i++) {
        var p = def.parts[i];
        var cell = p.pat[inst.step % p.pat.length];
        if (!cell || !cell.length) continue;
        if (p.prob !== undefined && Math.random() > p.prob) continue;
        var dur = (p.len || 1) * stepDur;
        for (var j = 0; j < cell.length; j++) {
          try { INST[p.inst](inst.gain, t, cell[j], dur, p.vel || 1); } catch (e) {}
        }
      }
      inst.next += stepDur;
      inst.step = (inst.step + 1) % def.steps;
    }
  }

  function tick() {
    if (!ctx || hidden) return;
    var now = ctx.currentTime;
    var horizon = now + LOOKAHEAD;
    if (current) scheduleTrack(current, horizon);
    for (var i = fading.length - 1; i >= 0; i--) {
      var f = fading[i];
      if (now > f.stopAt + 3.5) { // 等殘響結束再斷開
        try { f.gain.disconnect(); } catch (e) {}
        fading.splice(i, 1);
      } else {
        scheduleTrack(f, horizon);
      }
    }
    if (!current && !fading.length && timer) { clearInterval(timer); timer = null; }
  }

  function ensureTimer() { if (!timer) timer = setInterval(tick, TICK_MS); }

  // ---------- master volume ----------
  function targetGain() {
    if (muted || hidden) return 0;
    return MASTER_GAIN * (ducked ? DUCK_FACTOR : 1);
  }
  function applyMaster(secs) { if (master) rampParam(master.gain, targetGain(), secs); }

  function onVisibility() {
    hidden = !!document.hidden;
    applyMaster(hidden ? 0.15 : 0.5);
  }

  // ---------- public API ----------
  var RLMusic = {
    init: function (audioContext) {
      if (ctx || !audioContext) return;
      try {
        ctx = audioContext;
        try { muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) {}
        hidden = !!(typeof document !== 'undefined' && document.hidden);
        master = ctx.createGain();
        master.gain.value = targetGain();
        master.connect(ctx.destination);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      } catch (e) { ctx = null; master = null; }
    },
    play: function (name) {
      if (!ctx) return;
      if (name && !TRACKS[name]) name = null;
      if (!name) name = null;
      if (name === currentName) return;
      currentName = name;
      if (current) { fadeOut(current); current = null; }
      if (name) current = startTrack(name);
      ensureTimer();
    },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(LS_KEY, muted ? '1' : '0'); } catch (e) {}
      if (ctx) applyMaster(0.3);
    },
    isMuted: function () {
      if (!ctx) { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return muted; } }
      return muted;
    },
    duck: function (on) {
      ducked = !!on;
      if (ctx) applyMaster(0.4);
    },
    // 方便除錯（非正式 API）
    _debug: function () {
      return { track: currentName, fading: fading.length, voices: voices, master: master ? master.gain.value : null };
    },
    tracks: Object.keys(TRACKS)
  };

  window.RLMusic = RLMusic;
})();
