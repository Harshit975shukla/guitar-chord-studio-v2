// Rhythm Presets - Tabla, Cajón, and Percussion Patterns

export interface RhythmStroke {
  name: string;
  type: 'bayan_dayan' | 'bayan' | 'dayan_na' | 'dayan_tin' | 'dayan_ta' | 'cajon_bass' | 'cajon_snare' | 'shaker';
  vel: number;
  sam?: boolean; // first beat of cycle
}

export interface RhythmPreset {
  id: string;
  name: string;
  beats: number;
  pattern: RhythmStroke[];
  description: string;
  category: 'indian' | 'western' | 'hybrid';
  bpmRange: { min: number; max: number; default: number };
}

export const RHYTHM_PRESETS: RhythmPreset[] = [
  // Indian Classical
  {
    id: 'keharwa',
    name: 'Keharwa Taal (8 Beats)',
    beats: 8,
    pattern: [
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0, sam: true },
      { name: 'Ge', type: 'bayan', vel: 0.8 },
      { name: 'Na', type: 'dayan_na', vel: 0.9 },
      { name: 'Ti', type: 'dayan_tin', vel: 0.7 },
      { name: 'Na', type: 'dayan_na', vel: 0.9 },
      { name: 'Ke', type: 'dayan_ta', vel: 0.6 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Na', type: 'dayan_na', vel: 0.85 },
    ],
    description: 'Most common 8-beat cycle. Used in Bollywood, Ghazal, Folk, Bhajan.',
    category: 'indian',
    bpmRange: { min: 60, max: 140, default: 80 },
  },
  {
    id: 'dadra',
    name: 'Dadra Taal (6 Beats)',
    beats: 6,
    pattern: [
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0, sam: true },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.95 },
      { name: 'Tu', type: 'bayan', vel: 0.75 },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
    ],
    description: '6-beat cycle. Waltz feel. Light classical, Bhajan, Folk.',
    category: 'indian',
    bpmRange: { min: 60, max: 120, default: 76 },
  },
  {
    id: 'teentaal',
    name: 'TeenTaal (16 Beats)',
    beats: 16,
    pattern: [
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0, sam: true },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dha', type: 'dayan_na', vel: 0.85 },
      { name: 'Tin', type: 'dayan_tin', vel: 0.75 },
      { name: 'Tin', type: 'dayan_tin', vel: 0.75 },
      { name: 'Ta', type: 'dayan_ta', vel: 0.7 },
      { name: 'Ta', type: 'dayan_ta', vel: 0.75 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0 },
    ],
    description: 'The king of taalas - 16 beats. Classical instrumental, Khayal, Dhrupad.',
    category: 'indian',
    bpmRange: { min: 40, max: 120, default: 72 },
  },
  {
    id: 'jhaptaal',
    name: 'JhapTaal (10 Beats)',
    beats: 10,
    pattern: [
      { name: 'Dhi', type: 'bayan_dayan', vel: 1.0, sam: true },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
      { name: 'Ti', type: 'dayan_tin', vel: 0.7 },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Na', type: 'dayan_na', vel: 0.8 },
    ],
    description: '10-beat cycle. Khayal, Tarana, Instrumental.',
    category: 'indian',
    bpmRange: { min: 50, max: 130, default: 80 },
  },
  {
    id: 'rupak',
    name: 'Rupak Taal (7 Beats)',
    beats: 7,
    pattern: [
      { name: 'Tin', type: 'dayan_tin', vel: 0.8, sam: true }, // Khali (empty) on sam
      { name: 'Tin', type: 'dayan_tin', vel: 0.75 },
      { name: 'Na', type: 'dayan_na', vel: 0.85 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 1.0 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 0.95 },
      { name: 'Na', type: 'dayan_na', vel: 0.85 },
      { name: 'Dhi', type: 'bayan_dayan', vel: 1.0 },
    ],
    description: '7-beat cycle starting on khali. Bhajan, Thumri, Light Classical.',
    category: 'indian',
    bpmRange: { min: 50, max: 120, default: 72 },
  },
  {
    id: 'ektal',
    name: 'EkTaal (12 Beats)',
    beats: 12,
    pattern: [
      { name: 'Dhin', type: 'bayan_dayan', vel: 1.0, sam: true },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.85 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dha', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Tin', type: 'dayan_tin', vel: 0.75 },
      { name: 'Tin', type: 'dayan_tin', vel: 0.75 },
      { name: 'Ta', type: 'dayan_ta', vel: 0.7 },
      { name: 'Ta', type: 'dayan_ta', vel: 0.7 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dhin', type: 'bayan_dayan', vel: 0.9 },
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0 },
      { name: 'Dha', type: 'bayan_dayan', vel: 1.0 },
    ],
    description: '12-beat cycle. Dhrupad, Khayal, Instrumental.',
    category: 'indian',
    bpmRange: { min: 40, max: 100, default: 60 },
  },

  // Western / Pop
  {
    id: 'pop_cajon',
    name: 'Acoustic Pop Cajón (4/4)',
    beats: 8,
    pattern: [
      { name: 'Bass', type: 'cajon_bass', vel: 1.0, sam: true },
      { name: 'Shk', type: 'shaker', vel: 0.5 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.9 },
      { name: 'Shk', type: 'shaker', vel: 0.6 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.85 },
      { name: 'Shk', type: 'shaker', vel: 0.55 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.95 },
      { name: 'Shk', type: 'shaker', vel: 0.7 },
    ],
    description: 'Standard pop/folk cajón pattern. Ed Sheeran style, singer-songwriter.',
    category: 'western',
    bpmRange: { min: 60, max: 140, default: 90 },
  },
  {
    id: 'rock_cajon',
    name: 'Rock Cajón (4/4 Driving)',
    beats: 8,
    pattern: [
      { name: 'Bass', type: 'cajon_bass', vel: 1.0, sam: true },
      { name: 'Bass', type: 'cajon_bass', vel: 0.7 },
      { name: 'Snare', type: 'cajon_snare', vel: 1.0 },
      { name: 'Shk', type: 'shaker', vel: 0.6 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.9 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.6 },
      { name: 'Snare', type: 'cajon_snare', vel: 1.0 },
      { name: 'Shk', type: 'shaker', vel: 0.7 },
    ],
    description: 'Driving rock pattern with double bass. High energy.',
    category: 'western',
    bpmRange: { min: 100, max: 180, default: 130 },
  },
  {
    id: 'funk_cajon',
    name: 'Funk Cajón (16th Feel)',
    beats: 16,
    pattern: [
      { name: 'Bass', type: 'cajon_bass', vel: 1.0, sam: true },
      { name: 'Gst', type: 'shaker', vel: 0.4 },
      { name: 'Gst', type: 'shaker', vel: 0.3 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.8 },
      { name: 'Gst', type: 'shaker', vel: 0.35 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.6 },
      { name: 'Gst', type: 'shaker', vel: 0.4 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.85 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.9 },
      { name: 'Gst', type: 'shaker', vel: 0.3 },
      { name: 'Gst', type: 'shaker', vel: 0.25 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.8 },
      { name: 'Gst', type: 'shaker', vel: 0.35 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.7 },
      { name: 'Gst', type: 'shaker', vel: 0.4 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.9 },
    ],
    description: '16th-note funk groove. Ghost notes on shaker. James Brown style.',
    category: 'western',
    bpmRange: { min: 80, max: 130, default: 100 },
  },
  {
    id: 'ballad_cajon',
    name: 'Slow Ballad Cajón (6/8 Feel)',
    beats: 12,
    pattern: [
      { name: 'Bass', type: 'cajon_bass', vel: 1.0, sam: true },
      { name: 'Shk', type: 'shaker', vel: 0.4 },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.7 },
      { name: 'Shk', type: 'shaker', vel: 0.35 },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.8 },
      { name: 'Shk', type: 'shaker', vel: 0.4 },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.75 },
      { name: 'Shk', type: 'shaker', vel: 0.35 },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
    ],
    description: 'Slow 6/8 ballad feel. Sparse, emotional. Adele, Ed Sheeran ballads.',
    category: 'western',
    bpmRange: { min: 40, max: 80, default: 60 },
  },
  {
    id: 'reggae_cajon',
    name: 'Reggae Cajón (One Drop)',
    beats: 8,
    pattern: [
      { name: 'Rst', type: 'shaker', vel: 0.3 }, // Rest on 1
      { name: 'Bass', type: 'cajon_bass', vel: 0.9 }, // Bass on 2
      { name: 'Rst', type: 'shaker', vel: 0.3 },
      { name: 'Snare', type: 'cajon_snare', vel: 1.0 }, // Snare on 3 (one drop)
      { name: 'Rst', type: 'shaker', vel: 0.3 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.8 },
      { name: 'Rst', type: 'shaker', vel: 0.3 },
      { name: 'Snare', type: 'cajon_snare', vel: 0.9 },
    ],
    description: 'Classic reggae "one drop" - bass on 2&4, snare on 3. Bob Marley style.',
    category: 'western',
    bpmRange: { min: 60, max: 100, default: 76 },
  },
  {
    id: 'bossa_nova',
    name: 'Bossa Nova Shaker (2/4)',
    beats: 8,
    pattern: [
      { name: 'Shk', type: 'shaker', vel: 0.7, sam: true },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
      { name: 'Rim', type: 'cajon_snare', vel: 0.6 },
      { name: 'Shk', type: 'shaker', vel: 0.4 },
      { name: 'Shk', type: 'shaker', vel: 0.65 },
      { name: 'Shk', type: 'shaker', vel: 0.3 },
      { name: 'Rim', type: 'cajon_snare', vel: 0.65 },
      { name: 'Shk', type: 'shaker', vel: 0.45 },
    ],
    description: 'Brazilian bossa nova shaker pattern. Jobim, Gilberto style.',
    category: 'western',
    bpmRange: { min: 100, max: 160, default: 120 },
  },

  // Hybrid / Specialty
  {
    id: 'shaker_groove',
    name: 'Acoustic Shaker & Rim (16th)',
    beats: 8,
    pattern: [
      { name: 'Shk', type: 'shaker', vel: 0.9, sam: true },
      { name: 'Shk', type: 'shaker', vel: 0.4 },
      { name: 'Rim', type: 'cajon_snare', vel: 0.8 },
      { name: 'Shk', type: 'shaker', vel: 0.5 },
      { name: 'Shk', type: 'shaker', vel: 0.85 },
      { name: 'Shk', type: 'shaker', vel: 0.45 },
      { name: 'Rim', type: 'cajon_snare', vel: 0.85 },
      { name: 'Shk', type: 'shaker', vel: 0.6 },
    ],
    description: '16th-note egg shaker with rim clicks. Unplugged ballads, coffeehouse.',
    category: 'hybrid',
    bpmRange: { min: 60, max: 120, default: 85 },
  },
  {
    id: 'flamenco_compas',
    name: 'Flamenco Compás (12 Beats)',
    beats: 12,
    pattern: [
      { name: 'Golpe', type: 'cajon_snare', vel: 1.0 }, // 1
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 2
      { name: 'Golpe', type: 'cajon_snare', vel: 0.8 }, // 3
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 4
      { name: 'Golpe', type: 'cajon_snare', vel: 0.9 }, // 5
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 6
      { name: 'Bass', type: 'cajon_bass', vel: 0.9 }, // 7
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 8
      { name: 'Golpe', type: 'cajon_snare', vel: 0.8 }, // 9
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 10
      { name: 'Golpe', type: 'cajon_snare', vel: 0.9 }, // 11
      { name: 'Rst', type: 'shaker', vel: 0.1 }, // 12
    ],
    description: 'Flamenco 12-beat compás (Soleá/Bulerías). Accents on 3,6,8,10,12.',
    category: 'hybrid',
    bpmRange: { min: 100, max: 220, default: 160 },
  },
  {
    id: 'afro_cuban_6_8',
    name: 'Afro-Cuban 6/8 (Bembé)',
    beats: 12,
    pattern: [
      { name: 'Bass', type: 'cajon_bass', vel: 1.0, sam: true },
      { name: 'Rst', type: 'shaker', vel: 0.2 },
      { name: 'Slap', type: 'cajon_snare', vel: 0.8 },
      { name: 'Rst', type: 'shaker', vel: 0.2 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.7 },
      { name: 'Slap', type: 'cajon_snare', vel: 0.9 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.8 },
      { name: 'Rst', type: 'shaker', vel: 0.2 },
      { name: 'Slap', type: 'cajon_snare', vel: 0.7 },
      { name: 'Rst', type: 'shaker', vel: 0.2 },
      { name: 'Bass', type: 'cajon_bass', vel: 0.6 },
      { name: 'Slap', type: 'cajon_snare', vel: 0.8 },
    ],
    description: 'Afro-Cuban 6/8 bell pattern adapted for cajón. Latin jazz, Salsa.',
    category: 'hybrid',
    bpmRange: { min: 100, max: 180, default: 140 },
  },
];

// Helper functions
export function getRhythmPreset(id: string): RhythmPreset | undefined {
  return RHYTHM_PRESETS.find(p => p.id === id);
}

export function getRhythmPresetsByCategory(category: 'indian' | 'western' | 'hybrid'): RhythmPreset[] {
  return RHYTHM_PRESETS.filter(p => p.category === category);
}

export function getAllRhythmPresetNames(): Array<{ id: string; name: string }> {
  return RHYTHM_PRESETS.map(p => ({ id: p.id, name: p.name }));
}