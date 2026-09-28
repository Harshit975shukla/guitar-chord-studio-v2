import type { RhythmStroke } from '../tabs/rhythm';
import { DRUM_BANKS, DRUM_FILES } from './percussionSampleData';
import { loadPercussionRecordings, markPercussionKitActive, percussionLayer, percussionRecording } from './percussionSamples';

export const PERCUSSION_KITS = {
  original: 'Pattern instruments · mixed sources', tabla: 'Tabla · legacy synthesized', conga: 'Congas · recorded',
  bongos: 'Bongos · recorded', cajon: 'Cajón · recorded', drums: 'Drums · Standard',
  'drums-powerful': 'Drums · Powerful', 'drums-monumental': 'Drums · Monumental',
  'drums-smooth': 'Drums · Smooth', 'drums-minimalistic': 'Drums · Minimalistic', 'drums-energetic': 'Drums · Energetic',
} as const;
export type PercussionKit = keyof typeof PERCUSSION_KITS;
/** Sample sources: pulse-player kits plus the groove trainer's multi-velocity studio kit. */
export type SampleKit = PercussionKit | 'studio';
export type PercussionVoice = Exclude<RhythmStroke['type'], 'bayan_dayan'>;
export interface PercussionLevels { volume: number; bass: number; treble: number }
export const DEFAULT_PERCUSSION_LEVELS: PercussionLevels = { volume: 1, bass: 0.8, treble: 0.75 };
export const PERCUSSION_CEILING = 0.88;
export interface PercussionHit { voice: PercussionVoice; channel: 'bass' | 'treble' }

export const PERCUSSION_VOICES: Record<PercussionVoice, string> = {
  bayan: 'Bayan', dayan_na: 'Dayan · Na', dayan_tin: 'Dayan · Tin', dayan_ta: 'Dayan · Ta',
  cajon_bass: 'Cajón hit 1', cajon_snare: 'Cajón hit 2', shaker: 'Shaker',
  conga_low: 'Low conga (tumba)', conga_open: 'Conga', conga_slap: 'High conga (quinto)',
  bongo_low: 'Low bongo', bongo_high: 'High bongo', kick: 'Kick', snare: 'Snare', hihat: 'Hi-hat',
  rim: 'Cross stick', hihat_open: 'Open hi-hat', hihat_foot: 'Foot hi-hat', tom1: 'High tom', tom2: 'Low tom',
  floor_tom: 'Floor tom', ride: 'Ride cymbal', crash: 'Crash cymbal', tambourine: 'Tambourine',
  clap: 'Hand claps', cowbell: 'Cowbell', claves: 'Claves', woodblock: 'Woodblock', agogo_high: 'Agogô · high', agogo_low: 'Agogô · low',
};
const bassVoices = new Set<PercussionVoice>(['bayan', 'cajon_bass', 'conga_low', 'bongo_low', 'kick', 'tom2', 'floor_tom']);
/** Auxiliary recordings used by drum grooves only; pulse patterns never load them. */
export const GROOVE_ONLY_VOICES = new Set<PercussionVoice>(['clap', 'cowbell', 'claves', 'woodblock', 'agogo_high', 'agogo_low']);
const kitVoices: Record<'tabla' | 'conga' | 'bongos' | 'cajon' | 'drums', [PercussionVoice, PercussionVoice, PercussionVoice, PercussionVoice]> = {
  tabla: ['bayan', 'dayan_na', 'dayan_tin', 'dayan_ta'],
  conga: ['conga_low', 'conga_open', 'conga_open', 'conga_slap'],
  bongos: ['bongo_low', 'bongo_high', 'bongo_high', 'bongo_high'],
  cajon: ['cajon_bass', 'cajon_snare', 'cajon_snare', 'cajon_snare'],
  drums: ['kick', 'snare', 'snare', 'snare'],
};

