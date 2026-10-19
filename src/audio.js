// Every sound is synthesized with WebAudio, so there are no audio files to host.
import { clamp } from './util.js';

export class Sound {
  constructor() {
    this.ctx = null; this.volume = 0.8; this.voices = 0;
    this.lpos = { x: 0, y: 1.6, z: 0 }; this.lright = { x: 1, y: 0, z: 0 };
    this.last = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.lp); this.lp.connect(this.comp); this.comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMuffle(on) { if (this.lp) this.lp.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.06); }
  setListener(pos, right) { this.lpos = pos; this.lright = right; }

  out(p, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let gain = vol, pan = 0;
    if (p) {
      const dx = p[0] - this.lpos.x, dy = p[1] - this.lpos.y, dz = p[2] - this.lpos.z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      gain = vol / (1 + dist * 0.32);
      pan = clamp((dx * this.lright.x + dz * this.lright.z) / dist, -1, 1) * 0.75;
    }
    g.gain.value = gain;
    if (ctx.createStereoPanner) { const sp = ctx.createStereoPanner(); sp.pan.value = pan; g.connect(sp); sp.connect(this.master); }
    else g.connect(this.master);
    return g;
  }

  tone(dest, { type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.3, at = 0, attack = 0.004, curve = 'exp' }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    this.track(dur);
    return o;
  }

  hiss(dest, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.1, vol = 0.3, at = 0, attack = 0.003 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5, dur + 0.05);
    this.track(dur);
    return g;
  }

  bell(dest, f, partials, vol, decay, at = 0) {
    partials.forEach(([ratio, amp, dk], k) => this.tone(dest, { f0: f * ratio, dur: decay * dk, vol: vol * amp, at, attack: 0.002 }));
  }

  track(dur) { this.voices++; setTimeout(() => this.voices--, (dur + 0.1) * 1000); }

  guitarBuffer() {
    if (this.gbuf) return this.gbuf;
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 2.2);
    const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    const notes = [82.41, 123.47, 164.81, 196.0, 246.94, 329.63];
    notes.forEach((f, k) => {
      const N = Math.round(sr / f), line = new Float32Array(N);
      for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
      const start = Math.floor(k * 0.018 * sr);
      let idx = 0;
      for (let i = start; i < len; i++) {
        const a = line[idx], b = line[(idx + 1) % N];
        line[idx] = (a + b) * 0.5 * 0.996;
        out[i] += a * 0.16;
        idx = (idx + 1) % N;
      }
    });
    return (this.gbuf = buf);
  }

  play(kind, { p = null, v = 1, f } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.voices > 60 && v < 0.5) return;
    const now = this.ctx.currentTime;
    const key = kind + (p ? Math.round(p[0] * 4) + ',' + Math.round(p[2] * 4) : '');
    if (this.last[key] && now - this.last[key] < 0.045) return;
    this.last[key] = now;
    v = clamp(v, 0.05, 1);
    const o = this.out(p, 1);
    const R = (a, b) => a + Math.random() * (b - a);
    switch (kind) {
      case 'squish':
        this.hiss(o, { f0: 1000 * R(0.9, 1.1), f1: 320, q: 1.3, dur: 0.15, vol: 0.55 * v });
        this.tone(o, { f0: 230 * R(0.9, 1.1), f1: 105, dur: 0.1, vol: 0.4 * v });
        if (v > 0.55) this.tone(o, { f0: 1500, f1: 950, dur: 0.07, vol: 0.05 * v });
        break;
      case 'bonk':
        this.tone(o, { type: 'triangle', f0: 720, f1: 250, dur: 0.17, vol: 0.5 });
        this.tone(o, { f0: 340, f1: 150, dur: 0.22, vol: 0.45 });
        this.hiss(o, { f0: 900, f1: 300, q: 1.2, dur: 0.16, vol: 0.5 });
        { const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 17; lg.gain.value = 70;
          const osc = this.tone(o, { f0: 330, dur: 0.45, vol: 0.18, at: 0.05 }); lfo.connect(lg); lg.connect(osc.frequency); lfo.start(); lfo.stop(now + 0.6); }
        break;
      case 'catch':
        this.hiss(o, { type: 'lowpass', f0: 1300, dur: 0.07, vol: 0.45 });
        this.tone(o, { f0: 400, f1: 260, dur: 0.07, vol: 0.22 });
        break;
      case 'whoosh':
        this.hiss(o, { f0: 450, f1: 1700, q: 0.8, dur: 0.24, vol: 0.18 * v, attack: 0.05 });
        break;
      case 'pickup': this.tone(o, { f0: 520, f1: 820, dur: 0.09, vol: 0.14 }); break;
      case 'deny': this.tone(o, { type: 'square', f0: 140, dur: 0.12, vol: 0.08 }); break;
      case 'metal': {
        const fr = (f || 400) * R(0.94, 1.06), long = fr < 300 ? 1.5 : 1;
        this.bell(o, fr, [[1, 0.5, 1], [2.76, 0.3, 0.6], [5.4, 0.18, 0.35], [8.93, 0.1, 0.2]], v * 0.6, 1.1 * long);
        this.hiss(o, { type: 'highpass', f0: 3000, dur: 0.03, vol: 0.3 * v });
        break;
      }
      case 'metalDull':
        this.bell(o, 190 * R(0.95, 1.05), [[1, 0.5, 1], [2.3, 0.25, 0.6], [4.1, 0.12, 0.4]], v * 0.5, 0.3);
        this.hiss(o, { type: 'lowpass', f0: 900, dur: 0.07, vol: 0.4 * v });
        break;
      case 'metalLight':
        this.bell(o, (f || 900) * R(0.93, 1.07), [[1, 0.45, 1], [2.6, 0.25, 0.5], [4.9, 0.12, 0.3]], v * 0.45, 0.35);
        this.hiss(o, { type: 'highpass', f0: 2500, dur: 0.025, vol: 0.25 * v });
        break;
      case 'glass':
        this.bell(o, (f || 1600) * R(0.92, 1.08), [[1, 0.5, 1], [2.32, 0.3, 0.6], [4.25, 0.18, 0.35]], v * 0.45, 0.4);
        this.hiss(o, { type: 'highpass', f0: 4000, dur: 0.02, vol: 0.25 * v });
        break;
      case 'ceramic':
        this.bell(o, (f || 1200) * R(0.92, 1.08), [[1, 0.5, 1], [2.1, 0.3, 0.6], [3.6, 0.18, 0.4]], v * 0.5, 0.14);
        this.hiss(o, { f0: 2600, q: 1.5, dur: 0.04, vol: 0.35 * v });
        break;
      case 'tin':
        this.bell(o, 700 * R(0.9, 1.1), [[1, 0.4, 1], [2.4, 0.3, 0.7], [4.1, 0.2, 0.5]], v * 0.45, 0.16);
        this.hiss(o, { type: 'highpass', f0: 2000, dur: 0.04, vol: 0.3 * v });
        break;
      case 'plastic':
        this.hiss(o, { f0: 1100 * R(0.85, 1.15), q: 2, dur: 0.06, vol: 0.45 * v });
        this.tone(o, { f0: 270, f1: 180, dur: 0.06, vol: 0.3 * v });
        break;
      case 'counter':
      case 'wood':
        this.hiss(o, { f0: (kind === 'counter' ? 1100 : 700) * R(0.9, 1.1), q: 3, dur: 0.05, vol: 0.5 * v });
        this.tone(o, { f0: 200, f1: 150, dur: 0.07, vol: 0.35 * v });
        break;
      case 'knock':
        for (const at of [0, 0.12]) {
          this.hiss(o, { f0: 420, q: 2.5, dur: 0.06, vol: 0.55 * v, at });
          this.tone(o, { f0: 150, f1: 110, dur: 0.08, vol: 0.45 * v, at });
        }
        break;
      case 'cloth':
      case 'soft':
        this.hiss(o, { type: 'lowpass', f0: 520, dur: 0.13, vol: 0.35 * v });
        break;
      case 'thud':
        this.hiss(o, { type: 'lowpass', f0: 420, dur: 0.09, vol: 0.5 * v });
        this.tone(o, { f0: 125, f1: 80, dur: 0.1, vol: 0.45 * v });
        break;
      case 'rattle': {
        this.tone(o, { f0: 88, dur: 0.22, vol: 0.4 * v });
        const g = this.hiss(o, { f0: 2100, q: 4, dur: 0.38, vol: 0.25 * v });
        const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 27;
        const lg = this.ctx.createGain(); lg.gain.value = 0.12 * v; lfo.connect(lg); lg.connect(g.gain); lfo.start(); lfo.stop(now + 0.45);
        this.bell(o, 2400, [[1, 0.3, 1]], v * 0.3, 0.2);
        break;
      }
      case 'fridge':
        this.play('metalDull', { p, v });
        this.bell(o, 1800, [[1, 0.4, 1], [2.3, 0.2, 0.5]], v * 0.2, 0.3, 0.06);
        this.bell(o, 2100, [[1, 0.4, 1]], v * 0.15, 0.25, 0.11);
        break;
      case 'ac':
        this.play('plastic', { p, v });
        for (const at of [0.18, 0.32]) this.tone(o, { type: 'square', f0: 2000, dur: 0.07, vol: 0.06, at, curve: 'lin' });
        break;
      case 'squeak': {
        const t = now, osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(1150, t); osc.frequency.linearRampToValueAtTime(1750, t + 0.08); osc.frequency.linearRampToValueAtTime(1050, t + 0.24);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.3); this.track(0.3);
        this.tone(o, { f0: 2300, f1: 2100, dur: 0.2, vol: 0.05 * v });
        break;
      }
      case 'boom':
        this.tone(o, { f0: 60, f1: 45, dur: 0.45, vol: 0.75 * v });
        for (const [fr, at] of [[262, 0.02], [330, 0.02], [392, 0.02], [523, 0.16]]) this.tone(o, { type: 'sawtooth', f0: fr, dur: 0.22, vol: 0.05 * v, at });
        break;
      case 'ball':
        this.tone(o, { f0: 150, f1: 85, dur: 0.13, vol: 0.55 * v });
        this.hiss(o, { type: 'lowpass', f0: 650, dur: 0.05, vol: 0.4 * v });
        break;
      case 'chime': {
        const notes = [1046.5, 1174.7, 1396.9, 1568, 1760, 2093];
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) this.bell(o, notes[Math.floor(Math.random() * notes.length)], [[1, 0.5, 1], [2.76, 0.15, 0.4]], 0.22 * v, 1.8, k * R(0.06, 0.16));
        break;
      }
      case 'guitar': {
        const s = this.ctx.createBufferSource(); s.buffer = this.guitarBuffer();
        const g = this.ctx.createGain(); g.gain.value = 0.9 * v; s.connect(g); g.connect(o);
        s.playbackRate.value = R(0.97, 1.03); s.start(); this.track(2.2);
        break;
      }
      case 'ring': {
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.22 * v, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
        const am = this.ctx.createGain(); am.gain.value = 0.5;
        const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 22;
        const lg = this.ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
        for (const fr of [2350, 2350 * 2.76]) { const os = this.ctx.createOscillator(); os.frequency.value = fr; os.connect(am); os.start(now); os.stop(now + 1.15); }
        am.connect(g); g.connect(o); lfo.start(now); lfo.stop(now + 1.15); this.track(1.15);
        break;
      }
      case 'coins':
        this.play('ceramic', { p, v, f: 950 });
        for (let k = 0; k < 6; k++) this.bell(o, R(3000, 5200), [[1, 0.4, 1]], 0.12 * v, 0.12, 0.03 + k * R(0.02, 0.05));
        break;
      case 'explosion':
        this.hiss(o, { type: 'lowpass', f0: 4200, f1: 140, q: 0.7, dur: 1.5, vol: 1.0 });
        this.tone(o, { f0: 75, f1: 28, dur: 0.75, vol: 0.9 });
        for (let k = 0; k < 7; k++) this.hiss(o, { type: 'highpass', f0: 2500, dur: 0.03, vol: 0.25, at: 0.1 + k * R(0.05, 0.12) });
        break;
      case 'tick': this.tone(o, { type: 'square', f0: f || 1800, dur: 0.018, vol: 0.09 }); break;
      case 'beep': this.tone(o, { f0: 660, dur: 0.14, vol: 0.18 }); break;
      case 'go': this.tone(o, { f0: 990, dur: 0.3, vol: 0.22 }); this.tone(o, { f0: 1485, dur: 0.3, vol: 0.08 }); break;
      case 'whistle': {
        const t = now, osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.frequency.value = 2900;
        const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 26; lg.gain.value = 260; lfo.connect(lg); lg.connect(osc.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.03); g.gain.setValueAtTime(0.2, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 0.65); lfo.stop(t + 0.65); this.track(0.65);
        this.hiss(o, { f0: 3000, q: 2, dur: 0.55, vol: 0.06 });
        break;
      }
      case 'ding': this.bell(o, 1568, [[1, 0.5, 1], [2, 0.25, 0.7], [3, 0.1, 0.5]], 0.35, 0.9); this.bell(o, 2093, [[1, 0.4, 1]], 0.25, 0.9, 0.09); break;
      case 'win': [523, 659, 784, 1046].forEach((fr, k) => this.tone(o, { type: 'triangle', f0: fr, dur: 0.3, vol: 0.22, at: k * 0.11 })); break;
      case 'lose': [392, 330, 262].forEach((fr, k) => this.tone(o, { type: 'triangle', f0: fr, f1: fr * 0.97, dur: 0.35, vol: 0.2, at: k * 0.16 })); break;
      case 'draw': [440, 440].forEach((fr, k) => this.tone(o, { type: 'triangle', f0: fr, dur: 0.22, vol: 0.18, at: k * 0.2 })); break;
      case 'step':
        this.hiss(o, { type: 'highpass', f0: 1400, dur: 0.025, vol: 0.05 });
        this.tone(o, { f0: 120, dur: 0.03, vol: 0.04 });
        break;
      case 'ui': this.tone(o, { f0: 880, f1: 1320, dur: 0.06, vol: 0.08 }); break;
      default: break;
    }
  }
}
