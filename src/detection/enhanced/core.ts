import { NOTE_NAMES } from '../../types';
import type { DetectionResult } from '../../types';
import { MODEL_RATE, MODEL_WINDOW, MAX_AGE, WINDOW_SECONDS, type Identity, type FastFrame, type TimedPrediction, type Comparison, type ModelNote } from './types';

const QUALITIES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]],
  ['m7', [0, 3, 7, 10]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['5', [0, 7]],
  ['dim', [0, 3, 6]], ['aug', [0, 4, 8]],
];
const pitchMask = (notes: readonly number[]) => notes.reduce((value, midi) => value | (1 << (((midi % 12) + 12) % 12)), 0);

export function chordFromNotes(midis: readonly number[]): string | null {
  if (midis.some(midi => !Number.isInteger(midi) || midi < 0 || midi > 127)) throw new Error('Invalid predicted pitch.');
  if (midis.length < 2 || midis.length > 6) return null;
  const mask = pitchMask(midis), matches: Array<{ root: number; label: string }> = [];
  for (let root = 0; root < 12; root++) for (const [suffix, tones] of QUALITIES) {
    if (pitchMask(tones.map(tone => root + tone)) === mask) matches.push({ root, label: NOTE_NAMES[root] + suffix });
  }
  return matches.length === 1 ? matches[0].label : matches.find(match => match.root === Math.min(...midis) % 12)?.label ?? null;
}
export interface NoteEvent { pitchMidi: number; startFrame: number; durationFrames: number }
export function decodeWindow(frames: number[][], events?: NoteEvent[]) {
  if (frames.length !== 172 || frames.some(frame => frame.length !== 88 || frame.some(v => !Number.isFinite(v) || v < 0 || v > 1))) {
    throw new Error('Unexpected note-model output.');
  }
  const start = 145, end = 157;
  const note = (midi: number): ModelNote => ({ midi, name: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}` });
  let notes: ModelNote[] = [];
  for (let midi = 36; midi <= 88; midi++) {
    if (frames.slice(start, end).filter(frame => frame[midi - 21] >= .35).length >= 8) notes.push(note(midi));
  }
  let chord = chordFromNotes(notes.map(n => n.midi));
  if (events && new Set(notes.map(n => n.midi % 12)).size >= 2 && (!chord || chord.endsWith('5'))) {
    const supported: ModelNote[] = [];
    for (let midi = 36; midi <= 88; midi++) {
      const occurrences = events.filter(event => event.pitchMidi === midi);
      let hits = 0;
      for (let frame = start; frame < end; frame++) {
        if (occurrences.some(event => event.startFrame <= frame && frame < event.startFrame + event.durationFrames)) hits++;
      }
      if (hits >= 8) supported.push(note(midi));
    }
    const alternative = chordFromNotes(supported.map(n => n.midi)), root = chord?.endsWith('5') ? chord.slice(0, -1) : null;
    if (alternative && !alternative.endsWith('5') && (!root || [root, `${root}m`].includes(alternative))) { chord = alternative; notes = supported; }
  }
  return { chord, notes, evidenceStartOffset: start * 256 / MODEL_RATE, evidenceEndOffset: end * 256 / MODEL_RATE,
    evidenceOffset: (start + end - 1) / 2 * 256 / MODEL_RATE };
}

export class AudioWindow {
  private samples: Float32Array<ArrayBuffer>;
  private position = 0;
  count = 0;
  end: number | null = null;
  constructor(readonly rate: number) {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new Error('Unsupported microphone sample rate.');
    this.samples = new Float32Array(Math.round(MODEL_WINDOW * rate / MODEL_RATE));
  }
  clear(): void { this.samples.fill(0); this.position = 0; this.count = 0; this.end = null; }
  get ready(): boolean { return this.count === this.samples.length; }
  push(pcm: Float32Array, end: number): boolean {
    if (!pcm.length || !pcm.every(Number.isFinite) || !Number.isFinite(end)) throw new Error('Invalid microphone block.');
    const gap = this.end !== null && Math.abs(end - pcm.length / this.rate - this.end) > .005;
    if (gap) this.clear();
    for (const value of pcm) { this.samples[this.position] = value; this.position = (this.position + 1) % this.samples.length; }
    this.count = Math.min(this.samples.length, this.count + pcm.length); this.end = end;
    return gap;
  }
  snapshot(): Float32Array<ArrayBuffer> {
    if (!this.ready) throw new Error('Audio context is not full yet.');
    const result = new Float32Array(this.samples.length);
    result.set(this.samples.subarray(this.position));
    result.set(this.samples.subarray(0, this.position), this.samples.length - this.position);
    return result;
  }
}

export function fastIdentity(result: DetectionResult): Identity | null {
  if (result.mode === 'chord' && result.chord) return { key: `chord:${result.chord.symbol}`, label: result.chord.symbol };
  if (result.mode === 'single-note' && result.note && Number.isFinite(result.note.pitch.midi)) {
    const midi = Math.round(result.note.pitch.midi);
    return { key: `note:${midi}`, label: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}` };
  }
  return null;
}
export function modelIdentity(result: TimedPrediction): Identity | null {
  if (result.chord) return { key: `chord:${result.chord}`, label: result.chord };
  return result.notes.length === 1 ? { key: `note:${result.notes[0].midi}`, label: result.notes[0].name } : null;
}