export function percussionHits(type: RhythmStroke['type'], kit: PercussionKit): PercussionHit[] {
  if (!Object.hasOwn(PERCUSSION_KITS, kit)) throw new Error(`Unknown percussion instrument: ${kit}`);
  const voices: PercussionVoice[] = type === 'bayan_dayan' ? ['bayan', 'dayan_na'] : [type];
  return voices.map(original => {
    if (!Object.hasOwn(PERCUSSION_VOICES, original)) throw new Error(`Unknown percussion stroke: ${original}`);
    const channel = bassVoices.has(original) ? 'bass' : 'treble';
    let voice = original;
    if (kit !== 'original') {
      const family = kit === 'tabla' || kit === 'conga' || kit === 'bongos' || kit === 'cajon' ? kit : 'drums';
      const sounds = kitVoices[family];
      voice = original === 'shaker' || original === 'hihat' ? family === 'drums' ? 'hihat' : 'shaker'
        : channel === 'bass' ? sounds[0]
          : original === 'dayan_tin' || original === 'conga_open' ? sounds[2]
            : original === 'dayan_ta' || original === 'conga_slap' || original === 'snare' || original === 'cajon_snare' ? sounds[3] : sounds[1];
    }
    return { voice, channel };
  });
}

interface VoiceShape {
  frequency: number; decay: number; duration: number; bend: number; noise: number; cutoff: number;
  modes: readonly [number, number][];
}
const shapes: Partial<Record<PercussionVoice, VoiceShape>> = {
  bayan: { frequency: 82, decay: .19, duration: .65, bend: .65, noise: .045, cutoff: 700, modes: [[1, 1], [2, .48], [3, .22], [4.1, .1]] },
  dayan_na: { frequency: 265, decay: .14, duration: .55, bend: .018, noise: .08, cutoff: 1500, modes: [[1, 1], [2, .62], [3, .36], [4, .14]] },
  dayan_tin: { frequency: 330, decay: .2, duration: .65, bend: .006, noise: .035, cutoff: 1800, modes: [[1, 1], [2, .38], [3, .15]] },
  dayan_ta: { frequency: 235, decay: .045, duration: .2, bend: .04, noise: .3, cutoff: 1600, modes: [[1, .65], [1.8, .42], [3.2, .2]] },
  cajon_bass: { frequency: 92, decay: .13, duration: .5, bend: .5, noise: .18, cutoff: 900, modes: [[1, 1], [1.65, .25], [2.4, .18]] },
  cajon_snare: { frequency: 180, decay: .07, duration: .32, bend: .05, noise: .95, cutoff: 1200, modes: [[1, .38], [1.7, .22], [2.5, .1]] },
  conga_low: { frequency: 155, decay: .16, duration: .6, bend: .15, noise: .12, cutoff: 1000, modes: [[1, 1], [1.48, .5], [2.1, .28], [2.65, .13]] },
  conga_open: { frequency: 220, decay: .15, duration: .6, bend: .08, noise: .1, cutoff: 1300, modes: [[1, 1], [1.5, .58], [2.14, .28], [2.8, .14]] },
  conga_slap: { frequency: 285, decay: .052, duration: .26, bend: .12, noise: .8, cutoff: 1800, modes: [[1, .6], [1.6, .3], [2.45, .2]] },
  bongo_low: { frequency: 270, decay: .09, duration: .38, bend: .09, noise: .13, cutoff: 1300, modes: [[1, 1], [1.55, .48], [2.25, .22]] },
  bongo_high: { frequency: 390, decay: .065, duration: .3, bend: .055, noise: .16, cutoff: 1700, modes: [[1, 1], [1.62, .48], [2.33, .25]] },
  kick: { frequency: 55, decay: .16, duration: .6, bend: 1.5, noise: .1, cutoff: 1500, modes: [[1, 1], [2, .25], [3, .1]] },
  snare: { frequency: 185, decay: .085, duration: .4, bend: .04, noise: 1.2, cutoff: 950, modes: [[1, .48], [1.68, .3]] },
  hihat: { frequency: 4200, decay: .035, duration: .18, bend: 0, noise: 1, cutoff: 4000, modes: [[1, .08], [1.43, .06], [1.91, .05]] },
  shaker: { frequency: 3200, decay: .04, duration: .18, bend: 0, noise: 1, cutoff: 2800, modes: [] },
};

