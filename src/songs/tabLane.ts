import type { SongEvent, SongTiming } from './timing';

/** A string/fret to play, with a short note label; s is 0 for string 1 (high e). */
export interface LanePosition { s: number; f: number; label: string }
export interface LaneItem {
  index: number;
  /** Start and length in beats, exactly as authored (speed and tempo changes only affect seconds). */
  beat: number;
  beats: number;
  kind: SongEvent['type'];
  /** Chord symbol, note name such as "G4", or "Rest". */
  label: string;
  positions: LanePosition[];
  /** False when a note or chord has no fingering in the current tuning, capo and position. */
  available: boolean;
  line?: number;
}
export interface LaneSection { start: number; end: number }
/** One event as the transport actually scheduled it on the audio clock. */
export interface ScheduledSpan { index: number; beat: number; beats: number; start: number; end: number }
export interface NextTarget { index: number; beatsAway: number; restBeats: number }

export type LaneResolver = (event: SongEvent, index: number) => { label: string; positions: LanePosition[]; available: boolean };

export function laneItems(timing: SongTiming, resolve: LaneResolver): LaneItem[] {
  let beat = 0;
  return timing.events.map((event, index) => {
    const item: LaneItem = { index, beat, beats: event.beats, kind: event.type, line: event.line, ...resolve(event, index) };
    beat += event.beats;
    return item;
  });
}

export function laneLength(items: readonly LaneItem[]): number {
  const last = items.at(-1);
  return last ? last.beat + last.beats : 0;
}

/**
 * Beat under the playhead at audio time `time`, taken from the spans the transport really
 * scheduled, so tempo changes, speed, loops and recovered stalls all stay in step with the sound.
 */
export function cursorBeat(spans: readonly ScheduledSpan[], time: number): { index: number; beat: number } | null {
  let current: ScheduledSpan | null = null;
  for (const span of spans) {
    if (span.start <= time + 1e-9) current = span;
    else break;
  }
  if (!current) return spans.length ? { index: spans[0].index, beat: spans[0].beat } : null;
  const length = current.end - current.start;
  const fraction = length > 0 ? Math.min(1, Math.max(0, (time - current.start) / length)) : 1;
  return { index: current.index, beat: current.beat + fraction * current.beats };
}

export function normalizeSection(section: LaneSection | null, count: number): LaneSection | null {
  if (!section || count < 1 || !Number.isInteger(section.start) || !Number.isInteger(section.end)) return null;
  const start = Math.max(0, Math.min(section.start, section.end)), end = Math.min(count - 1, Math.max(section.start, section.end));
  return start <= end ? { start, end } : null;
}

/** The event after `index`. Inside a loop section it wraps to the section start; elsewhere the chart loop wraps to 0. */
export function followingIndex(index: number, count: number, loop: boolean, section: LaneSection | null): number | null {
  if (section && index >= section.start && index <= section.end) return index >= section.end ? section.start : index + 1;
  if (index + 1 < count) return index + 1;
  return loop && count > 0 ? 0 : null;
}

/** The next note or chord to prepare for, skipping rests, and how many beats until it starts. */
export function nextTarget(items: readonly LaneItem[], index: number, cursor: number, loop: boolean, section: LaneSection | null): NextTarget | null {
  const current = items[index];
  if (!current) return null;
  let beatsAway = Math.max(0, current.beat + current.beats - cursor), restBeats = 0, at = index;
  for (let step = 0; step < items.length; step++) {
    const next = followingIndex(at, items.length, loop, section);
    if (next === null) return null;
    if (items[next].kind !== 'rest') return { index: next, beatsAway, restBeats };
    beatsAway += items[next].beats; restBeats += items[next].beats;
    at = next;
  }
  return null;
}

/** Horizontal scale that keeps the shortest note wide enough to read. */
export function pixelsPerBeat(items: readonly LaneItem[], base = 72): number {
  const shortest = Math.min(...items.filter(item => item.kind !== 'rest').map(item => item.beats));
  if (!Number.isFinite(shortest)) return base;
  return Math.min(160, Math.max(44, base, 34 / shortest));
}

/** The event sounding at a beat position (binary search; items are contiguous in beats). */
export function itemAtBeat(items: readonly LaneItem[], beat: number): number | null {
  if (!items.length || beat < 0 || beat >= laneLength(items)) return null;
  let low = 0, high = items.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (items[middle].beat <= beat) low = middle; else high = middle - 1;
  }
  return low;
}

/** Transport input for a section: only its events, looped, starting at the current event when inside it. */
export function sectionPlayback<T>(entries: readonly T[], section: LaneSection | null, current: number): { entries: T[]; start: number; loopAll: boolean } {
  if (!section) return { entries: [...entries], start: current, loopAll: false };
  const inside = current >= section.start && current <= section.end;
  return { entries: entries.slice(section.start, section.end + 1), start: inside ? current - section.start : 0, loopAll: true };
}

/** A sensible section around an event: its lyric line when authored, otherwise four events. */
export function defaultSection(items: readonly LaneItem[], index: number, edge: 'start' | 'end'): LaneSection {
  const item = items[index];
  const line = item?.line;
  if (line !== undefined) {
    let start = index, end = index;
    while (start > 0 && items[start - 1].line === line) start--;
    while (end + 1 < items.length && items[end + 1].line === line) end++;
    if (end > start) return edge === 'start' ? { start: index, end } : { start, end: index };
  }
  return edge === 'start' ? { start: index, end: Math.min(items.length - 1, index + 3) } : { start: Math.max(0, index - 3), end: index };
}

export function formatBeats(beats: number): string {
  const rounded = Math.round(beats * 4) / 4;
  const whole = Math.floor(rounded), part = rounded - whole;
  const fraction = part === .25 ? '¼' : part === .5 ? '½' : part === .75 ? '¾' : '';
  const text = whole ? `${whole}${fraction}` : fraction || '0';
  return `${text} ${rounded === 1 ? 'beat' : 'beats'}`;
}
