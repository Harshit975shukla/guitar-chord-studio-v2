/**
 * Acoustic Guitar Physical Modeling Engine
 * Karplus-Strong with fractional delay, formant filters, and convolution
 */

import { AcousticModel, StrumStyle, StringTuning } from '../types';

// ============================================================================
// Audio Engine Configuration
// ============================================================================

export interface AcousticEngineConfig {
  model: AcousticModel;
  masterVolume: number;
  strumStyle: StrumStyle;
  sampleRate: number;
}

export const DEFAULT_ENGINE_CONFIG: AcousticEngineConfig = {
  model: 'dreadnought',
  masterVolume: 1.0,
  strumStyle: 'down',
  sampleRate: 44100,
};

// ============================================================================
// Wooden Body Impulse Response (generated mathematically)
// ============================================================================

function createWoodenBodyImpulse(
  ctx: AudioContext, 
  duration: number = 0.22,
  model: AcousticModel = 'dreadnought'
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Model-specific reflection parameters
  let reflections: Array<{ t: number; g: number; gR: number }>;
  
  switch (model) {
    case 'nylon':
      // Classical guitar: warmer, more body resonance, less sparkle
      reflections = [
        { t: 0.0012, g: 0.80, gR: 0.75 },
        { t: 0.0028, g: -0.55, gR: -0.50 },
        { t: 0.0048, g: 0.40, gR: 0.35 },
        { t: 0.0072, g: -0.30, gR: -0.25 },
        { t: 0.0105, g: 0.22, gR: 0.20 },
        { t: 0.0148, g: -0.18, gR: -0.15 },
      ];
      break;
    case 'twelve':
      // 12-string: brighter, more air, wider stereo
      reflections = [
        { t: 0.0010, g: 0.65, gR: 0.70 },
        { t: 0.0025, g: -0.50, gR: -0.55 },
        { t: 0.0042, g: 0.35, gR: 0.40 },
        { t: 0.0068, g: -0.25, gR: -0.30 },
        { t: 0.0095, g: 0.18, gR: 0.22 },
        { t: 0.0132, g: -0.12, gR: -0.15 },
      ];
      break;
    default:
      // Dreadnought steel string: balanced, punchy
      reflections = [
        { t: 0.0014, g: 0.75, gR: 0.66 },
        { t: 0.0031, g: -0.60, gR: -0.53 },
        { t: 0.0052, g: 0.45, gR: 0.40 },
        { t: 0.0078, g: -0.35, gR: -0.31 },
        { t: 0.0115, g: 0.28, gR: 0.25 },
        { t: 0.0162, g: -0.22, gR: -0.19 },
      ];
  }

  // Early reflections (soundhole & cavity boundaries)
  reflections.forEach(r => {
    const idx = Math.floor(r.t * sampleRate);
    if (idx < numSamples) {
      left[idx] += r.g;
      right[idx] += r.gR;
    }
  });

  // Damped body modes avoid adding broadband noise to every sustained note.
  const modes = model === 'nylon' ? [98, 195, 380] : model === 'twelve' ? [104, 215, 420] : [102, 208, 400];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    for (let m = 0; m < modes.length; m++) {
      const amplitude = Math.exp(-t * (24 + m * 12)) * 0.08 / (m + 1);
      left[i] += Math.sin(2 * Math.PI * modes[m] * t) * amplitude;
      right[i] += Math.sin(2 * Math.PI * modes[m] * t + m * 0.12) * amplitude;
    }
  }

  // Normalize
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (peak > 0) {
    for (let i = 0; i < numSamples; i++) {
      left[i] /= peak;
      right[i] /= peak;
    }
  }

  return buffer;
}

// ============================================================================
// Master Acoustic Bus (filter chain + convolution)
// ============================================================================

export interface AcousticBus {
  ctx: AudioContext;
  model: AcousticModel;
  input: GainNode;
  helmholtz: BiquadFilterNode;
  topPlate: BiquadFilterNode;
  backPlate: BiquadFilterNode;
  sparkle: BiquadFilterNode;
  woodRollOff: BiquadFilterNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode | null;
  limiter: DynamicsCompressorNode;
  masterOut: GainNode;
}

