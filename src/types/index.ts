/**
 * Core type definitions for Guitar Chord Studio
 */

// ============================================================================
// Musical Types
// ============================================================================

export type NoteName = 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B';
export type Accidental = '#' | 'b' | '';
export type Octave = number;

export interface Pitch {
  midi: number;
  freq: number;
  note: NoteName;
  octave: Octave;
  cents: number; // deviation from equal temperament
}

export type ChordQuality = 
  | 'Major' | 'Minor' 
  | '7' | 'maj7' | 'm7' 
  | 'sus2' | 'sus4' 
  | '5' // power chord
  | 'dim' | 'aug'
  | '6' | 'm6'
  | '9' | 'm9' | 'maj9'
  | '11' | 'm11' | '13'
  | 'add9' | 'add11'
  | '7sus4' | '7#9' | '7b9' | '7#5' | '7b5'
  | 'm7b5' | 'dim7';

export interface ChordSymbol {
  root: NoteName;
  quality: ChordQuality;
  bass?: NoteName; // for slash chords
}

export interface ChordVoicing {
  name: string; // e.g., "CAGED-E", "Drop-2", "Quartal", "Shell"
  frets: (number | null)[]; // 6 strings, null = muted, 0 = open, -1 = not played
  fingerings?: (number | null)[]; // suggested finger numbers (1-4, null = open/muted)
  barre?: { fret: number; fromString: number; toString: number };
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface ChordDefinition {
  symbol: ChordSymbol;
  intervals: number[]; // semitones from root
  notes: NoteName[];
  voicings: ChordVoicing[];
  formula: string; // e.g., "1 - 3 - 5"
  aliases?: string[]; // e.g., ["Cmaj7", "CM7"]
}

// ============================================================================
// Guitar Tuning Types
// ============================================================================

export interface StringTuning {
  note: NoteName;
  midi: number;
  freq: number;
  gaugeClass: string; // for visual string thickness
  stringIndex: number; // 0 = high E (1st), 5 = low E (6th)
}

export interface TuningPreset {
  id: string;
  name: string;
  strings: StringTuning[]; // 6 strings, high to low (1st to 6th)
  description?: string;
}

export const STANDARD_TUNING: StringTuning[] = [
  { note: 'E', midi: 64, freq: 329.63, gaugeClass: 'str-1', stringIndex: 0 }, // 1st
  { note: 'B', midi: 59, freq: 246.94, gaugeClass: 'str-2', stringIndex: 1 }, // 2nd
  { note: 'G', midi: 55, freq: 196.00, gaugeClass: 'str-3', stringIndex: 2 }, // 3rd
  { note: 'D', midi: 50, freq: 146.83, gaugeClass: 'str-4', stringIndex: 3 }, // 4th
  { note: 'A', midi: 45, freq: 110.00, gaugeClass: 'str-5', stringIndex: 4 }, // 5th
  { note: 'E', midi: 40, freq: 82.41,  gaugeClass: 'str-6', stringIndex: 5 }, // 6th
];

// ============================================================================
// Audio / Detection Types
// ============================================================================

export type DetectionMode = 'single-note' | 'chord' | 'polyphonic-tuner' | 'idle';

export interface DetectedPeak {
  freq: number;
  midi: number;
  note: NoteName;
  amp: number;
  pitchClass: number;
  bin: number;
}

export interface DetectionResult {
  mode: DetectionMode;
  timestamp: number;
  
  // Single note
  note?: {
    pitch: Pitch;
    guitarPosition?: GuitarPosition;
    confidence: number;
    tunerVerdict: 'in-tune' | 'flat' | 'sharp';
  };
  
  // Chord
  chord?: {
    symbol: string; // e.g., "Am7"
    root: NoteName;
    quality: ChordQuality;
    inversion?: NoteName; // bass note if different from root
    confidence: number;
    activeNotes: NoteName[];
    intervals: string; // e.g. "1 - b3 - 5"
    formula?: string;
    sargam?: string; // legacy alias
    // 7th disambiguation
    seventhAnalysis?: {
      seventhNote: NoteName;
      seventhRatio: number;
      threshold: number;
      verdict: 'triad' | 'seventh';
    };
    candidates?: Array<{ symbol: string; confidence: number; name?: string }>;
  };
  
  // Polyphonic tuner (6 needles)
  polyphonicTuner?: {
    strings: Array<{
      stringIndex: number;
      targetFreq: number;
      detectedFreq: number | null;
      cents: number | null;
      inTune: boolean;
    }>;
  };
  
