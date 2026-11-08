// Procedural soundtrack for the Million Stars site. Web Audio only: no assets, no deps.
import type { AudioAPI } from './api';

// A minor pentatonic (semitones above A), used for pings.
const PENTA = [0, 3, 5, 7, 10];

/** Random A-minor-pentatonic frequency spanning `octaves` octaves above `baseHz`. */
function pentaFreq(baseHz: number, octaves: number): number {
  const steps = PENTA.length * octaves;
  const i = Math.floor(Math.random() * steps);
  const semis = PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length);
  return baseHz * Math.pow(2, semis / 12);
}

export function createAudio(): AudioAPI {
  let ctx: AudioContext | null = null;
  let startPromise: Promise<void> | null = null;
  let on = false;

  let master: GainNode;      // toggle fade lives here
  let droneBus: GainNode;    // ambient level (~0.18) with the 2s fade-in
  let fxBus: GainNode;       // one-shots, dry path
  let reverbIn: GainNode;    // send into the convolver
  let whiteNoise: AudioBuffer;
  let lastWhoosh = -1;

  interface CollapseNodes {
    gain: GainNode;
    saw: OscillatorNode;
    riser: OscillatorNode;
    all: AudioNode[];
    stopping: boolean;
  }
  let collapse: CollapseNodes | null = null;

  // ---------- buffers ----------
  function makeNoise(c: AudioContext, seconds: number): AudioBuffer {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function makePink(c: AudioContext, seconds: number): AudioBuffer {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  function makeImpulse(c: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.6);
      }
    }
    return buf;
  }

  // ---------- helpers ----------
  /** Disconnect `nodes` once `src` ends. */
  function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => {
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* already gone */ }
      }
    };
  }

  /** Route a node to the dry bus and the reverb send at given levels. */
  function route(node: AudioNode, c: AudioContext, dry: number, wet: number, extra: AudioNode[]): void {
    if (dry > 0) {
      const g = c.createGain();
      g.gain.value = dry;
      node.connect(g).connect(fxBus);
      extra.push(g);
    }
    if (wet > 0) {
      const g = c.createGain();
      g.gain.value = wet;
      node.connect(g).connect(reverbIn);
      extra.push(g);
    }
  }

  /** One-shot noise source from the shared buffer at a random offset. */
  function noiseSource(c: AudioContext, when: number, dur: number): AudioBufferSourceNode {
    const src = c.createBufferSource();
    src.buffer = whiteNoise;
    src.start(when, Math.random() * (whiteNoise.duration - dur - 0.1));
    src.stop(when + dur);
    return src;
  }

  /** Soft sine ping through the reverb. */
  function ping(c: AudioContext, when: number, freq: number, peak: number, decay: number): void {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(g);
    const nodes: AudioNode[] = [osc, g];
    route(g, c, 0.35, 1, nodes);
    cleanup(osc, nodes);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  }

  // ---------- ambient bed ----------
  function buildDrone(c: AudioContext): void {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.Q.value = 0.7;
    const lpLfo = c.createOscillator();
    lpLfo.frequency.value = 0.03;
    const lpLfoGain = c.createGain();
    lpLfoGain.gain.value = 300;
    lpLfo.connect(lpLfoGain).connect(lp.frequency);
    lpLfo.start();

    const voices: Array<[number, OscillatorType, number]> = [
      [55.0, 'sine', 0.5],       // A1
      [82.41, 'triangle', 0.3],  // E2
      [110.0, 'sine', 0.4],      // A2
      [138.59, 'triangle', 0.18] // C#3
    ];
    voices.forEach(([freq, type, level], i) => {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      // +-4 cents slow pitch drift
      const drift = c.createOscillator();
      drift.frequency.value = 0.05 + i * 0.023;
      const driftGain = c.createGain();
      driftGain.gain.value = 4;
      drift.connect(driftGain).connect(osc.detune);
      drift.start();
      // slow amplitude swell
      const amp = c.createGain();
      amp.gain.value = level;
      const swell = c.createOscillator();
      swell.frequency.value = 0.04 + i * 0.017;
      const swellGain = c.createGain();
      swellGain.gain.value = level * 0.4;
      swell.connect(swellGain).connect(amp.gain);
      swell.start();
      osc.connect(amp).connect(lp);
      osc.start();
    });

    const droneOut = c.createGain();
    droneOut.gain.value = 1;
    lp.connect(droneOut);
    droneOut.connect(droneBus);
    const send = c.createGain();
    send.gain.value = 0.9;
    droneOut.connect(send).connect(reverbIn);

    // very quiet filtered pink-noise bed
    const pink = c.createBufferSource();
    pink.buffer = makePink(c, 6);
    pink.loop = true;
    const pinkFilter = c.createBiquadFilter();
    pinkFilter.type = 'lowpass';
    pinkFilter.frequency.value = 500;
    const pinkGain = c.createGain();
    pinkGain.gain.value = 0.05;
    pink.connect(pinkFilter).connect(pinkGain).connect(droneBus);
    pinkGain.connect(reverbIn);
    pink.start();
  }

  // ---------- public ----------
  function start(): Promise<void> {
    if (startPromise) return startPromise;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return (startPromise = Promise.resolve());
    const c = new Ctor();
    ctx = c;
    on = true;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(c.destination);

    master = c.createGain();
    master.gain.value = 1;
    master.connect(comp);

    droneBus = c.createGain();
    droneBus.gain.setValueAtTime(0, c.currentTime);
    droneBus.gain.linearRampToValueAtTime(0.18, c.currentTime + 2);
    droneBus.connect(master);

    fxBus = c.createGain();
    fxBus.gain.value = 1;
    fxBus.connect(master);

    const convolver = c.createConvolver();
    convolver.buffer = makeImpulse(c, 3);
    reverbIn = c.createGain();
    reverbIn.gain.value = 1;
    const reverbOut = c.createGain();
    reverbOut.gain.value = 0.7;
    reverbIn.connect(convolver).connect(reverbOut).connect(master);

    whiteNoise = makeNoise(c, 3);
    buildDrone(c);

    startPromise = c.resume().catch(() => { /* blocked until a gesture; ignore */ });
    return startPromise;
  }

  function toggle(): boolean {
    if (!ctx) {
      void start();
      return true;
    }
    on = !on;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(on ? 1 : 0, t + 0.3);
    if (on && ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return on;
  }

  function isOn(): boolean {
    return on;
  }

  function whoosh(): void {
    const c = ctx;
    if (!c || !on) return;
    const t = c.currentTime;
    if (lastWhoosh >= 0 && t - lastWhoosh < 0.15) return;
    lastWhoosh = t;
    const dur = 0.6;

    const src = noiseSource(c, t, dur + 0.05);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g);
    const nodes: AudioNode[] = [src, bp, g];
    route(g, c, 0.7, 0.5, nodes);
    cleanup(src, nodes);

    ping(c, t + 0.05, pentaFreq(440, 2), 0.07, 1.6);
  }

  function collapseStart(): void {
    const c = ctx;
    if (!c || !on || collapse) return;
    const t = c.currentTime;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 2.5);

    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 55;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(150, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + 2.5);
    const sawGain = c.createGain();
    sawGain.gain.value = 0.7;
    saw.connect(lp).connect(sawGain).connect(gain);

    const riser = c.createOscillator();
    riser.type = 'sine';
    riser.frequency.setValueAtTime(110, t);
    riser.frequency.exponentialRampToValueAtTime(440, t + 3);
    const riserGain = c.createGain();
    riserGain.gain.value = 0.45;
    riser.connect(riserGain).connect(gain);

    const all: AudioNode[] = [saw, lp, sawGain, riser, riserGain, gain];
    gain.connect(fxBus);
    const send = c.createGain();
    send.gain.value = 0.3;
    gain.connect(send).connect(reverbIn);
    all.push(send);

    const state: CollapseNodes = { gain, saw, riser, all, stopping: false };
    collapse = state;
    saw.onended = () => {
      for (const n of all) {
        try { n.disconnect(); } catch { /* already gone */ }
      }
    };
    saw.start(t);
    riser.start(t);
  }

  function collapseStop(): void {
    const c = ctx;
    const s = collapse;
    if (!c || !s || s.stopping) return;
    s.stopping = true;
    collapse = null;
    const t = c.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    s.gain.gain.linearRampToValueAtTime(0, t + 0.15);
    s.saw.stop(t + 0.18);
    s.riser.stop(t + 0.18);
  }

  function burst(): void {
    const c = ctx;
    if (!c || !on) return;
    const t = c.currentTime;

    // noise burst, lowpass closing 6000 -> 200 Hz over 1.2 s
    const src = noiseSource(c, t, 1.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.6, t + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    src.connect(lp).connect(ng);
    const nNodes: AudioNode[] = [src, lp, ng];
    route(ng, c, 0.8, 0.8, nNodes);
    cleanup(src, nNodes);

    // sub thump, sine 60 -> 30 Hz over 0.4 s
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(0.6, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    sub.connect(sg);
    const sNodes: AudioNode[] = [sub, sg];
    route(sg, c, 1, 0.4, sNodes);
    cleanup(sub, sNodes);
    sub.start(t);
    sub.stop(t + 0.65);

    // shimmering tail: 5-7 quick pentatonic pings over 0.8 s
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + 0.1 + (i / n) * 0.8 + Math.random() * 0.04;
      ping(c, at, pentaFreq(880, 2), 0.06, 1.4);
    }
  }

  return { start, toggle, isOn, whoosh, collapseStart, collapseStop, burst };
}