export function createAcousticBus(ctx: AudioContext, config: AcousticEngineConfig): AcousticBus {
  const input = ctx.createGain();
  input.gain.value = 1.0;

  // 1. Helmholtz soundhole air cavity resonance
  const helmholtz = ctx.createBiquadFilter();
  helmholtz.type = 'peaking';

  // 2. Solid spruce/cedar soundboard breathing mode
  const topPlate = ctx.createBiquadFilter();
  topPlate.type = 'peaking';

  // 3. Rosewood/mahogany back plate cavity resonance
  const backPlate = ctx.createBiquadFilter();
  backPlate.type = 'peaking';

  // 4. Phosphor bronze string chime / pick sparkle
  const sparkle = ctx.createBiquadFilter();
  sparkle.type = 'peaking';

  // 5. Wood soundboard natural acoustic roll-off
  const woodRollOff = ctx.createBiquadFilter();
  woodRollOff.type = 'lowpass';

  // Dry/Wet for convolution
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();

  // Wooden body chamber convolver
  let convolver: ConvolverNode | null = null;
  try {
    convolver = ctx.createConvolver();
    convolver.buffer = createWoodenBodyImpulse(ctx, 0.22, config.model);
  } catch (e) {
    console.warn('Convolver creation failed:', e);
  }

  // Master acoustic limiter / compressor
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6.0;
  limiter.ratio.value = 4.0;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  const masterOut = ctx.createGain();
  masterOut.gain.value = config.masterVolume;

  // Wire acoustic filter graph
  input.connect(helmholtz);
  helmholtz.connect(topPlate);
  topPlate.connect(backPlate);
  backPlate.connect(sparkle);
  sparkle.connect(woodRollOff);

  // Dry / Wet Wood Body Convolution
  woodRollOff.connect(dryGain);
  dryGain.connect(limiter);

  if (convolver) {
    woodRollOff.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(limiter);
  }

  limiter.connect(masterOut);
  masterOut.connect(ctx.destination);

  const bus: AcousticBus = {
    ctx,
    model: config.model,
    input,
    helmholtz,
    topPlate,
    backPlate,
    sparkle,
    woodRollOff,
    dryGain,
    wetGain,
    convolver,
    limiter,
    masterOut,
  };

  updateAcousticBusSettings(bus, config.model);
  return bus;
}

export function updateAcousticBusSettings(bus: AcousticBus, model: AcousticModel): void {
  if (bus.model !== model && bus.convolver) bus.convolver.buffer = createWoodenBodyImpulse(bus.ctx, 0.22, model);
  bus.model = model;
  bus.dryGain.gain.value = 0.85;
  if (model === 'nylon') {
    // Spanish nylon: warmer, mellow highs, prominent cedar warmth
    bus.helmholtz.gain.value = 3.0;
    bus.helmholtz.frequency.value = 98;
    bus.helmholtz.Q.value = 4.0;
    bus.topPlate.gain.value = 2.5;
    bus.topPlate.frequency.value = 195;
    bus.topPlate.Q.value = 3.5;
    bus.backPlate.gain.value = 1.5;
    bus.backPlate.frequency.value = 380;
    bus.backPlate.Q.value = 2.2;
    bus.sparkle.gain.value = -2.0; // Soft singing trebles, no metal bite
    bus.sparkle.frequency.value = 2800;
    bus.sparkle.Q.value = 1.8;
    bus.woodRollOff.frequency.value = 4500;
    bus.wetGain.gain.value = 0.12;
  } else if (model === 'twelve') {
    // 12-string shimmer: bright octave presence, wide airy sparkle
    bus.helmholtz.gain.value = 2.0;
    bus.helmholtz.frequency.value = 104;
    bus.helmholtz.Q.value = 3.5;
    bus.topPlate.gain.value = 2.0;
    bus.topPlate.frequency.value = 215;
    bus.topPlate.Q.value = 3.0;
    bus.backPlate.gain.value = 1.0;
    bus.backPlate.frequency.value = 420;
    bus.backPlate.Q.value = 2.0;
    bus.sparkle.gain.value = 2.5; // Sparkling octave presence
    bus.sparkle.frequency.value = 3500;
    bus.sparkle.Q.value = 2.2;
    bus.woodRollOff.frequency.value = 7500;
    bus.wetGain.gain.value = 0.14;
  } else {
    // Standard steel dreadnought: full punch, deep body bass, crisp bronze chime
    bus.helmholtz.gain.value = 3.0;
    bus.helmholtz.frequency.value = 102;
    bus.helmholtz.Q.value = 3.8;
    bus.topPlate.gain.value = 2.0;
    bus.topPlate.frequency.value = 208;
    bus.topPlate.Q.value = 3.2;
    bus.backPlate.gain.value = 1.5;
    bus.backPlate.frequency.value = 400;
    bus.backPlate.Q.value = 2.5;
    bus.sparkle.gain.value = 1.5;
    bus.sparkle.frequency.value = 3100;
    bus.sparkle.Q.value = 2.0;
    bus.woodRollOff.frequency.value = 6000;
    bus.wetGain.gain.value = 0.10;
  }
}

