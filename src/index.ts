export type {
  // Musical Types
  NoteName,
  Accidental,
  Octave,
  Pitch,
  ChordQuality,
  ChordSymbol,
  ChordVoicing,
  ChordDefinition,
  StringTuning,
  TuningPreset,
  DetectionMode,
  DetectionTargetMode,
  DetectedPeak,
  DetectionResult,
  GuitarPosition,
  NoiseProfile,
  DetectionConfig,
  PracticeSession,
  ChordStat,
  DrillConfig,
  DrillResult,
  SongLine,
  SongNote,
  Song,
  PlayAlongState,
  TranscribedNote,
  TabTranscription,
  MidiDevice,
  MidiConfig,
  AudioEngineConfig,
  AcousticModel,
  StrumStyle,
  SynthVoice,
  UserSettings,
  CapoState,
  // New types
  UserProfile,
  ProfileStats,
  RecordedTake,
  AudioRecorderState,
  RecorderConfig,
} from './types';

export {
  NOTE_NAMES,
  SARGAM_NAMES,
  midiToPitch,
  freqToMidi,
  transposeNote,
  chordSymbolToString,
  parseChordSymbol,
  STANDARD_TUNING,
  DEFAULT_SETTINGS,
  DEFAULT_DETECTION_CONFIG,
  DEFAULT_ENGINE_CONFIG,
} from './types';

// Chords
export * from './chords/definitions';
export * from './chords/tunings';

// Audio
export * from './audio/engine';
export * from './audio/recorder';

// Detection
export * from './detection/engine';

// Storage
export * from './storage';
export * from './storage/profiles';

// MIDI
export * from './midi/output';

// UI Components
export * from './ui/components/ProfileModal';

// Tabs
export * from './tabs/songs';
export * from './tabs/rhythm';
export * from './tabs/recorder';