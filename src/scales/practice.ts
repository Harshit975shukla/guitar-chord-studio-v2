import { NOTE_NAMES, type DetectionResult, type NoteName, type StringTuning } from '../types';
import { isPositionReach, positionBounds, REGISTER_RANGES, type FretboardRegister } from '../chords/positions';
import { scaleRootPc } from './theory';

export type ScalePracticeMode = 'free' | 'ascending' | 'descending';
export interface ScalePracticePosition {
  stringIndex: number;
  fret: number;
  midi: number;
  reach?: true;
  handPosition?: Exclude<FretboardRegister, 'all'>;
  shift?: 'up' | 'down';
}

function availablePositions(tuning: StringTuning[], register: FretboardRegister, allowReach: boolean): Map<number, ScalePracticePosition[]> {
  const [min, max] = positionBounds(register, allowReach);
  const available = new Map<number, ScalePracticePosition[]>();
  tuning.forEach((string, stringIndex) => {
    for (let fret = min; fret <= max; fret++) {
      const midi = string.midi + fret;
      const positions = available.get(midi) || [];
      positions.push({ stringIndex, fret, midi, ...(isPositionReach(fret, register) ? { reach: true as const } : {}) });
      available.set(midi, positions);
    }
  });
  return available;
}

function fingerPitches(pitches: number[], available: Map<number, ScalePracticePosition[]>): ScalePracticePosition[] {
  const run: ScalePracticePosition[] = [];
  for (const midi of pitches) {
    const previous = run.at(-1);
    const score = (p: ScalePracticePosition) => p.fret * 0.1 + (previous ? Math.abs(p.stringIndex - previous.stringIndex) * 2 + Math.abs(p.fret - previous.fret) : 0);
    const position = [...available.get(midi)!].sort((a, b) => Number(!!a.reach) - Number(!!b.reach) || score(a) - score(b) || a.stringIndex - b.stringIndex)[0];
    run.push(position);
  }
  return run;
}

/** Lowest complete root-to-octave run; prefer a root in the core hand area. */
export function buildScalePracticeRun(root: NoteName, intervals: readonly number[], tuning: StringTuning[], register: FretboardRegister, descending = false, allowReach = false): ScalePracticePosition[] {
  const available = availablePositions(tuning, register, allowReach);
  const roots = [...available.keys()].filter(midi => midi % 12 === scaleRootPc(root)).sort((a, b) =>
    Number(available.get(a)!.every(p => p.reach)) - Number(available.get(b)!.every(p => p.reach)) || a - b);
  for (const start of roots) {
    const pitches = [...intervals.map(interval => start + interval), start + 12];
    if (!pitches.every(midi => available.has(midi))) continue;
    if (descending) pitches.reverse();
    return fingerPitches(pitches, available);
  }
  return [];
}

/** A full ascent and mirrored descent, including the same start/end fingering. */
export function buildScaleReferenceLoop(root: NoteName, intervals: readonly number[], tuning: StringTuning[], register: FretboardRegister, allowReach = false): ScalePracticePosition[] {
  const available = availablePositions(tuning, register, allowReach);
  const roots = [...available.keys()].filter(midi => midi % 12 === scaleRootPc(root)).sort((a, b) => a - b);
  for (const start of roots) {
    for (const end of roots.filter(midi => midi > start).reverse()) {
      const pitches: number[] = [];
      for (let octave = start; octave < end; octave += 12) pitches.push(...intervals.map(interval => octave + interval));
      pitches.push(end);
      if (!pitches.every(midi => available.has(midi))) continue;
      const up = fingerPitches(pitches, available);
      return [...up, ...up.slice(0, -1).reverse()];
    }
  }
  return [];
}

export function assessScaleNote(result: DetectionResult, root: NoteName, intervals: readonly number[], tuning: StringTuning[], register: FretboardRegister, allowReach = false) {
  if (result.freshness !== 'fresh' || result.mode !== 'single-note' || !result.note || result.note.confidence < 70 ||
      !Number.isFinite(result.note.pitch.midi)) return null;
  const midi = Math.round(result.note.pitch.midi);
  const pc = ((midi % 12) + 12) % 12;
  const degreeIndex = intervals.indexOf((pc - scaleRootPc(root) + 12) % 12);
  const [min, max] = positionBounds(register, allowReach);
  const [coreMin, coreMax] = REGISTER_RANGES[register];
  const inRegister = tuning.some(string => midi - string.midi >= min && midi - string.midi <= max);
  return {
    midi, pc, degreeIndex, inScale: degreeIndex >= 0,
    inRegister,
    needsReach: inRegister && !tuning.some(string => midi - string.midi >= coreMin && midi - string.midi <= coreMax),
    name: `${NOTE_NAMES[pc]}${Math.floor(midi / 12) - 1}`,
  };
}
