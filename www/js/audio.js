// audio.js — procedural Web Audio synthesis, no assets. iOS needs resume() on first tap.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.unlocked = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  // Call from a user gesture (pointerdown) — required by iOS Safari.
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().then(() => { this.unlocked = true; }).catch(() => {});
    else this.unlocked = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _env(node, t0, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  _tone(freq, { type = 'sine', t0, dur = 0.12, peak = 0.5, attack = 0.005, glide = 0 }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t0 + dur);
    this._env(osc, t0, peak, attack, dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ t0, dur = 0.15, peak = 0.4, freq = 1200, q = 1 }) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    src.connect(bp);
    this._env(bp, t0, peak, 0.004, dur);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(name) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'tap':       this._tone(660, { type: 'square', t0: t, dur: 0.05, peak: 0.22 }); break;
      case 'place':     this._tone(320, { type: 'triangle', t0: t, dur: 0.09, peak: 0.4, glide: 300 });
                        this._tone(640, { type: 'sine', t0: t + 0.05, dur: 0.08, peak: 0.3 }); break;
      case 'upgrade':   this._tone(440, { type: 'square', t0: t, dur: 0.07, peak: 0.25 });
                        this._tone(660, { type: 'square', t0: t + 0.07, dur: 0.07, peak: 0.25 });
                        this._tone(880, { type: 'square', t0: t + 0.14, dur: 0.1, peak: 0.28 }); break;
      case 'sell':      this._tone(520, { type: 'sawtooth', t0: t, dur: 0.09, peak: 0.3, glide: -260 }); break;
      case 'deny':      this._tone(160, { type: 'sawtooth', t0: t, dur: 0.12, peak: 0.35, glide: -60 }); break;
      case 'pulse':     this._tone(880, { type: 'square', t0: t, dur: 0.045, peak: 0.12, glide: -420 }); break;
      case 'cryo':      this._tone(1400, { type: 'sine', t0: t, dur: 0.08, peak: 0.12, glide: -700 }); break;
      case 'arc':       this._noise({ t0: t, dur: 0.09, peak: 0.18, freq: 2600, q: 2 }); break;
      case 'rail':      this._tone(120, { type: 'sawtooth', t0: t, dur: 0.16, peak: 0.3, glide: 900 });
                        this._noise({ t0: t, dur: 0.1, peak: 0.16, freq: 900, q: 0.7 }); break;
      case 'hit':       this._noise({ t0: t, dur: 0.03, peak: 0.08, freq: 1800, q: 1.4 }); break;
      case 'kill':      this._noise({ t0: t, dur: 0.12, peak: 0.22, freq: 700, q: 0.8 });
                        this._tone(220, { type: 'triangle', t0: t, dur: 0.1, peak: 0.18, glide: -120 }); break;
      case 'leak':      this._tone(220, { type: 'sawtooth', t0: t, dur: 0.25, peak: 0.4, glide: -140 }); break;
      case 'wave':      this._tone(392, { type: 'square', t0: t, dur: 0.1, peak: 0.22 });
                        this._tone(523, { type: 'square', t0: t + 0.1, dur: 0.1, peak: 0.22 });
                        this._tone(784, { type: 'square', t0: t + 0.2, dur: 0.16, peak: 0.26 }); break;
      case 'boss':      this._tone(82, { type: 'sawtooth', t0: t, dur: 0.5, peak: 0.4, glide: -30 });
                        this._noise({ t0: t, dur: 0.5, peak: 0.2, freq: 240, q: 0.6 }); break;
      case 'victory':   [523, 659, 784, 1046].forEach((f, i) =>
                          this._tone(f, { type: 'square', t0: t + i * 0.13, dur: 0.16, peak: 0.26 })); break;
      case 'defeat':    [392, 330, 262, 196].forEach((f, i) =>
                          this._tone(f, { type: 'sawtooth', t0: t + i * 0.17, dur: 0.22, peak: 0.3 })); break;
    }
  }
}

export const audio = new AudioEngine();
