// REDCAIRN — sound, made in the browser (Web Audio), no recordings. Off until you turn it on.
//   lander   a low rumble during the descent, a thud at touchdown
//   suit     your own breathing inside the helmet, faster when the alarm sounds
//   outside  the thin wind, the rover's motors when it rolls
//   radio    a click of static before the habitat speaks
//   voice    a recorded line through a radio filter, when assets/audio has it
//   alarm    two-tone warning for the solar storm

export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.mode = 'off';
  }

  #init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // One shared bed of noise; every voice filters it differently.
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.015 * w; d[i] = w * 0.35 + b * 4; }
    this.noiseBuf = buf;
    const voice = (type, f, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(flt).connect(g).connect(this.master); src.start();
      return { flt, g, gain };
    };
    this.wind = voice('lowpass', 380, 0.4, 0.22);
    this.rumble = voice('lowpass', 90, 0.7, 0.9);
    this.breath = voice('bandpass', 620, 0.8, 0.0);
    // The rover's motors: two detuned saws through a low filter.
    const mg = ctx.createGain(); mg.gain.value = 0;
    const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 420;
    for (const hz of [92, 93.7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(mf); o.start(); }
    mf.connect(mg).connect(this.master);
    this.motor = mg;
    this.#breathe();
  }

  // Inhale, exhale, pause: the loudest thing inside a helmet.
  #breathe() {
    const ctx = this.ctx, g = this.breath.g.gain;
    const fast = this.mode === 'storm';
    const period = fast ? 2.6 : 4.4, inh = fast ? 0.9 : 1.5, exh = fast ? 1.2 : 2.0;
    const level = this.mode === 'suit' || this.mode === 'outside' || this.mode === 'storm' ? (fast ? 0.16 : 0.1) : 0;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(level, t + inh);
    g.linearRampToValueAtTime(level * 0.6, t + inh + 0.15);
    g.linearRampToValueAtTime(0.0001, t + inh + exh);
    this.breath.flt.frequency.setValueAtTime(fast ? 760 : 620, t);
    clearTimeout(this.bt);
    this.bt = setTimeout(() => this.#breathe(), period * 1000);
  }

  setEnabled(on) {
    this.on = on;
    if (on) this.#init();
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.3);
    this.scene(this.mode);
  }

  scene(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (v, x) => v.g.gain.setTargetAtTime(x, t, 0.8);
    set(this.wind, mode === 'outside' || mode === 'storm' || mode === 'home' ? this.wind.gain : 0);
    set(this.rumble, mode === 'lander' ? this.rumble.gain : 0);
    if (mode !== 'outside' && mode !== 'storm') this.motor.gain.setTargetAtTime(0, t, 0.4);
  }

  roverMoving(moving) {
    if (!this.ctx) return;
    this.motor.gain.setTargetAtTime(moving ? 0.035 : 0, this.ctx.currentTime, 0.35);
  }

  #blip(freq, start, dur, vol, type = 'sine') {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start); o.stop(start + dur + 0.05);
  }

  #static(start, dur, vol) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(start, Math.random()); src.stop(start + dur + 0.05);
  }

  radio() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.#static(t, 0.18, 0.5);
    this.#blip(1320, t + 0.2, 0.09, 0.12);
    this.#static(t + 0.32, 0.12, 0.25);
  }

  // A recorded line (assets/audio/*.m4a, if it exists), played as if over a suit radio:
  // narrowed to a radio band, lightly overdriven, with a click of static at each end.
  async voice(url) {
    if (!this.ctx || !this.on) return;
    this.vcache = this.vcache || {};
    try {
      let buf = this.vcache[url];
      if (buf === null) return;
      if (!buf) {
        const r = await fetch(url);
        if (!r.ok) { this.vcache[url] = null; return; }
        buf = this.vcache[url] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      }
      const ctx = this.ctx, src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const sh = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(2.2 * x); }
      sh.curve = curve;
      const g = ctx.createGain(); g.gain.value = 0.85;
      src.connect(hp).connect(lp).connect(sh).connect(g).connect(this.master);
      const t = ctx.currentTime + 0.32;
      src.start(t);
      this.#static(t + buf.duration, 0.16, 0.4);
    } catch (e) { this.vcache[url] = null; }
  }

  alarm() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) { this.#blip(880, t + i * 0.6, 0.22, 0.14, 'square'); this.#blip(660, t + i * 0.6 + 0.26, 0.22, 0.14, 'square'); }
  }

  thud() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.8);
    this.#static(t, 0.4, 0.3);
  }
}
