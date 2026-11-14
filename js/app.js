'use strict';
/* Interfaz, bucles, MIDI y guardado. */
const $ = (s, el = document) => el.querySelector(s);
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COLORS = ['#ff5d5d', '#ffb238', '#3ddc84', '#3fa9ff', '#b86bff', '#ff6fb5', '#2fd6c9', '#f4e04d'];
const PADS = [
  { name: 'Bombo', icon: '🥁' }, { name: 'Caja', icon: '🪘' }, { name: 'Chis', icon: '🎩' }, { name: 'Chisss', icon: '✨' },
  { name: 'Palmas', icon: '👏' }, { name: 'Tom', icon: '🛢️' }, { name: 'Vaca', icon: '🐮' }, { name: 'Plato', icon: '💥' }
];
const KNOBS = [
  { name: 'Volumen', icon: '🔊', def: 100 }, { name: 'Filtro', icon: '🌊', def: 127 },
  { name: 'Eco', icon: '🏔️', def: 0 }, { name: 'Cueva', icon: '🦇', def: 15 },
  { name: 'Monstruo', icon: '👹', def: 0 }, { name: 'Tono', icon: '🎈', def: 64 },
  { name: 'Temblor', icon: '〰️', def: 0 }, { name: 'Cola', icon: '🦎', def: 40 }
];
const INSTRUMENTS = [
  { id: 'drums', name: 'Batería', icon: '🥁', type: 'drums' },
  { id: 'mic', name: 'Mi voz', icon: '🎤', type: 'mic' },
  { id: 'sinte', name: 'Sinte', icon: '🚀', type: 'synth', preset: { oscs: [{ type: 'sawtooth', det: -8 }, { type: 'sawtooth', det: 8 }], gain: 0.16, attack: 0.01 } },
  { id: 'robot', name: 'Robot', icon: '🤖', type: 'synth', preset: { oscs: [{ type: 'square' }], gain: 0.26, attack: 0.005 } },
  { id: 'alien', name: 'Marciano', icon: '👽', type: 'synth', preset: { oscs: [{ type: 'sine' }, { type: 'sine', ratio: 2, gain: 0.25 }], gain: 0.4, attack: 0.03, glide: 2 } },
  { id: 'bass', name: 'Bajo gordo', icon: '🐘', type: 'synth', preset: { oscs: [{ type: 'triangle' }, { type: 'square', gain: 0.3 }], gain: 0.42, attack: 0.008, oct: -1 } },
  { id: 'game', name: 'Consola', icon: '👾', type: 'synth', preset: { oscs: [{ type: 'square' }, { type: 'square', ratio: 2, gain: 0.4, det: 6 }], gain: 0.2, attack: 0.002 } },
  { id: 'piano', name: 'Piano', icon: '🎹', type: 'sf', sf: 'acoustic_grand_piano' },
  { id: 'guitar', name: 'Guitarra', icon: '🎸', type: 'sf', sf: 'acoustic_guitar_nylon' },
  { id: 'eguitar', name: 'Guitarra rock', icon: '⚡', type: 'sf', sf: 'overdriven_guitar', gain: 0.7 },
  { id: 'ebass', name: 'Bajo', icon: '🎚️', type: 'sf', sf: 'electric_bass_finger' },
  { id: 'violin', name: 'Violín', icon: '🎻', type: 'sf', sf: 'violin' },
  { id: 'strings', name: 'Orquesta', icon: '🎼', type: 'sf', sf: 'string_ensemble_1' },
  { id: 'trumpet', name: 'Trompeta', icon: '🎺', type: 'sf', sf: 'trumpet' },
  { id: 'sax', name: 'Saxo', icon: '🎷', type: 'sf', sf: 'alto_sax' },
  { id: 'flute', name: 'Flauta', icon: '🎶', type: 'sf', sf: 'flute' },
  { id: 'xylo', name: 'Xilófono', icon: '🌈', type: 'sf', sf: 'xylophone' },
  { id: 'accordion', name: 'Acordeón', icon: '🪗', type: 'sf', sf: 'accordion' },
  { id: 'choir', name: 'Coro', icon: '😮', type: 'sf', sf: 'choir_aahs' },
  { id: 'organ', name: 'Órgano', icon: '⛪', type: 'sf', sf: 'church_organ' },
  { id: 'steel', name: 'Caribe', icon: '🏝️', type: 'sf', sf: 'steel_drums' },
  { id: 'musicbox', name: 'Cajita', icon: '🎁', type: 'sf', sf: 'music_box' },
  { id: 'kalimba', name: 'Kalimba', icon: '🪵', type: 'sf', sf: 'kalimba' },
  { id: 'whistle', name: 'Silbido', icon: '😗', type: 'sf', sf: 'whistle' }
];
const INST = Object.fromEntries(INSTRUMENTS.map(i => [i.id, i]));
const PIANO_LO = 48, PIANO_HI = 72;
const MAX_TRACKS = 8;

