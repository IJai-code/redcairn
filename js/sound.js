// REDCAIRN — sound, made in the browser (Web Audio). On from the first click unless you turn it off.
//   score    an original ambient score, generated here: slow chords, a soft reverb, sparse high notes
//   lander   a low rumble during the descent, a thud at touchdown
//   suit     your own breathing inside the helmet, faster when the alarm sounds
//   outside  the thin wind, the rover's motors when it rolls
//   radio    a click of static before the habitat speaks
//   voice    a recorded line through a radio filter, when assets/audio has it
//   alarm    two-tone warning for the solar storm
//   film     wind and a low rumble under the opening; birthday(): the tune Curiosity vibrated in 2013

export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.mode = 'off';
    this.live = new Set();     // every recorded line or clip now sounding, so a jump can silence them
    this.gen = 0;              // bumped by hush(): a line still loading when you leave is never played
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
    this.wind = voice('lowpass', 420, 0.4, 0.4);
    this.rumble = voice('lowpass', 90, 0.7, 0.9);
    this.breath = voice('bandpass', 620, 0.8, 0.0);
    // The rover's motors: two detuned saws through a low filter.
    const mg = ctx.createGain(); mg.gain.value = 0;
    const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 420;
    for (const hz of [92, 93.7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(mf); o.start(); }
    mf.connect(mg).connect(this.master);
    this.motor = mg;
    // The score: its own bus through a generated reverb, so it sits behind everything else.
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.scoreBus = ctx.createGain(); this.scoreBus.gain.value = 0;
    this.scoreLP = ctx.createBiquadFilter(); this.scoreLP.type = 'lowpass'; this.scoreLP.frequency.value = 2400;
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    const wet = ctx.createGain(); wet.gain.value = 0.75;
    this.scoreBus.connect(this.scoreLP);
    this.scoreLP.connect(dry).connect(this.master);
    this.scoreLP.connect(this.verb); this.verb.connect(wet).connect(this.master);
    this.#breathe();
  }

  // ---------------------------------------------------------------- the score
  // Slow chords that change every eight seconds, and now and then a high note, like light on a ridge.
  // Wistful in A minor; darker for the storm; it settles on a major chord at home.
  static CHORDS = {
    walk: [[45, 52, 59, 60, 64], [41, 48, 52, 57, 60], [48, 55, 62, 64, 67], [43, 50, 52, 59, 62]],
    storm: [[38, 45, 50, 53, 57], [34, 41, 46, 50, 53], [36, 43, 48, 51, 55], [38, 45, 49, 52, 57]],
    home: [[48, 55, 59, 62, 64], [41, 48, 55, 57, 64], [43, 50, 55, 59, 62], [48, 55, 62, 64, 71]],
  };
  #pad(midi, t, dur, vol, bus) {
    const ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 2.6);
    g.gain.setValueAtTime(vol, t + dur - 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8);
    for (const [type, det, v] of [['triangle', 0, 1], ['sine', 1.003, 0.6], ['sine', 0.5, 0.35]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * (det || 1);
      const og = ctx.createGain(); og.gain.value = v;
      o.connect(og).connect(g); o.start(t); o.stop(t + dur + 2);
    }
    g.connect(bus || this.scoreBus);
  }
  #bell(midi, t, vol, bus) {
    const ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g).connect(bus || this.scoreBus); o.start(t); o.stop(t + 3.6);
  }
  #tick() {
    if (!this.ctx || !this.on) return;
    const set = Sound.CHORDS[this.mood] || Sound.CHORDS.walk, chord = set[this.chordI++ % set.length];
    const t = this.ctx.currentTime + 0.05, dur = 8;
    const layer = this.ctx.createGain(); layer.gain.value = 1; layer.connect(this.scoreBus);
    this.layers = (this.layers || []).filter((l) => l.until > t);
    this.layers.push({ g: layer, until: t + dur + 2.2 });
    chord.forEach((m, i) => this.#pad(m, t, dur, i < 2 ? 0.05 : 0.032, layer));
    // two or three sparse high notes from the chord, two octaves up
    for (let k = 0; k < 3; k++) if (Math.random() < 0.75) this.#bell(chord[2 + Math.floor(Math.random() * 3)] + 24, t + 1 + k * 2.3 + Math.random(), 0.022, layer);
    clearTimeout(this.scoreT);
    this.scoreT = setTimeout(() => this.#tick(), dur * 1000);
  }
  score(mood = 'walk', level = 1) {
    if (!this.ctx) return;
    const changed = mood !== this.mood;
    this.mood = mood;
    this.scoreLevel = level;
    this.scoreBus.gain.setTargetAtTime(this.on ? 0.95 * level : 0, this.ctx.currentTime, 1.2);
    this.scoreLP.frequency.setTargetAtTime(mood === 'storm' ? 900 : 2400, this.ctx.currentTime, 1.5);
    if (this.chordI === undefined) this.chordI = 0;
    if (changed && this.layers) {
      // let the old chord go over a second and a half instead of sounding against the new one
      const t = this.ctx.currentTime;
      for (const l of this.layers) { l.g.gain.cancelScheduledValues(t); l.g.gain.setTargetAtTime(0, t, 0.5); }
      this.layers = [];
    }
    if (changed || !this.scoreT) { if (changed) this.chordI = 0; this.#tick(); }
  }
  // Voices sit on top: the score dips while someone is speaking.
  #duck(t, dur) {
    if (!this.scoreBus) return;
    const g = this.scoreBus.gain, base = 0.95 * (this.scoreLevel ?? 1);
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * 0.35, t, 0.15);
    g.setTargetAtTime(base, t + dur, 0.8);
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
    this.master.gain.setTargetAtTime(on ? 1.0 : 0, this.ctx.currentTime, 0.3);
    this.scene(this.mode);
    if (on) this.score(this.mood || 'walk', this.scoreLevel ?? 1); else if (this.scoreBus) { clearTimeout(this.scoreT); this.scoreT = null; this.scoreBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); }
  }

  scene(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (v, x) => v.g.gain.setTargetAtTime(x, t, 0.8);
    set(this.wind, mode === 'outside' || mode === 'storm' || mode === 'home' ? this.wind.gain : mode === 'film' ? this.wind.gain * 1.1 : mode === 'world' ? this.wind.gain * 0.8 : 0);
    set(this.rumble, mode === 'lander' ? this.rumble.gain : mode === 'film' ? this.rumble.gain * 0.35 : 0);
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
  async voice(url, robot = false) {
    if (!this.ctx || !this.on) return;
    this.vcache = this.vcache || {};
    try {
      let buf = this.vcache[url];
      if (buf === null) return;
      const gen = this.gen;
      if (!buf) {
        const r = await fetch(url);
        if (!r.ok) { this.vcache[url] = null; return; }
        buf = this.vcache[url] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      }
      if (gen !== this.gen || !this.on) return;      // you moved on while it loaded
      const ctx = this.ctx, src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const sh = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(2.2 * x); }
      sh.curve = curve;
      const g = ctx.createGain(); g.gain.value = 1.15;
      let head = src;
      if (robot) {
        // Curiosity speaking: ring-modulated against a low tone and a little crushed, so it sounds like a machine.
        const ring = ctx.createGain(); ring.gain.value = 0;
        const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = 62;
        car.connect(ring.gain);
        const dry = ctx.createGain(); dry.gain.value = 0.45;
        const mix = ctx.createGain();
        src.connect(ring).connect(mix); src.connect(dry).connect(mix);
        const crush = ctx.createWaveShaper(), cc = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; cc[i] = Math.round(x * 10) / 10; }
        crush.curve = cc;
        mix.connect(crush);
        head = crush;
        const t0 = ctx.currentTime + 0.32;
        car.start(t0); car.stop(t0 + buf.duration + 0.2);
      }
      head.connect(hp).connect(lp).connect(sh).connect(g).connect(this.master);
      const t = ctx.currentTime + 0.32;
      src.start(t);
      // a hiss of static under the whole line, like an open channel
      const ns = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      ns.buffer = this.noiseBuf; ns.loop = true; nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 0.5;
      ng.gain.setValueAtTime(0.0001, t - 0.1); ng.gain.exponentialRampToValueAtTime(0.05, t); ng.gain.setValueAtTime(0.05, t + buf.duration); ng.gain.exponentialRampToValueAtTime(0.0001, t + buf.duration + 0.25);
      ns.connect(nf).connect(ng).connect(this.master); ns.start(t - 0.1, Math.random()); ns.stop(t + buf.duration + 0.3);
      const handle = { stop: () => { const n = ctx.currentTime; for (const x of [g, ng]) { x.gain.cancelScheduledValues(n); x.gain.setTargetAtTime(0, n, 0.04); } try { src.stop(n + 0.2); ns.stop(n + 0.2); } catch (e) { /* ended */ } } };
      this.live.add(handle);
      src.onended = () => this.live.delete(handle);
      this.#duck(t - 0.1, buf.duration + 0.3);
      this.#static(t + buf.duration, 0.16, 0.4);
    } catch (e) { this.vcache[url] = null; }
  }

  // A recording played as it is (no radio filter): the real 2013 tune from NASA. Returns a handle to fade it out.
  async clip(url, gain = 0.9) {
    if (!this.ctx || !this.on) return null;
    this.vcache = this.vcache || {};
    try {
      let buf = this.vcache[url];
      if (buf === null) return null;
      const gen = this.gen;
      if (!buf) {
        const r = await fetch(url);
        if (!r.ok) { this.vcache[url] = null; return null; }
        buf = this.vcache[url] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      }
      if (gen !== this.gen || !this.on) return null;
      const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; g.gain.value = gain;
      src.connect(g).connect(this.master);
      src.start(ctx.currentTime + 0.05);
      const handle = { stop: (fade = 1.2) => { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, fade / 3); try { src.stop(t + fade + 0.2); } catch (e) { /* already ended */ } this.live.delete(handle); } };
      this.live.add(handle);
      src.onended = () => this.live.delete(handle);
      return handle;
    } catch (e) { this.vcache[url] = null; return null; }
  }

  // Warm the cache so the first play starts on time.
  async preload(url) {
    if (!this.ctx) return;
    this.vcache = this.vcache || {};
    if (this.vcache[url] !== undefined) return;
    try { const r = await fetch(url); this.vcache[url] = r.ok ? await this.ctx.decodeAudioData(await r.arrayBuffer()) : null; } catch (e) { this.vcache[url] = null; }
  }

  // Silence every line and clip now playing (or still loading), stop the motors, and put the score back at its level.
  // Called whenever the story jumps, so nothing from the last scene talks over the next.
  hush(voicesOnly = false) {
    this.gen++;
    for (const h of [...this.live]) h.stop(0.15);
    this.live.clear();
    if (!this.ctx || voicesOnly) return;
    const t = this.ctx.currentTime;
    this.motor.gain.cancelScheduledValues(t); this.motor.gain.setTargetAtTime(0, t, 0.1);
    if (this.scoreBus) { const g = this.scoreBus.gain; g.cancelScheduledValues(t); g.setTargetAtTime(this.on ? 0.95 * (this.scoreLevel ?? 1) : 0, t, 0.3); }
  }

  // On 5 August 2013 Curiosity's sample lab (SAM) vibrated at the pitches of "Happy Birthday".
  // This is that tune as a vibration would make it: a buzzy tone through a narrow band, not an instrument.
  birthday() {
    if (!this.ctx || !this.on) return;
    const t0 = this.ctx.currentTime + 0.15, q = 0.4;
    const N = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33 };
    const tune = [['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2.5]];
    let t = t0;
    for (const [n, d] of tune) { this.#buzz(N[n], t, d * q * 0.9); t += d * q; }
  }

  #buzz(f, start, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    o2.type = 'sawtooth'; o2.frequency.value = f * 1.006;
    bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2.2;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.07, start + 0.025);
    g.gain.setValueAtTime(0.07, start + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(bp); o2.connect(bp); bp.connect(g).connect(this.master);
    o.start(start); o2.start(start); o.stop(start + dur + 0.05); o2.stop(start + dur + 0.05);
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
