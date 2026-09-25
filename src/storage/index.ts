/**
 * LocalStorage Persistence Layer
 * Handles user settings, practice sessions, custom songs, and transcribed tabs
 */

import { 
  UserSettings, 
  DEFAULT_SETTINGS, 
  PracticeSession, 
  Song, 
  TabTranscription,
  MidiConfig 
} from '../types';
import { normalizeSong } from '../songs/catalog';
import { isRecord } from '../songs/timing';

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  SETTINGS: 'guitar_studio_settings',
  PRACTICE_SESSIONS: 'guitar_studio_practice_sessions',
  CUSTOM_SONGS: 'guitar_studio_custom_songs',
  TRANSCRIPTIONS: 'guitar_studio_transcriptions',
  MIDI_CONFIG: 'guitar_studio_midi_config',
  CURRENT_SESSION: 'guitar_studio_current_session',
} as const;

// ============================================================================
// Generic Storage Helpers
// ============================================================================

function getJSON<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch (e) {
    console.warn(`Failed to parse ${key}:`, e);
  }
  return defaultValue;
}

function setJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to store ${key}:`, e);
  }
}

// ============================================================================
// User Settings
// ============================================================================

export function loadSettings(): UserSettings {
  const loaded = getJSON<UserSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...loaded };
}

export function saveSettings(settings: UserSettings): void {
  setJSON(STORAGE_KEYS.SETTINGS, settings);
}

export function updateSetting<K extends keyof UserSettings>(
  key: K, 
  value: UserSettings[K]
): UserSettings {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

// ============================================================================
// Practice Sessions
// ============================================================================

export function loadPracticeSessions(): PracticeSession[] {
  return getJSON<PracticeSession[]>(STORAGE_KEYS.PRACTICE_SESSIONS, []);
}

export function savePracticeSession(session: PracticeSession): void {
  const sessions = loadPracticeSessions();
  sessions.unshift(session); // Most recent first
  // Keep only last 100 sessions
  if (sessions.length > 100) sessions.splice(100);
  setJSON(STORAGE_KEYS.PRACTICE_SESSIONS, sessions);
}

export function getPracticeStats(): {
  totalSessions: number;
  totalMinutes: number;
  thisWeekMinutes: number;
  bestStreak: number;
  mostPlayedChords: Array<{ chord: string; count: number }>;
} {
  const sessions = loadPracticeSessions();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  let totalMinutes = 0;
  let thisWeekMinutes = 0;
  const chordCounts = new Map<string, number>();
  let bestStreak = 0;
  
  sessions.forEach(s => {
    totalMinutes += s.durationSec / 60;
    if (s.startTime > weekAgo) thisWeekMinutes += s.durationSec / 60;
    
    s.chordsDetected.forEach(c => {
      chordCounts.set(c.chord, (chordCounts.get(c.chord) || 0) + c.count);
    });
    
    if (s.drillResults && s.drillResults.chordResults.length > 0) {
      // Could track streak here
    }
  });
  
  const mostPlayedChords = Array.from(chordCounts.entries())
    .map(([chord, count]) => ({ chord, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    totalSessions: sessions.length,
    totalMinutes: Math.round(totalMinutes),
    thisWeekMinutes: Math.round(thisWeekMinutes),
    bestStreak,
    mostPlayedChords,
  };
}

export function getWeakChords(limit: number = 5): Array<{ chord: string; avgConfidence: number; flickerRate: number }> {
  const sessions = loadPracticeSessions();
  const chordStats = new Map<string, { totalConfidence: number; count: number; totalFlicker: number }>();
  
  sessions.forEach(s => {
    s.chordsDetected.forEach(c => {
      const existing = chordStats.get(c.chord) || { totalConfidence: 0, count: 0, totalFlicker: 0 };
      existing.totalConfidence += c.avgConfidence;
      existing.count += c.count;
      existing.totalFlicker += c.modeChanges;
      chordStats.set(c.chord, existing);
    });
  });
  
  return Array.from(chordStats.entries())
    .filter(([, v]) => v.count >= 3) // At least 3 detections
    .map(([chord, v]) => ({
      chord,
      avgConfidence: v.totalConfidence / v.count,
      flickerRate: v.totalFlicker / v.count,
    }))
    .sort((a, b) => a.avgConfidence - b.avgConfidence || b.flickerRate - a.flickerRate)
    .slice(0, limit);
}

// ============================================================================
// Custom Songs
// ============================================================================

export function loadCustomSongs(): Song[] {
  return mergeCustomSongs(readCustomArray(STORAGE_KEYS.CUSTOM_SONGS), readCustomArray('guitar_custom_songs'));
}

function readCustomArray(key: string): unknown[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`Saved songs in ${key} could not be read. Export/repair that storage entry before saving; it has not been overwritten.`); }
  if (!Array.isArray(value)) throw new Error(`Saved songs in ${key} must be an array; existing data was not changed.`);
  return value;
}

export function mergeCustomSongs(primary: readonly unknown[], legacy: readonly unknown[]): Song[] {
  const result = new Map<string, Song>();
  const add = (raw: unknown, origin: string) => {
    const song = normalizeSong(isRecord(raw) ? { ...raw, isCustom: true } : raw);
    if (!song) { console.warn('Unrecognized custom song retained in storage:', origin); return; }
    if (result.has(song.id)) {
      if (JSON.stringify(result.get(song.id)) === JSON.stringify(song)) return;
      let hash = 2166136261;
      for (const c of JSON.stringify(raw)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
      song.id = `${song.id}~${origin}-${(hash >>> 0).toString(16)}`;
    }
    if (!result.has(song.id)) result.set(song.id, song);
  };
  primary.forEach(raw => add(raw, 'saved'));
  legacy.forEach(raw => add(raw, 'legacy'));
  return [...result.values()];
}

export function saveCustomSong(song: Song): void {
  const songs = readCustomArray(STORAGE_KEYS.CUSTOM_SONGS);
  // Validate both stores before writing; legacy data remains untouched.
  readCustomArray('guitar_custom_songs');
  const filtered = songs.filter(s => !isRecord(s) || s.id !== song.id);
  filtered.unshift(song);
  localStorage.setItem(STORAGE_KEYS.CUSTOM_SONGS, JSON.stringify(filtered));
}

export function deleteCustomSong(id: string): void {
  const songs = loadCustomSongs().filter(s => s.id !== id);
  setJSON(STORAGE_KEYS.CUSTOM_SONGS, songs);
}

export function getCustomSong(id: string): Song | undefined {
  return loadCustomSongs().find(s => s.id === id);
}

// ============================================================================
// Transcriptions
// ============================================================================

export function loadTranscriptions(): TabTranscription[] {
  return getJSON<TabTranscription[]>(STORAGE_KEYS.TRANSCRIPTIONS, []);
}

export function saveTranscription(transcription: TabTranscription): void {
  const transcriptions = loadTranscriptions();
  transcriptions.unshift(transcription);
  if (transcriptions.length > 30) transcriptions.splice(30);
  setJSON(STORAGE_KEYS.TRANSCRIPTIONS, transcriptions);
}

export function deleteTranscription(createdAt: number): void {
  const transcriptions = loadTranscriptions().filter(t => t.createdAt !== createdAt);
  setJSON(STORAGE_KEYS.TRANSCRIPTIONS, transcriptions);
}

// ============================================================================
// MIDI Config
// ============================================================================

export function loadMidiConfig(): MidiConfig {
  return getJSON<MidiConfig>(STORAGE_KEYS.MIDI_CONFIG, DEFAULT_SETTINGS.midiConfig);
}

export function saveMidiConfig(config: MidiConfig): void {
  setJSON(STORAGE_KEYS.MIDI_CONFIG, config);
}

// ============================================================================
// Current Session (for recovery)
// ============================================================================

export interface CurrentSessionState {
  activeTab: string;
  tuningPreset: string;
  fretboardState: (number | null)[];
  lastChord: string | null;
  songId: string | null;
  drillConfig?: any;
  timestamp: number;
}

export function saveCurrentSession(state: CurrentSessionState): void {
  setJSON(STORAGE_KEYS.CURRENT_SESSION, state);
}

export function loadCurrentSession(): CurrentSessionState | null {
  return getJSON<CurrentSessionState | null>(STORAGE_KEYS.CURRENT_SESSION, null);
}

export function clearCurrentSession(): void {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
}

// ============================================================================
// Export/Import All Data
// ============================================================================

export function exportAllData(): string {
  return JSON.stringify({
    settings: loadSettings(),
    practiceSessions: loadPracticeSessions(),
    customSongs: loadCustomSongs(),
    transcriptions: loadTranscriptions(),
    midiConfig: loadMidiConfig(),
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
  }, null, 2);
}

export function importAllData(json: string): { success: boolean; error?: string } {
  try {
    const data = JSON.parse(json);
    
    if (data.settings) saveSettings(data.settings);
    if (data.practiceSessions) setJSON(STORAGE_KEYS.PRACTICE_SESSIONS, data.practiceSessions);
    if (data.customSongs) setJSON(STORAGE_KEYS.CUSTOM_SONGS, data.customSongs);
    if (data.transcriptions) setJSON(STORAGE_KEYS.TRANSCRIPTIONS, data.transcriptions);
    if (data.midiConfig) saveMidiConfig(data.midiConfig);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ============================================================================
// Clear All Data (for testing)
// ============================================================================

export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}