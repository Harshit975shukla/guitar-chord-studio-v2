import { playAcousticString, type AcousticBus } from '../audio/engine';
import { displayNote } from '../scales/theory';
import { SongTransport } from '../songs/transport';
import type { TimedEvent } from '../songs/timing';
import { STANDARD_TUNING, type NoteName } from '../types';
import { CIRCLE_KEYS, circleChordMidis, circleKey, circleSignature, circleTheory, type CircleChord, type CircleMode } from '../theory/circleOfFifths';

interface ReferenceStep { label: string; midis: number[]; duration: number; chordLabel?: string }
interface ReferenceAudio { context: AudioContext; bus: AcousticBus }
function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

/** Local theory state and owned audio: exploration never changes another pane. */
export class CircleOfFifths {
  private index = 0;
  private mode: CircleMode = 'major';
  private flatCrossover = false;
  private current = circleTheory(0, 'major');
  private active = false;
  private pending = false;
  private playing = false;
  private generation = 0;
  private audio: ReferenceAudio | null = null;
  private steps: ReferenceStep[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private transport: SongTransport;
  private abort = new AbortController();

  constructor(
    private getAudio: () => Promise<ReferenceAudio>,
    private openScale: (root: NoteName, mode: CircleMode) => void,
  ) {
    this.transport = new SongTransport({
      now: () => this.audio?.context.currentTime ?? 0,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: id => window.clearTimeout(id),
    }, {
      play: (entry, at, end) => this.playStep(this.steps[entry.index], at, end),
      target: entry => {
        const step = this.steps[entry.index];
        this.status(`Playing ${step.label} · concert-pitch reference`);
        element('fifths-chords').querySelectorAll<HTMLElement>('[data-chord]').forEach(row => {
          if (row.dataset.chord === step.chordLabel) row.setAttribute('aria-current', 'true');
          else row.removeAttribute('aria-current');
        });
      },
      finish: () => { this.playing = false; this.syncAudioControls(); this.clearPlayingChord(); this.status('Reference finished. Choose a chord, interval or progression to hear next.'); },
      stalled: () => this.status('Audio timing was interrupted; resuming without rushing through the reference.'),
    });
    const events = { signal: this.abort.signal };
    const wheel = element('fifths-wheel');
    CIRCLE_KEYS.forEach((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fifths-key';
      button.id = `fifths-key-${index}`;
      button.dataset.index = String(index);
      const angle = index * Math.PI / 6 - Math.PI / 2;
      button.style.left = `${50 + Math.cos(angle) * 44}%`;
      button.style.top = `${50 + Math.sin(angle) * 44}%`;
      button.append(document.createElement('strong'), document.createElement('span'));
      button.addEventListener('click', () => this.select(index), events);
      button.addEventListener('keydown', event => {
        let next: number;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % 12;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + 11) % 12;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 11;
        else return;
        event.preventDefault();
        this.select(next);
        element(`fifths-key-${next}`).focus();
      }, events);
      wheel.append(button);
    });
    element('fifths-major').addEventListener('click', () => this.select(this.index, 'major'), events);
    element('fifths-minor').addEventListener('click', () => this.select(this.index, 'minor'), events);
    element<HTMLSelectElement>('fifths-spelling').addEventListener('change', event => {
      this.flatCrossover = (event.target as HTMLSelectElement).value === 'flat';
      this.select(this.index);
    }, events);
    element('fifths-hear-scale').addEventListener('click', () => {
      void this.play(this.current.scaleMidis.map((midi, index) => ({ midis: [midi], label: this.current.scaleLabels[index], duration: 0.4 })));
    }, events);
    element('fifths-hear-interval').addEventListener('click', () => {
      const root = this.current.scaleMidis[0];
      void this.play([
        { midis: [root], label: `${displayNote(this.current.root)} tonic`, duration: 0.65 },
        { midis: [root + 7], label: `${this.current.notes[4]} · perfect fifth above`, duration: 0.9 },
      ]);
    }, events);
    element('fifths-stop').addEventListener('click', () => this.stop('Reference audio stopped.'), events);
    element('fifths-open-scales').addEventListener('click', () => {
      this.stop('');
      this.openScale(this.current.root, this.mode);
    }, events);
    window.addEventListener('pagehide', () => this.stop('Reference audio stopped.'), events);
    this.render();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.stop('');
  }

  private select(index: number, mode = this.mode): void {
    this.stop('');
    this.current = circleTheory(index, mode, this.flatCrossover);
    this.index = index; this.mode = mode;
    this.render();
    this.status(`Selected ${this.current.label}. Explore the relationships or play a reference.`);
  }