/* ---------- Estado ---------- */
const state = { bpm: 100, bars: 2, quant: 0.5, metro: true, sel: 0, tracks: [] };
const T = { playing: false, rec: false, anchorBeat: 0, anchorTime: 0, schedBeat: 0, timer: null, take: 0, takes: [] };
let seq = 1;

function newTrack(inst) {
  return { id: seq++, inst, knobs: KNOBS.map(k => k.def), muted: false, events: [], mic: null, rt: null, chain: null, loading: false, el: null, canvas: null };
}
const cur = () => state.tracks[state.sel];
const loopBeats = () => state.bars * 4;

/* ---------- Guardado (IndexedDB) ---------- */
const DB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('daw-infantil', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
};
let saveTimer = 0;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    DB.set('song', {
      bpm: state.bpm, bars: state.bars, quant: state.quant, metro: state.metro, sel: state.sel,
      tracks: state.tracks.map(t => ({
        inst: t.inst, knobs: t.knobs, muted: t.muted, mic: t.mic,
        events: t.events.map(({ k, n, i, v, p, d }) => ({ k, n, i, v, p, d }))
      }))
    }).catch(() => {});
  }, 500);
}

/* ---------- Instrumentos ---------- */
async function setInstrument(tr, id) {
  const def = INST[id] || INST.sinte;
  const tok = tr.tok = (tr.tok || 0) + 1;
  if (def.type === 'sf') {
    tr.inst = def.id; tr.loading = true; renderTracks(); renderPanel();
    if (!tr.rt) tr.rt = { type: 'synth', preset: INST.sinte.preset };
    try {
      const samples = await Engine.loadSoundfont(def.sf);
      if (tr.tok !== tok) return;
      tr.rt = { type: 'sample', samples, gain: (def.gain || 1) * 6.5 };
    } catch (e) {
      if (tr.tok !== tok) return;
      toast('😢 Sin internet no puedo bajar ' + def.name);
      tr.inst = 'sinte'; tr.rt = { type: 'synth', preset: INST.sinte.preset };
    }
    tr.loading = false;
  } else if (def.type === 'mic') {
    tr.inst = 'mic'; tr.loading = false;
    tr.rt = { type: 'sample', samples: tr.mic ? [{ root: 60, buffer: Engine.bufferFromData(tr.mic) }] : [] };
  } else {
    tr.inst = def.id; tr.loading = false;
    tr.rt = { type: def.type, preset: def.preset };
  }
  renderTracks(); renderPanel(); saveSoon();
}

/* ---------- Transporte y bucle ---------- */
const beatAt = t => T.anchorBeat + (t - T.anchorTime) * state.bpm / 60;
const timeAt = b => T.anchorTime + (b - T.anchorBeat) * 60 / state.bpm;