// ============================================================================
// Physical String Synthesis (Karplus-Strong with fractional delay)
// ============================================================================

export interface StringSynthParams {
  freq: number;
  startTime: number;
  stringIndex: number; // 0-5 (high E to low E)
  velocity: number; // 0-1
  isOctave?: boolean; // for 12-string
  model?: AcousticModel;
  endTime?: number;
}

export function renderStringSamples(
  sampleRate: number,
  params: StringSynthParams
): Float32Array {
  const { freq, stringIndex, isOctave, model = 'dreadnought' } = params;
  if (!Number.isFinite(freq) || freq < 20 || freq > sampleRate / 4) throw new Error('String frequency is outside the synthesis range.');
  const duration = isOctave ? 1.6 : (model === 'nylon' ? 3.2 : 2.8);
  const numSamples = Math.floor(sampleRate * duration);
  const isNylon = model === 'nylon';
  const S = isNylon ? 0.44 : (model === 'twelve' ? 0.48 : 0.50);
  const omega = 2 * Math.PI * freq / sampleRate;
  const dampingDelay = Math.atan2((1 - S) * Math.sin(omega), 1 - (1 - S) * Math.cos(omega)) / omega;

  // Compensate the actual loop-filter phase, not a fixed half-sample estimate.
  const exactDelay = sampleRate / freq;
  let N = Math.floor(exactDelay - dampingDelay);
  let frac = (exactDelay - dampingDelay) - N;
  if (frac < 0.1) {
    N -= 1;
    frac += 1.0;
  }
  const ratio = Math.tan(omega * frac / 2) / Math.tan(omega / 2);
  const C = (1 - ratio) / (1 + ratio);
  let seed = (Math.round(freq * 1000) + stringIndex * 7919 + (isNylon ? 17 : 31)) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000 * 2 - 1;
  };

  // 2. PICK STRIKE COMB FILTER
  const pluckRatio = isNylon ? 0.20 : (model === 'twelve' ? 0.14 : 0.14);
  const pluckDelay = Math.max(2, Math.round(N * pluckRatio));

  // 3. PRE-FILTERED EXCITATION (Simulates pick stiffness & fingernail elasticity)
  const pickHardness = isNylon ? 0.85 : (model === 'twelve' ? 0.35 : 0.42);
  const noiseSeed = new Float32Array(N + 1);
  let flt = 0;
  for (let i = 0; i <= N; i++) {
    const raw = random();
    flt = flt * pickHardness + raw * (1 - pickHardness);
    noiseSeed[i] = flt;
  }

  // Comb-filtered excitation
  const delayLine = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const delayed = i >= pluckDelay ? noiseSeed[i - pluckDelay] : 0;
    delayLine[i] = noiseSeed[i] - delayed;
  }

  // 4. PHYSICAL STRING DECAY & LOSS FACTORS
  const baseLoss = isNylon ? 0.990 : (model === 'twelve' ? 0.996 : 0.995);
  const stringLossBonus = stringIndex * 0.0006; // 5 = low E; lower strings decay slower
  const lossFactor = Math.min(0.9982, baseLoss + stringLossBonus);
  const channelData = new Float32Array(numSamples);

  let delayIdx = 0;
  let allpassPrevIn = 0;
  let allpassPrevOut = 0;
  let filterPrev = 0;

  // Pluck contact transient envelope (10ms plectrum click)
  const clickSamples = Math.min(numSamples, Math.floor(sampleRate * 0.012));

  for (let i = 0; i < numSamples; i++) {
    const outSample = delayLine[delayIdx];

    // Loop lowpass damping
    const lowpassed = outSample * S + filterPrev * (1 - S);
    filterPrev = lowpassed;

    // Fractional delay allpass filter
    const allpassIn = lowpassed * lossFactor;
    const allpassOut = C * allpassIn + allpassPrevIn - C * allpassPrevOut;
    allpassPrevIn = allpassIn;
    allpassPrevOut = allpassOut;

    delayLine[delayIdx] = allpassOut;
    delayIdx = (delayIdx + 1) % N;

    // Add soft physical pick contact click in first 10ms
    let click = 0;
    if (i < clickSamples && !isOctave) {
      const env = Math.exp(-i / (sampleRate * 0.0028));
      click = random() * (isNylon ? 0.01 : 0.025) * env;
    }

    channelData[i] = outSample + click;
  }

  let mean = 0, peak = 0;
  for (const sample of channelData) mean += sample;
  mean /= channelData.length;
  for (const sample of channelData) peak = Math.max(peak, Math.abs(sample - mean));
  for (let i = 0; i < channelData.length; i++) {
    const fade = Math.min(1, i / (sampleRate * 0.001), (channelData.length - 1 - i) / (sampleRate * 0.015));
    channelData[i] = (channelData[i] - mean) * (peak ? 0.8 / peak : 1) * fade;
  }
  return channelData;
}

const stringBuffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function createStringBuffer(ctx: AudioContext, params: StringSynthParams): AudioBuffer {
  let cache = stringBuffers.get(ctx);
  if (!cache) { cache = new Map(); stringBuffers.set(ctx, cache); }
  const key = `${params.model}:${params.stringIndex}:${params.freq}:${!!params.isOctave}`;
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  const samples = renderStringSamples(ctx.sampleRate, params);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  let bytes = [...cache.values()].reduce((sum, b) => sum + b.length * 4, buffer.length * 4);
  for (const [oldKey, old] of cache) {
    if (bytes <= 8 * 1024 * 1024) break;
    cache.delete(oldKey); bytes -= old.length * 4;
  }
  cache.set(key, buffer);
  return buffer;
}

export function playAcousticString(
  ctx: AudioContext,
  bus: AcousticBus,
  params: StringSynthParams
): AudioBufferSourceNode {
  const { freq: _freq, startTime, stringIndex, velocity, isOctave, model = bus.model } = params;
  const now = Math.max(ctx.currentTime + 0.004, startTime);
  const duration = isOctave ? 1.6 : (model === 'nylon' ? 3.2 : 2.8);

  // Create physical string buffer
  const audioBuffer = createStringBuffer(ctx, { ...params, model });

  // Playback
  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = audioBuffer;

  // Dynamic string damping envelope
  const stringGain = ctx.createGain();
  const peakVol = 0.55 * velocity * (isOctave ? 0.6 : 1.0);
  stringGain.gain.setValueAtTime(0.0001, now);
  const end = params.endTime ?? now + duration;
  const length = Math.max(0.001, end - now);
  const attackEnd = now + Math.min(0.003, length * 0.1);
  const decayEnd = now + Math.min(0.20, length * 0.6);
  const releaseStart = Math.max(decayEnd, end - Math.min(0.025, length * 0.25));
  stringGain.gain.linearRampToValueAtTime(peakVol, attackEnd);
  stringGain.gain.exponentialRampToValueAtTime(peakVol * 0.35, decayEnd);
  stringGain.gain.exponentialRampToValueAtTime(0.00001, params.endTime === undefined ? end : releaseStart);
  if (params.endTime !== undefined) stringGain.gain.linearRampToValueAtTime(0, end);

  // Stereo Panorama: Spatialize strings across acoustic soundstage
  let panner: StereoPannerNode | null = null;
  if (ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    // Strings 0-5 (high E to low E) -> pan right to left
    const panMap = [-0.28, -0.17, -0.06, 0.06, 0.17, 0.28];
    const basePan = panMap[stringIndex] || 0;
    panner.pan.setValueAtTime(isOctave ? -basePan : basePan, now);
  }

  // Route through Master Acoustic Wood Body Bus
  if (panner) {
    bufferSource.connect(stringGain);
    stringGain.connect(panner);
    panner.connect(bus.input);
  } else {
    bufferSource.connect(stringGain);
    stringGain.connect(bus.input);
  }

  bufferSource.start(now);
  if (params.endTime !== undefined) bufferSource.stop(end);
  bufferSource.addEventListener('ended', () => { bufferSource.disconnect(); stringGain.disconnect(); panner?.disconnect(); }, { once: true });
  return bufferSource;
}

// ============================================================================
// High-Level Strumming Interface
// ============================================================================

export interface StrumParams {
  frets: (number | null)[]; // 6 strings, null = muted
  style: StrumStyle;
  velocity: number;
  tuning: StringTuning[];
  model?: AcousticModel;
  startTime?: number;
  endTime?: number;
  humanize?: boolean;
}

