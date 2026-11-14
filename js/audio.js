'use strict';
/* Motor de sonido: cadena de efectos por pista, sintes, batería, samples, micrófono. */
const Engine = (() => {
  let ctx = null, master, delay, delayIn, reverbIn, noiseBuf;
  const NOVOICE = { stop() {} };
  const mod = (a, n) => ((a % n) + n) % n;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(limiter); limiter.connect(ctx.destination);

    // Eco compartido
    delayIn = ctx.createGain();
    delay = ctx.createDelay(2); delay.delayTime.value = 0.45;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    delayIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);

    // Reverb compartida
    reverbIn = ctx.createGain();
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse(2.6);
    reverbIn.connect(conv); conv.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function makeImpulse(sec) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return buf;
  }

  function setTempo(bpm) {
    if (ctx) delay.delayTime.setTargetAtTime(Math.min(1.9, 60 / bpm * 0.75), ctx.currentTime, 0.05);
  }

  function latency() {
    return Math.min(0.15, (ctx.outputLatency || 0) + (ctx.baseLatency || 0));
  }

  /* ---------- Cadena de pista ---------- */
  function createChain() {
    const input = ctx.createGain();
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 5;
    const vol = ctx.createGain();
    const mute = ctx.createGain();
    const echoSend = ctx.createGain(); echoSend.gain.value = 0;
    const revSend = ctx.createGain(); revSend.gain.value = 0;
    input.connect(shaper); shaper.connect(filter); filter.connect(vol); vol.connect(mute);
    mute.connect(master); mute.connect(echoSend); mute.connect(revSend);
    echoSend.connect(delayIn); revSend.connect(reverbIn);
    const pitch = ctx.createConstantSource(); pitch.offset.value = 0; pitch.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0;
    lfo.connect(lfoGain); lfo.start();
    return { input, shaper, filter, vol, mute, echoSend, revSend, pitch, lfo, lfoGain, release: 0.3, voices: new Set() };
  }

  function distCurve(a) {
    const n = 1024, c = new Float32Array(n), k = a * a * 80, comp = 1 / (1 + a * 2);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1;
      c[i] = k < 0.01 ? x : (1 + k) * x / (1 + k * Math.abs(x)) * comp;
    }
    return c;
  }

  // 8 roscas: 0 volumen, 1 filtro, 2 eco, 3 cueva, 4 monstruo, 5 tono, 6 temblor, 7 cola
  function setKnob(ch, i, v) {
    const x = v / 127, t = ctx.currentTime, s = 0.02;
    switch (i) {
      case 0: ch.vol.gain.setTargetAtTime(0.06 + x * x * 1.24, t, s); break;
      case 1: ch.filter.frequency.setTargetAtTime(260 * Math.pow(70, x), t, s); break;
      case 2: ch.echoSend.gain.setTargetAtTime(x * 0.8, t, s); break;
      case 3: ch.revSend.gain.setTargetAtTime(x * 0.9, t, s); break;
      case 4: ch.shaper.curve = distCurve(x); break;
      case 5: ch.pitch.offset.setTargetAtTime(Math.max(-12, Math.min(12, Math.round((v - 64) / 64 * 12))) * 100, t, s); break;
      case 6: ch.lfoGain.gain.setTargetAtTime(x * x * 250, t, s); ch.lfo.frequency.setTargetAtTime(4 + x * 5, t, s); break;
      case 7: ch.release = 0.04 + x * x * 2.5; break;
    }
  }

  function setMute(ch, m) { ch.mute.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.01); }

  // Conecta tono y temblor de la pista a una fuente
  function modulate(ch, src) {
    if (!src.detune) return;
    ch.pitch.connect(src.detune); ch.lfoGain.connect(src.detune);
    src.addEventListener('ended', () => {
      try { ch.pitch.disconnect(src.detune); ch.lfoGain.disconnect(src.detune); } catch (e) {}
    });
  }

  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
  }

  /* ---------- Notas ---------- */
  function pickSample(inst, midi) {
    let best = null, bd = 1e9;
    for (const s of inst.samples || []) {
      const d = Math.abs(s.root - midi);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function note(ch, inst, midi, vel, time, dur) {
    if (!inst) return NOVOICE;
    const t = Math.max(time || 0, ctx.currentTime);
    if (inst.type === 'drums') { drum(ch, mod(midi - 36, 8), t, vel); return NOVOICE; }
    const amp = 0.25 + 0.75 * (vel / 127);
    const g = ctx.createGain(), srcs = [];
    let attack = 0.005, peak = amp;
    if (inst.type === 'synth') {
      const p = inst.preset; attack = p.attack || 0.005;
      const f = 440 * Math.pow(2, (midi + (p.oct || 0) * 12 - 69) / 12);
      for (const o of p.oscs) {
        const osc = ctx.createOscillator(); osc.type = o.type;
        const freq = f * (o.ratio || 1);
        if (p.glide) {
          osc.frequency.setValueAtTime(freq * p.glide, t);
          osc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
        } else osc.frequency.value = freq;
        osc.detune.value = o.det || 0;
        const og = ctx.createGain(); og.gain.value = (o.gain == null ? 1 : o.gain) * p.gain;
        osc.connect(og); og.connect(g); srcs.push(osc);
      }
    } else {
      const s = pickSample(inst, midi);
      if (!s) return NOVOICE;
      const src = ctx.createBufferSource(); src.buffer = s.buffer;
      src.playbackRate.value = Math.pow(2, (midi - s.root) / 12);
      src.connect(g); srcs.push(src); peak = amp * (inst.gain || 1);
    }
    g.connect(ch.input);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    for (const s of srcs) { modulate(ch, s); s.start(t); }

    let stopAt = Infinity;
    const voice = {
      stop(at, fast) {
        const st = Math.max(at || 0, ctx.currentTime, t + 0.005);
        if (st >= stopAt) return;
        stopAt = st;
        const rel = fast ? 0.04 : Math.max(0.04, ch.release);
        hold(g.gain, st); g.gain.setTargetAtTime(0, st, rel / 4);
        for (const s of srcs) { try { s.stop(st + rel * 1.5 + 0.05); } catch (e) {} }
      }
    };
    srcs[0].addEventListener('ended', () => { ch.voices.delete(voice); g.disconnect(); });
    ch.voices.add(voice);
    if (ch.voices.size > 28) {
      const old = ch.voices.values().next().value;
      ch.voices.delete(old); old.stop(0, true);
    }
    if (dur != null) voice.stop(t + Math.max(0.03, dur));
    return voice;
  }

  function stopAll(ch) { for (const v of [...ch.voices]) v.stop(0, true); }

  /* ---------- Batería sintetizada (8 pads) ---------- */
  function drum(ch, i, time, vel) {
    const t = Math.max(time || 0, ctx.currentTime);
    const out = ctx.createGain(); out.gain.value = (0.3 + 0.7 * (vel / 127)) * 0.55;
    out.connect(ch.input);
    let pending = 0;
    const track = (src, end) => {
      pending++; modulate(ch, src);
      src.addEventListener('ended', () => { if (--pending === 0) out.disconnect(); });
      src.stop(end + 0.03);
    };
    const tone = (type, f0, f1, dur, gain) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); o.start(t); track(o, t + dur);
      return g;
    };
    const noise = (ftype, freq, q, dur, gain) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); track(s, t + dur);
      return g;
    };
    switch (i) {
      case 0: tone('sine', 160, 42, 0.45, 1.3).connect(out); break;                       // bombo
      case 1: tone('triangle', 220, 120, 0.12, 0.6).connect(out); noise('highpass', 1200, 0.7, 0.2, 0.7); break; // caja
      case 2: noise('highpass', 7500, 0.7, 0.05, 0.45); break;                             // charles cerrado
      case 3: noise('highpass', 7000, 0.7, 0.4, 0.4); break;                               // charles abierto
      case 4: {                                                                            // palmas
        const g = noise('bandpass', 1500, 1.2, 0.3, 0.9);
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.001, t);
        for (let k = 0; k < 3; k++) {
          g.gain.setValueAtTime(0.9, t + k * 0.012);
          g.gain.exponentialRampToValueAtTime(0.1, t + k * 0.012 + 0.01);
        }
        g.gain.setValueAtTime(0.9, t + 0.036); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        break;
      }
      case 5: tone('sine', 210, 85, 0.35, 1).connect(out); break;                          // tom
      case 6: {                                                                            // cencerro
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 2;
        tone('square', 540, 540, 0.3, 0.4).connect(f); tone('square', 800, 800, 0.3, 0.4).connect(f);
        f.connect(out); break;
      }
      default: noise('highpass', 4500, 0.5, 1.3, 0.45); noise('bandpass', 9000, 1, 0.9, 0.3); // plato
    }
  }

  function click(time, strong) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = strong ? 1700 : 1100;
    g.gain.setValueAtTime(0.25, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    o.connect(g); g.connect(master); o.start(time); o.stop(time + 0.05);
  }

  /* ---------- Instrumentos de internet (soundfonts MIDI.js, FluidR3_GM) ---------- */
  const NOTE_IDX = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  const sfCache = new Map();

  async function cachedText(url) {
    let cache = null;
    try {
      cache = await caches.open('daw-sonidos-v1');
      const hit = await cache.match(url);
      if (hit) return await hit.text();
    } catch (e) {}
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (cache) cache.put(url, res.clone()).catch(() => {});
    return res.text();
  }

  function b64ToBuffer(b64) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function doLoadSoundfont(name) {
    const urls = [
      `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${name}-mp3.js`,
      `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM/${name}-mp3.js`
    ];
    let text = null;
    for (const u of urls) { try { text = await cachedText(u); break; } catch (e) {} }
    if (!text) throw new Error('sin conexión');
    const re = /"([A-G]b?)(\d)":\s*"data:audio\/[a-z0-9]+;base64,([^"]+)"/g;
    const jobs = [];
    let m;
    while ((m = re.exec(text))) {
      const root = (parseInt(m[2], 10) + 1) * 12 + NOTE_IDX[m[1]];
      if (root % 3 !== 0 || root < 24 || root > 99) continue; // una de cada 3 notas basta
      jobs.push(ctx.decodeAudioData(b64ToBuffer(m[3])).then(buffer => ({ root, buffer })).catch(() => null));
    }
    const samples = (await Promise.all(jobs)).filter(Boolean);
    if (!samples.length) throw new Error('soundfont vacío');
    return samples;
  }

  function loadSoundfont(name) {
    if (!sfCache.has(name)) {
      sfCache.set(name, doLoadSoundfont(name).catch(e => { sfCache.delete(name); throw e; }));
    }
    return sfCache.get(name);
  }

  /* ---------- Micrófono ---------- */
  function trimSample(audio) {
    const rate = audio.sampleRate, src = audio.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < src.length; i++) { const a = Math.abs(src[i]); if (a > peak) peak = a; }
    if (peak < 0.01) throw new Error('silencio');
    let a = 0, b = src.length - 1;
    while (a < src.length && Math.abs(src[a]) < peak * 0.1) a++;
    while (b > a && Math.abs(src[b]) < peak * 0.03) b--;
    a = Math.max(0, a - Math.floor(rate * 0.005));
    b = Math.min(src.length, b + Math.floor(rate * 0.06), a + rate * 4);
    const data = src.slice(a, b), k = 0.9 / peak;
    const fin = Math.floor(rate * 0.002), fout = Math.min(data.length, Math.floor(rate * 0.03));
    for (let i = 0; i < data.length; i++) data[i] *= k;
    for (let i = 0; i < fin && i < data.length; i++) data[i] *= i / fin;
    for (let i = 0; i < fout; i++) data[data.length - 1 - i] *= i / fout;
    return { data, rate };
  }

  async function recordMic(maxSec, onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const node = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 1024; node.connect(an);
    const buf = new Float32Array(1024);
    let raf = 0;
    const meter = () => {
      an.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
      if (onLevel) onLevel(p);
      raf = requestAnimationFrame(meter);
    };
    meter();
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res, rej) => {
      rec.onstop = async () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach(t => t.stop());
        node.disconnect();
        try {
          const ab = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
          res(trimSample(await ctx.decodeAudioData(ab)));
        } catch (e) { rej(e); }
      };
    });
    rec.start();
    const timer = setTimeout(() => stop(), maxSec * 1000);
    function stop() { clearTimeout(timer); if (rec.state !== 'inactive') rec.stop(); return done; }
    return { stop, done };
  }

  function bufferFromData(s) {
    const b = ctx.createBuffer(1, s.data.length, s.rate);
    b.getChannelData(0).set(s.data);
    return b;
  }

  return {
    init, get ctx() { return ctx; }, latency, setTempo, createChain, setKnob, setMute,
    note, drum, click, stopAll, loadSoundfont, recordMic, bufferFromData
  };
})();