  // Visualization data
  chroma: Float32Array; // 12 semitone energies
  peaks: DetectedPeak[];
  ringingNotes?: Array<{ note: NoteName; freq: number; octave: number; amp: number; cents?: number }>;
  isSustained?: boolean;
  statusMessage?: string;
  spectrum: Float32Array;
  signalLevelDb: number;
}

export interface GuitarPosition {
  stringIndex: number; // 0-5 (high E to low E)
  stringName: string;
  fret: number;
  midi: number;
}

export interface NoiseProfile {
  amps: Float32Array;
  measuredNoiseFloorDb: number;
  calibrated: boolean;
  timestamp: number;
}

// ============================================================================
// Detection Config
// ============================================================================

export interface DetectionConfig {
  fftSize: number;
  smoothingTimeConstant: number;
  minFreq: number;
  maxFreq: number;
  noiseGateDb: number;
  micGainMultiplier: number;
  seventhStrictness: number;
  triggerMode: 'guitartuna' | 'continuous';
  oversubtraction: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  fftSize: 4096,
  smoothingTimeConstant: 0.12,
  minFreq: 75,
  maxFreq: 1250,
  noiseGateDb: 14,
  micGainMultiplier: 4.0,
  seventhStrictness: 0.55,
  triggerMode: 'guitartuna',
  oversubtraction: 1.35,
};

// ============================================================================
// Audio Engine Types
// ============================================================================

export type AcousticModel = 'dreadnought' | 'nylon' | 'twelve';
export type StrumStyle = 'down' | 'up' | 'arpeggio' | 'roll';

export interface AudioEngineConfig {
  model: AcousticModel;
  masterVolume: number;
  strumStyle: StrumStyle;
  sampleRate: number;
}

export const DEFAULT_ENGINE_CONFIG: AudioEngineConfig = {
  model: 'dreadnought',
  masterVolume: 1.0,
  strumStyle: 'down',
  sampleRate: 44100,
};

export interface SynthVoice {
  frequency: number;
  startTime: number;
  stringIndex: number;
  velocity: number;
  isOctave?: boolean; // for 12-string
}

// ============================================================================
// Practice / Session Types
// ============================================================================

export interface PracticeSession {
  id: string;
  date: string; // ISO
  startTime: number;
  endTime?: number;
  durationSec: number;
  mode: 'detector' | 'drill' | 'songs' | 'transcriber' | 'tuner';
  
  // Chord detection stats
  chordsDetected: ChordStat[];
  
  // Drill mode
  drillResults?: DrillResult;
  
  // Song practice
  songPractice?: {
    songId: string;
    score: number;
    matches: number;
    attempts: number;
  };
  
  // Transcriber
  transcribedNotes?: number;
}

export interface ChordStat {
  chord: string; // short name e.g., "Am7"
  count: number;
  avgConfidence: number;
  modeChanges: number; // how many times it flickered
  lastSeen: number;
}

export interface DrillConfig {
  progressionType: 'random' | 'I-V-vi-IV' | 'ii-V-I' | 'blues' | 'custom';
  customProgression?: string[]; // chord symbols
  bpm: number;
  barsPerChord: number;
  countInBars: number;
  totalChords: number;
  key?: NoteName;
}

export interface DrillResult {
  config: DrillConfig;
  chordResults: Array<{
    targetChord: string;
    detectedChord: string | null;
    matched: boolean;
    latencyMs: number;
    confidence: number;
  }>;
  overallAccuracy: number;
  avgLatencyMs: number;
  weakTransitions: Array<{ from: string; to: string; accuracy: number }>;
}

// ============================================================================
// Song / Play-Along Types
// ============================================================================

export interface SongLine {
  section: string;
  text: string;
  chords: Array<{ chord: string; word: string }>;
  intervals?: string;
  sargam?: string;
  notes: SongNote[];
}

export interface SongNote {
  note: string; // e.g., "D4"
  degree?: string;
  sargam?: string;
  lyric: string;
  string: number; // 1-6
  fret: number;
  beats: number;
  freq: number;
}

export interface Song {
  id: string;
  title: string;
  movie?: string;
  singer?: string;
  music?: string;
  lyricsBy?: string;
  key: string;
  bpm: number;
  strum: string;
  strumPatternVisual: string;
  chordsUsed: string[];
  lines: SongLine[];
  westernHook?: string;
  lyrics?: string;
  isCustom?: boolean;
}

export interface PlayAlongState {
  songId: string;
  lineIndex: number;
  noteIndex: number;
  isPlaying: boolean;
  practiceMicActive: boolean;
  tempoMultiplier: number;
  score: number;
  targetChord: string | null;
}

// ============================================================================
// Transcriber Types
// ============================================================================

export interface TranscribedNote {
  note: string; // e.g., "D4"
  degree?: string;
  sargam?: string;
  midi: number;
  string: number; // 1-6
  fret: number;
  hz: number;
  timestamp: number; // relative to start
  duration?: number;
}

export interface TabTranscription {
  notes: TranscribedNote[];
  asciiTab: string;
  degreeLine?: string;
  sargamLine?: string;
  tuning: TuningPreset;
  createdAt: number;
}

// ============================================================================
// MIDI Types
// ============================================================================

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  type: 'input' | 'output';
}