export function strumChord(
  ctx: AudioContext,
  bus: AcousticBus,
  params: StrumParams
): AudioBufferSourceNode[] {
  const { frets, style, velocity, tuning, model = bus.model, startTime } = params;
  const now = startTime ?? (ctx.currentTime + 0.015);

  const activeStrings: Array<{ index: number; fret: number }> = [];
  for (let s = 0; s < 6; s++) {
    const fret = frets[s];
    if (fret !== null && fret !== -1 && fret !== undefined) {
      activeStrings.push({ index: s, fret: fret as number });
    }
  }
  if (activeStrings.length === 0) return [];

  let order = [...activeStrings];
  let baseStagger = 0.022;

  if (style === 'up') {
    order.sort((a, b) => a.index - b.index); // high to low
    baseStagger = 0.020;
  } else if (style === 'arpeggio') {
    order.sort((a, b) => b.index - a.index); // low to high
    baseStagger = 0.110;
  } else if (style === 'roll') {
    order.sort((a, b) => b.index - a.index); // low to high, fast
    baseStagger = 0.012;
  } else {
    // down strum: low to high
    order.sort((a, b) => b.index - a.index);
    baseStagger = 0.022;
  }

  const sources: AudioBufferSourceNode[] = [];
  if (params.endTime !== undefined && order.length > 1) {
    baseStagger = Math.min(baseStagger, Math.max(0, params.endTime - now) * 0.5 / (order.length - 1));
  }

  order.forEach(({ index: s, fret }, idx) => {
    const midi = tuning[s].midi + fret;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    // Natural strum timing humanization
    const delay = idx * baseStagger + (params.humanize === false ? 0 : Math.random() * 0.003);
    const strVel = velocity * (0.85 + (5 - s) * 0.03); // lower strings slightly louder

    const source = playAcousticString(ctx, bus, {
      freq,
      startTime: now + delay,
      stringIndex: s,
      velocity: strVel,
      model,
      endTime: params.endTime,
    });
    sources.push(source);

    // In 12-string mode, trigger octave chorus pair on lower 4 strings
    if (model === 'twelve' && s >= 2) {
      const octave = playAcousticString(ctx, bus, {
        freq: freq * 2.002, // slight detune for chorus
        startTime: now + delay + 0.004,
        stringIndex: s,
        velocity: strVel * 0.65,
        isOctave: true,
        model,
        endTime: params.endTime,
      });
      sources.push(octave);
    }
  });

  return sources;
}

// ============================================================================
// Single Note Pluck (for tuner, transcriber, etc.)
// ============================================================================

export function playSingleNote(
  ctx: AudioContext,
  bus: AcousticBus,
  freq: number,
  velocity: number = 0.85,
  delay: number = 0
): AudioBufferSourceNode {
  // Determine which string this note would be played on (for timbre)
  let stringIndex = 2; // default to G string
  if (freq < 95) stringIndex = 0;
  else if (freq < 130) stringIndex = 1;
  else if (freq < 170) stringIndex = 2;
  else if (freq < 220) stringIndex = 3;
  else if (freq < 290) stringIndex = 4;
  else stringIndex = 5;

  const source = playAcousticString(ctx, bus, {
    freq,
    startTime: ctx.currentTime + Math.max(0.005, delay),
    stringIndex,
    velocity,
  });
  return source;
}

// ============================================================================
// Metronome / Click Sounds
// ============================================================================

export function playMetronomeClick(
  ctx: AudioContext,
  isAccent: boolean = false
): void {
  const now = ctx.currentTime;

  // Resonant wood block click
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(isAccent ? 1800 : 920, now);
  filter.Q.setValueAtTime(8, now);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isAccent ? 1200 : 650, now);
  osc.frequency.exponentialRampToValueAtTime(isAccent ? 400 : 250, now + 0.04);

  gain.gain.setValueAtTime(isAccent ? 0.35 : 0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (isAccent ? 0.07 : 0.05));

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.08);
}

export function playInTuneChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(now + 0.36);
}

// ============================================================================
// Test Chord (for speaker test)
// ============================================================================

export async function playTestChord(ctx: AudioContext, bus: AcousticBus): Promise<void> {
  // Rich G Major chord
  const gChordNotes = [
    { s: 5, freq: 98.00 },   // G2 (6th str, fret 3)
    { s: 4, freq: 123.47 },  // B2 (5th str, fret 2)
    { s: 3, freq: 146.83 },  // D3 (4th str open)
    { s: 2, freq: 196.00 },  // G3 (3rd str open)
    { s: 1, freq: 246.94 },  // B3 (2nd str open)
    { s: 0, freq: 392.00 },  // G4 (1st str, fret 3)
  ];

  gChordNotes.forEach((n, idx) => {
    playAcousticString(ctx, bus, {
      freq: n.freq,
      startTime: ctx.currentTime + 0.02 + idx * 0.024,
      stringIndex: n.s,
      velocity: 1.0,
    });
  });
}