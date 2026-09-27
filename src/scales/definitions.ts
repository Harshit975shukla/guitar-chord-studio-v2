export interface ScaleDefinition {
  name: string;
  formula: string;
  intervals: number[];
  degrees: string[];
  desc: string;
  solos: string;
}

export const WESTERN_SCALES: Record<string, ScaleDefinition> = {
  pentatonic_minor: {
    name: 'Pentatonic Minor',
    formula: '1 - ♭3 - 4 - 5 - ♭7',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', '♭3', '4', '5', '♭7'],
    desc: 'The bedrock foundation of rock, blues, and pop guitar lead playing. Zero dissonance, instant soulful melody across all styles.',
    solos: 'Jimmy Page (Stairway to Heaven), Jimi Hendrix, David Gilmour, Eric Clapton',
  },
  blues: {
    name: 'Blues Scale',
    formula: '1 - ♭3 - 4 - ♭5 - 5 - ♭7',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'],
    desc: 'The pentatonic minor turbocharged with the famous ♭5 "Blue Note". Delivers gritty grit, tension, and classic crying blues grit.',
    solos: 'Stevie Ray Vaughan (Texas Flood), B.B. King (The Thrill Is Gone), Gary Moore',
  },
  pentatonic_major: {
    name: 'Pentatonic Major',
    formula: '1 - 2 - 3 - 5 - 6',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6'],
    desc: 'Uplifting, sweet, and bright singing tones. Widely used in country, Southern rock, and soulful acoustic ballads.',
    solos: 'Dickey Betts (Jessica), Keith Richards, Brad Paisley, John Mayer',
  },
  natural_minor: {
    name: 'Natural Minor (Aeolian)',
    formula: '1 - 2 - ♭3 - 4 - 5 - ♭6 - ♭7',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
    desc: 'Full 7-note minor diatonic mode. Emotional, dark, dramatic, and essential for rock ballads and melodic metal.',
    solos: 'Kirk Hammett (Metallica), Randy Rhoads, Slash, Joe Satriani',
  },
  major: {
    name: 'Major Scale (Ionian)',
    formula: '1 - 2 - 3 - 4 - 5 - 6 - 7',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    desc: 'The master reference of all Western music theory. Bright, resolute, triumphant, and foundational for chord construction.',
    solos: 'Brian May (Queen), Eric Johnson (Cliffs of Dover), Mark Knopfler',
  },
  dorian: {
    name: 'Dorian Mode',
    formula: '1 - 2 - ♭3 - 4 - 5 - 6 - ♭7',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'],
    desc: 'The minor mode with a signature bright Major 6th. The hallmark sound of jazz-funk fusion and Latin rock.',
    solos: 'Carlos Santana (Oye Como Va), Pink Floyd (Breathe), Miles Davis (So What)',
  },
  mixolydian: {
    name: 'Mixolydian Mode',
    formula: '1 - 2 - 3 - 4 - 5 - 6 - ♭7',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'],
    desc: 'Major scale with a bluesy ♭7th degree. Matches dominant 7th chords perfectly for classic rock, jam band, and blues-rock.',
    solos: 'Jerry Garcia (Grateful Dead), Duane Allman, AC/DC, Guns N Roses',
  },
  harmonic_minor: {
    name: 'Harmonic Minor',
    formula: '1 - 2 - ♭3 - 4 - 5 - ♭6 - 7',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'],
    desc: 'Exotic Neo-classical and Spanish flamenco flavor created by the wide augmented 2nd step between ♭6 and Natural 7.',
    solos: 'Yngwie Malmsteen (Black Star), Ritchie Blackmore, Paco de Lucía',
  },
  melodic_minor: {
    name: 'Melodic Minor (fixed ascending form)',
    formula: '1 - 2 - ♭3 - 4 - 5 - 6 - 7',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', '♭3', '4', '5', '6', '7'],
    desc: 'Natural minor with raised sixth and seventh. This fixed form is used in both directions here, as in jazz practice. Classical melodic minor often returns using natural minor.',
    solos: 'Try an original phrase over a minor tonic; listen to the raised sixth and leading tone.',
  },
  phrygian: {
    name: 'Phrygian Mode',
    formula: '1 - ♭2 - ♭3 - 4 - 5 - ♭6 - ♭7',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'],
    desc: 'A minor mode with a half-step above the tonic. The lowered second creates a distinctive tension; this is not Phrygian dominant, which has a major third.',
    solos: 'Build an original modal phrase around 1 and ♭2 over a tonic drone.',
  },
  lydian: {
    name: 'Lydian Mode',
    formula: '1 - 2 - 3 - ♯4 - 5 - 6 - 7',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['1', '2', '3', '♯4', '5', '6', '7'],
    desc: 'A major mode with a raised fourth. Keep the selected tonic as home to hear its color rather than treating it as another major-scale fingering.',
    solos: 'Try an original phrase over a sustained major chord, comparing 4 with ♯4.',
  },
  locrian: {
    name: 'Locrian Mode',
    formula: '1 - ♭2 - ♭3 - 4 - ♭5 - ♭6 - ♭7',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'],
    desc: 'A minor mode with lowered second and fifth. Its tonic triad is diminished, so it is less stable than major or natural minor.',
    solos: 'Explore an original short phrase over a half-diminished chord; resolve the tension deliberately.',
  },
};
