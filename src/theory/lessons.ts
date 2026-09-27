import { CHORD_FORMULAS, CHORD_QUALITY_DISPLAY } from '../chords/definitions';
import { chordInRegister, REGISTER_RANGES, type FretboardRegister } from '../chords/positions';
import { WESTERN_SCALES } from '../scales/definitions';
import { displayNote, scaleRootPc, spellScale } from '../scales/theory';
import { NOTE_NAMES, type ChordQuality, type NoteName, type StringTuning } from '../types';

interface LessonCopy { group: string; construction: string; use: string; tryIt: string }
export const SCALE_LESSONS: Record<string, LessonCopy> = {
  major: { group: 'Start here', construction: 'Build from the tonic using whole and half steps: W W H W W W H. Degrees 1, 3 and 5 form the major tonic triad.', use: 'A reference for intervals, melodies and diatonic harmony. A major key has a tonal center; it is more than a collection of these notes.', tryIt: 'Sing the tonic, then play 1–2–3–2–1. Notice the half steps between 3–4 and 7–8.' },
  natural_minor: { group: 'Start here', construction: 'Lower degrees 3, 6 and 7 of the parallel major scale. It shares its notes with a relative major, but its tonic is different.', use: 'Minor-key melodies and harmony with a minor v chord. Minor-key music can also raise degrees 6 or 7; natural minor is not the only minor sound.', tryIt: 'Compare the same root in major and natural minor. Listen for the change from 3 to ♭3.' },
  pentatonic_major: { group: 'Five-note scales & blues', construction: 'Remove degrees 4 and 7 from major: 1, 2, 3, 5, 6. Pentatonic means five notes per octave.', use: 'Melodic ideas over compatible major harmony, common in country, pop and folk. The harmony still determines which notes feel settled.', tryIt: 'Make a three-note phrase, then answer it on 1. Leave space between phrases.' },
  pentatonic_minor: { group: 'Five-note scales & blues', construction: 'Remove degrees 2 and ♭6 from natural minor: 1, ♭3, 4, 5, ♭7. The gaps include three-semitone steps.', use: 'Minor-key riffs and blues/rock vocabulary. Against major or dominant harmony, ♭3 creates intentional tension; it is not automatically consonant.', tryIt: 'Play 1–♭3–4–5, then return to 1. Compare the minor third with a major third.' },
  blues: { group: 'Five-note scales & blues', construction: 'Add ♭5 between 4 and 5 of minor pentatonic. This six-note form is often called the minor blues scale.', use: 'The ♭5 is frequently a passing or expressive tone in blues and rock, not a note to hold over every chord.', tryIt: 'Play 4–♭5–5 slowly. Resolve the blue note instead of treating it as a resting point.' },
  harmonic_minor: { group: 'Minor colors', construction: 'Raise ♭7 of natural minor to 7. The gap from ♭6 to 7 is three semitones: an augmented second.', use: 'The raised seventh creates a leading tone and a major V chord in minor. It is an accidental, not a new minor key signature.', tryIt: 'In D minor, compare C with C♯, then resolve C♯ to D. B♭ stays unchanged.' },
  melodic_minor: { group: 'Minor colors', construction: 'Raise degrees 6 and 7 of natural minor. Here the ascending form stays fixed in both directions, as commonly practised in jazz.', use: 'Minor harmony and melodic-minor modal colors. Classical melodic minor often descends as natural minor; real melodies vary with harmonic context.', tryIt: 'Compare natural, harmonic and melodic minor on the same tonic. Hear how raising 6 removes the augmented-second gap.' },
  dorian: { group: 'Modes', construction: 'Natural minor with a natural 6. It is the second mode of major, but the selected root must sound like home.', use: 'Minor modal vamps with a major IV chord, often in funk and jazz. Match the underlying harmony rather than choosing a scale by genre alone.', tryIt: 'Alternate ♭3 and 6, resolving to the tonic. Compare 6 with natural minor’s ♭6.' },
  phrygian: { group: 'Modes', construction: 'Natural minor with ♭2. It is the third mode of major. Phrygian dominant is a different scale with a major third.', use: 'Modal riffs emphasizing the half step above the tonic. Context determines whether ♭2 is tension or a defining color.', tryIt: 'Play 1–♭2–1, then add ♭3. Keep returning to the selected root.' },
  lydian: { group: 'Modes', construction: 'Major with ♯4. It is the fourth mode of major and has a whole step between 3 and ♯4.', use: 'Major modal harmony where the raised fourth is welcome, including major-♯11 colors.', tryIt: 'Compare 1–3–4–5 with 1–3–♯4–5. Hear the raised fourth rather than changing the tonic.' },
  mixolydian: { group: 'Modes', construction: 'Major with ♭7. It is the fifth mode of major; degrees 1, 3, 5, ♭7 form a dominant seventh chord.', use: 'Dominant-seventh vamps and modal rock. A dominant chord in a changing progression may need more context than one scale.', tryIt: 'Play 1–3–5–♭7, then resolve to 1. Compare ♭7 with major’s leading tone 7.' },
  locrian: { group: 'Modes', construction: 'Natural minor with ♭2 and ♭5. It is the seventh mode of major, with a diminished tonic triad.', use: 'A starting color over half-diminished harmony, with considerable tension. It is not simply a minor scale in a different hand position.', tryIt: 'Build 1–♭3–♭5–♭7, then compare its fifth with natural minor’s perfect fifth.' },
};