function start(countIn) {
  const ctx = Engine.ctx; ctx.resume();
  T.anchorTime = ctx.currentTime + 0.08;
  T.anchorBeat = countIn ? -4 : 0;
  T.schedBeat = T.anchorBeat;
  T.playing = true;
  T.timer = setInterval(tick, 25); tick();
  renderTop();
}
function stop() {
  clearInterval(T.timer);
  T.playing = false; T.rec = false;
  for (const tr of state.tracks) Engine.stopAll(tr.chain);
  for (const h of held.values()) h.recEv = null;
  renderTop();
}
function tick() {
  const ctx = Engine.ctx, until = beatAt(ctx.currentTime + 0.12);
  if (until <= T.schedBeat) return;
  schedule(T.schedBeat, until);
  T.schedBeat = until;
}
function schedule(from, to) {
  const now = Engine.ctx.currentTime, L = loopBeats(), spb = 60 / state.bpm;
  for (let b = Math.ceil(from); b < to; b++) {
    if (state.metro || b < 0) { const t = timeAt(b); if (t > now - 0.05) Engine.click(t, mod(b, 4) === 0); }
  }
  if (to <= 0) return;
  for (const tr of state.tracks) {
    for (const ev of tr.events) {
      if (ev.p >= L) continue;
      let k = Math.max(0, Math.ceil((from - ev.p) / L));
      for (; ev.p + k * L < to; k++) {
        const t = timeAt(ev.p + k * L);
        if (t < now - 0.05 || (ev.skip && t < ev.skip)) continue;
        if (ev.k === 'p') Engine.drum(tr.chain, ev.i, t, ev.v);
        else Engine.note(tr.chain, tr.rt, ev.n, ev.v, t, ev.d * spb);
      }
    }
  }
}
function setTempo(bpm) {
  bpm = clamp(bpm, 50, 200);
  if (T.playing) { const now = Engine.ctx.currentTime, b = beatAt(now); T.anchorBeat = b; T.anchorTime = now; }
  state.bpm = bpm; Engine.setTempo(bpm); renderTop(); saveSoon();
}
function newTake() { T.take++; T.takes.push({ tid: cur().id, take: T.take }); }
function toggleRec() {
  if (!T.playing) { T.rec = true; newTake(); start(true); return; }
  T.rec = !T.rec;
  if (T.rec) newTake();
  renderTop();
}
function undo() {
  while (T.takes.length) {
    const tk = T.takes.pop(), tr = state.tracks.find(t => t.id === tk.tid);
    if (!tr) continue;
    const n = tr.events.length;
    tr.events = tr.events.filter(e => e.t !== tk.take);
    if (tr.events.length !== n) { Engine.stopAll(tr.chain); drawLane(tr); saveSoon(); if (T.rec) newTake(); return; }
  }
  toast('No hay nada que deshacer');
}

// Graba un evento en la pista elegida, en la posición actual del bucle
function recordEvent(ev) {
  if (!T.rec || !T.playing) return null;
  const b = beatAt(Engine.ctx.currentTime - Engine.latency());
  if (b < -0.4) return null;
  const q = state.quant, L = loopBeats();
  let qb = q ? Math.round(b / q) * q : b;
  if (qb < 0) qb = 0;
  ev.p = mod(qb, L); ev.t = T.take; ev.start = b;
  ev.skip = timeAt(Math.max(qb, b)) + Engine.latency() + 0.06; // ya ha sonado en directo
  const tr = cur();
  tr.events.push(ev); drawLane(tr); saveSoon();
  return ev;
}

/* ---------- Tocar en directo ---------- */
const held = new Map();
function noteOn(midi, vel) {
  if (!Engine.ctx) return;
  if (held.has(midi)) noteOff(midi); // nota atascada: se vuelve a tocar
  const tr = cur();
  if (tr.rt && tr.rt.type === 'drums') { padOn(mod(midi - 36, 8), vel); return; }
  if (tr.inst === 'mic' && !tr.mic) { openMic(tr); return; }
  const voice = Engine.note(tr.chain, tr.rt, midi, vel, 0, null);
  const recEv = recordEvent({ k: 'n', n: midi, v: vel, d: 0.25 });
  held.set(midi, { voice, recEv, tr });
  keyLight(midi, true);
}
function noteOff(midi) {
  const h = held.get(midi);
  if (!h) return;
  held.delete(midi); keyLight(midi, false);
  h.voice.stop(0);
  if (h.recEv && T.playing) {
    const b = beatAt(Engine.ctx.currentTime - Engine.latency());
    h.recEv.d = clamp(b - h.recEv.start, 0.12, loopBeats());
    drawLane(h.tr); saveSoon();
  }
}
function padOn(i, vel) {
  if (!Engine.ctx) return;
  Engine.drum(cur().chain, i, 0, vel);
  recordEvent({ k: 'p', i, v: vel });
  const el = padEls[i];
  el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 90);
}
function allOff() { for (const m of [...held.keys()]) noteOff(m); }

