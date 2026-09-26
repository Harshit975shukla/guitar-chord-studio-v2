import type { NoteName } from '../types';
import { WESTERN_SCALES } from '../scales/definitions';
import { displayNote, scalePitchName, scaleRootPc, spellScale, type ScalePattern } from '../scales/theory';

export type CircleMode = 'major' | 'minor';
export interface CircleKey { major: NoteName; minor: NoteName; fifths: number }
export const CIRCLE_KEYS: readonly CircleKey[] = [
  { major: 'C', minor: 'A', fifths: 0 },
  { major: 'G', minor: 'E', fifths: 1 },
  { major: 'D', minor: 'B', fifths: 2 },
  { major: 'A', minor: 'F#', fifths: 3 },
  { major: 'E', minor: 'C#', fifths: 4 },
  { major: 'B', minor: 'G#', fifths: 5 },
  { major: 'F#', minor: 'D#', fifths: 6 },
  { major: 'Db', minor: 'Bb', fifths: -5 },
  { major: 'Ab', minor: 'F', fifths: -4 },
  { major: 'Eb', minor: 'C', fifths: -3 },
  { major: 'Bb', minor: 'G', fifths: -2 },
  { major: 'F', minor: 'D', fifths: -1 },
];
const SHARPS = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
const FLATS = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'];

export interface CircleChord {
  degree: number;
  roman: string;
  label: string;
  notes: string[];
  pitchClasses: number[];
  quality: 'Major' | 'Minor' | 'dim';
}
export interface CircleProgression { id: 'primary' | 'cadence'; title: string; explanation: string; chords: CircleChord[] }

export function circleKey(index: number, flatCrossover = false): CircleKey {
  if (!Number.isInteger(index) || index < 0 || index >= CIRCLE_KEYS.length) throw new Error('Choose one of the twelve circle positions.');
  return index === 6 && flatCrossover ? { major: 'Gb', minor: 'Eb', fifths: -6 } : CIRCLE_KEYS[index];
}

export function circleSignature(key: CircleKey): { label: string; notes: string[] } {
  if (!Number.isInteger(key.fifths) || Math.abs(key.fifths) > 7) throw new Error('Key signatures need zero to seven sharps or flats.');
  const count = Math.abs(key.fifths);
  return {
    label: count === 0 ? 'No sharps or flats' : `${count} ${key.fifths > 0 ? 'sharp' : 'flat'}${count === 1 ? '' : 's'}`,
    notes: (key.fifths > 0 ? SHARPS : FLATS).slice(0, count),
  };
}

function triad(root: NoteName, pattern: ScalePattern, degree: number, roman: string): CircleChord {
  const names = spellScale(root, pattern);
  const indices = [degree, (degree + 2) % 7, (degree + 4) % 7];
  const pitchClasses = indices.map(i => (scaleRootPc(root) + pattern.intervals[i]) % 12);
  const third = (pitchClasses[1] - pitchClasses[0] + 12) % 12;
  const fifth = (pitchClasses[2] - pitchClasses[0] + 12) % 12;
  const quality = third === 4 && fifth === 7 ? 'Major' : third === 3 && fifth === 7 ? 'Minor' : third === 3 && fifth === 6 ? 'dim' : null;
  if (!quality) throw new Error('Unsupported triad in this key.');
  return { degree, roman, label: names[degree] + (quality === 'Minor' ? 'm' : quality === 'dim' ? 'dim' : ''),
    notes: indices.map(i => names[i]), pitchClasses, quality };
}

export function circleTheory(index: number, mode: CircleMode, flatCrossover = false) {
  if (mode !== 'major' && mode !== 'minor') throw new Error('Choose major or minor keys.');
  const key = circleKey(index, flatCrossover);
  const root = mode === 'major' ? key.major : key.minor;
  const pattern = mode === 'major' ? WESTERN_SCALES.major : WESTERN_SCALES.natural_minor;
  const romans = mode === 'major' ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] : ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
  const chords = romans.map((roman, degree) => triad(root, pattern, degree, roman));
  const notes = spellScale(root, pattern);
  const pitches = pattern.intervals.map(interval => (scaleRootPc(root) + interval) % 12);
  const scaleMidis = [...pattern.intervals, 12].map(interval => 48 + scaleRootPc(root) + interval);
  const dominant = mode === 'minor' ? triad(root, WESTERN_SCALES.harmonic_minor, 4, 'V') : chords[4];
  const progressions: CircleProgression[] = [
    { id: 'primary', title: mode === 'major' ? 'I – IV – V – I' : 'i – iv – v – i (natural minor)',
      explanation: 'Hear home, move away, and return to the tonic.', chords: [chords[0], chords[3], chords[4], chords[0]] },
    { id: 'cadence', title: mode === 'major' ? 'ii – V – I (triads)' : 'i – iv – V – i (raised seventh)',
      explanation: mode === 'major' ? 'A common route through the supertonic and dominant back home.'
        : `The major V uses ${spellScale(root, WESTERN_SCALES.harmonic_minor)[6]}, the raised seventh. That accidental is not a new key signature.`,
      chords: mode === 'major' ? [chords[1], chords[4], chords[0]] : [chords[0], chords[3], dominant, chords[0]] },
  ];
  return {
    key, root, mode, label: `${displayNote(root)} ${mode === 'major' ? 'major' : 'natural minor'}`,
    signature: circleSignature(key), notes, pitches, chords, progressions, scaleMidis,
    scaleLabels: scaleMidis.map(midi => scalePitchName(midi, root, pattern)),
    relative: `${displayNote(mode === 'major' ? key.minor : key.major)} ${mode === 'major' ? 'minor' : 'major'}`,
    parallel: `${displayNote(root)} ${mode === 'major' ? 'minor' : 'major'}`,
    parallelNotes: spellScale(root, mode === 'major' ? WESTERN_SCALES.natural_minor : WESTERN_SCALES.major),
    clockwise: circleKey((index + 1) % 12, flatCrossover),
    counterclockwise: circleKey((index + 11) % 12, flatCrossover),
  };
}

/** Concert-pitch reference voicing, independent of the user's capo/tuning. */
export function circleChordMidis(chord: CircleChord): number[] {
  const root = 48 + chord.pitchClasses[0];
  return chord.pitchClasses.map(pc => root + (pc - chord.pitchClasses[0] + 12) % 12);
}
