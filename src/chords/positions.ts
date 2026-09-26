import { NOTE_NAMES, type ChordSymbol, type StringTuning } from '../types';
import { CHORD_FORMULAS } from './definitions';

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

/** Generate only complete chord-tone sets within a chosen hand position. */
export function chordInRegister(chord: ChordSymbol, tuning: StringTuning[], register: Exclude<FretboardRegister, 'all'>): (number | null)[] | null {
  const root = NOTE_NAMES.indexOf(chord.root);
  const tones = [...new Set(CHORD_FORMULAS[chord.quality].map(interval => (root + interval) % 12))];
  const bass = chord.bass ? NOTE_NAMES.indexOf(chord.bass) : null;
  const required = [...new Set([...tones, ...(bass === null ? [] : [bass])])];
  const [min, max] = REGISTER_RANGES[register];
  const choices = tuning.map(string => {
    const frets: (number | null)[] = [];
    for (let fret = min; fret <= max; fret++) if (required.includes((string.midi + fret) % 12)) frets.push(fret);
    frets.push(null);
    return frets;
  });
  let best: (number | null)[] | null = null;
  let bestCost = Infinity;
  const current: (number | null)[] = new Array(6).fill(null);
  const search = (string: number): void => {
    if (string < 6) {
      for (const fret of choices[string]) { current[string] = fret; search(string + 1); }
      return;
    }
    const midis = current.flatMap((fret, s) => fret === null ? [] : [tuning[s].midi + fret]);
    if (midis.length < Math.max(2, required.length)) return;
    const pcs = new Set(midis.map(midi => midi % 12));
    if (required.some(pc => !pcs.has(pc)) || (bass !== null && Math.min(...midis) % 12 !== bass)) return;
    const played = current.flatMap(fret => fret === null ? [] : [fret]);
    const fretted = played.filter(fret => fret > 0);
    const lowest = fretted.length ? Math.min(...fretted) : 0;
    let fingers = fretted.filter(fret => fret > lowest).length;
    let barre = false;
    for (const fret of current) {
      if (fret === 0) barre = false;
      else if (fret === lowest && lowest > 0 && !barre) { fingers++; barre = true; }
    }
    if (fingers > 4) return;
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const firstString = current.findIndex(fret => fret !== null);
    const lastString = 5 - [...current].reverse().findIndex(fret => fret !== null);
    const innerMutes = current.slice(firstString, lastString + 1).filter(fret => fret === null).length;
    const rootBassPenalty = Math.min(...midis) % 12 === root ? 0 : 3;
    const cost = innerMutes * 20 + span * 2 + (6 - played.length) * 3 + rootBassPenalty + played.reduce((sum, f) => sum + f, 0) * 0.1;
    if (cost < bestCost) { bestCost = cost; best = [...current]; }
  };
  search(0);
  return best;
}