interface ChordLesson extends LessonCopy { name: string; degrees: string[] }
function chord(name: string, group: string, formula: string, construction: string, use: string): ChordLesson {
  return { name, group, degrees: formula.split(' '), construction, use,
    tryIt: 'Hear the tones separately, then play a complete shape. Move to another position and compare the bass and note order: the chord tones stay the same.' };
}
export const CHORD_LESSONS: Record<ChordQuality, ChordLesson> = {
  Major: chord('Major triad', 'Triads & power chords', '1 3 5', 'Stack a major third (4 semitones) and a minor third (3).', 'A major tonic, IV or V triad in major-key harmony; function depends on the key.'),
  Minor: chord('Minor triad', 'Triads & power chords', '1 ♭3 5', 'Lower the major triad’s third by one semitone; the root and fifth stay unchanged.', 'Minor tonic harmony, and ii, iii or vi in a major key.'),
  dim: chord('Diminished triad', 'Triads & power chords', '1 ♭3 ♭5', 'Stack two minor thirds. The lowered fifth creates tension.', 'Often a leading-tone triad that resolves to a more stable chord.'),
  aug: chord('Augmented triad', 'Triads & power chords', '1 3 ♯5', 'Stack two major thirds. Raise the fifth of a major triad.', 'A passing or altered harmony; moving one tone by a semitone makes its resolution audible.'),
  '5': chord('Power chord', 'Triads & power chords', '1 5', 'Use root and fifth, often doubling the root. With no third it is neither major nor minor.', 'Riffs and accompaniment where the melody or surrounding harmony supplies the quality.'),
  sus2: chord('Suspended second', 'Suspended & added tones', '1 2 5', 'Replace the third with a second. Do not keep the third as in add9.', 'Open accompaniment colors; may resolve to a third or remain a stable sonority.'),
  sus4: chord('Suspended fourth', 'Suspended & added tones', '1 4 5', 'Replace the third with a fourth. A traditional suspension resolves 4 to 3.', 'Tension and release, or sustained modal accompaniment.'),
  add9: chord('Added ninth', 'Suspended & added tones', '1 3 5 9', 'Add a ninth to a major triad without a seventh. The third remains.', 'Major accompaniment with an extra melodic color; different from sus2 and dominant 9.'),
  add11: chord('Added eleventh', 'Suspended & added tones', '1 3 5 11', 'Add an eleventh to a major triad without a seventh. The third remains.', 'The third and eleventh can rub strongly. Spacing and musical context matter.'),
  '6': chord('Major sixth', 'Sixths & sevenths', '1 3 5 6', 'Add a major sixth to a major triad, not a seventh.', 'A tonic color in major, common in jazz and swing. It shares notes with a relative minor seventh.'),
  m6: chord('Minor sixth', 'Sixths & sevenths', '1 ♭3 5 6', 'Add a major sixth to a minor triad. “Minor” describes the third, not the sixth.', 'Minor tonic or Dorian/melodic-minor color, depending on the surrounding harmony.'),
  '7': chord('Dominant seventh', 'Sixths & sevenths', '1 3 5 ♭7', 'Add a minor seventh to a major triad. The plain symbol 7 does not mean maj7.', 'Often V7 resolving to I, but also a stable blues or Mixolydian sound.'),
  maj7: chord('Major seventh', 'Sixths & sevenths', '1 3 5 7', 'Add a major seventh to a major triad: one semitone below the next root.', 'Major tonic and IV colors. Distinguish its seventh from dominant 7.'),
  m7: chord('Minor seventh', 'Sixths & sevenths', '1 ♭3 5 ♭7', 'Add a minor seventh to a minor triad.', 'Minor harmony and ii–V–I progressions.'),
  m7b5: chord('Half-diminished seventh', 'Sixths & sevenths', '1 ♭3 ♭5 ♭7', 'Add a minor seventh to a diminished triad. Also written ø7.', 'Commonly iiø7 in minor, or viiø7 in major.'),
  dim7: chord('Diminished seventh', 'Sixths & sevenths', '1 ♭3 ♭5 ♭♭7', 'Add a diminished seventh, spelled ♭♭7, to a diminished triad. It sounds like 6 but has a different theoretical role.', 'Symmetrical tension chords, often resolving by a semitone. Different from half-diminished.'),
  '9': chord('Dominant ninth', 'Extensions', '1 3 5 ♭7 9', 'Extend dominant 7 with 9, an octave plus a second.', 'Dominant color in jazz, blues and funk. Includes ♭7; add9 does not.'),
  m9: chord('Minor ninth', 'Extensions', '1 ♭3 5 ♭7 9', 'Extend minor 7 with a ninth.', 'Minor accompaniment with a ninth above the root.'),
  maj9: chord('Major ninth', 'Extensions', '1 3 5 7 9', 'Extend maj7 with a ninth. “Major” specifies the seventh as well as the underlying triad.', 'Major-key tonic and IV colors with a major seventh and ninth.'),
  '11': chord('Dominant eleventh', 'Extensions', '1 3 5 ♭7 9 11', 'Extend dominant 9 with 11. The full formula includes both 3 and 11.', 'Guitarists often omit the third or fifth to manage the 3/11 clash. This lesson only offers shapes containing every listed tone.'),
  m11: chord('Minor eleventh', 'Extensions', '1 ♭3 5 ♭7 9 11', 'Extend minor 9 with an eleventh.', 'Minor modal and jazz colors. Six distinct tones can be difficult to voice completely on guitar.'),
  '13': chord('Dominant thirteenth', 'Extensions', '1 3 5 ♭7 9 13', 'Extend dominant harmony to 13. This app’s practical six-tone formula omits 11; the full stack would also contain 11.', 'Dominant jazz/funk color. Real voicings often omit further tones, but these lesson diagrams preserve all six listed tones.'),
  '7sus4': chord('Dominant seventh suspended fourth', 'Altered & suspended sevenths', '1 4 5 ♭7', 'Replace dominant 7’s third with a fourth; keep the minor seventh.', 'Suspended dominant harmony, often resolving the fourth to the third.'),
  '7#9': chord('Dominant sharp ninth', 'Altered & suspended sevenths', '1 3 5 ♭7 ♯9', 'Add a raised ninth to dominant 7. Its spelling remains a ninth even though it sounds like a minor third.', 'Altered dominant or blues/rock tension; the major third and sharp ninth coexist.'),
  '7b9': chord('Dominant flat ninth', 'Altered & suspended sevenths', '1 3 5 ♭7 ♭9', 'Add a lowered ninth to dominant 7, a semitone above the octave root.', 'A strong dominant tension, especially in minor-key resolutions.'),
  '7#5': chord('Dominant sharp fifth', 'Altered & suspended sevenths', '1 3 ♯5 ♭7', 'Raise the fifth of dominant 7; retain its major third and minor seventh.', 'Altered dominant tension with a raised fifth that can resolve by step.'),
  '7b5': chord('Dominant flat fifth', 'Altered & suspended sevenths', '1 3 ♭5 ♭7', 'Lower the fifth of dominant 7. This is not half-diminished, which has a minor third.', 'Altered dominant color; follow the voice leading rather than treating it as a generic major chord.'),
};