/** Original modal/noise synthesis; no recordings, downloaded samples or random test outcomes. */
export function renderPercussionVoice(voice: PercussionVoice, sampleRate: number): Float32Array {
  const shape = shapes[voice];
  if (!shape) throw new Error(`No synthesized percussion voice: ${voice}`);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Unsupported percussion sample rate.');
  const count = Math.ceil(sampleRate * shape.duration), samples = new Float32Array(count);
  let seed = 0x6d2b79f5 + Object.keys(shapes).indexOf(voice), low = 0, mean = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * shape.cutoff / sampleRate);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += alpha * (noise - low);
    const phase = 2 * Math.PI * shape.frequency * (t + shape.bend * .035 * (1 - Math.exp(-t / .035)));
    const body = shape.modes.reduce((sum, [ratio, weight]) =>
      sum + Math.sin(phase * ratio) * weight * Math.exp(-t / (shape.decay / Math.sqrt(ratio))), 0);
    samples[i] = body + (noise - low) * shape.noise * Math.exp(-t / Math.min(shape.decay, .055));
    mean += samples[i];
  }
  mean /= count;
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const envelope = Math.min(1, i / (sampleRate * .002), (count - 1 - i) / (sampleRate * .015));
    samples[i] = (samples[i] - mean) * envelope;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak === 0) throw new Error(`Percussion synthesis produced silence: ${voice}`);
  for (let i = 0; i < count; i++) samples[i] *= .8 / peak;
  return samples;
}

export function percussionLimiterCurve(): Float32Array<ArrayBuffer> {
  return Float32Array.from({ length: 4097 }, (_, i) => PERCUSSION_CEILING * Math.tanh((i / 2048 - 1) * 2 / PERCUSSION_CEILING));
}

export function validatePercussionLevels(levels: PercussionLevels): void {
  for (const [name, max] of [['volume', 1.5], ['bass', 1], ['treble', 1]] as const) {
    if (!Number.isFinite(levels[name]) || levels[name] < 0 || levels[name] > max) throw new Error(`Percussion ${name} must be between 0 and ${max}.`);
  }
}

/** Independent output bus: guitar/master acoustic settings are never modified. */
export class PercussionBus {
  private bass: GainNode;
  private treble: GainNode;
  private master: GainNode;
  private limiter: WaveShaperNode;
  private buffers = new Map<PercussionVoice, AudioBuffer>();
  private sources = new Map<AudioBufferSourceNode, { gain: GainNode; voice: PercussionVoice; end: number }>();
  private takes = new Map<string, number>();
  private disposed = false;

  constructor(readonly context: BaseAudioContext, levels: PercussionLevels = DEFAULT_PERCUSSION_LEVELS) {
    validatePercussionLevels(levels);
    this.bass = context.createGain(); this.treble = context.createGain(); this.master = context.createGain();
    this.limiter = context.createWaveShaper(); this.limiter.curve = percussionLimiterCurve();
    this.bass.connect(this.master); this.treble.connect(this.master); this.master.connect(this.limiter); this.limiter.connect(context.destination);
    this.bass.gain.value = levels.bass; this.treble.gain.value = levels.treble;
    // Half gain gives the soft limiter room for layered/overlapping drum strikes.
    this.master.gain.value = levels.volume * .5;
  }

  setLevels(levels: PercussionLevels): void {
    validatePercussionLevels(levels);
    const now = this.context.currentTime;
    for (const [param, value] of [[this.master.gain, levels.volume * .5], [this.bass.gain, levels.bass], [this.treble.gain, levels.treble]] as const) {
      param.cancelAndHoldAtTime(now); param.linearRampToValueAtTime(value, now + .015);
    }
  }

  async prepare(kit: PercussionKit): Promise<void> {
    const voices = new Set<PercussionVoice>(percussionPads(kit));
    for (const type of Object.keys(PERCUSSION_VOICES) as PercussionVoice[]) {
      if (!GROOVE_ONLY_VOICES.has(type)) percussionHits(type, kit).forEach(hit => voices.add(hit.voice));
    }
    await loadPercussionRecordings(this.context, [...voices], kit);
  }

  /** Protects a kit from cache eviction from the moment it is chosen, before its first hit; stop() releases it. */
  holdKit(kit: SampleKit): void {
    if (!this.disposed) markPercussionKitActive(this.context, this, kit);
  }