// Roscas físicas: no mandan hasta pasar por el valor de la pantalla (evita saltos al cambiar de pista)
const hw = { last: Array(8).fill(null), on: Array(8).fill(false) };
function hwKnob(i, v) {
  const tr = cur(), c = tr.knobs[i], prev = hw.last[i];
  hw.last[i] = v;
  if (!hw.on[i] && (Math.abs(v - c) <= 8 || (prev != null && (prev - c) * (v - c) <= 0))) hw.on[i] = true;
  if (hw.on[i]) setKnob(tr, i, v, true);
  ghost(i, hw.on[i] ? null : v);
}
function ghost(i, v) {
  knobEls[i].classList.toggle('ghost', v != null);
  if (v != null) knobEls[i].style.setProperty('--g', v / 127);
}
function resetKnobs() {
  KNOBS.forEach((k, i) => setKnob(cur(), i, k.def));
  toast('🧽 Efectos quitados');
}
function setKnob(tr, i, v, fromHw) {
  v = clamp(Math.round(v), 0, 127);
  if (!fromHw && tr === cur()) { hw.on[i] = false; ghost(i, null); }
  tr.knobs[i] = v; Engine.setKnob(tr.chain, i, v);
  if (tr === cur()) knobEls[i].style.setProperty('--v', v / 127);
  saveSoon();
}
function selectTrack(i) {
  if (i === state.sel) return;
  allOff(); state.sel = i;
  hw.on.fill(false); knobEls.forEach((el, k) => ghost(k, null));
  if (T.rec) newTake();
  renderTracks(); renderPanel(); saveSoon();
}

/* ---------- Dibujo ---------- */
const padEls = [], knobEls = [], keyEls = {};

function renderTop() {
  $('#bPlay').textContent = T.playing ? '⏹' : '▶';
  $('#app').classList.toggle('rec', T.rec);
  $('#tempo').textContent = state.bpm;
  $('#bMetro').classList.toggle('on', state.metro);
  $('#bQuant').classList.toggle('on', state.quant > 0);
  $('#quantLbl').textContent = state.quant === 0.5 ? 'Imán' : state.quant === 0.25 ? 'Imán fino' : 'Libre';
  for (const b of $('#bars').children) b.classList.toggle('on', +b.dataset.n === state.bars);
}

function renderTracks() {
  const box = $('#tracks');
  box.innerHTML = '';
  state.tracks.forEach((tr, i) => {
    const def = INST[tr.inst], el = document.createElement('div');
    el.className = 'track' + (i === state.sel ? ' sel' : '');
    el.style.setProperty('--c', COLORS[i % 8]);
    el.innerHTML = `<div class="t-inst"><i>${tr.loading ? '⏳' : def.icon}</i>${def.name}</div>
      <div class="t-lane"><canvas></canvas><div class="ph"></div></div>
      <button class="t-btn mute ${tr.muted ? 'off' : ''}" title="Silenciar">${tr.muted ? '🔇' : '🔊'}</button>
      <button class="t-btn clear" title="Borrar pista">🧹</button>`;
    el.onclick = () => selectTrack(i);
    $('.mute', el).onclick = e => {
      e.stopPropagation(); tr.muted = !tr.muted; Engine.setMute(tr.chain, tr.muted); renderTracks(); saveSoon();
    };
    $('.clear', el).onclick = e => {
      e.stopPropagation(); tr.events = []; Engine.stopAll(tr.chain); drawLane(tr); saveSoon();
    };
    tr.el = el; tr.canvas = $('canvas', el);
    box.appendChild(el);
  });
  if (state.tracks.length < MAX_TRACKS) {
    const add = document.createElement('button');
    add.id = 'bAdd'; add.textContent = '➕ Pista'; add.onclick = addTrack;
    box.appendChild(add);
  }
  state.tracks.forEach(drawLane);
}

