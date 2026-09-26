import type { NoteName, StringTuning } from '../types';
import { isPositionReach, positionBounds, type FretboardRegister } from '../chords/positions';
import type { ScalePracticePosition } from './practice';
import { scaleRootPc } from './theory';

export type ScaleExerciseRange = 'position' | 'two-octaves';
export type HandPosition = Exclude<FretboardRegister, 'all'>;
const HANDS: HandPosition[] = ['open', 'middle', 'upper'];
export const HAND_LABELS: Record<HandPosition, string> = {
  open: 'Open area (0–4)', middle: 'Middle area (5–8)', upper: 'Upper area (9–12)',
};

interface PatternNode {
  position: ScalePracticePosition & { handPosition: HandPosition };
  cost: number;
  previous: PatternNode | null;
}

function candidates(midi: number, tuning: StringTuning[]): Array<ScalePracticePosition & { handPosition: HandPosition }> {
  const positions: Array<ScalePracticePosition & { handPosition: HandPosition }> = [];
  for (const handPosition of HANDS) {
    const [min, max] = positionBounds(handPosition, true);
    tuning.forEach((string, stringIndex) => {
      const fret = midi - string.midi;
      if (fret >= min && fret <= max) positions.push({
        stringIndex, fret, midi, handPosition,
        ...(isPositionReach(fret, handPosition) ? { reach: true as const } : {}),
      });
    });
  }
  return positions;
}

/** Keep a stable hand area, use small reaches, and shift upward only as needed. */
export function buildTwoOctavePattern(root: NoteName, intervals: readonly number[], tuning: StringTuning[], starting: FretboardRegister): ScalePracticePosition[] {
  const low = Math.min(...tuning.map(s => s.midi));
  const high = Math.max(...tuning.map(s => s.midi + 12));
  for (let tonic = low; tonic + 24 <= high; tonic++) {
    if (tonic % 12 !== scaleRootPc(root)) continue;
    const pitches = [...intervals.map(i => tonic + i), ...intervals.map(i => tonic + 12 + i), tonic + 24];
    let previous: PatternNode[] = [];
    for (const [index, midi] of pitches.entries()) {
      const next: PatternNode[] = [];
      for (const position of candidates(midi, tuning)) {
        const hand = HANDS.indexOf(position.handPosition);
        const locationCost = (position.reach ? 8 : 0) + position.fret * 0.01;
        if (index === 0) {
          if (starting !== 'all' && starting !== position.handPosition) continue;
          next.push({ position, cost: locationCost + (starting === 'all' ? hand * 4 : 0), previous: null });
          continue;
        }
        let best: PatternNode | null = null;
        let cost = Infinity;
        for (const prev of previous) {
          const handChange = hand - HANDS.indexOf(prev.position.handPosition);
          // Ascending patterns use adjacent upward shifts, not arbitrary jumps.
          if (handChange < 0 || handChange > 1) continue;
          const movement = Math.abs(position.fret - prev.position.fret) * 0.15
            + Math.abs(position.stringIndex - prev.position.stringIndex) * 0.4
            + (position.stringIndex > prev.position.stringIndex ? 2 : 0);
          const nextCost = prev.cost + locationCost + movement + handChange * 12;
          if (nextCost < cost) { best = prev; cost = nextCost; }
        }
        if (best) next.push({ position, cost, previous: best });
      }
      previous = next;
      if (!previous.length) break;
    }
    if (!previous.length) continue;
    let last: PatternNode | null = previous.reduce((best, node) => node.cost < best.cost ? node : best);
    const path: ScalePracticePosition[] = [];
    while (last) { path.push(last.position); last = last.previous; }
    if (path.length === pitches.length) return orientShiftPattern(path.reverse(), 'ascending');
  }
  return [];
}

export function orientShiftPattern(ascending: readonly ScalePracticePosition[], direction: 'ascending' | 'descending' | 'loop'): ScalePracticePosition[] {
  const path = direction === 'descending' ? [...ascending].reverse()
    : direction === 'loop' ? [...ascending, ...ascending.slice(0, -1).reverse()] : [...ascending];
  return path.map((position, index) => {
    const { shift: _shift, ...step } = position;
    const previousHand = path[index - 1]?.handPosition;
    if (!previousHand || !step.handPosition || previousHand === step.handPosition) return step;
    return { ...step, shift: HANDS.indexOf(step.handPosition) > HANDS.indexOf(previousHand) ? 'up' : 'down' };
  });
}