  /** Loads only the recordings a groove needs, from any sample kit. */
  async prepareVoices(voices: Iterable<PercussionVoice>, kit: SampleKit): Promise<void> {
    await loadPercussionRecordings(this.context, [...new Set(voices)], kit);
  }

  play(type: RhythmStroke['type'], kit: PercussionKit, velocity: number, at = this.context.currentTime + .005): number {
    return Math.max(...percussionHits(type, kit).map(hit => this.playVoice(hit.voice, kit, velocity, at, hit.channel)));
  }

  /** level scales loudness only (for a mixer); velocity also chooses the recorded dynamic layer. */
  playVoice(voice: PercussionVoice, kit: SampleKit, velocity: number, at = this.context.currentTime + .005, channel: 'bass' | 'treble' = bassVoices.has(voice) ? 'bass' : 'treble', level = 1): number {
    if (this.disposed) throw new Error('Percussion output has been closed.');
    if (!Number.isFinite(velocity) || velocity < 0 || velocity > 1 || !Number.isFinite(at) || at < 0) throw new Error('Invalid percussion velocity or start time.');
    if (!Number.isFinite(level) || level < 0 || level > 2) throw new Error('Invalid percussion level.');
      const key = `${kit}:${voice}:${percussionLayer(voice, kit, velocity)}`, take = this.takes.get(key) ?? 0;
      const recording = percussionRecording(this.context, voice, kit, velocity, take);
      markPercussionKitActive(this.context, this, kit);
      let buffer = recording?.buffer ?? null;
      const offset = recording?.offset ?? 0;
      this.takes.set(key, take + 1);
      if (!buffer && !voice.startsWith('dayan') && voice !== 'bayan') throw new Error(`No recording is available for ${voice}.`);
      buffer ??= this.buffers.get(voice) ?? null;
      if (!buffer) {
        const samples = renderPercussionVoice(voice, this.context.sampleRate);
        buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        buffer.getChannelData(0).set(samples); this.buffers.set(voice, buffer);
      }
      if (voice === 'hihat' || voice === 'hihat_foot') this.sources.forEach((entry, source) => {
        if (entry.voice !== 'hihat_open' || entry.end <= at) return;
        entry.gain.gain.cancelAndHoldAtTime(at); entry.gain.gain.linearRampToValueAtTime(0, at + .008);
        entry.end = Math.min(entry.end, at + .008); source.stop(entry.end);
      });
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = velocity * level * (recording?.gain ?? 1);
      source.connect(gain); gain.connect(channel === 'bass' ? this.bass : this.treble);
      this.sources.set(source, { gain, voice, end: at + buffer.duration - offset });
      source.addEventListener('ended', () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); }, { once: true });
      source.start(at, offset);
      return buffer.duration - offset;
  }

  /** Sends another source (an imported loop) through this bus's volume and soft limiter. */
  route(node: AudioNode): void {
    if (this.disposed) throw new Error('Percussion output has been closed.');
    node.connect(this.master);
  }

  stop(): void {
    const now = this.context.currentTime;
    this.sources.forEach(({ gain, end }, source) => {
      gain.gain.cancelAndHoldAtTime(now); gain.gain.linearRampToValueAtTime(0, now + .012);
      source.stop(Math.min(end, now + .012));
    });
    this.sources.clear();
    markPercussionKitActive(this.context, this, null);
  }

  dispose(): void {
    this.stop(); this.disposed = true; this.buffers.clear();
    this.bass.disconnect(); this.treble.disconnect(); this.master.disconnect(); this.limiter.disconnect();
  }
}

export function percussionPads(kit: PercussionKit): PercussionVoice[] {
  if (Object.hasOwn(DRUM_BANKS, kit)) return Object.keys(DRUM_FILES) as PercussionVoice[];
  if (kit === 'tabla') return ['bayan', 'dayan_na', 'dayan_tin', 'dayan_ta'];
  if (kit === 'conga') return ['conga_low', 'conga_open', 'conga_slap', 'shaker'];
  if (kit === 'bongos') return ['bongo_low', 'bongo_high', 'shaker'];
  if (kit === 'cajon') return ['cajon_bass', 'cajon_snare', 'shaker'];
  return ['kick', 'snare', 'conga_open', 'bongo_high', 'cajon_bass', 'shaker', 'tambourine'];
}
