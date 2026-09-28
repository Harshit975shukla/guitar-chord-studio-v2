import { NOTE_NAMES, parseChordSymbol, type ChordQuality, type NoteName, type StringTuning } from '../types';
import { CHORD_FORMULAS, CHORD_QUALITY_DISPLAY } from '../chords/definitions';
import { chordInRegister } from '../chords/positions';
import { WESTERN_SCALES } from '../scales/definitions';
import { buildScalePracticeRun, type ScalePracticePosition } from '../scales/practice';
import { displayNote, scaleRootPc } from '../scales/theory';
import type { PracticeTarget } from '../songs/performance';

export type ExerciseType = 'chords' | 'notes' | 'scales';
export type EarActivity = 'hear' | 'identify' | 'play-back';
export type ChordDifficulty = 'beginner' | 'intermediate' | 'master';
export const EAR_ROOTS = [...NOTE_NAMES];
// These are the ten qualities supported by the existing chord detector.
export const EAR_CHORD_QUALITIES: ChordQuality[] = ['Major', 'Minor', '7', 'maj7', 'm7', 'sus2', 'sus4', '5', 'dim', 'aug'];
export const NOTE_INTERVALS = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
  'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave',
] as const;

export interface EarSettings {
  type: ExerciseType;
  root: NoteName;
  minorKey: boolean;
  difficulty: ChordDifficulty;
  quality: ChordQuality;
  interval: number;
  scale: string;
}
export interface EarTarget {
  id: string;
  label: string;
  notes: ScalePracticePosition[];
  frets?: (number | null)[];
  practice: PracticeTarget[];
}
export interface EarExercise {
  type: ExerciseType;
  tonic: NoteName;
  reference: ScalePracticePosition | null;
  target: EarTarget;
  choices: { id: string; label: string }[];
}
export interface EarReferenceStep {
  notes: ScalePracticePosition[];
  offset: number;
  duration: number;
  role: 'cadence' | 'tonic' | 'target';
}

function validTuning(tuning: StringTuning[]): boolean {
  return tuning.length === 6 && tuning.every(string => Number.isInteger(string.midi) && string.midi >= 24 && string.midi <= 96);
}

export function chordSymbol(root: NoteName, quality: ChordQuality): string {
  return root + CHORD_QUALITY_DISPLAY[quality];
}

export function isCompleteVoicing(symbol: string, frets: (number | null)[], tuning: StringTuning[]): boolean {
  const chord = parseChordSymbol(symbol);
  if (!chord || !Object.hasOwn(CHORD_FORMULAS, chord.quality) || !validTuning(tuning) || frets.length !== 6 || frets.some(f => f !== null && (!Number.isInteger(f) || f < 0 || f > 12))) return false;
  const wanted = new Set(CHORD_FORMULAS[chord.quality].map(i => (scaleRootPc(chord.root) + i) % 12));
  const actual = new Set(frets.flatMap((f, s) => f === null ? [] : [(tuning[s].midi + f) % 12]));
  return actual.size === wanted.size && [...wanted].every(pc => actual.has(pc));
}

export function chordTarget(symbol: string, tuning: StringTuning[]): EarTarget | null {
  const chord = parseChordSymbol(symbol);
  if (!chord || chord.bass || !validTuning(tuning) || !EAR_CHORD_QUALITIES.includes(chord.quality)) return null;
  // The register helper checks complete tone coverage and a four-finger hand span.
  const normalized = { ...chord, root: NOTE_NAMES[scaleRootPc(chord.root)] };
  for (const register of ['open', 'middle', 'upper'] as const) {
    const frets = chordInRegister(normalized, tuning, register);
    if (!frets || !isCompleteVoicing(symbol, frets, tuning)) continue;
    const notes = frets.flatMap((fret, stringIndex) => fret === null ? [] : [{ stringIndex, fret, midi: tuning[stringIndex].midi + fret }]);
    return { id: symbol, label: displayNote(symbol), notes, frets, practice: [{ type: 'chord', chord: symbol }] };
  }
  return null;
}

/** Major and minor key contexts retain the original tonic/relative/minor cadence vocabulary. */
export function chordKeyMaterial(root: NoteName, minor: boolean, difficulty: ChordDifficulty): { cadence: string[]; pool: string[] } {
  const pc = scaleRootPc(root);
  const at = (offset: number, quality: ChordQuality = 'Major') => chordSymbol(NOTE_NAMES[(pc + offset) % 12], quality);
  const cadence = minor ? [at(0, 'Minor'), at(5, 'Minor'), at(8), at(7, '7')] : [at(0), at(9, 'Minor'), at(5), at(7)];
  const beginner = minor
    ? [at(0, 'Minor'), at(3), at(5, 'Minor'), at(7, 'Minor'), at(8), at(10), at(7, '7')]
    : [at(0), at(5), at(7), at(9, 'Minor'), at(2, 'Minor'), at(4, 'Minor')];
  const sevenths = minor
    ? [at(0, 'm7'), at(3, 'maj7'), at(5, 'm7'), at(7, 'm7'), at(8, 'maj7'), at(10, '7')]
    : [at(0, 'maj7'), at(2, 'm7'), at(4, 'm7'), at(5, 'maj7'), at(7, '7'), at(9, 'm7')];
  const pool = difficulty === 'beginner' ? beginner : [...beginner, ...sevenths];
  if (difficulty === 'master') pool.push(at(minor ? 2 : 11, 'dim'));
  return { cadence, pool: [...new Set(pool)] };
}

