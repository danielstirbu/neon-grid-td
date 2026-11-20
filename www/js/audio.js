// audio.js — 100% procedural Web Audio synthesis, no assets. iOS needs resume() on first tap.
// Architecture: every voice is a short-lived node chain that disconnects itself in
// `onended`; one shared noise buffer; a rate limiter for burst SFX; a soft limiter
// (compressor) on the master bus; music scheduled ahead on AudioContext.currentTime.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Am — F — C — G, one bar each; roots two octaves below the triads.
const PROG = [
  { root: 45, triad: [57, 60, 64] }, // Am
  { root: 41, triad: [53, 57, 60] }, // F
  { root: 48, triad: [48, 52, 55] }, // C
  { root: 43, triad: [55, 59, 62] }, // G
];
const PENTA = [69, 72, 74, 76, 79, 81]; // A minor pentatonic for melody sparks

const MUSIC_MODES = {
  menu: { bpm: 92, level: 0.16 },
  game: { bpm: 104, level: 0.2 },
  boss: { bpm: 116, level: 0.23 },
};

class AudioEngine {
  static MAX_SOUNDS_PER_100MS = 12;

  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.enabled = true;
    this.unlocked = false;
    this._winStart = 0;
    this._winCount = 0;
    this._musicMode = 'off';
    this._musicTimer = null;
    this._musicStep = 0;
    this._nextStepTime = 0;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    // Soft limiter guards the summed SFX + music against clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 4;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.musicBus.connect(this.master);
    return this.ctx;
  }

  // Call from a user gesture (pointerdown) — required by iOS Safari.
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        this.unlocked = true;
        this._applyMusic();
      }).catch(() => {});
    } else {
      this.unlocked = true;
      this._applyMusic();
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.unlock();
      this._applyMusic();
    } else {
      this._stopMusicSoon();
    }
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  // ---------- Voices ----------
  // `out` lets music route through the musicBus (pausable) while SFX go to master.
  _env(node, t0, peak, attack, decay, out) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(out || this.master);
    return g;
  }

  // Optional `lp` inserts a lowpass between osc and envelope; `q` shapes it.
  _tone(freq, { type = 'sine', t0, dur = 0.12, peak = 0.5, attack = 0.005, glide = 0, lp = 0, q = 1, out = null }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t0 + dur);
    let node = osc;
    let filt = null;
    if (lp) {
      filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      filt.Q.value = q;
      osc.connect(filt);
      node = filt;
    }
    const g = this._env(node, t0, peak, attack, dur, out);
    osc.onended = () => {
      try { osc.disconnect(); if (filt) filt.disconnect(); g.disconnect(); } catch {}
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Sub-bass punch used under most impacts for phone-speaker weight.
  _sub(from, to, t0, dur, peak, out = null) {
    this._tone(from, { type: 'sine', t0, dur, peak, attack: 0.003, glide: to - from, out });
  }

  // P-04: one 1-second white-noise buffer for the whole session, looped per
  // playback; per-sound color comes from the filter, not new samples.
  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  // `filter` type + optional exponential filter sweep (freq -> sweepTo) give
  // risers, air, crackle and body from the same shared buffer.
  _noise({ t0, dur = 0.15, peak = 0.4, freq = 1200, q = 1, filter = 'bandpass', sweepTo = 0, out = null }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = filter;
    bp.frequency.setValueAtTime(freq, t0);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    bp.Q.value = q;
    src.connect(bp);
    const g = this._env(bp, t0, peak, 0.004, dur, out);
    src.onended = () => {
      try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch {}
    };
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- SFX (layered) ----------
  play(name) {
    if (!this.ready) return;
    // Rate-limiter: many towers firing at once produce sounds that are individually
    // imperceptible but leak nodes and steal headroom. Drop the excess.
    const now = Date.now();
    if (now - this._winStart >= 100) {
      this._winStart = now;
      this._winCount = 0;
    }
    if (++this._winCount > AudioEngine.MAX_SOUNDS_PER_100MS) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'tap':
        this._tone(660, { type: 'square', t0: t, dur: 0.05, peak: 0.2 });
        this._noise({ t0: t, dur: 0.02, peak: 0.06, freq: 4200, q: 1.2 });
        break;
      case 'place': // build thump + rising confirm harmonic + dust
        this._sub(150, 70, t, 0.14, 0.42);
        this._noise({ t0: t, dur: 0.06, peak: 0.12, freq: 500, q: 0.7 });
        this._tone(520, { type: 'triangle', t0: t + 0.05, dur: 0.1, peak: 0.24, glide: 260 });
        break;
      case 'upgrade': // triad arpeggio + sparkle top
        [440, 554, 659, 880].forEach((f, i) =>
          this._tone(f, { type: 'square', t0: t + i * 0.06, dur: 0.08, peak: 0.2, lp: 3000 }));
        this._noise({ t0: t + 0.16, dur: 0.14, peak: 0.1, freq: 6000, q: 1.4, filter: 'highpass' });
        break;
      case 'sell': // coin: two fast high pings over a low down-slide
        this._tone(520, { type: 'sawtooth', t0: t, dur: 0.09, peak: 0.22, glide: -240 });
        this._tone(1568, { type: 'sine', t0: t + 0.02, dur: 0.07, peak: 0.18 });
        this._tone(2093, { type: 'sine', t0: t + 0.08, dur: 0.09, peak: 0.14 });
        break;
      case 'deny': // buzz + thud: clearly negative even on small speakers
        this._tone(110, { type: 'square', t0: t, dur: 0.13, peak: 0.28, lp: 700, q: 3 });
        this._tone(116, { type: 'sawtooth', t0: t, dur: 0.13, peak: 0.2, lp: 700, q: 3 });
        this._noise({ t0: t, dur: 0.09, peak: 0.14, freq: 320, q: 0.9 });
        break;
      case 'pulse': // laser-pew: sub body + bright zap
        this._sub(220, 120, t, 0.05, 0.16);
        this._tone(880, { type: 'square', t0: t, dur: 0.05, peak: 0.12, glide: -460 });
        this._noise({ t0: t, dur: 0.02, peak: 0.05, freq: 3400, q: 1.6 });
        break;
      case 'cryo': // frost: descending shimmer + airy hiss sweep
        this._tone(1700, { type: 'sine', t0: t, dur: 0.1, peak: 0.12, glide: -900 });
        this._tone(1724, { type: 'sine', t0: t + 0.01, dur: 0.1, peak: 0.09, glide: -860 });
        this._noise({ t0: t, dur: 0.14, peak: 0.1, freq: 3600, q: 0.8, sweepTo: 700 });
        break;
      case 'arc': // tesla crack: double noise burst + zappy square
        this._noise({ t0: t, dur: 0.09, peak: 0.17, freq: 2800, q: 3 });
        this._noise({ t0: t + 0.03, dur: 0.07, peak: 0.12, freq: 900, q: 0.7 });
        this._tone(1200, { type: 'square', t0: t, dur: 0.05, peak: 0.07, glide: -700 });
        break;
      case 'rail': // cannon: sub drop + rising saw sweep + crack
        this._sub(70, 34, t, 0.2, 0.5);
        this._tone(140, { type: 'sawtooth', t0: t, dur: 0.18, peak: 0.24, glide: 950, lp: 2400 });
        this._noise({ t0: t, dur: 0.1, peak: 0.16, freq: 3200, q: 0.9, sweepTo: 1100 });
        break;
      case 'hit':
        this._noise({ t0: t, dur: 0.03, peak: 0.08, freq: 1800, q: 1.4 });
        break;
      case 'kill': // pop down + body + click
        this._noise({ t0: t, dur: 0.12, peak: 0.2, freq: 900, q: 0.8, sweepTo: 220 });
        this._tone(220, { type: 'triangle', t0: t, dur: 0.1, peak: 0.16, glide: -140 });
        this._tone(60, { type: 'sine', t0: t, dur: 0.06, peak: 0.2, attack: 0.002 });
        break;
      case 'leak': // alarm: detuned minor second + sub thud
        this._tone(440, { type: 'sawtooth', t0: t, dur: 0.22, peak: 0.26, lp: 1500 });
        this._tone(466, { type: 'sawtooth', t0: t, dur: 0.22, peak: 0.22, lp: 1500 });
        this._sub(160, 60, t + 0.16, 0.22, 0.36);
        break;
      case 'wave': // riser + two-tone stab
        this._noise({ t0: t, dur: 0.3, peak: 0.12, freq: 300, q: 0.8, sweepTo: 3800 });
        this._tone(392, { type: 'square', t0: t + 0.16, dur: 0.1, peak: 0.22, lp: 2600 });
        this._tone(523, { type: 'square', t0: t + 0.26, dur: 0.14, peak: 0.24, lp: 2600 });
        break;
      case 'boss': // rumble + dissonant minor-second stab
        this._sub(60, 36, t, 0.7, 0.55);
        this._noise({ t0: t, dur: 0.6, peak: 0.2, freq: 160, q: 0.6 });
        this._tone(82, { type: 'sawtooth', t0: t + 0.1, dur: 0.5, peak: 0.3, lp: 900, q: 4 });
        this._tone(87, { type: 'sawtooth', t0: t + 0.1, dur: 0.5, peak: 0.26, lp: 900, q: 4 });
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone(f, { type: 'square', t0: t + i * 0.12, dur: 0.16, peak: 0.24, lp: 3200 }));
        this._noise({ t0: t + 0.3, dur: 0.4, peak: 0.1, freq: 5000, q: 1.2, filter: 'highpass' });
        [523, 659, 784].forEach((f) =>
          this._tone(f, { type: 'triangle', t0: t + 0.5, dur: 0.7, peak: 0.14 }));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) =>
          this._tone(f, { type: 'sawtooth', t0: t + i * 0.16, dur: 0.24, peak: 0.26, lp: 1200 }));
        this._sub(80, 30, t + 0.4, 0.9, 0.5);
        this._noise({ t0: t + 0.1, dur: 0.9, peak: 0.1, freq: 900, q: 0.6, sweepTo: 120 });
        break;
    }
  }

  // ---------- Music (procedural BGM) ----------
  // mode: 'menu' | 'game' | 'boss' | 'off'. Idempotent; safe before unlock —
  // the desired mode is applied as soon as the context is running.
  setMusicMode(mode) {
    if (mode === this._musicMode) return;
    this._musicMode = mode;
    if (mode !== 'off') this._musicStep = 0;
    this._applyMusic();
  }

  _applyMusic() {
    if (!this.ctx) return;
    const want = this.enabled && this._musicMode !== 'off' && this.ctx.state === 'running';
    if (!want) {
      this._stopMusicSoon();
      return;
    }
    if (this._musicTimer) return;
    const cfg = MUSIC_MODES[this._musicMode] || MUSIC_MODES.game;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(cfg.level, t + 0.5);
    this._nextStepTime = t + 0.08;
    this._musicTimer = setInterval(() => this._musicTick(), 25);
  }

  _stopMusicSoon() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    // An exponential ramp cannot start from 0 — clamp the current level first.
    const cur = Math.max(this.musicBus.gain.value, 0.0001);
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(cur, t);
    this.musicBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  }

  // Lookahead scheduler: keeps ~0.35 s of the score queued on the audio clock,
  // so tempo is immune to main-thread jank.
  _musicTick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.enabled) return;
    const horizon = ctx.currentTime + 0.35;
    if (this._nextStepTime < ctx.currentTime) this._nextStepTime = ctx.currentTime + 0.05;
    while (this._nextStepTime < horizon) {
      this._scheduleStep(this._musicStep, this._nextStepTime);
      const bpm = (MUSIC_MODES[this._musicMode] || MUSIC_MODES.game).bpm;
      this._nextStepTime += 60 / bpm / 4; // one 16th
      this._musicStep += 1;
    }
  }

  _scheduleStep(step, t) {
    const mode = this._musicMode;
    const cfg = MUSIC_MODES[mode] || MUSIC_MODES.game;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const barDur = (60 / cfg.bpm) * 4;
    const chord = PROG[bar];
    const out = this.musicBus;
    const boss = mode === 'boss';

    if (mode === 'menu') {
      // Dreamy pad on the chord every bar, slow bass pulse, sparse sparkle.
      if (s === 0) {
        chord.triad.forEach((m, i) => {
          const f = midi(m);
          this._tone(f, { type: 'sawtooth', t0: t, dur: barDur * 0.95, peak: 0.05, attack: 0.9, lp: 520 + i * 90, out });
          this._tone(f * 1.003, { type: 'sawtooth', t0: t, dur: barDur * 0.95, peak: 0.04, attack: 1.1, lp: 560 + i * 90, out });
        });
      }
      if (s === 0 || s === 8) {
        this._tone(midi(chord.root), { type: 'sine', t0: t, dur: 0.7, peak: 0.16, attack: 0.05, out });
      }
      if (s === 2 && bar % 2 === 0) {
        this._tone(midi(PENTA[(bar * 2) % PENTA.length]), { type: 'sine', t0: t, dur: 0.55, peak: 0.05, attack: 0.02, out });
      }
      if (s === 10 && bar % 4 === 3) {
        this._tone(midi(PENTA[3]), { type: 'sine', t0: t, dur: 0.7, peak: 0.05, attack: 0.03, out });
      }
      return;
    }

    // game / boss: arp + driving bass + pulse + hats + occasional melody hook.
    const cut = boss ? 2600 : 1400;
    // arpeggio 16ths (boss: adds 3rd octave accents)
    const arp = chord.triad[[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0);
    this._tone(midi(arp), { type: 'sawtooth', t0: t, dur: 0.11, peak: boss ? 0.07 : 0.055, attack: 0.004, lp: cut, q: 1.5, out });
    if (boss && s % 4 === 0) {
      this._tone(midi(arp) * 2, { type: 'sawtooth', t0: t, dur: 0.09, peak: 0.04, lp: 3400, out });
    }
    // bass on 8ths, saw + sub
    if (s % 2 === 0) {
      const bOct = boss ? 12 : 0;
      this._tone(midi(chord.root - 12 + bOct), { type: 'sawtooth', t0: t, dur: 0.16, peak: 0.09, lp: 480, q: 3, out });
      this._tone(midi(chord.root - 24 + bOct), { type: 'sine', t0: t, dur: 0.18, peak: 0.14, attack: 0.004, out });
    }
    // pulse: kick on 1 & 3 (+ 2 & 4 when boss)
    if (s === 0 || s === 8 || (boss && (s === 4 || s === 12))) {
      this._tone(58, { type: 'sine', t0: t, dur: 0.13, peak: 0.22, attack: 0.002, glide: -20, out });
    }
    // hats offbeat
    if (s % 4 === 2) {
      this._noise({ t0: t, dur: boss ? 0.035 : 0.025, peak: boss ? 0.045 : 0.03, freq: 8000, q: 1, filter: 'highpass', out });
    }
    // melody hook every 2 bars
    if (bar % 2 === 0 && (s === 0 || s === 6 || s === 11)) {
      const idx = (Math.floor(step / 32) * 3 + s + bar) % PENTA.length;
      const seq = PENTA[idx];
      this._tone(midi(seq), { type: 'square', t0: t, dur: 0.22, peak: 0.045, lp: 2000, out });
      this._tone(midi(seq) * 1.005, { type: 'square', t0: t, dur: 0.22, peak: 0.035, lp: 2000, out });
    }
  }
}

export const audio = new AudioEngine();
