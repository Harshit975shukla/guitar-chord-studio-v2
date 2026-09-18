/**
 * Tuning Presets and Management
 */

import { TuningPreset, StringTuning, STANDARD_TUNING, NOTE_NAMES, NoteName } from '../types';

// ============================================================================
// Capo State (local since it's not exported from types)
// ============================================================================

export interface CapoState {
  enabled: boolean;
  fret: number; // 1-12
}

// ============================================================================
// Built-in Tuning Presets
// ============================================================================

function createTuning(id: string, name: string, notes: NoteName[], description?: string): TuningPreset {
  const strings: StringTuning[] = notes.map((note, i) => {
    // Find MIDI note for this string (standard tuning reference)
    const standardMidi = STANDARD_TUNING[i].midi;
    const standardNote = STANDARD_TUNING[i].note;
    const noteIndex = NOTE_NAMES.indexOf(note);
    const standardNoteIndex = NOTE_NAMES.indexOf(standardNote);
    
    // Calculate octave to keep in reasonable range
    let midi = standardMidi + (noteIndex - standardNoteIndex);
    // Adjust octave to stay close to standard
    while (midi > standardMidi + 6) midi -= 12;
    while (midi < standardMidi - 6) midi += 12;
    
    return {
      note,
      midi,
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      gaugeClass: STANDARD_TUNING[i].gaugeClass,
      stringIndex: i,
    };
  });
  
  return { id, name, strings, description };
}

export const TUNING_PRESETS: TuningPreset[] = [
  createTuning(
    'standard',
    'Standard (EADGBE)',
    ['E', 'B', 'G', 'D', 'A', 'E'],
    'Standard tuning - most common for all styles'
  ),
  createTuning(
    'drop_d',
    'Drop D (DADGBE)',
    ['E', 'B', 'G', 'D', 'A', 'D'],
    'Low E dropped to D - rock, metal, folk'
  ),
  createTuning(
    'double_drop_d',
    'Double Drop D (DADGBD)',
    ['D', 'B', 'G', 'D', 'A', 'D'],
    'Both E strings dropped to D - folk, Celtic'
  ),
  createTuning(
    'dadgad',
    'DADGAD',
    ['D', 'A', 'G', 'D', 'A', 'D'],
    'Celtic, folk, fingerstyle - open Dsus4'
  ),
  createTuning(
    'open_d',
    'Open D (DADF#AD)',
    ['D', 'A', 'F#', 'D', 'A', 'D'],
    'Open D major - slide, blues, folk'
  ),
  createTuning(
    'open_g',
    'Open G (DGDGBD)',
    ['D', 'B', 'G', 'D', 'G', 'D'],
    'Open G major - blues, slide, Keith Richards style'
  ),
  createTuning(
    'open_c',
    'Open C (CGCGCE)',
    ['E', 'C', 'G', 'C', 'G', 'C'],
    'Open C major - John Fahey style, fingerstyle'
  ),
  createTuning(
    'open_e',
    'Open E (EBEG#BE)',
    ['E', 'B', 'G#', 'E', 'B', 'E'],
    'Open E major - slide blues, Duane Allman'
  ),
  createTuning(
    'open_a',
    'Open A (EAEAC#E)',
    ['E', 'C#', 'A', 'E', 'A', 'E'],
    'Open A major - slide, blues'
  ),
  createTuning(
    'half_step_down',
    'Half Step Down (Eb Ab Db Gb Bb Eb)',
    ['Eb', 'Bb', 'Gb', 'Db', 'Ab', 'Eb'],
    'Eb standard - rock, metal, easier vocals'
  ),
  createTuning(
    'full_step_down',
    'Full Step Down (D G C F A D)',
    ['D', 'A', 'F', 'C', 'G', 'D'],
    'D standard - heavy metal, doom'
  ),
  createTuning(
    'drop_c',
    'Drop C (CGCFAD)',
    ['D', 'A', 'F', 'C', 'G', 'C'],
    'Drop C - metal, hardcore'
  ),
  createTuning(
    'drop_b',
    'Drop B (BGBEAbB)',
    ['B', 'Ab', 'E', 'B', 'G', 'B'],
    'Drop B - modern metal'
  ),
  createTuning(
    'nashville',
    'Nashville High Strung',
    ['E', 'B', 'G', 'D', 'A', 'E'], // Same notes but high-strung (octave up on 4-6)
    'High-strung / Nashville tuning - jangly 12-string sound on 6-string'
  ),
  createTuning(
    'all_fourths',
    'All Fourths (EADGCF)',
    ['F', 'C', 'G', 'D', 'A', 'E'],
    'Symmetrical tuning - jazz, easier scale patterns'
  ),
  createTuning(
    'new_standard',
    'New Standard (CGDAEG)',
    ['G', 'E', 'D', 'A', 'G', 'C'],
    'Robert Fripp / Guitar Craft tuning'
  ),
];

