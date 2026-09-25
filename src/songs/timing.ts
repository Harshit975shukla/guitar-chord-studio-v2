import { NOTE_NAMES, type ChordQuality, type ChordSymbol, type StringTuning } from '../types';

export type SongEvent = { beats: number; line?: number } & (
  { type: 'chord'; chord: string } |
  { type: 'note'; string: number; fret: number } |
  { type: 'rest' }
);
export interface SongTiming {
  version: 1;
  bpm: number;
  tempos: Array<{ beat: number; bpm: number }>;
  events: SongEvent[];
}
export type TimingMode = 'fixed' | 'song' | 'wait';
export interface TimedEvent {
  event: SongEvent;
  index: number;
  beat: number;
  start: number;
  duration: number;
  bpm: number;
}

export const PITCH_CLASSES: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const QUALITIES: Record<string, ChordQuality> = {
  '': 'Major', maj: 'Major', M: 'Major', m: 'Minor', min: 'Minor',
  '7': '7', maj7: 'maj7', M7: 'maj7', m7: 'm7', min7: 'm7', sus2: 'sus2', sus4: 'sus4',
  '5': '5', dim: 'dim', aug: 'aug', '+': 'aug', '6': '6', m6: 'm6', '9': '9',
  m9: 'm9', maj9: 'maj9', '11': '11', m11: 'm11', '13': '13', add9: 'add9', add11: 'add11',
  '7sus4': '7sus4', '7#9': '7#9', '7b9': '7b9', '7#5': '7#5', '7b5': '7b5', m7b5: 'm7b5', dim7: 'dim7',
};
export function chordIdentity(text: string): ChordSymbol | null {
  const match = text.trim().replaceAll('♯', '#').replaceAll('♭', 'b').match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!match || !Object.hasOwn(QUALITIES, match[2])) return null;
  return { root: NOTE_NAMES[PITCH_CLASSES[match[1]]], quality: QUALITIES[match[2]],
    bass: match[3] ? NOTE_NAMES[PITCH_CLASSES[match[3]]] : undefined };
}
export function transposeSongChord(text: string, semitones: number): string {
  const match = text.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!match) return text;
  const name = (note: string) => NOTE_NAMES[(PITCH_CLASSES[note] + semitones % 12 + 12) % 12];
  return name(match[1]) + match[2] + (match[3] ? '/' + name(match[3]) : '');
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number from ${min} to ${max}.`);
  return value;
}
export function validateTiming(input: unknown): SongTiming {
  if (!isRecord(input) || input.version !== 1) throw new Error('Timing must use version: 1.');
  const bpm = finite(input.bpm, 20, 400, 'BPM');
  if (!Array.isArray(input.events) || !input.events.length || input.events.length > 2000) throw new Error('Timing needs 1–2000 events.');
  const events = input.events.map((raw, index): SongEvent => {
    if (!isRecord(raw)) throw new Error(`Event ${index + 1} must be an object.`);
    const beats = finite(raw.beats, 1 / 64, 128, `Event ${index + 1} beats`);
    const line = raw.line === undefined ? undefined : finite(raw.line, 0, 10000, 'Line index');
    if (line !== undefined && !Number.isInteger(line)) throw new Error('Line indices must be integers.');
    if (raw.type === 'rest') return { type: 'rest', beats, line };
    if (raw.type === 'chord') {
      if (typeof raw.chord !== 'string' || !chordIdentity(raw.chord)) throw new Error(`Unsupported chord in event ${index + 1}; use a supported root and quality.`);
      return { type: 'chord', chord: raw.chord.trim(), beats, line };
    }
    if (raw.type === 'note') {
      const string = finite(raw.string, 1, 6, 'String');
      const fret = finite(raw.fret, 0, 12, 'Fret');
      if (!Number.isInteger(string) || !Number.isInteger(fret)) throw new Error('String/fret must be whole numbers (frets 0–12).');
      return { type: 'note', string, fret, beats, line };
    }
    throw new Error(`Event ${index + 1} needs type chord, note or rest.`);
  });
  const totalBeats = events.reduce((sum, e) => sum + e.beats, 0);
  if (!Number.isFinite(totalBeats)) throw new Error('Timeline is too long.');
  if (input.tempos !== undefined && !Array.isArray(input.tempos)) throw new Error('tempos must be an array.');
  let lastBeat = -1;
  const tempos = (Array.isArray(input.tempos) ? input.tempos : []).map(raw => {
    if (!isRecord(raw)) throw new Error('Tempo changes need beat and bpm.');
    const beat = finite(raw.beat, 0, totalBeats, 'Tempo beat');
    if (beat <= lastBeat || beat >= totalBeats) throw new Error('Tempo beats must be increasing, unique, and before the timeline ends.');
    lastBeat = beat;
    return { beat, bpm: finite(raw.bpm, 20, 400, 'Tempo BPM') };
  });
  return { version: 1, bpm, tempos, events };
}

/** Integrate tempo changes, including a change inside a sustained event/rest. */
export function compileTiming(timing: SongTiming, mode: 'fixed' | 'song', fixedBpm = timing.bpm, speed = 1): TimedEvent[] {
  finite(fixedBpm, 20, 400, 'Fixed BPM');
  finite(speed, 0.25, 2, 'Speed');
  let beat = 0, seconds = 0, tempoIndex = 0, bpm = mode === 'fixed' ? fixedBpm : timing.bpm;
  const tempos = mode === 'song' ? timing.tempos : [];
  return timing.events.map((event, index) => {
    const startBeat = beat, start = seconds, end = beat + event.beats;
    while (tempoIndex < tempos.length && tempos[tempoIndex].beat <= beat) bpm = tempos[tempoIndex++].bpm;
    const startBpm = bpm;
    while (tempoIndex < tempos.length && tempos[tempoIndex].beat < end) {
      const change = tempos[tempoIndex++];
      seconds += (change.beat - beat) * 60 / bpm / (mode === 'song' ? speed : 1);
      beat = change.beat; bpm = change.bpm;
    }
    seconds += (end - beat) * 60 / bpm / (mode === 'song' ? speed : 1);
    beat = end;
    return { event, index, beat: startBeat, start, duration: seconds - start, bpm: startBpm * (mode === 'song' ? speed : 1) };
  });
}

export function resolveSongNote(event: Extract<SongEvent, { type: 'note' }>, tuning: StringTuning[], transpose: number) {
  const midi = tuning[event.string - 1].midi + event.fret + transpose;
  const preferred = event.fret + transpose;
  if (preferred >= 0 && preferred <= 12) return { s: event.string - 1, f: preferred, midi };
  const s = tuning.findIndex(string => midi - string.midi >= 0 && midi - string.midi <= 12);
  return s < 0 ? null : { s, f: midi - tuning[s].midi, midi };
}

export const ORIGINAL_TIMING: SongTiming = {
  version: 1, bpm: 80, tempos: [{ beat: 4, bpm: 120 }],
  events: [
    { type: 'chord', chord: 'C', beats: 2 },
    { type: 'chord', chord: 'C', beats: 0.5 },
    { type: 'rest', beats: 0.5 },
    { type: 'note', string: 1, fret: 0, beats: 1 },
    { type: 'note', string: 1, fret: 3, beats: 0.5 },
    { type: 'rest', beats: 0.5 },
    { type: 'chord', chord: 'G', beats: 2 },
  ],
};
