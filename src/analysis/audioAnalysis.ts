import { DetectionEngine } from '../detection/engine';
import { NOTE_NAMES, type Song } from '../types';
import { validateTiming } from '../songs/timing';
import { suggestStrumming, type StrummingAnalysis } from '../rhythm/strumming';

export const ANALYSIS_RATE = 22050;
export const MAX_AUDIO_SECONDS = 300;
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const FFT_SIZE = 8192;
const HOP = 2205;

export interface ChordRegion {
  start: number;
  end: number;
  chord: string | null;
  kind: 'chord' | 'silence' | 'uncertain';
  match: number | null;
}
export interface KeySuggestion {
  root: string;
  mode: 'major' | 'minor';
  fit: number;
}
export interface AudioAnalysis {
  duration: number;
  regions: ChordRegion[];
  keys: KeySuggestion[];
  keyUncertain: boolean;
  strumming?: StrummingAnalysis;
}
export type AnalysisResponse =
  | { type: 'progress'; percent: number }
  | { type: 'complete'; result: AudioAnalysis }
  | { type: 'error'; message: string };

/** Hann-windowed radix-2 FFT. Buffers are reused for the entire recording. */
class Spectrum {
  private real = new Float64Array(FFT_SIZE);
  private imaginary = new Float64Array(FFT_SIZE);
  private magnitudes = new Float32Array(FFT_SIZE / 2);
  private window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));

  frame(samples: Float32Array, center: number): Float32Array {
    const { real, imaginary } = this;
    imaginary.fill(0);
    for (let i = 0; i < FFT_SIZE; i++) real[i] = (samples[center + i - FFT_SIZE / 2] || 0) * this.window[i];
    for (let i = 1, j = 0; i < FFT_SIZE; i++) {
      let bit = FFT_SIZE >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [real[i], real[j]] = [real[j], real[i]];
    }
    for (let length = 2; length <= FFT_SIZE; length *= 2) {
      const angle = -2 * Math.PI / length;
      const stepR = Math.cos(angle), stepI = Math.sin(angle);
      for (let start = 0; start < FFT_SIZE; start += length) {
        let wr = 1, wi = 0;
        for (let k = 0; k < length / 2; k++) {
          const a = start + k, b = a + length / 2;
          const br = real[b] * wr - imaginary[b] * wi;
          const bi = real[b] * wi + imaginary[b] * wr;
          real[b] = real[a] - br; imaginary[b] = imaginary[a] - bi;
          real[a] += br; imaginary[a] += bi;
          const next = wr * stepR - wi * stepI;
          wi = wr * stepI + wi * stepR; wr = next;
        }
      }
    }
    for (let i = 0; i < this.magnitudes.length; i++) this.magnitudes[i] = Math.hypot(real[i], imaginary[i]) * 4 / FFT_SIZE;
    return this.magnitudes;
  }
}

export function suggestKeys(profile: readonly number[]): KeySuggestion[] {
  const total = profile.reduce((sum, n) => sum + n, 0);
  if (total <= 0 || profile.filter(n => n > total * 0.06).length < 3) return [];
  const suggestions: KeySuggestion[] = [];
  for (let root = 0; root < 12; root++) for (const mode of ['major', 'minor'] as const) {
    const intervals = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    let score = 0;
    for (let pc = 0; pc < 12; pc++) {
      const interval = (pc - root + 12) % 12;
      const weight = interval === 0 ? 1.5 : interval === (mode === 'major' ? 4 : 3) ? 1.25 : interval === 7 ? 1.15 : intervals.includes(interval) ? 0.7 : -1;
      score += profile[pc] * weight;
    }
    suggestions.push({ root: NOTE_NAMES[root], mode, fit: score / (total * 1.5) });
  }
  return suggestions.sort((a, b) => b.fit - a.fit).slice(0, 3);
}

