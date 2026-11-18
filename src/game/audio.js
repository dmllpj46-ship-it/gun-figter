/** All sounds are synthesised at runtime — no audio files shipped. */
class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.crowdSource = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise(2.0);
    this._startCrowd();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gain, t, attack, decay, peak = 1) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** gunshot: filtered noise burst + low sine thump */
  shot(volume = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(5200, t);
    filt.frequency.exponentialRampToValueAtTime(420, t + 0.13);
    const g = this.ctx.createGain();
    this._env(g, t, 0.002, 0.16, 0.85 * volume);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.2);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g2 = this.ctx.createGain();
    this._env(g2, t, 0.002, 0.1, 0.6 * volume);
    osc.connect(g2).connect(this.master);
    osc.start(t); osc.stop(t + 0.15);
  }

  /** distant, duller gunshot for the robot */
  botShot() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2400, t);
    filt.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, t, 0.003, 0.13, 0.42);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.18);
  }

  impact(head = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(head ? 880 : 520, t);
    osc.frequency.exponentialRampToValueAtTime(head ? 180 : 120, t + 0.07);
    const g = this.ctx.createGain();
    this._env(g, t, 0.001, 0.07, 0.22);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.1);
  }

  click(high = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = high ? 2400 : 1100;
    const g = this.ctx.createGain();
    this._env(g, t, 0.001, 0.035, 0.25);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.05);
  }

  reload() { this.click(false); setTimeout(() => this.click(true), 190); }

  hurt() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, 0.22, 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.28);
  }

  beep(freq = 660, dur = 0.1, vol = 0.15) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = freq;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, dur, vol);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  cheer(intensity = 1) {
    if (!this.ctx || !this.enabled || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    const base = 0.055;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(base + 0.22 * intensity, t + 0.25);
    this.crowdGain.gain.exponentialRampToValueAtTime(base, t + 2.6);
  }

  /** Continuous low crowd murmur, shaped by a slow random walk. */
  _startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.55;
    const g = this.ctx.createGain();
    g.gain.value = 0.055;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.crowdGain = g;
    this.crowdSource = src;
  }
}

export const audio = new AudioKit();
