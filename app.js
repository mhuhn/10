/* 10 – Multitouch-Reaktionsspiel
   Stufe 1: ein Kreis (4 Aufgaben), danach je 5 Aufgaben mit 2 … 10 Kreisen.
   Pro Aufgabe 5 Sekunden, Startpunkte = 10 × Kreisanzahl, gleichmäßig herunterzählend. */
(() => {
  'use strict';

  // ---------- Konstanten ----------
  const TOTAL_MS = 5000;
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
    scrStart: $('scrStart'), scrLevel: $('scrLevel'), scrPause: $('scrPause'), scrEnd: $('scrEnd'),
    bestStart: $('bestStart'), levelDots: $('levelDots'), levelTitle: $('levelTitle'), levelText: $('levelText'),
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
  const MAX_SCORE = PLAN.reduce((s, p) => s + p.n * 10, 0);
  const LEVEL_MAX = Array.from({ length: MAX_CIRCLES }, (_, i) => PLAN.filter((p) => p.n === i + 1).length * (i + 1) * 10);

  // ---------- Geometrie ----------
  function scaleFactor(W, H) { return clamp(Math.min(W, H) / 780, 0.55, 1.35); }

  function diameterFor(task, s) {
    const { n, t } = task;
    let a, b;
    if (n === 1) { a = 150; b = 64; }
    else if (n <= 3) { a = 140; b = 78; }
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
    return lerp(d + 14 * s, max, task.t);
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
        const g = placeGroup(m, bounds[gi], D, minSep, 440 * s) || gridFallback(m, bounds[gi], d);
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
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.7;
        const comp = ctx.createDynamicsCompressor();
        // leichtes Echo für einen weicheren Klang
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.13;
        const fb = ctx.createGain(); fb.gain.value = 0.22;
        const wet = ctx.createGain(); wet.gain.value = 0.3;
        master.connect(comp);
        master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);
        comp.connect(ctx.destination);
        this.ctx = ctx; this.out = master;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted(m) {
      this.muted = m;
      store.set(STORE_MUTED, m ? '1' : '0');
      if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
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
    [ui.scrStart, ui.scrLevel, ui.scrPause, ui.scrEnd].forEach((s) => { s.hidden = s !== screen; });
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
    setCountdownIdle('10');
    later(startTask, 650);
  }

  function startTask() {
    clearTimers();
    task = PLAN[idx];
    geo = layoutTask(task);
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
    ui.taskNo.textContent = (idx + 1) + ' / ' + PLAN.length;
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
    later(nextTask, 750);
  }

  function nextTask() {
    idx++;
    if (idx >= PLAN.length) { endGame(); return; }
    if (PLAN[idx].n !== PLAN[idx - 1].n) showLevelIntro(PLAN[idx].n);
    else startTask();
  }

  function showLevelIntro(n) {
    phase = 'intro';
    circlesEl.innerHTML = '';
    circles = [];
    setCountdownIdle(String(n * 10));
    ui.timefill.style.transform = 'scaleX(0)';
    ui.levelDots.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.style.color = 'hsl(' + hueFor(i, n) + ' 90% 62%)';
      s.style.animationDelay = (i * 50) + 'ms';
      ui.levelDots.appendChild(s);
    }
    ui.levelTitle.textContent = n + ' Kreise';
    let text;
    if (n === 2) text = 'Ab jetzt gilt: alle Kreise gleichzeitig berühren – und sonst nichts. Pro Aufgabe gibt es bis zu 20 Punkte.';
    else if (n === 4) text = '4 Kreise, bis zu 40 Punkte. Falls das iPad jetzt Gesten auslöst: Multitasking-Gesten in den Einstellungen ausschalten.';
    else if (n === 6) text = 'Nimm beide Hände! 6 Kreise, bis zu 60 Punkte.';
    else if (n === 10) text = 'Alle zehn Finger! Bis zu 100 Punkte pro Aufgabe.';
    else text = n + ' Kreise gleichzeitig, bis zu ' + (n * 10) + ' Punkte pro Aufgabe.';
    ui.levelText.textContent = text;
    show(ui.scrLevel);
    Sound.levelUp();
  }

  function endGame() {
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
    ui.endSub.textContent = 'von ' + MAX_SCORE + ' möglichen Punkten';
    if (score > best) {
      store.set(STORE_BEST, score);
      ui.endKicker.textContent = 'Neuer Rekord!';
      ui.endBest.textContent = best > 0 ? 'Bisheriger Rekord: ' + best : '';
    } else {
      ui.endKicker.textContent = 'Geschafft!';
      ui.endBest.textContent = 'Rekord: ' + best;
    }
    ui.levelStats.innerHTML = '';
    levelScore.forEach((v, i) => {
      const pct = Math.round((v / LEVEL_MAX[i]) * 100);
      const cell = document.createElement('div');
      cell.className = 'lv';
      cell.innerHTML = '<span class="lv-n">' + (i + 1) + (i === 0 ? ' Kreis' : ' Kreise') + '</span>' +
        '<span class="lv-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="lv-p">' + v + '</span>';
      ui.levelStats.appendChild(cell);
    });
    show(ui.scrEnd);
    Sound.fanfare();
  }

  function pauseGame() {
    if (state !== 'playing' || phase === 'paused' || phase === 'intro') return;
    clearTimers();
    phase = 'paused';
    circlesEl.innerHTML = '';
    circles = [];
    setCountdownIdle('II');
    ui.timefill.style.transform = 'scaleX(0)';
    show(ui.scrPause);
  }

  function resumeGame() {
    Sound.init();
    show(null);
    phase = 'between';
    later(startTask, 400);
  }

  function quitGame() {
    clearTimers();
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
        else { badTouch(p.x, p.y); Sound.bad(); }
      }
    }
    if (evaluate(current)) success(performance.now());
  }

  function onTouch(e) {
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
  $('btnLevelGo').addEventListener('click', () => {
    Sound.init();
    show(null);
    phase = 'between';
    later(startTask, 350);
  });
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
  window.__ten = { PLAN, MAX_SCORE, layoutTask, placeGroup, jump(i) { Sound.init(); state = 'playing'; idx = i; show(null); ui.btnPause.hidden = false; startTask(); } };
})();