export interface MidiConfig {
  outputDeviceId: string | 'virtual';
  channel: number; // 0-15
  sendChords: boolean;
  sendSingleNotes: boolean;
  noteVelocity: number;
  chordNoteDurationMs: number;
}

// ============================================================================
// Settings / Persistence
// ============================================================================

export interface UserSettings {
  // Audio
  micGain: number;
  noiseGateDb: number;
  seventhStrictness: number;
  triggerMode: 'guitartuna' | 'continuous';
  acousticModel: AcousticModel;
  monitorEnabled: boolean;
  monitorGain: number;
  
  // Tuning
  activeTuningPreset: string;
  
  // UI
  theme: 'dark' | 'light' | 'auto';
  leftHanded: boolean;
  showDegrees: boolean;
  showWestern: boolean;
  showSargam?: boolean;
  
  // Practice
  defaultDrillBpm: number;
  defaultDrillBarsPerChord: number;
  
  // MIDI
  midiConfig: MidiConfig;
}

export const DEFAULT_SETTINGS: UserSettings = {
  micGain: 4.0,
  noiseGateDb: 14,
  seventhStrictness: 0.55,
  triggerMode: 'guitartuna',
  acousticModel: 'dreadnought',
  monitorEnabled: false,
  monitorGain: 0.5,
  activeTuningPreset: 'standard',
  theme: 'dark',
  leftHanded: false,
  showDegrees: true,
  showWestern: true,
  showSargam: false,
  defaultDrillBpm: 80,
  defaultDrillBarsPerChord: 2,
  midiConfig: {
    outputDeviceId: 'virtual',
    channel: 0,
    sendChords: true,
    sendSingleNotes: true,
    noteVelocity: 90,
    chordNoteDurationMs: 300,
  },
};

export interface CapoState {
  enabled: boolean;
  fret: number; // 1-12
}

// Profiles
export * from './profiles';

// Recorder
export * from './recorder';

export const NOTE_NAMES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const DEGREE_NAMES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
export const INTERVAL_NAMES = ['Root', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Dim 5th', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th'];
export const SARGAM_NAMES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']; // Western numeric degree alias for compatibility

// ============================================================================
// Utility Functions
// ============================================================================

export function midiToPitch(midi: number): Pitch {
  const noteIndex = ((midi % 12) + 12) % 12;
  const note = NOTE_NAMES[noteIndex];
  const octave = Math.floor(midi / 12) - 1;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round((midi - Math.round(midi)) * 100);
  return { midi, freq, note, octave, cents };
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function transposeNote(note: NoteName, semitones: number): NoteName {
  const idx = NOTE_NAMES.indexOf(note);
  if (idx === -1) return note;
  const newIdx = (idx + semitones + 120) % 12;
  return NOTE_NAMES[newIdx];
}

export function chordSymbolToString(symbol: ChordSymbol): string {
  let str = symbol.root + symbol.quality;
  if (symbol.bass) str += `/${symbol.bass}`;
  return str;
}

export function parseChordSymbol(str: string): ChordSymbol | null {
  // Root + optional Quality suffix + optional /Bass
  const match = str.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!match) return null;
  // Map display suffix ('' = major, 'm' = minor) to internal ChordQuality keys.
  // Every other suffix already equals its internal key.
  const suffix = match[2];
  const quality: ChordQuality =
    suffix === '' ? 'Major' : suffix === 'm' ? 'Minor' : (suffix as ChordQuality);
  return {
    root: match[1] as NoteName,
    quality,
    bass: match[3] as NoteName | undefined,
  };
}