export class Agreement {
  fast: FastFrame | null = null;
  model: TimedPrediction | null = null;
  private verification: Array<{ at: number; identity: Identity | null }> = [];
  private segment: { id: number; start: number; identity: Identity | null; first: number | null; last: number | null } | null = null;
  private clippedUntil = -Infinity;
  reset(): void { this.fast = null; this.model = null; this.verification = []; this.segment = null; this.clippedUntil = -Infinity; }
  invalidateModel(): void { this.model = null; }
  observe(frame: FastFrame): void {
    if (this.fast && frame.at < this.fast.at) this.reset();
    this.fast = frame;
    if (frame.clipped) this.clippedUntil = frame.at + WINDOW_SECONDS;
    if (!frame.ready || !frame.signalPresent) { this.model = null; this.segment = null; this.verification = []; return; }
    if (frame.verified) {
      this.verification.push(frame.verified);
      while (this.verification.length > 160 || (this.verification.length && this.verification[0].at < frame.at - 3)) this.verification.shift();
    }
    const newAttack = !this.segment || this.segment.id !== frame.attackId;
    if (newAttack || (frame.fresh && frame.identity && this.segment?.identity && this.segment.identity.key !== frame.identity.key)) {
      this.segment = { id: frame.attackId, start: newAttack ? frame.attackAt : frame.at, identity: null, first: null, last: null };
    }
    if (frame.fresh && frame.identity && this.segment) {
      this.segment.identity = frame.identity; this.segment.first ??= frame.at; this.segment.last = frame.at;
    }
  }
  update(result: TimedPrediction): void {
    if (![result.evidenceAt, result.evidenceStart, result.evidenceEnd, result.receivedAt].every(Number.isFinite)
      || result.evidenceStart > result.evidenceAt || result.evidenceAt > result.evidenceEnd || result.evidenceEnd > result.receivedAt) {
      throw new Error('Invalid enhanced detection time.');
    }
    if (!this.model || result.evidenceEnd > this.model.evidenceEnd) this.model = result;
  }
  compare(now: number): Comparison {
    const answer = (state: Comparison['state'], label: string | null, message: string, supported = false): Comparison => ({ state, label, message, supported });
    const frame = this.fast;
    if (!frame?.ready) return answer('checking', null, 'Checking the room. Stay quiet before playing.');
    if (now < this.clippedUntil) return answer('warning', null, 'Input is clipping. Lower the microphone input level.');
    if (now - frame.at > .25) return answer('checking', null, 'Waiting for current microphone input.');
    if (!frame.signalPresent) return answer('quiet', null, 'Listening for your next strum or note.');
    const model = this.model && now - this.model.evidenceAt <= MAX_AGE ? this.model : null;
    const learned = model ? modelIdentity(model) : null;
    const fast = frame.identity;
    if (!fast) return answer('checking', null, 'Play clearly and let the sound ring.');
    if (!model || !learned) return answer('fast-only', fast.label, 'Fast estimate. Waiting for an enhanced second opinion.');
    const event = this.segment;
    const aligned = event?.identity?.key === fast.key && event.first !== null && event.last !== null
      && now - event.last <= MAX_AGE && model.evidenceStart >= event.start && model.evidenceEnd >= event.first;
    if (aligned) {
      return learned.key === fast.key
        ? answer('agree', fast.label, 'Both checks agree on this performance; this is not a guarantee.', true)
        : answer('different', `Could be ${fast.label} or ${learned.label}`, 'The checks disagree. Neither answer is treated as confirmed.');
    }
    const recent = this.verification.filter(check => check.at >= model.evidenceStart && check.at <= model.evidenceEnd);
    const latest = this.verification.at(-1);
    if (fast.key.startsWith('chord:') && fast.key === learned.key && latest?.identity?.key === fast.key
      && now - latest.at < .35 && recent.length >= 2 && recent.every(check => check.identity?.key === fast.key)) {
      return answer('recent', fast.label, 'Matching recent audio, not a new-strum confirmation.');
    }
    // Never offer the previous strum's answer as a candidate for a later chord.
    return answer('checking', fast.label, 'Fast estimate; the second opinion describes earlier audio. Checking…');
  }
}
