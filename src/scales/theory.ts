import { NOTE_NAMES, type NoteName } from '../types';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALE_ROOTS: NoteName[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
export interface ScalePattern { intervals: readonly number[]; degrees: readonly string[] }

export function displayNote(name: string): string {
  return name.replaceAll('#', '♯').replaceAll('b', '♭');
}

function naturalPitch(name: string): number {
  const letter = LETTERS.indexOf(name[0]);
  if (letter < 0) throw new Error(`Unknown note letter: ${name}`);
  let pitch = NATURAL_PCS[letter];
  for (const accidental of name.slice(1)) {
    if (accidental === '#' || accidental === '♯') pitch++;
    else if (accidental === 'b' || accidental === '♭') pitch--;
    else throw new Error(`Unknown accidental in ${name}`);
  }
  return pitch;
}

export function scaleRootPc(root: NoteName): number {
  return (naturalPitch(root) + 12) % 12;
}

/** Scale degrees choose the letter; semitone intervals choose its accidental. */
export function spellScale(root: NoteName, scale: ScalePattern): string[] {
  const rootLetter = LETTERS.indexOf(root[0]);
  const rootPc = scaleRootPc(root);
  return scale.intervals.map((interval, index) => {
    const degree = Number(scale.degrees[index]?.match(/\d+/)?.[0]);
    if (!Number.isInteger(degree) || degree < 1 || degree > 7) throw new Error('Scale spelling requires degrees 1–7.');
    const letter = (rootLetter + degree - 1) % 7;
    const wantedPc = (rootPc + interval) % 12;
    const alteration = ((wantedPc - NATURAL_PCS[letter] + 18) % 12) - 6;
    return LETTERS[letter] + (alteration > 0 ? '♯'.repeat(alteration) : '♭'.repeat(-alteration));
  });
}

export function scaleNoteName(pc: number, root: NoteName, scale: ScalePattern): string {
  const normalized = ((pc % 12) + 12) % 12;
  const names = spellScale(root, scale);
  const index = scale.intervals.indexOf((normalized - scaleRootPc(root) + 12) % 12);
  if (index >= 0) return names[index];
  return names.some(name => name.includes('♭')) ? FLAT_NAMES[normalized] : displayNote(NOTE_NAMES[normalized]);
}

export function scalePitchName(midi: number, root: NoteName, scale: ScalePattern): string {
  const pitch = Math.round(midi);
  const name = scaleNoteName(pitch % 12, root, scale);
  // C♭4 is B3 and B♯3 is C4: the octave belongs to the written letter.
  const octave = Math.round((pitch - naturalPitch(name)) / 12) - 1;
  return `${name}${octave}`;
}