export interface LessonTone { degree: string; name: string; interval: number; pc: number }
export interface TheoryLesson extends LessonCopy {
  title: string; tones: LessonTone[]; steps: number[]; kind: 'scale' | 'chord';
}
export function theoryLesson(kind: 'scale' | 'chord', root: NoteName, key: string): TheoryLesson {
  const copy = kind === 'scale' ? SCALE_LESSONS[key] : CHORD_LESSONS[key as ChordQuality];
  if (!copy) throw new Error(`Unknown ${kind} lesson: ${key}`);
  const pattern = kind === 'scale' ? WESTERN_SCALES[key] : {
    intervals: CHORD_FORMULAS[key as ChordQuality], degrees: CHORD_LESSONS[key as ChordQuality].degrees,
  };
  const names = spellScale(root, {
    intervals: pattern.intervals.map(interval => interval % 12),
    degrees: pattern.degrees.map(degree => degree.replace(/\d+/, n => String((Number(n) - 1) % 7 + 1))),
  });
  return {
    ...copy, kind,
    title: `${displayNote(root)} ${kind === 'scale' ? WESTERN_SCALES[key].name : CHORD_LESSONS[key as ChordQuality].name}`,
    tones: pattern.intervals.map((interval, i) => ({ interval, degree: pattern.degrees[i], name: names[i], pc: (scaleRootPc(root) + interval) % 12 })),
    steps: kind === 'scale' ? pattern.intervals.map((interval, i) => (pattern.intervals[i + 1] ?? 12) - interval) : [],
  };
}