function drawLane(tr) {
  const cv = tr.canvas;
  if (!cv || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const L = loopBeats(), color = COLORS[state.tracks.indexOf(tr) % 8];
  for (let b = 0; b < L; b++) {
    g.fillStyle = Math.floor(b / 4) % 2 ? '#171a26' : '#12141d';
    g.fillRect(b / L * w, 0, w / L + 1, h);
    g.fillStyle = b % 4 === 0 ? '#ffffff40' : '#ffffff14';
    g.fillRect(b / L * w, 0, b % 4 === 0 ? 2 : 1, h);
  }
  const notes = tr.events.filter(e => e.k === 'n' && e.p < L);
  let lo = 127, hi = 0;
  for (const e of notes) { lo = Math.min(lo, e.n); hi = Math.max(hi, e.n); }
  if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
  const nh = clamp(h / 10, 5, 12);
  g.fillStyle = color;
  for (const e of notes) {
    const x = e.p / L * w, y = (h - nh - 4) * (1 - (e.n - lo) / (hi - lo)) + 2;
    g.beginPath(); g.roundRect(x, y, Math.max(6, e.d / L * w - 2), nh, 4); g.fill();
  }
  for (const e of tr.events) {
    if (e.k !== 'p' || e.p >= L) continue;
    g.fillStyle = COLORS[e.i];
    g.beginPath(); g.arc(e.p / L * w + 6, h - (e.i + 0.5) / 8 * h, clamp(h / 14, 4, 7), 0, 7); g.fill();
  }
}

function renderPanel() {
  const tr = cur(), def = INST[tr.inst], color = COLORS[state.sel % 8];
  $('#panel').style.setProperty('--c', color);
  $('#piano').style.setProperty('--c', color);
  $('#instCard').innerHTML = `<i>${tr.loading ? '⏳' : def.icon}</i>${def.name}<small>${tr.loading ? 'bajando…' : 'toca para cambiar'}</small>`;
  knobEls.forEach((el, i) => el.style.setProperty('--v', tr.knobs[i] / 127));
}

function buildStatic() {
  // compases
  for (const n of [1, 2, 4, 8]) {
    const b = document.createElement('button');
    b.className = 'btn'; b.dataset.n = n; b.innerHTML = `<b>${n}</b>`;
    b.onclick = () => { state.bars = n; renderTop(); state.tracks.forEach(drawLane); saveSoon(); };
    $('#bars').appendChild(b);
  }
  // pads: fila de arriba 5-8, abajo 1-4 (como el LPD8)
  for (const i of [4, 5, 6, 7, 0, 1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'pad'; b.style.setProperty('--pc', COLORS[i]);
    b.innerHTML = `<i>${PADS[i].icon}</i>${PADS[i].name}`;
    b.onpointerdown = e => { e.preventDefault(); padOn(i, 110); };
    padEls[i] = b; $('#pads').appendChild(b);
  }
  // roscas
  KNOBS.forEach((k, i) => {
    const el = document.createElement('div');
    el.className = 'knob';
    el.innerHTML = `<div class="dial"><u></u><b></b><span>${k.icon}</span></div><label>${k.name}</label>`;
    let y0 = 0, v0 = 0, drag = false;
    el.onpointerdown = e => { drag = true; y0 = e.clientY; v0 = cur().knobs[i]; el.setPointerCapture(e.pointerId); };
    el.onpointermove = e => { if (drag) setKnob(cur(), i, v0 + (y0 - e.clientY) * 0.9); };
    el.onpointerup = el.onpointercancel = () => { drag = false; };
    el.ondblclick = () => setKnob(cur(), i, k.def);
    el.onwheel = e => { e.preventDefault(); setKnob(cur(), i, cur().knobs[i] - Math.sign(e.deltaY) * 4); };
    knobEls[i] = el; $('#knobs').appendChild(el);
  });
  const fx = document.createElement('button');
  fx.id = 'bFx'; fx.textContent = '🧽'; fx.title = 'Quitar efectos de esta pista'; fx.onclick = resetKnobs;
  $('#knobs').appendChild(fx);
  // piano
  const piano = $('#piano'), blacks = [1, 3, 6, 8, 10], whites = [];
  for (let m = PIANO_LO; m <= PIANO_HI; m++) if (!blacks.includes(m % 12)) whites.push(m);
  const bindKey = (el, m) => {
    el.onpointerdown = e => { e.preventDefault(); el.setPointerCapture(e.pointerId); noteOn(m, 100); };
    el.onpointerup = el.onpointercancel = () => noteOff(m);
    keyEls[m] = el;
  };
  whites.forEach(m => { const el = document.createElement('div'); el.className = 'wk'; bindKey(el, m); piano.appendChild(el); });
  for (let m = PIANO_LO; m <= PIANO_HI; m++) {
    if (!blacks.includes(m % 12)) continue;
    const el = document.createElement('div'); el.className = 'bk';
    const wi = whites.indexOf(m - 1) + 1, ww = 100 / whites.length;
    el.style.left = (wi * ww - ww * 0.3) + '%'; el.style.width = (ww * 0.6) + '%';
    bindKey(el, m); piano.appendChild(el);
  }

  $('#bPlay').onclick = () => (T.playing ? stop() : start(false));
  $('#bRec').onclick = toggleRec;
  $('#bUndo').onclick = undo;
  $('#bSlow').onclick = () => setTempo(state.bpm - 5);
  $('#bFast').onclick = () => setTempo(state.bpm + 5);
  $('#bMetro').onclick = () => { state.metro = !state.metro; renderTop(); saveSoon(); };
  $('#bQuant').onclick = () => { state.quant = state.quant === 0.5 ? 0.25 : state.quant === 0.25 ? 0 : 0.5; renderTop(); saveSoon(); };
  $('#bNew').onclick = openNew;
  $('#bSet').onclick = openSettings;
  $('#instCard').onclick = openPicker;
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  new ResizeObserver(() => state.tracks.forEach(drawLane)).observe($('#tracks'));
  window.addEventListener('blur', allOff);
}

function keyLight(m, on) { if (keyEls[m]) keyEls[m].classList.toggle('on', on); }

function frame() {
  requestAnimationFrame(frame);
  if (!Engine.ctx) return;
  const ci = $('#countIn');
  if (T.playing) {
    const b = beatAt(Engine.ctx.currentTime - Engine.latency());
    $('#tracks').style.setProperty('--ph', b < 0 ? 0 : mod(b, loopBeats()) / loopBeats());
    if (b < 0) { ci.hidden = false; ci.textContent = Math.min(4, Math.ceil(-b)); } else ci.hidden = true;
  } else ci.hidden = true;
}

function addTrack() {
  if (state.tracks.length >= MAX_TRACKS) return;
  const tr = newTrack('sinte');
  tr.chain = Engine.createChain();
  tr.knobs.forEach((v, i) => Engine.setKnob(tr.chain, i, v));
  state.tracks.push(tr);
  setInstrument(tr, 'sinte');
  selectTrack(state.tracks.length - 1);
  openPicker();
}

/* ---------- Ventanas ---------- */
let toastTimer = 0, onModalClose = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function openModal(html) { closeModal(); $('#modalBox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() {
  $('#modal').hidden = true;
  if (onModalClose) { const f = onModalClose; onModalClose = null; f(); }
}

function openPicker() {
  const tr = cur();
  openModal(`<h2>Elige instrumento</h2><div class="tiles" style="--c:${COLORS[state.sel % 8]}">` +
    INSTRUMENTS.map(d => `<button class="tile ${d.id === tr.inst ? 'cur' : ''}" data-id="${d.id}"><i>${d.icon}</i>${d.name}${d.type === 'sf' ? '<em>☁️</em>' : ''}</button>`).join('') +
    `</div><p class="hint">☁️ = se baja de internet la primera vez.</p>`);
  for (const b of $('#modalBox').querySelectorAll('.tile')) {
    b.onclick = () => {
      closeModal(); allOff();
      if (b.dataset.id === 'mic') { setInstrument(tr, 'mic'); openMic(tr); } else setInstrument(tr, b.dataset.id);
    };
  }
}

function openMic(tr) {
  openModal(`<div class="center"><h2>🎤 Graba tu sonido</h2>
    <button class="micBig" id="micBtn">🎤</button>
    <div id="micLevel"><i></i></div>
    <canvas id="micWave" width="840" height="180"></canvas>
    <div id="micMsg" class="pill">Pulsa el botón rojo y haz un sonido</div>
    <div class="row"><button class="pill" id="micPlay">▶ Probar</button><button class="pill go" id="micOk">✅ Listo</button></div></div>`);
  let rec = null;
  const btn = $('#micBtn'), msg = $('#micMsg');
  const wave = () => {
    const cv = $('#micWave'); if (!cv) return;
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    if (!tr.mic) return;
    const d = tr.mic.data, step = Math.max(1, Math.floor(d.length / cv.width));
    g.fillStyle = COLORS[state.tracks.indexOf(tr) % 8];
    for (let x = 0; x < cv.width; x++) {
      let p = 0;
      for (let j = 0; j < step; j++) p = Math.max(p, Math.abs(d[x * step + j] || 0));
      g.fillRect(x, cv.height / 2 - p * cv.height / 2, 1, Math.max(2, p * cv.height));
    }
  };
  const play = () => { if (tr.mic) Engine.note(tr.chain, tr.rt, 60, 110, 0, 4); };
  wave();
  btn.onclick = async () => {
    if (rec) { rec.stop(); return; }
    try {
      rec = await Engine.recordMic(3, p => { const l = $('#micLevel i'); if (l) l.style.width = Math.min(100, p * 140) + '%'; });
    } catch (e) { msg.textContent = '😢 No puedo usar el micrófono (permiso)'; return; }
    btn.classList.add('recording'); btn.textContent = '⏹'; msg.textContent = '¡Grabando! Pulsa otra vez para parar';
    try {
      tr.mic = await rec.done;
      await setInstrument(tr, 'mic');
      msg.textContent = '¡Genial! Ahora tócalo en el teclado'; wave(); play();
    } catch (e) { msg.textContent = '🤔 No he oído nada, prueba otra vez'; }
    rec = null;
    if (btn.isConnected) { btn.classList.remove('recording'); btn.textContent = '🎤'; }
  };
  $('#micPlay').onclick = play;
  $('#micOk').onclick = closeModal;
  onModalClose = () => { if (rec) rec.stop(); };
}

function openNew() {
  openModal(`<div class="center"><h2>¿Empezar una canción nueva?</h2><p class="hint">Se borra todo lo grabado.</p>
    <div class="row"><button class="pill danger" id="nYes">🗑️ Sí, borrar todo</button><button class="pill go" id="nNo">No</button></div></div>`);
  $('#nNo').onclick = closeModal;
  $('#nYes').onclick = () => {
    closeModal(); if (T.playing) stop();
    for (const tr of state.tracks) { tr.events = []; }
    T.takes = []; state.tracks.forEach(drawLane); saveSoon();
  };
}

/* ---------- MIDI ---------- */
const M = Object.assign({ roles: {}, ccMap: {}, padMap: {} }, JSON.parse(localStorage.getItem('daw-midi') || '{}'));
const saveM = () => localStorage.setItem('daw-midi', JSON.stringify(M));
let midi = null, learn = null;
const padNotes = new Set();

function initMidi() {
  if (!navigator.requestMIDIAccess) { midiStatus(); return; }
  navigator.requestMIDIAccess().then(acc => {
    midi = acc;
    const hook = () => { for (const inp of midi.inputs.values()) inp.onmidimessage = onMidi; midiStatus(); };
    midi.onstatechange = hook; hook();
  }).catch(() => midiStatus());
}
function midiStatus() {
  const el = $('#midiStatus');
  if (!navigator.requestMIDIAccess) { el.textContent = '🔌 Usa Chrome o Edge'; return; }
  const names = midi ? [...midi.inputs.values()].filter(i => i.state === 'connected').map(i => i.name) : [];
  el.classList.toggle('ok', names.length > 0);
  el.textContent = names.length ? '🎹 ' + names.length + ' conectado' + (names.length > 1 ? 's' : '') : '🔌 Enchufa el teclado';
  el.title = names.join('\n') || 'Sin teclados MIDI';
}

function padIndexFor(name, ch, key, num) {
  const full = name + '|' + key;
  if (learn && learn.type === 'pad') { learnFeed(full); return -1; }
  if (full in M.padMap) return M.padMap[full];
  if (Object.keys(M.padMap).some(k => k.startsWith(name + '|'))) return null; // aparato ya enseñado: lo demás son teclas
  const role = M.roles[name] || 'auto';
  const isPad = role === 'pads' || (role === 'auto' && (/LPD|MPD|pad/i.test(name) || ch === 9));
  return isPad ? mod(num - 36, 8) : null;
}

function onMidi(e) {
  const [st, d1, d2] = e.data, cmd = st & 0xf0, ch = st & 0x0f, name = e.target.name || '?';
  if (cmd === 0x90 && d2 > 0) {
    const p = padIndexFor(name, ch, d1, d1);
    if (p === null) noteOn(d1, d2);
    else { padNotes.add(name + d1); if (p >= 0) padOn(p, d2); }
  } else if (cmd === 0x80 || cmd === 0x90) {
    if (!padNotes.has(name + d1)) noteOff(d1);
  } else if (cmd === 0xC0) { // pads en modo "Prog Chng"
    const p = padIndexFor(name, ch, 'pc' + d1, d1 + 36);
    if (p !== null && p >= 0) padOn(p, 110);
  } else if (cmd === 0xB0) {
    if (learn) { if (learn.type === 'knob') learnFeed(String(d1)); return; }
    let i = M.ccMap[d1];
    if (i == null) {
      if (d1 >= 70 && d1 <= 77) i = d1 - 70;
      else if (d1 >= 1 && d1 <= 8 && /LPD/i.test(name)) i = d1 - 1;
    }
    if (i != null) hwKnob(i, d2);
  }
}

function startLearn(type) {
  closeModal();
  learn = { type, idx: 0, seen: new Set() };
  if (type === 'knob') M.ccMap = {}; else M.padMap = {};
  showLearn();
}
function learnFeed(key) {
  if (learn.seen.has(key)) return;
  learn.seen.add(key);
  (learn.type === 'knob' ? M.ccMap : M.padMap)[key] = learn.idx++;
  if (learn.idx >= 8) { learn = null; saveM(); toast('✅ ¡Aprendido!'); }
  showLearn();
}
function showLearn() {
  [...padEls, ...knobEls].forEach(el => el.classList.remove('learnTarget'));
  const bar = $('#learnBar');
  if (!learn) { bar.hidden = true; return; }
  const knob = learn.type === 'knob';
  (knob ? knobEls : padEls)[learn.idx].classList.add('learnTarget');
  bar.hidden = false;
  bar.innerHTML = `<span>${knob ? '🎛️ Mueve la rosca' : '🟦 Toca el pad'} ${learn.idx + 1} de 8</span><button>Cancelar</button>`;
  $('button', bar).onclick = () => { learn = null; saveM(); showLearn(); };
}

function openSettings() {
  const inputs = midi ? [...midi.inputs.values()] : [];
  openModal(`<h2>⚙️ Ajustes (para mayores)</h2>
    <h3>Aparatos MIDI</h3>
    ${inputs.length ? inputs.map((inp, i) => `<div class="row"><span class="pill">${inp.name}</span>
      <select data-i="${i}"><option value="auto">Automático</option><option value="keys">Teclas</option><option value="pads">Pads</option></select></div>`).join('')
      : '<p class="hint">No veo ningún aparato. Enchúfalo por USB y cierra otros programas de música que lo estén usando.</p>'}
    <h3>Enseñar los controles</h3>
    <div class="row"><button class="pill" id="lKnob">🎛️ Enseñar roscas</button><button class="pill" id="lPad">🟦 Enseñar pads</button><button class="pill" id="lReset">♻️ Olvidar</button></div>
    <p class="hint">Si las roscas o los pads no hacen lo que deben, pulsa «Enseñar» y mueve cada uno en orden (1 a 8). Los pads deben estar en modo PAD (notas).</p>
    <h3>Sin teclado</h3>
    <p class="hint">Teclas del ordenador: A W S E D F T G Y H U J K = notas · 1-8 = pads · Espacio = tocar/parar · R = grabar · Retroceso = deshacer.</p>
    <div class="row"><button class="pill go" id="sOk">Cerrar</button></div>`);
  for (const s of $('#modalBox').querySelectorAll('select')) {
    const name = inputs[+s.dataset.i].name;
    s.value = M.roles[name] || 'auto';
    s.onchange = () => { M.roles[name] = s.value; saveM(); };
  }
  $('#lKnob').onclick = () => startLearn('knob');
  $('#lPad').onclick = () => startLearn('pad');
  $('#lReset').onclick = () => { M.ccMap = {}; M.padMap = {}; saveM(); toast('♻️ Olvidado'); };
  $('#sOk').onclick = closeModal;
}

/* ---------- Teclado del ordenador ---------- */
const PC_KEYS = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 };
window.addEventListener('keydown', e => {
  if (!Engine.ctx || e.repeat || e.ctrlKey || e.altKey || e.metaKey || !$('#modal').hidden) return;
  if (e.code in PC_KEYS) noteOn(PC_KEYS[e.code], 100);
  else if (/^Digit[1-8]$/.test(e.code)) padOn(+e.code.slice(5) - 1, 110);
  else if (e.code === 'Space') { e.preventDefault(); T.playing ? stop() : start(false); }
  else if (e.code === 'KeyR') toggleRec();
  else if (e.code === 'Backspace') undo();
});
window.addEventListener('keyup', e => { if (e.code in PC_KEYS) noteOff(PC_KEYS[e.code]); });

/* ---------- Arranque ---------- */
async function boot() {
  $('#start').hidden = true;
  Engine.init(); Engine.ctx.resume();
  let saved = null;
  try { saved = await DB.get('song'); } catch (e) {}
  if (saved && saved.tracks && saved.tracks.length) {
    Object.assign(state, { bpm: saved.bpm, bars: saved.bars, quant: saved.quant, metro: saved.metro, sel: clamp(saved.sel || 0, 0, saved.tracks.length - 1) });
    state.tracks = saved.tracks.map(s => Object.assign(newTrack(s.inst), { knobs: s.knobs, muted: s.muted, events: s.events || [], mic: s.mic || null }));
  } else {
    state.tracks = ['drums', 'bass', 'sinte', 'piano'].map(newTrack);
  }
  for (const tr of state.tracks) {
    tr.chain = Engine.createChain();
    tr.knobs.forEach((v, i) => Engine.setKnob(tr.chain, i, v));
    Engine.setMute(tr.chain, tr.muted);
  }
  Engine.setTempo(state.bpm);
  buildStatic(); renderTop(); renderTracks(); renderPanel();
  for (const tr of state.tracks) setInstrument(tr, tr.inst);
  initMidi();
  frame();
}
$('#bStart').onclick = boot;
