import { STANDARD_TUNING, type StrumStyle, type StringTuning } from '../types';
import { guitarSamplePlayback, type GuitarSampleBank } from './guitarSamples';

export interface AcousticEngineConfig {
  bank: GuitarSampleBank;
  masterVolume: number;
  strumStyle: StrumStyle;
  sampleRate: number;
}

export const DEFAULT_ENGINE_CONFIG: AcousticEngineConfig = {
  bank: 'steel', masterVolume: 1, strumStyle: 'down', sampleRate: 44100,
};

export interface AcousticBus {
  ctx: AudioContext;
  sampleBank: GuitarSampleBank;
  input: GainNode;
  limiter: DynamicsCompressorNode;
  masterOut: GainNode;
  sources: Map<AudioBufferSourceNode, GainNode>;
}

export function createAcousticBus(ctx: AudioContext, config: AcousticEngineConfig): AcousticBus {
  const input = ctx.createGain(), limiter = ctx.createDynamicsCompressor(), masterOut = ctx.createGain();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 4;
  limiter.attack.value = .002;
  limiter.release.value = .12;
  masterOut.gain.value = config.masterVolume;
  input.connect(limiter); limiter.connect(masterOut); masterOut.connect(ctx.destination);
  return { ctx, sampleBank: config.bank, input, limiter, masterOut, sources: new Map() };
}

export interface GuitarNoteParams {
  freq: number;
  startTime: number;
  stringIndex: number;
  velocity: number;
  endTime?: number;
}

/** Play the selected recording without synthetic body filters or an artificial decay. */
export function playAcousticString(ctx: AudioContext, bus: AcousticBus, params: GuitarNoteParams): AudioBufferSourceNode {
  const { freq, startTime, stringIndex, velocity } = params;
  const recording = guitarSamplePlayback(ctx, bus.sampleBank, freq, stringIndex);
  const now = Math.max(ctx.currentTime + .004, startTime);
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = recording.buffer;
  source.playbackRate.value = recording.rate;
  const naturalEnd = now + (recording.buffer.duration - recording.offset) / recording.rate;
  const end = Math.min(params.endTime ?? naturalEnd, naturalEnd), length = Math.max(.001, end - now);
  const attackEnd = now + Math.min(.003, length * .1), level = .65 * velocity;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.linearRampToValueAtTime(level, attackEnd);
  gain.gain.setValueAtTime(level, Math.max(attackEnd, end - Math.min(.025, length * .25)));
  gain.gain.linearRampToValueAtTime(0, end);
  let panner: StereoPannerNode | null = null;
  source.connect(gain);
  if (ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    panner.pan.value = [-.28, -.17, -.06, .06, .17, .28][stringIndex];
    gain.connect(panner); panner.connect(bus.input);
  } else gain.connect(bus.input);
  source.start(now, recording.offset); source.stop(end);
  bus.sources.set(source, gain);
  source.addEventListener('ended', () => {
    bus.sources.delete(source); source.disconnect(); gain.disconnect(); panner?.disconnect();
  }, { once: true });
  return source;
}

export function stopAcousticSources(bus: AcousticBus): void {
  const now = bus.ctx.currentTime;
  bus.sources.forEach((gain, source) => {
    gain.gain.cancelAndHoldAtTime(now); gain.gain.linearRampToValueAtTime(0, now + .012);
    source.stop(now + .012);
  });
  bus.sources.clear();
}

export interface StrumParams {
  frets: (number | null)[];
  style: StrumStyle;
  velocity: number;
  tuning: StringTuning[];
  startTime?: number;
  endTime?: number;
  humanize?: boolean;
}

export function strumChord(ctx: AudioContext, bus: AcousticBus, params: StrumParams): AudioBufferSourceNode[] {
  const { frets, style, velocity, tuning, startTime } = params;
  const now = startTime ?? ctx.currentTime + .015;
  const order = frets.flatMap((fret, index) => fret === null || fret < 0 ? [] : [{ index, fret }]);
  if (!order.length) return [];
  order.sort((a, b) => style === 'up' ? a.index - b.index : b.index - a.index);
  let stagger = style === 'up' ? .020 : style === 'arpeggio' ? .110 : style === 'roll' ? .012 : .022;
  if (params.endTime !== undefined && order.length > 1) {
    stagger = Math.min(stagger, Math.max(0, params.endTime - now) * .5 / (order.length - 1));
  }
  return order.map(({ index: s, fret }, i) => playAcousticString(ctx, bus, {
    freq: 440 * 2 ** ((tuning[s].midi + fret - 69) / 12),
    startTime: now + i * stagger + (params.humanize === false ? 0 : Math.random() * .003),
    stringIndex: s, velocity: velocity * (.85 + (5 - s) * .03), endTime: params.endTime,
  }));
}

export function playSingleNote(ctx: AudioContext, bus: AcousticBus, freq: number, velocity = .85, delay = 0): AudioBufferSourceNode {
  const index = STANDARD_TUNING.findIndex(string => freq >= string.freq);
  return playAcousticString(ctx, bus, {
    freq, velocity, stringIndex: index < 0 ? 5 : index, startTime: ctx.currentTime + Math.max(.005, delay),
  });
}

export function playMetronomeClick(ctx: AudioContext, isAccent = false, startTime = ctx.currentTime): () => void {
  const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(isAccent ? 1800 : 920, startTime);
  filter.Q.setValueAtTime(8, startTime);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isAccent ? 1200 : 650, startTime);
  osc.frequency.exponentialRampToValueAtTime(isAccent ? 400 : 250, startTime + .04);
  gain.gain.setValueAtTime(isAccent ? .35 : .22, startTime);
  gain.gain.exponentialRampToValueAtTime(.0001, startTime + (isAccent ? .07 : .05));
  osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  osc.start(startTime); osc.stop(startTime + .08);
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true; osc.disconnect(); filter.disconnect(); gain.disconnect();
  };
  osc.addEventListener('ended', cleanup, { once: true });
  return () => { if (!disposed) { osc.stop(); cleanup(); } };
}

export function playInTuneChime(ctx: AudioContext): void {
  const now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1760, now + .15);
  gain.gain.setValueAtTime(.12, now); gain.gain.exponentialRampToValueAtTime(.001, now + .35);
  osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(now + .36);
}

export async function playTestChord(ctx: AudioContext, bus: AcousticBus): Promise<void> {
  const notes = [
    { s: 5, freq: 98 }, { s: 4, freq: 123.47 }, { s: 3, freq: 146.83 },
    { s: 2, freq: 196 }, { s: 1, freq: 246.94 }, { s: 0, freq: 392 },
  ];
  notes.forEach((note, i) => playAcousticString(ctx, bus, {
    freq: note.freq, stringIndex: note.s, startTime: ctx.currentTime + .02 + i * .024, velocity: 1,
  }));
}
