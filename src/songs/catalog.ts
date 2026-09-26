import { NOTE_NAMES, STANDARD_TUNING, type Song, type SongLine, type SongNote } from '../types';
import { chordIdentity, isRecord, MAX_SOURCE_FRET, ORIGINAL_TIMING, validateTiming, type SongEvent, type SongTiming } from './timing';

export interface CatalogSong extends Song {
  artist: string;
  album: string;
  leadNotes: SongNote[];
  warnings: string[];
  availability: { chords: boolean; tabs: boolean; imported: boolean; authored: boolean; labels: string[] };
}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
function normalizeNote(raw: unknown): SongNote | null {
  if (!isRecord(raw)) return null;
  const string = raw.string ?? raw.str;
  const fret = raw.fret;
  if (typeof string !== 'number' || !Number.isInteger(string) || string < 1 || string > 6 ||
      typeof fret !== 'number' || !Number.isInteger(fret) || fret < 0 || fret > MAX_SOURCE_FRET) return null;
  const midi = STANDARD_TUNING[string - 1].midi + fret;
  return {
    string, fret, note: text(raw.note, `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`),
    beats: typeof raw.beats === 'number' && Number.isFinite(raw.beats) && raw.beats > 0 ? raw.beats : 1,
    freq: typeof raw.freq === 'number' ? raw.freq : 440 * 2 ** ((midi - 69) / 12),
    lyric: text(raw.lyric), degree: text(raw.degree), sargam: text(raw.sargam),
  };
}
export function normalizeSong(raw: unknown, fallbackId = ''): CatalogSong | null {
  if (!isRecord(raw) || !text(raw.title).trim() || !text(raw.id, fallbackId).trim()) return null;
  const warnings = list(raw.importWarnings).filter((w): w is string => typeof w === 'string');
  let invalidNotes = 0;
  let highNotes = 0;
  const notes = (value: unknown) => list(value).flatMap(item => {
    const normalized = normalizeNote(item);
    if (!normalized) invalidNotes++;
    else if (normalized.fret > 12) highNotes++;
    return normalized ? [normalized] : [];
  });
  const lines: SongLine[] = list(raw.lines).filter(isRecord).map((line, i) => ({
    section: text(line.section, text(line.sec, `Section ${i + 1}`)), text: text(line.text),
    chords: list(line.chords).filter(isRecord).filter(c => typeof c.chord === 'string').map(c => ({ chord: text(c.chord), word: text(c.word) })),
    notes: notes(line.notes), intervals: text(line.intervals), sargam: text(line.sargam),
  }));
  const leadNotes = notes(raw.leadNotes);
  if (invalidNotes) warnings.push(`${invalidNotes} invalid source note positions could not be read (strings 1–6, source frets 0–${MAX_SOURCE_FRET}). Original imported text is retained when supplied.`);
  if (highNotes) warnings.push(`${highNotes} high source notes retained. The displayed neck is frets 0–12; any automatic whole-melody octave fit is shown with Playing position.`);
  let timing: SongTiming | undefined;
  if (raw.timing !== undefined) {
    try { timing = validateTiming(raw.timing); }
    catch (error) { warnings.push(`Timing unavailable: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const sequence = lines.flatMap(line => line.chords.map(c => c.chord));
  const unsupported = sequence.filter(chord => !chordIdentity(chord));
  if (unsupported.length) warnings.push(`Some chord symbols are display-only: ${[...new Set(unsupported)].join(', ')}.`);
  const chords = timing ? timing.events.some(e => e.type === 'chord') : sequence.some(c => !!chordIdentity(c));
  const tabs = timing ? timing.events.some(e => e.type === 'note') : leadNotes.length > 0 || lines.some(l => l.notes.length > 0);
  const inventory = [...new Set([...list(raw.chordsUsed).filter((c): c is string => typeof c === 'string'), ...sequence,
    ...(timing?.events.flatMap(e => e.type === 'chord' ? [e.chord] : []) || [])])];
  const imported = raw.isCustom === true;
  const labels = [
    ...(chords ? [imported ? 'Imported chord chart' : 'Simplified chord chart'] : inventory.length ? ['Chord inventory only'] : []),
    ...(tabs ? [imported ? 'Imported note events' : 'Melody excerpt · not full tabs'] : []),
    ...(text(raw.sourceText) && !chords && !tabs ? ['Source text only · not playable'] : []),
    timing ? 'Explicitly authored timing · not verified against a recording' : 'Approximate timing',
  ];
  return {
    ...raw, id: text(raw.id, fallbackId), title: text(raw.title),
    artist: text(raw.artist, text(raw.singer, text(raw.movie, 'Artist not supplied'))),
    album: text(raw.album, text(raw.movie)), key: text(raw.key, 'C'),
    bpm: typeof raw.bpm === 'number' && raw.bpm >= 20 && raw.bpm <= 400 ? raw.bpm : 80,
    strum: text(raw.strum), strumPatternVisual: text(raw.strumPatternVisual), chordsUsed: inventory, lines, leadNotes,
    lyrics: text(raw.lyrics), sourceText: text(raw.sourceText, text(raw.lyrics)), source: text(raw.source),
    versionLabel: text(raw.versionLabel), timing, warnings, isCustom: imported,
    availability: { chords, tabs, imported, authored: !!timing, labels },
  };
}

export const ORIGINAL_EXERCISE: Song = {
  id: 'original-timing-study', title: 'Two steps and a pause', artist: 'Guitar Studio original exercise',
  source: 'Original demonstration composed for this app', versionLabel: 'Timing study 1',
  bpm: 80, key: 'C Major', strum: 'Down', strumPatternVisual: '', chordsUsed: ['C', 'G'], lines: [],
  timing: ORIGINAL_TIMING,
};

/** Public script takes precedence for a built-in ID; custom items have their own namespace. */
export function buildSongCatalog(bundled: readonly Song[], external: unknown, custom: readonly Song[]): CatalogSong[] {
  const builtins = new Map<string, CatalogSong>();
  for (const raw of [...bundled, ORIGINAL_EXERCISE]) {
    const song = normalizeSong(raw);
    if (song) builtins.set(song.id, song);
  }
  if (isRecord(external)) for (const [key, raw] of Object.entries(external)) {
    const song = normalizeSong(raw, key);
    if (song) builtins.set(song.id, song);
  }
  const result = [...builtins.values()];
  const occupied = new Set(builtins.keys());
  const seen = new Set<string>();
  for (const raw of custom) {
    const song = normalizeSong(raw);
    if (!song || seen.has(song.id)) continue;
    seen.add(song.id);
    // Avoid silently hiding a built-in or resolving a click to a different item.
    while (occupied.has(song.id)) song.id = `imported:${song.id}`;
    occupied.add(song.id);
    result.push(song);
  }
  return result;
}
export function findSong(catalog: readonly CatalogSong[], id: string): CatalogSong {
  const song = catalog.find(item => item.id === id);
  if (!song) throw new Error('This song is not in the local library. Choose another song in Play Along or import your chart.');
  return song;
}

export function songTimeline(song: CatalogSong, part: 'notes' | 'chords'): SongTiming {
  if (song.timing) return song.timing;
  const events: SongEvent[] = [];
  if (part === 'notes') {
    const hasLineNotes = song.lines.some(line => line.notes.length > 0);
    if (hasLineNotes) song.lines.forEach((line, i) => {
      for (const note of line.notes) events.push({ type: 'note', string: note.string, fret: note.fret, beats: note.beats, line: i });
    });
    else for (const note of song.leadNotes) events.push({ type: 'note', string: note.string, fret: note.fret, beats: note.beats });
  } else {
    if (song.lines.some(line => line.chords.some(c => !chordIdentity(c.chord)))) return { version: 1, bpm: song.bpm, tempos: [], events: [] };
    song.lines.forEach((line, i) => {
      for (const chord of line.chords) {
        events.push({ type: 'chord', chord: chord.chord, beats: 2, line: i });
      }
    });
  }
  return { version: 1, bpm: song.bpm, tempos: [], events };
}

const SECTION = /^\s*[\[(]?(intro|verse|chorus|bridge|outro|pre[- ]?chorus|hook|solo|interlude|refrain)(?:\s+\d+)?[\])]?\s*:?\s*$/i;
export function parseChordSheet(source: string): { lines: SongLine[]; chordsUsed: string[]; warnings: string[]; metadata: Record<string, string> } {
  const lines: SongLine[] = [], warnings: string[] = [], metadata: Record<string, string> = {};
  let section = 'Chart';
  let pending: Array<{ chord: string; column: number }> = [];
  const flush = (text = '') => {
    if (!pending.length && !text) return;
    lines.push({ section, text, chords: pending.map(({ chord, column }) => ({ chord, word: text.slice(column).trim().split(/\s+/)[0] || '' })), notes: [] });
    pending = [];
  };
  for (const line of source.split(/\r?\n/)) {
    const directive = line.match(/^\{(title|t|artist|subtitle|key|source|version):\s*(.*?)\}$/i);
    if (directive) { metadata[directive[1].toLowerCase()] = directive[2]; continue; }
    if (SECTION.test(line)) { flush(); section = line.trim(); continue; }
    if (/^\s*[eEBGDA]?\s*\|[-\d|hpb~x/\\ ]{3,}/.test(line)) {
      flush(line);
      if (!warnings.length) warnings.push('ASCII tablature/techniques are preserved as source text, not converted to playable or timed notes. Use the timing editor for explicit note events.');
      continue;
    }
    const tokens = [...line.matchAll(/\S+/g)];
    const chordTokens = tokens.filter(t => !/^[|:]+$/.test(t[0]));
    if (chordTokens.length && chordTokens.every(t => !!chordIdentity(t[0]))) {
      flush();
      pending = chordTokens.map(t => ({ chord: t[0], column: t.index }));
      continue;
    }
    const bracketed = [...line.matchAll(/\[([^\]]+)\]/g)];
    if (bracketed.some(m => chordIdentity(m[1]))) {
      flush();
      const chords = bracketed.filter(m => !!chordIdentity(m[1])).map(m => ({
        chord: m[1], word: line.slice(m.index + m[0].length).replace(/\[[^\]]+\]/g, '').trim().split(/\s+/)[0] || '',
      }));
      lines.push({ section, text: line.replace(/\[([^\]]+)\]/g, (full, chord: string) => chordIdentity(chord) ? '' : full), chords, notes: [] });
    } else flush(line);
  }
  flush();
  return { lines, chordsUsed: [...new Set(lines.flatMap(line => line.chords.map(c => c.chord)))], warnings, metadata };
}

export function importSong(source: string, metadata: { title: string; artist: string; key: string; bpm: number; strum: string; source?: string; versionLabel?: string }, id: string): Song {
  if (!source.trim()) throw new Error('Paste a chord chart, source tab text, or timing JSON first.');
  if (!Number.isFinite(metadata.bpm) || metadata.bpm < 20 || metadata.bpm > 400) throw new Error('BPM must be 20–400.');
  if (source.trimStart().startsWith('{') && !/^\s*\{[a-z][\w-]*:/i.test(source)) {
    let raw: unknown;
    try { raw = JSON.parse(source); } catch { throw new Error('Invalid timing/song JSON. Nothing was saved.'); }
    if (!isRecord(raw)) throw new Error('Import JSON must be a timing or song object.');
    const timing = validateTiming(raw.timing ?? raw);
    const song = normalizeSong({ ...raw, ...metadata, title: metadata.title || text(raw.title),
      artist: metadata.artist || text(raw.artist, text(raw.singer)),
      source: metadata.source || text(raw.source), versionLabel: metadata.versionLabel || text(raw.versionLabel),
      key: text(raw.key, metadata.key), bpm: timing.bpm,
      id, timing, isCustom: true, sourceText: text(raw.sourceText, source) });
    if (!song) throw new Error('Supply a title for this import.');
    return song;
  }
  const chart = parseChordSheet(source);
  const title = metadata.title || chart.metadata.title || chart.metadata.t;
  if (!title) throw new Error('Enter a title or include {title: ...}.');
  return {
    ...metadata, title, artist: metadata.artist || chart.metadata.artist || chart.metadata.subtitle,
    source: metadata.source || chart.metadata.source, versionLabel: metadata.versionLabel || chart.metadata.version,
    id, key: chart.metadata.key || metadata.key, isCustom: true, strumPatternVisual: '',
    lines: chart.lines, chordsUsed: chart.chordsUsed, sourceText: source, lyrics: source, importWarnings: chart.warnings,
  };
}