/** Offline draft analysis: independent engine instance, no microphone settings changed. */
export function analyzePcm(samples: Float32Array, onProgress: (percent: number) => void = () => {}): AudioAnalysis {
  if (!samples.length || samples.length > ANALYSIS_RATE * MAX_AUDIO_SECONDS) throw new Error('Audio must be non-empty and at most 5 minutes.');
  const frames = Math.ceil(samples.length / HOP);
  const levels = new Float64Array(frames);
  let peakRms = 0;
  for (let frame = 0; frame < frames; frame++) {
    const end = Math.min(samples.length, (frame + 1) * HOP);
    let energy = 0;
    for (let i = frame * HOP; i < end; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('Audio contains invalid samples.');
      energy += samples[i] * samples[i];
    }
    levels[frame] = Math.sqrt(energy / (end - frame * HOP));
    peakRms = Math.max(peakRms, levels[frame]);
  }
  const engine = new DetectionEngine({ fftSize: FFT_SIZE, triggerMode: 'continuous' });
  const spectrum = new Spectrum();
  const profile = new Array<number>(12).fill(0);
  const regions: ChordRegion[] = [];
  const duration = samples.length / ANALYSIS_RATE;
  const gate = Math.max(0.0005, peakRms * 0.025);
  for (let frame = 0; frame < frames; frame++) {
    let chord: string | null = null, match: number | null = null;
    let kind: ChordRegion['kind'] = 'silence';
    if (levels[frame] > gate) {
      kind = 'uncertain';
      const magnitudes = spectrum.frame(samples, frame * HOP + Math.floor(HOP / 2));
      const first = Math.floor(65 * FFT_SIZE / ANALYSIS_RATE), last = Math.ceil(1600 * FFT_SIZE / ANALYSIS_RATE);
      let max = 0, sum = 0;
      for (let i = first; i <= last; i++) { max = Math.max(max, magnitudes[i]); sum += magnitudes[i]; }
      if (max / (sum / (last - first + 1) + 1e-10) >= 6) {
        for (let i = 0; i < magnitudes.length; i++) magnitudes[i] /= max;
        const chroma = engine.buildChromaCQT(magnitudes, ANALYSIS_RATE);
        for (let i = 0; i < 12; i++) profile[i] += chroma[i] * levels[frame];
        if (chroma.filter(energy => energy >= 0.25).length >= 2) {
          const found = engine.processChord(chroma, engine.extractPeaks(magnitudes, ANALYSIS_RATE));
          if (found.chord && found.chord.confidence >= 55) {
            chord = found.chord.symbol; match = found.chord.confidence; kind = 'chord';
          }
        } else {
          engine.reset();
        }
      }
    } else engine.reset();
    const start = frame * HOP / ANALYSIS_RATE, end = Math.min(duration, (frame + 1) * HOP / ANALYSIS_RATE);
    const previous = regions.at(-1);
    if (previous?.chord === chord && previous.kind === kind) {
      if (match !== null && previous.match !== null) previous.match = (previous.match * (previous.end - previous.start) + match * (end - start)) / (end - previous.start);
      previous.end = end;
    } else regions.push({ start, end, chord, kind, match });
    if (frame % 20 === 0) onProgress(Math.round((frame + 1) / frames * 100));
  }
  const keys = suggestKeys(profile);
  const strumming = suggestStrumming(samples, ANALYSIS_RATE);
  onProgress(100);
  return { duration, regions, keys, strumming, keyUncertain: keys.length < 2 || keys[0].fit < 0.65 || keys[0].fit - keys[1].fit < 0.08 };
}

export function analysisToSong(result: AudioAnalysis, title: string, source: string, bpm: number, allowUnknownRests: boolean, id: string): Song {
  if (!title.trim()) throw new Error('Enter a title for the draft.');
  if (!result.regions.some(region => region.kind === 'chord')) throw new Error('No confident chord regions found. The recording was not turned into a playable chart.');
  if (!allowUnknownRests && result.regions.some(region => region.kind === 'uncertain')) throw new Error('Review uncertain regions first, or explicitly allow them to become draft rests.');
  const events = result.regions.map(region => {
    const beats = (region.end - region.start) * bpm / 60;
    return region.chord ? { type: 'chord' as const, chord: region.chord, beats } : { type: 'rest' as const, beats };
  });
  let timing;
  try { timing = validateTiming({ version: 1, bpm, tempos: [], events }); }
  catch (error) { throw new Error(`Draft cannot fit the timing editor at this reference BPM. Adjust BPM or edit the regions. ${error instanceof Error ? error.message : String(error)}`); }
  return {
    id, title: title.trim(), artist: 'User audio draft', key: result.keys.length && !result.keyUncertain ? `${result.keys[0].root} ${result.keys[0].mode}` : 'Uncertain',
    bpm, strum: '', strumPatternVisual: '', chordsUsed: [...new Set(events.flatMap(e => e.type === 'chord' ? [e.chord] : []))],
    lines: [], isCustom: true, timing, source, versionLabel: 'Local audio analysis · unverified draft',
    importWarnings: ['Estimated chord boundaries, not verified rhythm or tablature. Reference BPM is user-selected, not detected.',
      ...(result.keys.length ? [`Audio key candidates${result.keyUncertain ? ' (uncertain)' : ''}: ${result.keys.map(key => `${key.root} ${key.mode}`).join(', ')}.`] : []),
      ...(allowUnknownRests ? ['Uncertain regions were explicitly imported as draft rests. Review before practice.'] : [])],
  };
}
