/* 10 – Multitouch-Reaktionsspiel
   Stufe 1: ein Kreis (4 Aufgaben), danach je 5 Aufgaben mit 2 … 10 Kreisen.
   Pro Aufgabe 5 Sekunden, Startpunkte = 10 × Kreisanzahl, gleichmäßig herunterzählend. */
(() => {
  'use strict';

  // ---------- Konstanten ----------
  const TOTAL_MS = 5000;
  const PENALTY_MS = 500;   // Abzug fürs Tippen neben einen Kreis
  const MAX_CIRCLES = 10;
  const STORE_BEST = 'ten.best';
  const STORE_MUTED = 'ten.muted';

  const $ = (id) => document.getElementById(id);
  const field = $('field');
  const circlesEl = $('circles');
  const fxEl = $('fx');
  const ui = {
    taskNo: $('taskNo'), score: $('score'), countdown: $('countdown'), timefill: $('timefill'),
    btnPause: $('btnPause'), btnSound: $('btnSound'),
    scrStart: $('scrStart'), scrPause: $('scrPause'), scrEnd: $('scrEnd'),
    bestStart: $('bestStart'),
    finalScore: $('finalScore'), endKicker: $('endKicker'), endSub: $('endSub'), endBest: $('endBest'),
    levelStats: $('levelStats')
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  // Türkis → Magenta wie im Logo, über die Kreise einer Aufgabe verteilt
  const hueFor = (i, n) => Math.round(n > 1 ? 175 + (i / (n - 1)) * 155 : 175);

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* egal */ } }
  };

  // ---------- Spielplan ----------
  function buildPlan() {
    const plan = [];
    for (let n = 1; n <= MAX_CIRCLES; n++) {
      const T = n === 1 ? 4 : 5;
      for (let k = 0; k < T; k++) plan.push({ n, k, T, t: k / (T - 1) });
    }
    return plan;
  }
  const PLAN = buildPlan();

  // Nach dem Plan geht es endlos mit 10 Kreisen weiter; extra = Nummer der Zusatzrunde (1, 2, …)
  function taskAt(i) {
    if (i < PLAN.length) return PLAN[i];
    return { n: MAX_CIRCLES, k: 4, T: 5, t: 1, extra: i - PLAN.length + 1 };
  }
  const MAX_SCORE = PLAN.reduce((s, p) => s + p.n * 10, 0);
  const LEVEL_MAX = Array.from({ length: MAX_CIRCLES }, (_, i) => PLAN.filter((p) => p.n === i + 1).length * (i + 1) * 10);

  // ---------- Geometrie ----------
  function scaleFactor(W, H) { return clamp(Math.min(W, H) / 780, 0.55, 1.35); }

  function diameterFor(task, s) {
    const { n, t } = task;
    let a, b;
    if (n === 1) { a = 110; b = 58; }
    else if (n === 2) { a = 110; b = 72; }
    else if (n === 3) { a = 140; b = 78; }
    else if (n <= 6) { a = 130; b = 82; }
    else { a = 120; b = 84; }
    return lerp(a, b, t) * s;
  }

  // Abstand benachbarter Kreise: anfangs dicht beieinander, später weiter auseinander
  function neighborDist(task, d, s, groupSize) {
    let max;
    if (task.n === 2) max = 420;
    else if (groupSize <= 3) max = 260;
    else max = 200;
    max = Math.max(max * s, d + 30 * s);
    // Zusatzrunden mit 10 Fingern: die Punkte jeder Hand rücken Runde für Runde weiter auseinander
    if (task.extra) return Math.min(max + task.extra * 18 * s, 420 * s);
    return lerp(d + 14 * s, max, task.t);
  }

  // Größte erlaubte Spannweite einer Hand
  function handSpan(task, s) {
    if (task.extra) return Math.min(440 + task.extra * 40, 950) * s;
    return 440 * s;
  }

  function placeGroup(m, b, D, minSep, span) {
    if (b.x1 < b.x0 || b.y1 < b.y0) return null;
    for (let attempt = 0; attempt < 400; attempt++) {
      if (attempt > 0 && attempt % 80 === 0) D *= 0.9;
      const pts = [{ x: rand(b.x0, b.x1), y: rand(b.y0, b.y1) }];
      let ok = true;
      for (let i = 1; i < m && ok; i++) {
        let placed = false;
        for (let tries = 0; tries < 80; tries++) {
          const base = pts[Math.floor(Math.random() * pts.length)];
          const lo = Math.max(minSep, D * 0.85);
          const dist = rand(lo, Math.max(lo * 1.05, D * 1.15));
          const a = Math.random() * Math.PI * 2;
          const p = { x: base.x + Math.cos(a) * dist, y: base.y + Math.sin(a) * dist };
          if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
          if (pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minSep)) continue;
          if (span && pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) > span)) continue;
          pts.push(p); placed = true; break;
        }
        if (!placed) ok = false;
      }
      if (ok) return pts;
    }
    return null;
  }

  // Notlösung: Kreise in Reihen anordnen
  function gridFallback(m, b, d) {
    const cols = Math.max(1, Math.floor((b.x1 - b.x0) / (d + 10)) + 1);
    const pts = [];
    for (let i = 0; i < m; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      pts.push({ x: b.x0 + c * (d + 10), y: b.y0 + r * (d + 10) });
    }
    return pts;
  }

  let lastSingle = null;

  function layoutTask(task) {
    const W = field.clientWidth, H = field.clientHeight;
    const s = scaleFactor(W, H);
    const d = Math.min(diameterFor(task, s), Math.min(W, H) * 0.3);
    const r = d / 2;
    const margin = r + 14;
    const bottomExtra = 16; // Abstand zur Home-Leiste
    const minSep = d + 10 * s;
    const n = task.n;
    let pts = [];

    if (n === 1) {
      const b = { x0: margin, x1: W - margin, y0: margin, y1: H - margin - bottomExtra };
      let p, tries = 0;
      do {
        p = { x: rand(b.x0, b.x1), y: rand(b.y0, b.y1) };
        tries++;
      } while (lastSingle && Math.hypot(p.x - lastSingle.x, p.y - lastSingle.y) < 220 * s && tries < 50);
      lastSingle = p;
      pts = [p];
    } else if (n <= 5) {
      const b = { x0: margin, x1: W - margin, y0: margin, y1: H - margin - bottomExtra };
      const D = neighborDist(task, d, s, n);
      const span = n >= 3 ? 480 * s : 0;
      pts = placeGroup(n, b, D, minSep, span) || gridFallback(n, b, d);
    } else {
      // Ab 6 Kreisen: eine Gruppe pro Hand, links und rechts
      const groups = [Math.ceil(n / 2), Math.floor(n / 2)];
      const mid = W / 2, gap = 30 * s;
      const bounds = [
        { x0: margin, x1: mid - gap / 2 - r, y0: margin, y1: H - margin - bottomExtra },
        { x0: mid + gap / 2 + r, x1: W - margin, y0: margin, y1: H - margin - bottomExtra }
      ];
      groups.forEach((m, gi) => {
        const D = neighborDist(task, d, s, m);
        const g = placeGroup(m, bounds[gi], D, minSep, handSpan(task, s)) || gridFallback(m, bounds[gi], d);
        pts = pts.concat(g);
      });
    }
    return { d, r, s, pts };
  }

  // ---------- Sound ----------
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

  const Sound = {
    ctx: null, out: null, muted: store.get(STORE_MUTED, '0') === '1',
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        // iOS/iPadOS-Safari: Web Audio sonst stumm, wenn der Stumm-Modus aktiv ist
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ältere Versionen */ }
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = 0.7;
        const comp = ctx.createDynamicsCompressor();
        const bus = ctx.createGain();
        bus.gain.value = this.muted ? 0 : 1;
        // leichtes Echo für einen weicheren Klang
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.13;
        const fb = ctx.createGain(); fb.gain.value = 0.22;
        const wet = ctx.createGain(); wet.gain.value = 0.3;
        master.connect(comp);
        master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);
        comp.connect(bus); bus.connect(ctx.destination);
        this.ctx = ctx; this.out = master; this.comp = comp; this.bus = bus;
      }
      this.wake();
    },
    // Safari kennt neben 'suspended' auch 'interrupted' (z. B. nach Anrufen oder App-Wechsel)
    wake() {
      if (!this.ctx) return Promise.resolve();
      if (this.ctx.state !== 'running') {
        try { return this.ctx.resume().catch(() => {}); } catch (e) { return Promise.resolve(); }
      }
      return Promise.resolve();
    },
    setMuted(m) {
      this.muted = m;
      store.set(STORE_MUTED, m ? '1' : '0');
      if (this.bus) this.bus.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    },
    tone(freq, at, dur, opt = {}) {
      if (!this.ctx || this.muted) return;
      const { type = 'sine', gain = 0.2, attack = 0.006, glide = null } = opt;
      const t = this.ctx.currentTime + at;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.out);
      osc.start(t); osc.stop(t + dur + 0.03);
    },
    blip(i) {
      const f = SCALE[i % SCALE.length];
      this.tone(f, 0, 0.16, { type: 'triangle', gain: 0.16 });
      this.tone(f * 2, 0, 0.07, { gain: 0.04 });
    },
    bad() {
      this.tone(170, 0, 0.13, { type: 'square', gain: 0.045, glide: 95 });
    },
    success(q) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => this.tone(f, i * 0.045, 0.32, { type: 'triangle', gain: 0.12 }));
      if (q > 0.6) this.tone(2093, 0.18, 0.25, { gain: 0.05 });
      if (q > 0.85) this.tone(2637, 0.24, 0.3, { gain: 0.04 });
    },
    miss() {
      this.tone(330, 0, 0.2, { type: 'triangle', gain: 0.12, glide: 220 });
      this.tone(220, 0.13, 0.32, { type: 'triangle', gain: 0.1, glide: 147 });
    },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => this.tone(f, i * 0.07, 0.3, { type: 'triangle', gain: 0.11 }));
    },
    fanfare() {
      const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51, 1567.98];
      seq.forEach((f, i) => this.tone(f, i * 0.09, i === seq.length - 1 ? 0.8 : 0.22, { type: 'triangle', gain: 0.12 }));
    }
  };


  // ---------- Hintergrundmusik ----------
  // Generativ: Am – F – C – G, ein Akkord pro Takt. Mit der Intensität (0 … 1) kommen
  // nach und nach Bass, Arpeggio, Kick, Hi-Hat, Clap und Melodie dazu, das Tempo steigt.
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [
    { root: 45, tones: [57, 60, 64] },  // Am
    { root: 41, tones: [57, 60, 65] },  // F
    { root: 48, tones: [55, 60, 64] },  // C
    { root: 43, tones: [55, 59, 62] }   // G
  ];
  const MELODY = [69, 72, 74, 76, 79, 81, 84]; // A-Moll-Pentatonik

  const Music = {
    out: null, noise: null, timer: 0, playing: false,
    step: 0, nextTime: 0, bpm: 68, targetBpm: 68, intensity: 0, melIdx: 3,
    ensure() {
      const ctx = Sound.ctx;
      if (!ctx) return false;
      if (!this.out) {
        // out = Summe aller Stimmen → level (Lautstärke je Intensität) → fade (Ein-/Ausblenden)
        this.out = ctx.createGain();
        this.level = ctx.createGain();
        this.fade = ctx.createGain();
        this.out.gain.value = 1;
        this.level.gain.value = this.volume();
        this.fade.gain.value = 0;
        this.out.connect(this.level); this.level.connect(this.fade); this.fade.connect(Sound.comp);
        const len = ctx.sampleRate;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      return true;
    },
    volume() { return lerp(0.35, 0.9, this.intensity); },
    rampTo(param, value, secs) {
      const now = Sound.ctx.currentTime;
      const cur = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(cur, now);
      param.linearRampToValueAtTime(value, now + secs);
    },
    start() {
      if (!this.ensure() || this.playing) return;
      this.playing = true;
      this.bpm = this.targetBpm;
      this.step = 0;
      clearInterval(this.timer);
      // erst loslegen, wenn der AudioContext wirklich läuft (Safari startet ihn asynchron)
      Sound.wake().then(() => {
        if (!this.playing) return;
        this.rampTo(this.fade.gain, 1, 3);
        this.nextTime = Sound.ctx.currentTime + 0.15;
        clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), 25);
      });
    },
    stop(fade = 1.5) {
      if (!this.playing || !this.out) return;
      this.playing = false;
      this.rampTo(this.fade.gain, 0, fade);
      setTimeout(() => { if (!this.playing) clearInterval(this.timer); }, fade * 1000 + 100);
    },
    setIntensity(x) {
      this.intensity = clamp(x, 0, 1);
      this.targetBpm = lerp(68, 122, this.intensity);
      if (this.level) this.rampTo(this.level.gain, this.volume(), 1.5);
    },
    tick() {
      const ctx = Sound.ctx;
      if (ctx.state !== 'running') { Sound.wake(); return; }
      // nach einer Unterbrechung nicht alle verpassten Schritte auf einmal nachholen
      if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.15) {
        this.playStep(this.step, this.nextTime);
        this.bpm += (this.targetBpm - this.bpm) * 0.03;
        this.nextTime += 60 / this.bpm / 4;
        this.step++;
      }
    },
    voice(freq, t, dur, { type = 'sine', gain = 0.05, attack = 0.005, cutoff = 0 } = {}) {
      const ctx = Sound.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cutoff;
        o.connect(f); node = f;
      }
      node.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noiseHit(t, dur, { type = 'highpass', freq = 7000, gain = 0.03, q = 0.7 } = {}) {
      const ctx = Sound.ctx;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.out);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    },
    kick(t, gain) {
      const ctx = Sound.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.25);
    },
    playStep(s, t) {
      const I = this.intensity;
      const pos = s % 16;
      const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
      const sixteenth = 60 / this.bpm / 4;
      const bar = sixteenth * 16;

      // Fläche: immer, wird mit der Intensität heller
      if (pos === 0) {
        const cutoff = lerp(500, 2600, I);
        chord.tones.forEach((m) => this.voice(midi(m), t, bar * 1.05, { type: 'triangle', gain: 0.035, attack: bar * 0.35, cutoff }));
      }
      // Bass
      if (I > 0.1) {
        if (pos === 0 || (I > 0.45 && pos === 8) || (I > 0.75 && (pos === 6 || pos === 14))) {
          this.voice(midi(chord.root), t, sixteenth * 3.5, { type: 'triangle', gain: lerp(0.06, 0.1, I), cutoff: 900 });
        }
      }
      // Arpeggio: erst Achtel, später Sechzehntel
      if (I > 0.22) {
        const every = I > 0.7 ? 1 : 2;
        if (pos % every === 0) {
          const seq = [0, 1, 2, 1];
          const k = (pos / every) % seq.length;
          const octave = (I > 0.55 && Math.floor(pos / 8) === 1) ? 12 : 0;
          this.voice(midi(chord.tones[seq[k]] + 12 + octave), t, sixteenth * 2.2, { gain: lerp(0.025, 0.045, I) });
        }
      }
      // Kick: erst auf 1 und 3, später jede Viertel
      if (I > 0.35) {
        if (pos === 0 || pos === 8 || (I > 0.6 && (pos === 4 || pos === 12))) this.kick(t, lerp(0.12, 0.2, I));
      }
      // Hi-Hat auf den Offbeats, später dichter
      if (I > 0.48) {
        if (pos % 4 === 2 || (I > 0.8 && pos % 2 === 1 && Math.random() < 0.5)) this.noiseHit(t, 0.04, { gain: lerp(0.015, 0.03, I) });
      }
      // Clap auf 2 und 4
      if (I > 0.62 && (pos === 4 || pos === 12)) {
        this.noiseHit(t, 0.12, { type: 'bandpass', freq: 1500, gain: 0.05, q: 1.2 });
      }
      // Melodie: Zufallsweg durch die Pentatonik
      if (I > 0.72 && pos % 2 === 0 && Math.random() < lerp(0.3, 0.55, I)) {
        this.melIdx = clamp(this.melIdx + Math.floor(Math.random() * 5) - 2, 0, MELODY.length - 1);
        this.voice(midi(MELODY[this.melIdx]), t, sixteenth * (Math.random() < 0.3 ? 4 : 2), { type: 'triangle', gain: 0.04, cutoff: 3000 });
      }
    }
  };

  // ---------- Zustand ----------
  let state = 'menu';      // menu | playing | ended
  let phase = 'idle';      // idle | live | between | intro | paused
  let idx = 0;
  let score = 0;
  let levelScore = new Array(MAX_CIRCLES).fill(0);
  let task = null;
  let geo = null;
  let circles = [];        // { x, y, el } in Feld-Koordinaten
  let taskStart = 0;
  let stale = new Set();   // Finger, die schon vor dem Erscheinen lagen
  let currentIds = new Set();
  let shownPts = -1;
  let timers = [];

  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function show(screen) {
    [ui.scrStart, ui.scrPause, ui.scrEnd].forEach((s) => { s.hidden = s !== screen; });
  }

  function setCountdownIdle(text) {
    ui.countdown.textContent = text;
    ui.countdown.classList.add('idle');
    ui.countdown.style.color = '';
  }

  function updateBestLabel() {
    const best = parseInt(store.get(STORE_BEST, '0'), 10) || 0;
    ui.bestStart.textContent = best > 0 ? 'Rekord: ' + best + ' Punkte' : '';
  }

  // ---------- Ablauf ----------
  function startGame() {
    Sound.init();
    clearTimers();
    state = 'playing';
    idx = 0;
    score = 0;
    levelScore = new Array(MAX_CIRCLES).fill(0);
    lastSingle = null;
    ui.score.textContent = '0';
    ui.btnPause.hidden = false;
    show(null);
    phase = 'between';
    Sound.levelUp();
    Music.setIntensity(0);
    Music.start();
    setCountdownIdle('10');
    later(startTask, 650);
  }

  function startTask() {
    clearTimers();
    task = taskAt(idx);
    geo = layoutTask(task);
    Music.setIntensity(idx / (PLAN.length - 4));
    circlesEl.innerHTML = '';
    circles = geo.pts.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'circle';
      el.style.width = el.style.height = geo.d + 'px';
      el.style.left = (p.x - geo.r) + 'px';
      el.style.top = (p.y - geo.r) + 'px';
      el.style.setProperty('--h', hueFor(i, task.n));
      el.style.animationDelay = (i * 18) + 'ms';
      circlesEl.appendChild(el);
      return { x: p.x, y: p.y, el };
    });
    stale = new Set(currentIds);
    ui.taskNo.textContent = idx < PLAN.length ? (idx + 1) + ' / ' + PLAN.length : String(idx + 1);
    ui.countdown.classList.remove('idle');
    shownPts = -1;
    taskStart = performance.now();
    phase = 'live';
  }

  function pointsAt(now) {
    const maxP = task.n * 10;
    const interval = TOTAL_MS / maxP;
    return Math.max(0, maxP - Math.floor((now - taskStart) / interval));
  }

  function success(now) {
    phase = 'between';
    const p = pointsAt(now);
    const maxP = task.n * 10;
    score += p;
    levelScore[task.n - 1] += p;
    animateScore();
    let cx = 0, cy = 0;
    circles.forEach((c, i) => {
      c.el.classList.remove('on');
      c.el.classList.add('done');
      spawnRing(c.x, c.y, geo.d, 'hsl(' + hueFor(i, circles.length) + ' 90% 65%)');
      cx += c.x; cy += c.y;
    });
    floatText(cx / circles.length, cy / circles.length - geo.r - 10, '+' + p, p === 0);
    setCountdownIdle(String(p));
    Sound.success(p / maxP);
    later(nextTask, 560);
  }

  function timeout() {
    phase = 'between';
    let cx = 0, cy = 0;
    circles.forEach((c) => { c.el.classList.remove('on'); c.el.classList.add('gone'); cx += c.x; cy += c.y; });
    floatText(cx / circles.length, cy / circles.length, '0', true);
    setCountdownIdle('0');
    ui.timefill.style.transform = 'scaleX(0)';
    Sound.miss();
    later(() => endGame(true), 1100);
  }

  function nextTask() {
    idx++;
    if (taskAt(idx).n !== taskAt(idx - 1).n) {
      // neue Stufe: kurzer Klang, etwas längere Pause, kein Zwischenbildschirm
      Sound.levelUp();
      later(startTask, 350);
    } else startTask();
  }

  function endGame(timedOut) {
    Music.stop(2);
    state = 'ended';
    phase = 'idle';
    clearTimers();
    circlesEl.innerHTML = '';
    circles = [];
    ui.btnPause.hidden = true;
    setCountdownIdle('–');
    ui.timefill.style.transform = 'scaleX(0)';
    const best = parseInt(store.get(STORE_BEST, '0'), 10) || 0;
    ui.finalScore.textContent = String(score);
    const reachedLevel = taskAt(idx).n;
    const extra = taskAt(idx).extra || 0;
    ui.endSub.textContent = extra
      ? 'Zeit abgelaufen in der ' + extra + '. Zusatzrunde mit 10 Fingern (Aufgabe ' + (idx + 1) + ')'
      : 'Zeit abgelaufen bei Aufgabe ' + (idx + 1) + ' (' + reachedLevel + (reachedLevel === 1 ? ' Kreis' : ' Kreise') + ')';
    const record = score > best;
    if (record) {
      store.set(STORE_BEST, score);
      ui.endKicker.textContent = 'Neuer Rekord!';
      ui.endBest.textContent = best > 0 ? 'Bisheriger Rekord: ' + best : '';
    } else {
      ui.endKicker.textContent = timedOut ? 'Zeit abgelaufen' : 'Geschafft!';
      ui.endBest.textContent = 'Rekord: ' + best;
    }
    ui.levelStats.innerHTML = '';
    levelScore.forEach((v, i) => {
      const pct = Math.min(100, Math.round((v / LEVEL_MAX[i]) * 100));
      const cell = document.createElement('div');
      cell.className = 'lv';
      cell.innerHTML = '<span class="lv-n">' + (i + 1) + (i === 0 ? ' Kreis' : ' Kreise') + '</span>' +
        '<span class="lv-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="lv-p">' + (i + 1 > reachedLevel ? '–' : v) + '</span>';
      ui.levelStats.appendChild(cell);
    });
    show(ui.scrEnd);
    if (record || !timedOut) Sound.fanfare();
  }

  function pauseGame() {
    if (state !== 'playing' || phase === 'paused' || phase === 'intro') return;
    clearTimers();
    phase = 'paused';
    Music.stop(0.6);
    circlesEl.innerHTML = '';
    circles = [];
    setCountdownIdle('II');
    ui.timefill.style.transform = 'scaleX(0)';
    show(ui.scrPause);
  }

  function resumeGame() {
    Sound.init();
    Music.start();
    show(null);
    phase = 'between';
    later(startTask, 400);
  }

  function quitGame() {
    clearTimers();
    Music.stop(0.6);
    state = 'menu';
    phase = 'idle';
    circlesEl.innerHTML = '';
    circles = [];
    ui.btnPause.hidden = true;
    ui.taskNo.textContent = '–';
    setCountdownIdle('10');
    ui.timefill.style.transform = 'scaleX(0)';
    updateBestLabel();
    show(ui.scrStart);
  }

  // ---------- Effekte ----------
  function spawnRing(x, y, d, color) {
    const el = document.createElement('div');
    el.className = 'ring';
    el.style.width = el.style.height = d + 'px';
    el.style.left = (x - d / 2) + 'px';
    el.style.top = (y - d / 2) + 'px';
    el.style.color = color;
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function badTouch(x, y) {
    const el = document.createElement('div');
    el.className = 'bad-touch';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    fxEl.appendChild(el);
    const txt = document.createElement('div');
    txt.className = 'penalty';
    txt.textContent = '−0,5 s';
    txt.style.left = clamp(x, 50, field.clientWidth - 50) + 'px';
    txt.style.top = Math.max(30, y - 50) + 'px';
    fxEl.appendChild(txt);
    setTimeout(() => txt.remove(), 800);
    setTimeout(() => el.remove(), 600);
  }

  function floatText(x, y, text, zero) {
    const el = document.createElement('div');
    el.className = 'float' + (zero ? ' zero' : '');
    el.textContent = text;
    const W = field.clientWidth;
    el.style.left = clamp(x, 60, W - 60) + 'px';
    el.style.top = Math.max(40, y) + 'px';
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  let scoreAnim = 0;
  function animateScore() {
    const from = parseInt(ui.score.textContent, 10) || 0;
    const to = score;
    const t0 = performance.now();
    cancelAnimationFrame(scoreAnim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 400);
      ui.score.textContent = String(Math.round(lerp(from, to, k)));
      if (k < 1) scoreAnim = requestAnimationFrame(step);
    };
    scoreAnim = requestAnimationFrame(step);
  }

  // ---------- Eingabe ----------
  function circleAt(x, y) {
    const tol = geo.r + 10 * geo.s;
    let best = -1, bestD = Infinity;
    circles.forEach((c, i) => {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= tol && d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  // points: [{ id, x, y }] in Feld-Koordinaten
  function evaluate(points) {
    const hits = new Array(circles.length).fill(0);
    let outside = 0;
    for (const p of points) {
      if (stale.has(p.id)) { outside++; continue; }
      const i = circleAt(p.x, p.y);
      if (i < 0) outside++; else hits[i]++;
    }
    circles.forEach((c, i) => c.el.classList.toggle('on', hits[i] > 0));
    return outside === 0 && hits.every((h) => h === 1);
  }

  function toFieldPoints(list) {
    const rect = field.getBoundingClientRect();
    return list.map((t) => ({ id: t.identifier, x: t.clientX - rect.left, y: t.clientY - rect.top }));
  }

  function handleInput(kind, changed, current) {
    currentIds = new Set(current.map((p) => p.id));
    if (state !== 'playing' || phase !== 'live') return;
    if (kind === 'start') {
      for (const p of changed) {
        const i = circleAt(p.x, p.y);
        if (i >= 0) Sound.blip(i);
        else {
          taskStart -= PENALTY_MS;
          badTouch(p.x, p.y);
          Sound.bad();
        }
      }
    }
    if (evaluate(current)) success(performance.now());
  }

  function onTouch(e) {
    if (e.type === 'touchend' && Sound.ctx && Sound.ctx.state !== 'running') Sound.wake();
    const t = e.target;
    const inUi = t && t.closest && (t.closest('button') || t.closest('.screen'));
    if (!inUi) e.preventDefault();
    const kind = e.type === 'touchstart' ? 'start' : (e.type === 'touchmove' ? 'move' : 'end');
    handleInput(kind, toFieldPoints(Array.from(e.changedTouches)), toFieldPoints(Array.from(e.touches)));
  }

  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((ev) =>
    document.addEventListener(ev, onTouch, { passive: false }));
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Maus zum Testen am Rechner (nur ein Zeiger)
  let mouseDown = false;
  field.addEventListener('mousedown', (e) => {
    mouseDown = true;
    const p = toFieldPoints([{ identifier: 'mouse', clientX: e.clientX, clientY: e.clientY }]);
    handleInput('start', p, p);
  });
  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    handleInput('end', [], []);
  });

  // ---------- Zeitschleife ----------
  function frame(now) {
    if (phase === 'live') {
      const el = now - taskStart;
      const pts = pointsAt(now);
      if (pts !== shownPts) {
        shownPts = pts;
        ui.countdown.textContent = String(pts);
        const k = clamp(el / TOTAL_MS, 0, 1);
        ui.countdown.style.color = 'hsl(' + Math.round(lerp(175, 330, k)) + ' 90% 62%)';
      }
      ui.timefill.style.transform = 'scaleX(' + clamp(1 - el / TOTAL_MS, 0, 1) + ')';
      if (el >= TOTAL_MS) timeout();
    }
    requestAnimationFrame(frame);
  }
  ui.timefill.style.width = '100%';
  ui.timefill.style.transform = 'scaleX(0)';
  requestAnimationFrame(frame);

  // ---------- Buttons ----------
  $('btnStart').addEventListener('click', startGame);
  $('btnAgain').addEventListener('click', startGame);
  $('btnHome').addEventListener('click', quitGame);
  ui.btnPause.addEventListener('click', pauseGame);
  $('btnResume').addEventListener('click', resumeGame);
  $('btnQuit').addEventListener('click', quitGame);

  function syncSoundBtn() {
    ui.btnSound.classList.toggle('muted', Sound.muted);
    ui.btnSound.setAttribute('aria-label', Sound.muted ? 'Ton an' : 'Ton aus');
  }
  ui.btnSound.addEventListener('click', () => {
    Sound.init();
    Sound.setMuted(!Sound.muted);
    syncSoundBtn();
  });
  syncSoundBtn();

  // Pause beim Verlassen der App, Neuaufbau bei Drehung
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state === 'playing' && phase === 'live') startTask(); }, 200);
  });

  updateBestLabel();
  show(ui.scrStart);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Für Tests
  window.__ten = { taskAt, Music, PLAN, MAX_SCORE, layoutTask, placeGroup, jump(i) { Sound.init(); Music.start(); state = 'playing'; idx = i; show(null); ui.btnPause.hidden = false; startTask(); } };
})();
