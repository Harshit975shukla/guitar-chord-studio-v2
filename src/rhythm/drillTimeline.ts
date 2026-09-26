import type { DrillConfig } from '../types';
import type { TimedEvent } from '../songs/timing';
import { getStrummingPattern, type StrumStroke } from './strumming';

export interface DrillRhythmCue {
  chordIndex: number;
  bar: number;
  step: number;
  countIn: boolean;
  stroke: StrumStroke;
}
export function buildDrillRhythm(config: DrillConfig, chordCount: number): { entries: TimedEvent[]; cues: DrillRhythmCue[] } {
  if (!Number.isFinite(config.bpm) || config.bpm < 50 || config.bpm > 160) throw new Error('Drill BPM must be between 50 and 160.');
  if (![1, 2, 4].includes(config.barsPerChord) || ![0, 1, 2].includes(config.countInBars)) throw new Error('Choose a supported bar/count-in length.');
  if (!Number.isInteger(chordCount) || chordCount < 1 || chordCount > 64) throw new Error('Choose 1–64 chord changes.');
  const pattern = getStrummingPattern(config.strummingPatternId || 'quarter-down');
  const cues: DrillRhythmCue[] = [];
  for (let bar = 0; bar < config.countInBars; bar++) for (let step = 0; step < 8; step++) {
    cues.push({ chordIndex: -1, bar, step, countIn: true, stroke: '-' });
  }
  for (let chordIndex = 0; chordIndex < chordCount; chordIndex++) for (let bar = 0; bar < config.barsPerChord; bar++) for (let step = 0; step < 8; step++) {
    cues.push({ chordIndex, bar, step, countIn: false, stroke: pattern.steps[step] });
  }
  const duration = 30 / config.bpm;
  return { cues, entries: cues.map((_, index) => ({
    event: { type: 'rest', beats: 0.5 }, index, beat: index * 0.5, start: index * duration, duration, bpm: config.bpm,
  })) };
}
