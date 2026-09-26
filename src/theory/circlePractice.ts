import type { NoteName } from '../types';
import type { PracticeTarget } from '../songs/performance';
import { displayNote, scaleRootPc } from '../scales/theory';
import { circleKey, type CircleMode } from './circleOfFifths';

export type CirclePracticeGoal = 'chord' | 'root';
export type CircleDirection = 1 | -1;
export interface CircleRoundTarget { index: number; root: NoteName; chord: string; label: string }

export function buildCircleRound(start: number, mode: CircleMode, flatCrossover: boolean, direction: CircleDirection): CircleRoundTarget[] {
  circleKey(start, flatCrossover);
  if (direction !== 1 && direction !== -1) throw new Error('Choose clockwise or counterclockwise.');
  if (mode !== 'major' && mode !== 'minor') throw new Error('Choose major or minor keys.');
  return Array.from({ length: 12 }, (_, step) => {
    const index = (start + direction * step + 12) % 12;
    const key = circleKey(index, flatCrossover);
    const root = mode === 'major' ? key.major : key.minor;
    return { index, root, chord: root + (mode === 'minor' ? 'm' : ''), label: `${displayNote(root)} ${mode}` };
  });
}

export function circlePracticeTarget(target: CircleRoundTarget, goal: CirclePracticeGoal): PracticeTarget {
  if (goal === 'chord') return { type: 'chord', chord: target.chord };
  if (goal === 'root') return { type: 'pitch-class', pitchClass: scaleRootPc(target.root) };
  throw new Error('Choose tonic chords or root notes.');
}