export const TUNING_PRESET_MAP = new Map(TUNING_PRESETS.map(t => [t.id, t]));

export function getTuningPreset(id: string): TuningPreset | undefined {
  return TUNING_PRESET_MAP.get(id);
}

export function getTuningPresetNames(): Array<{ id: string; name: string }> {
  return TUNING_PRESETS.map(t => ({ id: t.id, name: t.name }));
}

// ============================================================================
// Tuning Utilities
// ============================================================================

export function getStringMidi(tuning: TuningPreset, stringIndex: number): number {
  return tuning.strings[stringIndex].midi;
}

export function getStringFreq(tuning: TuningPreset, stringIndex: number): number {
  return tuning.strings[stringIndex].freq;
}

export function getStringNote(tuning: TuningPreset, stringIndex: number): string {
  return tuning.strings[stringIndex].note;
}

export function getFretMidi(tuning: TuningPreset, stringIndex: number, fret: number): number {
  return tuning.strings[stringIndex].midi + fret;
}

export function getFretFreq(tuning: TuningPreset, stringIndex: number, fret: number): number {
  const midi = getFretMidi(tuning, stringIndex, fret);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function findFretForNote(tuning: TuningPreset, targetMidi: number, maxFret: number = 24): { stringIndex: number; fret: number } | null {
  let best: { stringIndex: number; fret: number; diff: number } | null = null;
  
  for (let s = 0; s < 6; s++) {
    const openMidi = tuning.strings[s].midi;
    const fret = Math.round(targetMidi - openMidi);
    if (fret >= 0 && fret <= maxFret) {
      const diff = Math.abs(targetMidi - (openMidi + fret));
      if (!best || diff < best.diff) {
        best = { stringIndex: s, fret, diff };
      }
    }
  }
  
  return best ? { stringIndex: best.stringIndex, fret: best.fret } : null;
}

export function findAllPositionsForNote(tuning: TuningPreset, targetMidi: number, maxFret: number = 24): Array<{ stringIndex: number; fret: number }> {
  const positions: Array<{ stringIndex: number; fret: number }> = [];
  
  for (let s = 0; s < 6; s++) {
    const openMidi = tuning.strings[s].midi;
    const fret = targetMidi - openMidi;
    if (fret >= 0 && fret <= maxFret && Number.isInteger(fret)) {
      positions.push({ stringIndex: s, fret });
    }
  }
  
  // Sort by fret (lowest first)
  positions.sort((a, b) => a.fret - b.fret);
  return positions;
}

export function getTuningRange(tuning: TuningPreset): { lowestMidi: number; highestMidi: number } {
  const lowestMidi = tuning.strings[5].midi; // 6th string open
  const highestMidi = tuning.strings[0].midi + 24; // 1st string 24th fret
  return { lowestMidi, highestMidi };
}

// ============================================================================
// Capo Support
// ============================================================================

export function applyCapo(tuning: TuningPreset, capo: CapoState): StringTuning[] {
  if (!capo.enabled || capo.fret === 0) return tuning.strings;
  
  return tuning.strings.map(s => ({
    ...s,
    midi: s.midi + capo.fret,
    freq: 440 * Math.pow(2, (s.midi + capo.fret - 69) / 12),
  }));
}

export function getEffectiveFret(fret: number, capo: CapoState): number {
  if (!capo.enabled) return fret;
  return fret - capo.fret; // Fret relative to capo
}

export function getAbsoluteFret(displayFret: number, capo: CapoState): number {
  if (!capo.enabled) return displayFret;
  return displayFret + capo.fret;
}

// ============================================================================
// Transposition Helper
// ============================================================================

export function transposeTuning(tuning: TuningPreset, semitones: number): TuningPreset {
  const newNotes = tuning.strings.map(s => {
    const idx = NOTE_NAMES.indexOf(s.note as any);
    const newIdx = (idx + semitones + 120) % 12;
    return NOTE_NAMES[newIdx];
  });
  
  return createTuning(
    `${tuning.id}_transposed${semitones >= 0 ? '+' : ''}${semitones}`,
    `${tuning.name} (${semitones >= 0 ? '+' : ''}${semitones})`,
    newNotes as any,
    `Transposed ${semitones} semitones from ${tuning.name}`
  );
}