function positionAt(midi: number, tuning: StringTuning[]): ScalePracticePosition | null {
  const positions = tuning.flatMap((string, stringIndex) => {
    const fret = midi - string.midi;
    return fret >= 0 && fret <= 12 ? [{ stringIndex, fret, midi }] : [];
  });
  return positions.sort((a, b) => a.fret - b.fret || b.stringIndex - a.stringIndex)[0] ?? null;
}

function noteReference(root: NoteName, tuning: StringTuning[]): ScalePracticePosition | null {
  // A common tonic for every chromatic option prevents register from becoming an answer clue.
  const chromatic = Array.from({ length: 12 }, (_, i) => i);
  return buildScalePracticeRun(root, chromatic, tuning, 'all')[0] ?? null;
}

export function noteTarget(root: NoteName, interval: number, tuning: StringTuning[]): EarTarget | null {
  if (!validTuning(tuning) || !Number.isInteger(interval) || interval < 0 || interval >= NOTE_INTERVALS.length) return null;
  const tonic = noteReference(root, tuning);
  const note = tonic && positionAt(tonic.midi + interval, tuning);
  if (!note) return null;
  const label = `${displayNote(NOTE_NAMES[note.midi % 12])} — ${NOTE_INTERVALS[interval].toLowerCase()}`;
  return { id: String(interval), label, notes: [note], practice: [{ type: 'note', midi: note.midi }] };
}

export function scaleTarget(root: NoteName, key: string, tuning: StringTuning[]): EarTarget | null {
  const scale = Object.hasOwn(WESTERN_SCALES, key) ? WESTERN_SCALES[key] : null;
  if (!scale || !validTuning(tuning)) return null;
  const notes = buildScalePracticeRun(root, scale.intervals, tuning, 'all');
  if (notes.length !== scale.intervals.length + 1) return null;
  return { id: key, label: `${displayNote(root)} ${scale.name}`, notes, practice: notes.map(note => ({ type: 'note', midi: note.midi })) };
}

export function availableTargets(settings: EarSettings, tuning: StringTuning[]): EarTarget[] {
  if (!validTuning(tuning)) return [];
  const targets = settings.type === 'chords'
    ? chordKeyMaterial(settings.root, settings.minorKey, settings.difficulty).pool.map(symbol => chordTarget(symbol, tuning))
    : settings.type === 'notes'
      ? NOTE_INTERVALS.map((_, interval) => noteTarget(settings.root, interval, tuning))
      : Object.keys(WESTERN_SCALES).map(key => scaleTarget(settings.root, key, tuning));
  return targets.filter((target): target is EarTarget => target !== null);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildEarExercise(settings: EarSettings, activity: EarActivity, tuning: StringTuning[], random: () => number = Math.random, previousId?: string): EarExercise | null {
  const pool = availableTargets(settings, tuning);
  let target: EarTarget | null;
  if (activity === 'identify') {
    const candidates = pool.filter(item => item.id !== previousId);
    target = shuffle(candidates.length ? candidates : pool, random)[0] ?? null;
  } else {
    target = settings.type === 'chords' ? chordTarget(chordSymbol(settings.root, settings.quality), tuning)
      : settings.type === 'notes' ? noteTarget(settings.root, settings.interval, tuning)
        : scaleTarget(settings.root, settings.scale, tuning);
  }
  if (!target) return null;
  const distractors = shuffle(pool.filter(item => item.id !== target.id), random).slice(0, 3);
  const choices = shuffle([target, ...distractors], random).map(({ id, label }) => ({ id, label }));
  return {
    type: settings.type, tonic: settings.root, target, choices,
    reference: settings.type === 'chords' ? null : settings.type === 'notes' ? noteReference(settings.root, tuning) : target.notes[0],
  };
}

/** Hidden rounds expose no target labels, pitches or positions in their presentation. */
export function exercisePresentation(exercise: EarExercise, activity: EarActivity, answered: boolean): { title: string; notes: ScalePracticePosition[]; frets?: (number | null)[] } {
  if (activity === 'identify' && !answered) return { title: `Mystery ${exercise.type === 'chords' ? 'chord' : exercise.type === 'notes' ? 'note' : 'scale'}`, notes: [] };
  return { title: exercise.target.label, notes: exercise.target.notes, frets: exercise.target.frets };
}

export function answerIsCorrect(exercise: EarExercise, choiceId: string): boolean {
  return exercise.choices.some(choice => choice.id === choiceId) && choiceId === exercise.target.id;
}

export function buildEarReference(exercise: EarExercise, settings: EarSettings, tuning: StringTuning[], includeCadence: boolean): EarReferenceStep[] | null {
  const steps: EarReferenceStep[] = [];
  let offset = 0;
  if (exercise.type === 'chords' && includeCadence) {
    for (const symbol of chordKeyMaterial(settings.root, settings.minorKey, settings.difficulty).cadence) {
      const chord = chordTarget(symbol, tuning);
      if (!chord) return null;
      steps.push({ notes: chord.notes, offset, duration: .65, role: 'cadence' });
      offset += .9;
    }
    offset += .35;
  } else if (exercise.reference) {
    steps.push({ notes: [exercise.reference], offset, duration: .7, role: 'tonic' });
    offset += 1.1;
  }
  if (exercise.type === 'scales') {
    for (const note of exercise.target.notes) {
      steps.push({ notes: [note], offset, duration: .42, role: 'target' });
      offset += .6;
    }
  } else {
    steps.push({ notes: exercise.target.notes, offset, duration: 1.2, role: 'target' });
  }
  return steps;
}
