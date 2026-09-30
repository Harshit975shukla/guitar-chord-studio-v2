import { type ChordSymbol, type StringTuning } from '../types';
import { CHORD_FORMULAS } from './formulas';
import { scaleRootPc } from '../scales/theory';

export const REGISTER_RANGES = { all: [0, 12], open: [0, 4], middle: [5, 8], upper: [9, 12] } as const;
export type FretboardRegister = keyof typeof REGISTER_RANGES;
export const REGISTER_LABELS: Record<FretboardRegister, string> = {
  all: 'Original / Auto (0–12)', open: 'Open position (0–4)', middle: 'Middle position (5–8)', upper: 'Upper position (9–12)',
};
export function isFretboardRegister(value: string): value is FretboardRegister {
  return Object.hasOwn(REGISTER_RANGES, value);
}

export function positionBounds(register: FretboardRegister, allowReach = false): readonly [number, number] {
  const [min, max] = REGISTER_RANGES[register];
  return allowReach && (register === 'middle' || register === 'upper')
    ? [Math.max(0, min - 1), Math.min(12, max + 1)] : [min, max];
}

export function isPositionReach(fret: number, register: FretboardRegister): boolean {
  const [min, max] = REGISTER_RANGES[register];
  const [reachMin, reachMax] = positionBounds(register, true);
  return (fret < min || fret > max) && fret >= reachMin && fret <= reachMax;
}
const positionCache = new Map<string, (number | null)[] | null>();

/** Generate only complete chord-tone sets within a chosen hand position. */
export function chordInRegister(chord: ChordSymbol, tuning: StringTuning[], register: Exclude<FretboardRegister, 'all'>): (number | null)[] | null {
  const [min, max] = REGISTER_RANGES[register];
  return chordInFretRange(chord, tuning, min, max);
}

/** Search one bounded hand span; open strings can also ring in library voicings. */
export function chordInFretRange(chord: ChordSymbol, tuning: StringTuning[], min: number, max: number, includeOpen = false): (number | null)[] | null {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 12 || min > max || max - min > 4) {
    throw new Error('Chord hand positions must fit a four-fret span within frets 0–12.');
  }
  const root = scaleRootPc(chord.root);
  const tones = [...new Set(CHORD_FORMULAS[chord.quality].map(interval => (root + interval) % 12))];
  const bass = chord.bass ? scaleRootPc(chord.bass) : null;
  const required = [...new Set([...tones, ...(bass === null ? [] : [bass])])];
  const reference = tuning[5].midi;
  const key = `${(root - reference % 12 + 12) % 12}:${chord.quality}:${bass === null ? '-' : (bass - reference % 12 + 12) % 12}:${tuning.map(s => s.midi - reference).join(',')}:${min}:${max}:${includeOpen}`;
  if (positionCache.has(key)) return positionCache.get(key)?.slice() ?? null;
  const choices = tuning.map(string => {
    const frets: (number | null)[] = [];
    if (includeOpen && min > 0 && required.includes(string.midi % 12)) frets.push(0);
    for (let fret = min; fret <= max; fret++) if (required.includes((string.midi + fret) % 12)) frets.push(fret);
    frets.push(null);
    return frets;
  });
  let best: (number | null)[] | null = null;
  let bestCost = Infinity;
  const current: (number | null)[] = new Array(6).fill(null);
  const requiredMask = required.reduce((mask, pc) => mask | 1 << pc, 0);
  const suffix = new Array<number>(7).fill(0);
  for (let s = 5; s >= 0; s--) suffix[s] = suffix[s + 1] | choices[s].reduce<number>((mask, fret) => fret === null ? mask : mask | 1 << ((tuning[s].midi + fret) % 12), 0);
  const bitCount = (value: number) => { let count = 0; while (value) { value &= value - 1; count++; } return count; };
  const search = (string: number, present: number, fingers: number, barres: number): void => {
    if (fingers > 4 || ((present | suffix[string]) & requiredMask) !== requiredMask || bitCount(requiredMask & ~present) > 6 - string) return;
    if (string < 6) {
      for (const fret of choices[string]) {
        current[string] = fret;
        const allowedBarres = fret === null ? barres : barres & ((1 << (fret + 1)) - 1);
        const bit = fret !== null && fret > 0 ? 1 << fret : 0;
        search(string + 1, fret === null ? present : present | 1 << ((tuning[string].midi + fret) % 12),
          fingers + (bit && !(allowedBarres & bit) ? 1 : 0), allowedBarres | bit);
      }
      return;
    }
    const midis = current.flatMap((fret, s) => fret === null ? [] : [tuning[s].midi + fret]);
    if (midis.length < Math.max(2, required.length)) return;
    const pcs = new Set(midis.map(midi => midi % 12));
    if (required.some(pc => !pcs.has(pc)) || (bass !== null && Math.min(...midis) % 12 !== bass)) return;
    const played = current.flatMap(fret => fret === null ? [] : [fret]);
    const fretted = played.filter(fret => fret > 0);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const firstString = current.findIndex(fret => fret !== null);
    const lastString = 5 - [...current].reverse().findIndex(fret => fret !== null);
    const innerMutes = current.slice(firstString, lastString + 1).filter(fret => fret === null).length;
    const rootBassPenalty = Math.min(...midis) % 12 === root ? 0 : 3;
    const cost = innerMutes * 20 + span * 2 + (6 - played.length) * 3 + rootBassPenalty + played.reduce((sum, f) => sum + f, 0) * 0.1;
    if (cost < bestCost) { bestCost = cost; best = [...current]; }
  };
  search(0, 0, 0, 0);
  if (positionCache.size >= 4096) positionCache.delete(positionCache.keys().next().value!);
  positionCache.set(key, best);
  return best ? [...best] : null;
}
