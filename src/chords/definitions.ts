/**
 * Chord Definitions Database
 * Contains interval formulas and generates voicings for any tuning
 */

import { 
  ChordDefinition, 
  ChordVoicing, 
  ChordQuality, 
  NoteName, 
  StringTuning,
  STANDARD_TUNING,
  midiToPitch,
  transposeNote,
  parseChordSymbol,
  NOTE_NAMES,
} from '../types';

// ============================================================================
// Chord Interval Formulas (semitones from root)
// ============================================================================

export const CHORD_FORMULAS: Record<ChordQuality, number[]> = {
  'Major': [0, 4, 7],
  'Minor': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  '5': [0, 7], // power chord
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  'm9': [0, 3, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  '11': [0, 4, 7, 10, 14, 17],
  'm11': [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21],
  'add9': [0, 4, 7, 14],
  'add11': [0, 4, 7, 17],
  '7sus4': [0, 5, 7, 10],
  '7#9': [0, 4, 7, 10, 15],
  '7b9': [0, 4, 7, 10, 13],
  '7#5': [0, 4, 8, 10],
  '7b5': [0, 4, 6, 10],
  'm7b5': [0, 3, 6, 10],
  'dim7': [0, 3, 6, 9],
};

// Chord quality display names
export const CHORD_QUALITY_DISPLAY: Record<ChordQuality, string> = {
  'Major': '',
  'Minor': 'm',
  '7': '7',
  'maj7': 'maj7',
  'm7': 'm7',
  'sus2': 'sus2',
  'sus4': 'sus4',
  '5': '5',
  'dim': 'dim',
  'aug': 'aug',
  '6': '6',
  'm6': 'm6',
  '9': '9',
  'm9': 'm9',
  'maj9': 'maj9',
  '11': '11',
  'm11': 'm11',
  '13': '13',
  'add9': 'add9',
  'add11': 'add11',
  '7sus4': '7sus4',
  '7#9': '7#9',
  '7b9': '7b9',
  '7#5': '7#5',
  '7b5': '7b5',
  'm7b5': 'm7b5',
  'dim7': 'dim7',
};

// ============================================================================
// CAGED System Voicing Templates (for standard tuning)
// Each template defines fret offsets from a base barre position
// ============================================================================

interface CagedTemplate {
  name: string;
  // Shape pattern: for each string (high E to low E), fret offset from barre fret
  // null = muted, -1 = not played in this voicing
  shape: (number | null)[];
  rootString: number; // which string has the root (0-5, high to low)
  barre: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const CAGED_TEMPLATES: Record<string, CagedTemplate[]> = {
  // CAGED shapes for MAJOR triads
  'Major': [
    { name: 'CAGED-E', shape: [0, 0, 1, 2, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },      // E shape
    { name: 'CAGED-D', shape: [2, 3, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' }, // D shape
    { name: 'CAGED-C', shape: [0, 1, 0, 2, 3, null], rootString: 4, barre: false, difficulty: 'beginner' },   // C shape
    { name: 'CAGED-A', shape: [null, 2, 2, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' }, // A shape
    { name: 'CAGED-G', shape: [3, 0, 0, 0, 2, 3], rootString: 5, barre: false, difficulty: 'intermediate' },  // G shape
    // Barre versions
    { name: 'E-Barre', shape: [1, 1, 2, 3, 3, 1], rootString: 5, barre: true, difficulty: 'intermediate' },
    { name: 'A-Barre', shape: [null, 3, 3, 3, 1, null], rootString: 4, barre: true, difficulty: 'intermediate' },
  ],
  
  // MINOR triads
  'Minor': [
    { name: 'CAGED-Em', shape: [0, 0, 0, 2, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Dm', shape: [1, 3, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Cm', shape: [null, 1, 0, 1, 3, null], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'CAGED-Am', shape: [null, 1, 2, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Gm', shape: [3, 0, 0, 0, 1, 3], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'Em-Barre', shape: [1, 1, 1, 3, 3, 1], rootString: 5, barre: true, difficulty: 'intermediate' },
    { name: 'Am-Barre', shape: [null, 2, 3, 3, 1, null], rootString: 4, barre: true, difficulty: 'intermediate' },
  ],
  
  // DOMINANT 7th
  '7': [
    { name: 'CAGED-E7', shape: [0, 2, 0, 2, 1, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-A7', shape: [null, 0, 2, 0, 2, 0], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-C7', shape: [3, 2, 3, 1, 3, null], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'CAGED-G7', shape: [3, 0, 0, 0, 1, 3], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'CAGED-D7', shape: [2, 1, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
    { name: 'E7-Barre', shape: [2, 1, 2, 0, 2, 2], rootString: 5, barre: true, difficulty: 'intermediate' },
    { name: 'A7-Barre', shape: [null, 2, 0, 2, 1, 2], rootString: 4, barre: true, difficulty: 'intermediate' },
  ],
  
  // MAJOR 7th
  'maj7': [
    { name: 'CAGED-Emaj7', shape: [0, 0, 1, 1, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Amaj7', shape: [null, 2, 1, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Cmaj7', shape: [0, 0, 0, 2, 3, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Gmaj7', shape: [2, 0, 0, 0, 2, 3], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'Emaj7-Barre', shape: [2, 2, 3, 1, 3, 2], rootString: 5, barre: true, difficulty: 'intermediate' },
  ],
  
  // MINOR 7th
  'm7': [
    { name: 'CAGED-Em7', shape: [0, 3, 0, 0, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Am7', shape: [null, 1, 0, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Dm7', shape: [1, 1, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Gm7', shape: [3, 0, 3, 0, 1, 3], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'Em7-Barre', shape: [2, 2, 2, 4, 3, 2], rootString: 5, barre: true, difficulty: 'intermediate' },
    { name: 'Am7-Barre', shape: [null, 2, 0, 2, 1, 2], rootString: 4, barre: true, difficulty: 'intermediate' },
  ],
  
  // SUSPENDED 4th
  'sus4': [
    { name: 'CAGED-Esus4', shape: [0, 0, 2, 2, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Asus4', shape: [null, 3, 2, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Dsus4', shape: [3, 3, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Gsus4', shape: [3, 1, 0, 0, 3, 3], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'Esus4-Barre', shape: [2, 2, 4, 4, 4, 2], rootString: 5, barre: true, difficulty: 'intermediate' },
  ],
  
  // SUSPENDED 2nd
  'sus2': [
    { name: 'CAGED-Esus2', shape: [0, 0, 0, 2, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Asus2', shape: [null, 0, 2, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'CAGED-Dsus2', shape: [0, 3, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
  ],
  
  // POWER CHORDS
  '5': [
    { name: 'E-Power', shape: [null, null, null, 2, 2, 0], rootString: 5, barre: false, difficulty: 'beginner' },
    { name: 'A-Power', shape: [null, null, 2, 2, 0, null], rootString: 4, barre: false, difficulty: 'beginner' },
    { name: 'D-Power', shape: [null, 3, 2, 0, null, null], rootString: 3, barre: false, difficulty: 'beginner' },
    { name: 'E-Power-Barre', shape: [null, null, 3, 3, 1, 1], rootString: 5, barre: true, difficulty: 'intermediate' },
    { name: 'A-Power-Barre', shape: [null, null, 4, 4, 2, null], rootString: 4, barre: true, difficulty: 'intermediate' },
  ],
  
  // DIMINISHED
  'dim': [
    { name: 'CAGED-Edim', shape: [1, 2, 1, 2, 1, 0], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'CAGED-Adim', shape: [null, 1, 2, 1, 2, 0], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'Edim-Barre', shape: [2, 3, 2, 3, 2, 2], rootString: 5, barre: true, difficulty: 'advanced' },
  ],
  
  // AUGMENTED
  'aug': [
    { name: 'CAGED-Eaug', shape: [0, 1, 1, 2, 2, 0], rootString: 5, barre: false, difficulty: 'intermediate' },
    { name: 'Eaug-Barre', shape: [2, 2, 2, 4, 4, 2], rootString: 5, barre: true, difficulty: 'advanced' },
  ],
};

// ============================================================================
// Additional Voicing Systems
// ============================================================================

// Drop-2 voicings (for 4-note chords on adjacent strings)
export const DROP2_TEMPLATES: Record<string, CagedTemplate[]> = {
  'maj7': [
    { name: 'Drop-2 (Root pos)', shape: [null, 7, 6, 7, 5, null], rootString: 4, barre: false, difficulty: 'advanced' }, // on strings 5-2
    { name: 'Drop-2 (1st inv)', shape: [null, 9, 9, 8, 7, null], rootString: 4, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (2nd inv)', shape: [null, 12, 11, 12, 10, null], rootString: 3, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (3rd inv)', shape: [null, 14, 13, 14, 12, null], rootString: 3, barre: false, difficulty: 'advanced' },
  ],
  'm7': [
    { name: 'Drop-2 (Root pos)', shape: [null, 7, 6, 6, 5, null], rootString: 4, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (1st inv)', shape: [null, 9, 8, 8, 7, null], rootString: 4, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (2nd inv)', shape: [null, 11, 11, 10, 10, null], rootString: 3, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (3rd inv)', shape: [null, 13, 13, 12, 11, null], rootString: 3, barre: false, difficulty: 'advanced' },
  ],
  '7': [
    { name: 'Drop-2 (Root pos)', shape: [null, 7, 6, 7, 6, null], rootString: 4, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (1st inv)', shape: [null, 9, 9, 8, 7, null], rootString: 4, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (2nd inv)', shape: [null, 11, 10, 11, 10, null], rootString: 3, barre: false, difficulty: 'advanced' },
    { name: 'Drop-2 (3rd inv)', shape: [null, 13, 13, 12, 11, null], rootString: 3, barre: false, difficulty: 'advanced' },
  ],
};

// Quartal voicings (built in 4ths)
export const QUARTAL_TEMPLATES: CagedTemplate[] = [
  { name: 'Quartal-1', shape: [null, 5, 5, 5, null, null], rootString: 3, barre: false, difficulty: 'advanced' },   // strings 4-2
  { name: 'Quartal-2', shape: [null, 10, 10, 10, null, null], rootString: 3, barre: false, difficulty: 'advanced' },
  { name: 'Quartal-3', shape: [8, 8, 8, null, null, null], rootString: 2, barre: false, difficulty: 'advanced' },   // strings 3-1
];

// Shell voicings (root + 3rd + 7th, no 5th)
export const SHELL_TEMPLATES: Record<string, CagedTemplate[]> = {
  'maj7': [
    { name: 'Shell (R-3-7)', shape: [null, null, 4, 3, 4, null], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'Shell (R-7-3)', shape: [null, null, 11, 10, 10, null], rootString: 4, barre: false, difficulty: 'advanced' },
  ],
  'm7': [
    { name: 'Shell (R-b3-b7)', shape: [null, null, 3, 3, 3, null], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'Shell (R-b7-b3)', shape: [null, null, 10, 10, 10, null], rootString: 4, barre: false, difficulty: 'advanced' },
  ],
  '7': [
    { name: 'Shell (R-3-b7)', shape: [null, null, 4, 3, 3, null], rootString: 4, barre: false, difficulty: 'intermediate' },
    { name: 'Shell (R-b7-3)', shape: [null, null, 10, 10, 9, null], rootString: 4, barre: false, difficulty: 'advanced' },
  ],
};

// ============================================================================
// Open Chord Definitions (standard tuning, fixed frets)
// ============================================================================

const OPEN_CHORDS: Record<string, { frets: (number | null)[]; root: NoteName; quality: ChordQuality }> = {
  'C': { frets: [0, 1, 0, 2, 3, null], root: 'C', quality: 'Major' },
  'Cm': { frets: [3, 4, 5, 5, 3, null], root: 'C', quality: 'Minor' },
  'C7': { frets: [0, 1, 3, 2, 3, null], root: 'C', quality: '7' },
  'Cmaj7': { frets: [0, 0, 0, 2, 3, null], root: 'C', quality: 'maj7' },
  'Cm7': { frets: [3, 4, 3, 5, 3, null], root: 'C', quality: 'm7' },
  'Csus4': { frets: [1, 1, 0, 3, 3, null], root: 'C', quality: 'sus4' },
  'Csus2': { frets: [0, 3, 0, 3, 3, null], root: 'C', quality: 'sus2' },
  'Cadd9': { frets: [3, 3, 0, 2, 3, null], root: 'C', quality: 'add9' },
  'C5': { frets: [null, null, 5, 5, 3, null], root: 'C', quality: '5' },
  
  'D': { frets: [2, 3, 2, 0, null, null], root: 'D', quality: 'Major' },
  'Dm': { frets: [1, 3, 2, 0, null, null], root: 'D', quality: 'Minor' },
  'D7': { frets: [2, 1, 2, 0, null, null], root: 'D', quality: '7' },
  'Dmaj7': { frets: [2, 2, 2, 0, null, null], root: 'D', quality: 'maj7' },
  'Dm7': { frets: [1, 1, 2, 0, null, null], root: 'D', quality: 'm7' },
  'Dsus4': { frets: [3, 3, 2, 0, null, null], root: 'D', quality: 'sus4' },
  'Dsus2': { frets: [0, 3, 2, 0, null, null], root: 'D', quality: 'sus2' },
  'Dadd9': { frets: [0, 3, 2, 0, null, null], root: 'D', quality: 'add9' },
  'D5': { frets: [null, null, null, 0, 5, 5], root: 'D', quality: '5' },
  
  'E': { frets: [0, 0, 1, 2, 2, 0], root: 'E', quality: 'Major' },
  'Em': { frets: [0, 0, 0, 2, 2, 0], root: 'E', quality: 'Minor' },
  'E7': { frets: [0, 0, 1, 0, 2, 0], root: 'E', quality: '7' },
  'Em7': { frets: [0, 3, 0, 0, 2, 0], root: 'E', quality: 'm7' },
  'Emaj7': { frets: [0, 0, 1, 1, 2, 0], root: 'E', quality: 'maj7' },
  'Esus4': { frets: [0, 0, 2, 2, 2, 0], root: 'E', quality: 'sus4' },
  'E5': { frets: [null, null, null, 2, 2, 0], root: 'E', quality: '5' },
  
  'F': { frets: [1, 1, 2, 3, 3, 1], root: 'F', quality: 'Major' },
  'Fm': { frets: [1, 1, 1, 3, 3, 1], root: 'F', quality: 'Minor' },
  'F7': { frets: [1, 1, 2, 1, 3, 1], root: 'F', quality: '7' },
  'Fmaj7': { frets: [0, 1, 2, 3, null, null], root: 'F', quality: 'maj7' },
  'Fm7': { frets: [1, 1, 1, 3, 3, 1], root: 'F', quality: 'm7' },
  'Fsus4': { frets: [1, 1, 3, 3, 3, 1], root: 'F', quality: 'sus4' },
  
  'G': { frets: [3, 0, 0, 0, 2, 3], root: 'G', quality: 'Major' },
  'Gm': { frets: [3, 3, 3, 5, 5, 3], root: 'G', quality: 'Minor' },
  'G7': { frets: [1, 0, 0, 0, 2, 3], root: 'G', quality: '7' },
  'Gmaj7': { frets: [2, 0, 0, 0, 2, 3], root: 'G', quality: 'maj7' },
  'Gm7': { frets: [3, 3, 3, 5, 5, 3], root: 'G', quality: 'm7' },
  'Gsus4': { frets: [3, 1, 0, 0, 3, 3], root: 'G', quality: 'sus4' },
  'Gadd9': { frets: [3, 0, 0, 2, 3, 3], root: 'G', quality: 'add9' },
  'G5': { frets: [null, null, null, 0, 5, 5], root: 'G', quality: '5' },
  
  'A': { frets: [0, 2, 2, 2, 0, null], root: 'A', quality: 'Major' },
  'Am': { frets: [0, 1, 2, 2, 0, null], root: 'A', quality: 'Minor' },
  'A7': { frets: [0, 2, 0, 2, 0, null], root: 'A', quality: '7' },
  'Am7': { frets: [0, 1, 0, 2, 0, null], root: 'A', quality: 'm7' },
  'Amaj7': { frets: [0, 2, 1, 2, 0, null], root: 'A', quality: 'maj7' },
  'Asus4': { frets: [0, 3, 2, 2, 0, null], root: 'A', quality: 'sus4' },
  'Asus2': { frets: [0, 0, 2, 2, 0, null], root: 'A', quality: 'sus2' },
  'Aadd9': { frets: [0, 0, 2, 4, 2, 0], root: 'A', quality: 'add9' },
  'A5': { frets: [null, null, 2, 2, 0, null], root: 'A', quality: '5' },
  
  'B': { frets: [2, 4, 4, 4, 2, null], root: 'B', quality: 'Major' },
  'Bm': { frets: [2, 3, 4, 4, 2, null], root: 'B', quality: 'Minor' },
  'B7': { frets: [2, 0, 2, 1, 2, null], root: 'B', quality: '7' },
  'Bm7': { frets: [2, 0, 2, 0, 2, null], root: 'B', quality: 'm7' },
  'Bmaj7': { frets: [2, 1, 2, 2, 2, null], root: 'B', quality: 'maj7' },
  'Bsus4': { frets: [2, 4, 4, 4, 2, null], root: 'B', quality: 'sus4' },
  'B5': { frets: [null, null, 4, 4, 2, null], root: 'B', quality: '5' },
  
  // Sharp/Flat variants
  'C#': { frets: [4, 6, 6, 6, 4, null], root: 'C#', quality: 'Major' },
  'Db': { frets: [4, 6, 6, 6, 4, null], root: 'Db', quality: 'Major' },
  'D#': { frets: [3, 4, 3, 1, null, null], root: 'D#', quality: 'Major' },
  'Eb': { frets: [3, 4, 3, 1, null, null], root: 'Eb', quality: 'Major' },
  'F#': { frets: [2, 2, 3, 4, 4, 2], root: 'F#', quality: 'Major' },
  'Gb': { frets: [2, 2, 3, 4, 4, 2], root: 'Gb', quality: 'Major' },
  'G#': { frets: [4, 4, 5, 6, 6, 4], root: 'G#', quality: 'Major' },
  'Ab': { frets: [4, 4, 5, 6, 6, 4], root: 'Ab', quality: 'Major' },
  'A#': { frets: [1, 3, 3, 3, 1, null], root: 'A#', quality: 'Major' },
  'Bb': { frets: [1, 3, 3, 3, 1, null], root: 'Bb', quality: 'Major' },
  
  'C#m': { frets: [4, 5, 6, 6, 4, null], root: 'C#', quality: 'Minor' },
  'Dbm': { frets: [4, 5, 6, 6, 4, null], root: 'Db', quality: 'Minor' },
  'D#m': { frets: [2, 4, 3, 1, null, null], root: 'D#', quality: 'Minor' },
  'Ebm': { frets: [2, 4, 3, 1, null, null], root: 'Eb', quality: 'Minor' },
  'F#m': { frets: [2, 2, 2, 4, 4, 2], root: 'F#', quality: 'Minor' },
  'Gbm': { frets: [2, 2, 2, 4, 4, 2], root: 'Gb', quality: 'Minor' },
  'G#m': { frets: [4, 4, 4, 6, 6, 4], root: 'G#', quality: 'Minor' },
  'Abm': { frets: [4, 4, 4, 6, 6, 4], root: 'Ab', quality: 'Minor' },
  'A#m': { frets: [1, 2, 3, 3, 1, null], root: 'A#', quality: 'Minor' },
  'Bbm': { frets: [1, 2, 3, 3, 1, null], root: 'Bb', quality: 'Minor' },
  
  'G/B': { frets: [3, 0, 0, 0, 2, null], root: 'G', quality: 'Major' },
  'C/E': { frets: [0, 1, 0, 2, 3, 0], root: 'C', quality: 'Major' },
  'D/F#': { frets: [2, 3, 2, 0, null, 2], root: 'D', quality: 'Major' },
};

// Slash chords (inversions)
const SLASH_CHORDS: Record<string, { frets: (number | null)[]; root: NoteName; quality: ChordQuality; bass: NoteName }> = {
  'G/B': { frets: [3, 0, 0, 0, 2, null], root: 'G', quality: 'Major', bass: 'B' },
  'C/E': { frets: [0, 1, 0, 2, 3, 0], root: 'C', quality: 'Major', bass: 'E' },
  'D/F#': { frets: [2, 3, 2, 0, null, 2], root: 'D', quality: 'Major', bass: 'F#' },
  'Am/G': { frets: [3, 1, 2, 2, 0, null], root: 'A', quality: 'Minor', bass: 'G' },
  'Dm/F': { frets: [1, 1, 2, 0, null, 1], root: 'D', quality: 'Minor', bass: 'F' },
  'F/C': { frets: [1, 1, 2, 3, 3, 1], root: 'F', quality: 'Major', bass: 'C' },
};

// ============================================================================
// Chord Database Builder
// ============================================================================

export function buildChordDefinition(
  root: NoteName, 
  quality: ChordQuality,
  tuning: StringTuning[] = STANDARD_TUNING
): ChordDefinition {
  const intervals = CHORD_FORMULAS[quality] || [0, 4, 7];
  const notes = intervals.map(i => transposeNote(root, i));
  const formula = intervals.map(i => {
    if (i === 0) return '1';
    if (i === 1) return 'b2';
    if (i === 2) return '2';
    if (i === 3) return 'b3';
    if (i === 4) return '3';
    if (i === 5) return '4';
    if (i === 6) return '#4/b5';
    if (i === 7) return '5';
    if (i === 8) return '#5/b6';
    if (i === 9) return '6';
    if (i === 10) return 'b7';
    if (i === 11) return '7';
    if (i === 14) return '9';
    if (i === 17) return '11';
    if (i === 21) return '13';
    return i.toString();
  }).join(' - ');
  
  // Get open chord if available
  const openKey = `${root}${CHORD_QUALITY_DISPLAY[quality]}`;
  const openChord = OPEN_CHORDS[openKey];
  
  // Generate voicings
  const voicings: ChordVoicing[] = [];
  
  // 1. Open chord (if exists)
  if (openChord) {
    voicings.push({
      name: 'Open',
      frets: openChord.frets,
      difficulty: 'beginner',
    });
  }
  
  // 2. CAGED shapes
  const cagedTemplates = CAGED_TEMPLATES[quality] || [];
  for (const tmpl of cagedTemplates) {
    // Find barre fret to match root on rootString
    const rootStringMidi = tuning[tmpl.rootString].midi;
    const rootNoteIndex = NOTE_NAMES.indexOf(root);
    const targetMidi = 60 + rootNoteIndex; // Middle C = 60
    let barreFret = targetMidi - rootStringMidi;
    
    // For open shapes, barreFret should be 0
    if (!tmpl.barre && barreFret === 0) {
      // Already covered by open chord
      continue;
    }
    
    // Apply template
    const frets: (number | null)[] = [];
    for (let s = 0; s < 6; s++) {
      const offset = tmpl.shape[s];
      if (offset === null) {
        frets.push(null);
      } else {
        frets.push(offset + barreFret);
      }
    }
    
    voicings.push({
      name: tmpl.name,
      frets,
      barre: tmpl.barre ? { fret: barreFret, fromString: 0, toString: 5 } : undefined,
      difficulty: tmpl.difficulty,
    });
  }
  
  // 3. Drop-2 voicings (for 4-note chords)
  if (intervals.length >= 4) {
    const drop2Templates = DROP2_TEMPLATES[quality] || [];
    for (const tmpl of drop2Templates) {
      const frets: (number | null)[] = [...tmpl.shape];
      voicings.push({
        name: tmpl.name,
        frets,
        difficulty: tmpl.difficulty,
      });
    }
  }
  
  // 4. Shell voicings
  const shellTemplates = SHELL_TEMPLATES[quality] || [];
  for (const tmpl of shellTemplates) {
    voicings.push({
      name: tmpl.name,
      frets: tmpl.shape,
      difficulty: tmpl.difficulty,
    });
  }
  
  // 5. Quartal (for suspended/modern)
  if (quality === 'sus4' || quality === 'sus2' || quality === '7sus4') {
    for (const tmpl of QUARTAL_TEMPLATES) {
      voicings.push({
        name: tmpl.name,
        frets: tmpl.shape,
        difficulty: tmpl.difficulty,
      });
    }
  }
  
  // 6. Slash chord if applicable
  const slashKey = `${root}${CHORD_QUALITY_DISPLAY[quality]}`;
  if (SLASH_CHORDS[slashKey]) {
    const slash = SLASH_CHORDS[slashKey];
    voicings.push({
      name: `Slash (/${slash.bass})`,
      frets: slash.frets,
      difficulty: 'intermediate',
    });
  }
  
  return {
    symbol: { root, quality },
    intervals,
    notes,
    voicings,
    formula,
    aliases: [`${root}${CHORD_QUALITY_DISPLAY[quality]}`],
  };
}

export function getAllChordDefinitions(tuning: StringTuning[] = STANDARD_TUNING): ChordDefinition[] {
  const roots: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const qualities: ChordQuality[] = [
    'Major', 'Minor', '7', 'maj7', 'm7', 
    'sus2', 'sus4', '5', 'dim', 'aug',
    '6', 'm6', 'add9', '9', 'm9', 'maj9',
    '7sus4', 'm7b5', 'dim7'
  ];
  
  const definitions: ChordDefinition[] = [];
  for (const root of roots) {
    for (const quality of qualities) {
      definitions.push(buildChordDefinition(root, quality, tuning));
    }
  }
  return definitions;
}

// ============================================================================
// Utility: Find chord voicings for a specific fretboard state
// ============================================================================

export function identifyChordFromFrets(
  frets: (number | null)[], 
  tuning: StringTuning[] = STANDARD_TUNING
): ChordDefinition | null {
  // Collect active notes
  const activeNotes: { note: NoteName; midi: number; string: number }[] = [];
  let lowestMidi = 999;
  
  for (let s = 0; s < 6; s++) {
    const fret = frets[s];
    if (fret !== null && fret !== -1 && fret !== undefined) {
      const midi = tuning[s].midi + fret;
      const pitch = midiToPitch(midi);
      activeNotes.push({ note: pitch.note, midi, string: s });
      if (midi < lowestMidi) lowestMidi = midi;
    }
  }
  
  if (activeNotes.length < 2) return null;
  
  // Find best matching chord definition
  const allDefs = getAllChordDefinitions(tuning);
  let bestMatch: ChordDefinition | null = null;
  let bestScore = -1;
  
  for (const def of allDefs) {
    let score = 0;
    const chordNotes = new Set(def.notes);
    
    // Check how many active notes match chord tones
    for (const an of activeNotes) {
      if (chordNotes.has(an.note)) score += 2;
      else score -= 1; // non-chord tone penalty
    }
    
    // Bonus for root in bass
    const bassNote = midiToPitch(lowestMidi).note;
    if (bassNote === def.symbol.root) score += 3;
    
    // Check if any voicing matches exactly
    for (const v of def.voicings) {
      let match = true;
      for (let s = 0; s < 6; s++) {
        if (v.frets[s] !== frets[s]) { match = false; break; }
      }
      if (match) score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = def;
    }
  }
  
  return bestMatch;
}

// ============================================================================
// Transpose chord to different tuning
// ============================================================================

export function transposeChordToTuning(
  chordSymbol: string,
  fromTuning: StringTuning[],
  toTuning: StringTuning[]
): (number | null)[] {
  // Parse chord symbol
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed) return [null, null, null, null, null, null];
  
  // Get definition in source tuning
  const def = buildChordDefinition(parsed.root, parsed.quality, fromTuning);
  
  // Find best matching voicing (prefer open, then fewest frets)
  let bestVoicing = def.voicings[0];
  for (const v of def.voicings) {
    if (v.name === 'Open') { bestVoicing = v; break; }
  }
  
  // Convert frets to intervals from open strings
  const intervals: (number | null)[] = [];
  for (let s = 0; s < 6; s++) {
    if (bestVoicing.frets[s] !== null && bestVoicing.frets[s] !== -1) {
      intervals.push(bestVoicing.frets[s]);
    } else {
      intervals.push(null);
    }
  }
  
  // Apply to target tuning - calculate the actual frets needed
  const result: (number | null)[] = [];
  for (let s = 0; s < 6; s++) {
    if (intervals[s] === null) {
      result.push(null);
    } else {
      // Calculate the target MIDI note from source tuning
      const sourceMidi = fromTuning[s].midi + intervals[s]!;
      // Find the fret on target tuning that gives the same note
      const targetFret = sourceMidi - toTuning[s].midi;
      if (targetFret >= 0 && targetFret <= 24) {
        result.push(targetFret);
      } else {
        result.push(null); // Can't play this note on target tuning
      }
    }
  }
  
  return result;
}

export { parseChordSymbol } from '../types';
export type { CapoState } from './tunings';