  private render(): void {
    const theory = this.current;
    CIRCLE_KEYS.forEach((_, index) => {
      const key = circleKey(index, this.flatCrossover);
      const button = element<HTMLButtonElement>(`fifths-key-${index}`);
      button.querySelector('strong')!.textContent = displayNote(key.major);
      button.querySelector('span')!.textContent = `${displayNote(key.minor)}m`;
      button.setAttribute('aria-label', `${displayNote(key.major)} major / ${displayNote(key.minor)} minor. ${circleSignature(key).label}. Explore ${displayNote(this.mode === 'major' ? key.major : key.minor)} ${this.mode}.`);
      button.setAttribute('aria-pressed', String(index === this.index));
      button.tabIndex = index === this.index ? 0 : -1;
      button.classList.toggle('fifths-neighbor', index === (this.index + 1) % 12 || index === (this.index + 11) % 12);
    });
    element('fifths-major').setAttribute('aria-pressed', String(this.mode === 'major'));
    element('fifths-minor').setAttribute('aria-pressed', String(this.mode === 'minor'));
    element('fifths-center-root').textContent = displayNote(theory.root);
    element('fifths-center-mode').textContent = this.mode === 'major' ? 'major' : 'natural minor';
    element('fifths-center-signature').textContent = theory.signature.label;
    element('fifths-key-title').textContent = theory.label;
    element('fifths-signature').textContent = `${theory.signature.label}${theory.signature.notes.length ? ': ' + theory.signature.notes.join(' · ') : ''}`;
    element('fifths-scale-notes').textContent = [...theory.notes, theory.notes[0]].join(' · ');
    element('fifths-relative').textContent = `${theory.relative} — same key signature, different tonic`;
    element('fifths-parallel').textContent = `${theory.parallel} — same tonic, different scale: ${theory.parallelNotes.join(' · ')}`;
    element('fifths-clockwise').textContent = `${displayNote(this.mode === 'major' ? theory.clockwise.major : theory.clockwise.minor)} ${this.mode} · tonic +7 semitones`;
    element('fifths-counterclockwise').textContent = `${displayNote(this.mode === 'major' ? theory.counterclockwise.major : theory.counterclockwise.minor)} ${this.mode} · tonic −7 / +5 semitones`;
    element('fifths-open-scales').textContent = `Open ${displayNote(theory.root)} ${this.mode} in Scales`;
    element('fifths-chord-description').textContent = this.mode === 'major'
      ? 'Diatonic triads: stack every other note of the major scale.'
      : 'These triads use natural minor. A major V needs the raised seventh shown in the cadence example below.';
    const body = element('fifths-chords');
    body.replaceChildren();
    for (const chord of theory.chords) {
      const row = document.createElement('tr');
      row.dataset.chord = chord.label;
      for (const value of [chord.roman, chord.label, chord.notes.join(' · ')]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      const cell = document.createElement('td'), button = document.createElement('button');
      button.className = 'btn btn-secondary'; button.type = 'button'; button.dataset.fifthsAudio = '';
      button.textContent = 'Hear'; button.setAttribute('aria-label', `Hear ${chord.label}, degree ${chord.roman}`);
      button.onclick = () => { void this.play([this.chordStep(chord)]); };
      cell.append(button); row.append(cell); body.append(row);
    }
    const examples = element('fifths-progressions');
    examples.replaceChildren();
    for (const progression of theory.progressions) {
      const section = document.createElement('div'); section.className = 'fifths-progression';
      const title = document.createElement('h4'); title.textContent = progression.title;
      const sequence = document.createElement('p'); sequence.textContent = progression.chords.map(chord => chord.label).join(' → ');
      const explanation = document.createElement('p'); explanation.textContent = progression.explanation; explanation.className = 'fifths-muted';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary';
      button.dataset.fifthsAudio = ''; button.dataset.progression = progression.id; button.textContent = 'Hear progression';
      button.onclick = () => { void this.play(progression.chords.map(chord => this.chordStep(chord))); };
      section.append(title, sequence, explanation, button); examples.append(section);
    }
    this.syncAudioControls();
  }

  private chordStep(chord: CircleChord): ReferenceStep {
    return { label: `${chord.roman} · ${chord.label}`, midis: circleChordMidis(chord), duration: 1.2, chordLabel: chord.label };
  }

  private status(message: string): void {
    if (message) element('fifths-audio-status').textContent = message;
  }

  private syncAudioControls(): void {
    element<HTMLButtonElement>('fifths-stop').disabled = !this.playing && !this.pending;
    document.querySelectorAll<HTMLButtonElement>('[data-fifths-audio]').forEach(button => { button.disabled = this.pending; });
  }

  private clearPlayingChord(): void {
    element('fifths-chords').querySelectorAll('[aria-current]').forEach(row => row.removeAttribute('aria-current'));
  }

  private async play(steps: ReferenceStep[]): Promise<void> {
    if (!this.active) return;
    this.stop('');
    const generation = this.generation;
    this.pending = true; this.syncAudioControls();
    try {
      const audio = await this.getAudio();
      if (generation !== this.generation || !this.active) return;
      this.audio = audio; this.steps = steps;
      let start = 0;
      const entries: TimedEvent[] = steps.map((step, index) => {
        const entry: TimedEvent = { event: { type: 'rest', beats: step.duration * 2 }, index, beat: start * 2, start, duration: step.duration, bpm: 120 };
        start += step.duration; return entry;
      });
      this.playing = true;
      this.transport.start(entries, 0, false);
    } catch (error) {
      if (generation === this.generation) {
        this.stop('');
        this.status(`Reference audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (generation === this.generation) { this.pending = false; this.syncAudioControls(); }
    }
  }

  private playStep(step: ReferenceStep, at: number, end: number): () => void {
    if (!this.audio) throw new Error('Audio is not ready.');
    const { context, bus } = this.audio;
    const sources = step.midis.map((midi, index) => {
      const stringIndex = STANDARD_TUNING.findIndex(string => midi >= string.midi && midi - string.midi <= 12);
      if (stringIndex < 0) throw new Error('Reference pitch is outside the supported guitar range.');
      const source = playAcousticString(context, bus, {
        freq: 440 * 2 ** ((midi - 69) / 12), stringIndex, startTime: at + index * 0.025,
        endTime: end, velocity: step.midis.length > 1 ? 0.65 : 0.8,
      });
      this.sources.add(source);
      source.addEventListener('ended', () => this.sources.delete(source), { once: true });
      return source;
    });
    return () => sources.forEach(source => { if (this.sources.delete(source)) source.stop(); });
  }

  stop(message = ''): void {
    this.generation++; this.pending = false; this.playing = false;
    this.transport.stop();
    this.sources.forEach(source => source.stop()); this.sources.clear();
    this.clearPlayingChord(); this.syncAudioControls(); this.status(message);
  }

  dispose(): void { this.stop(); this.abort.abort(); }
}