export interface LessonPosition { stringIndex: number; fret: number; midi: number; tone: number }
export function lessonPositions(lesson: TheoryLesson, tuning: StringTuning[], register: FretboardRegister, frets: (number | null)[] | null): LessonPosition[] {
  const [min, max] = REGISTER_RANGES[register];
  return tuning.flatMap((string, stringIndex) => {
    const positions: LessonPosition[] = [];
    for (let fret = min; fret <= max; fret++) {
      if (lesson.kind === 'chord' && frets?.[stringIndex] !== fret) continue;
      const midi = string.midi + fret;
      const tone = lesson.tones.findIndex(t => t.pc === midi % 12);
      if (tone >= 0) positions.push({ stringIndex, fret, midi, tone });
    }
    return positions;
  });
}

export function lessonVoicings(root: NoteName, quality: ChordQuality, tuning: StringTuning[]): Array<{ register: Exclude<FretboardRegister, 'all'>; frets: (number | null)[] | null }> {
  const symbol = { root: NOTE_NAMES[scaleRootPc(root)], quality };
  return (['open', 'middle', 'upper'] as const).map(register => ({ register, frets: chordInRegister(symbol, tuning, register) }));
}

export function lessonChordSymbol(root: NoteName, quality: ChordQuality): string {
  return `${displayNote(root)}${CHORD_QUALITY_DISPLAY[quality]}`;
}
