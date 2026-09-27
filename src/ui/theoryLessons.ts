import { playAcousticString, type AcousticBus } from '../audio/engine';
import { REGISTER_LABELS, isFretboardRegister, type FretboardRegister } from '../chords/positions';
import { displayNote, SCALE_ROOTS, scaleRootPc } from '../scales/theory';
import { WESTERN_SCALES } from '../scales/definitions';
import { SongTransport } from '../songs/transport';
import type { TimedEvent } from '../songs/timing';
import { CHORD_LESSONS, SCALE_LESSONS, lessonChordSymbol, lessonPositions, lessonVoicings, theoryLesson, type LessonPosition } from '../theory/lessons';
import { NOTE_NAMES, STANDARD_TUNING, type ChordQuality, type NoteName, type StringTuning } from '../types';
import { PaneNeck3D } from './paneNeck3d';

interface ReferenceAudio { context: AudioContext; bus: AcousticBus }
interface ReferenceStep { notes: Array<{ midi: number; stringIndex: number }>; tone: number | null; label: string }
interface LessonActions {
  audio(): Promise<ReferenceAudio>;
  scale(root: NoteName, key: string): void;
  chord(root: NoteName, quality: ChordQuality, frets: (number | null)[]): void;
  circle(): void;
}

/** Lesson choices are local; only explicit practice buttons transfer them. */
export class TheoryLessons {
  private kind: 'scale' | 'chord' = 'scale';
  private root: NoteName = 'C';
  private scaleKey = 'major';
  private quality: ChordQuality = 'Major';
  private register: FretboardRegister = 'open';
  private degreeLabels = false;
  private lesson = theoryLesson('scale', 'C', 'major');
  private tuning: StringTuning[];
  private capo = 0;
  private voicings: ReturnType<typeof lessonVoicings> = [];
  private frets: (number | null)[] | null = null;
  private positions: LessonPosition[] = [];
  private selectedTone: number | null = null;
  private playingPosition: LessonPosition | null = null;
  private active = false;
  private pending = false;
  private generation = 0;
  private audio: ReferenceAudio | null = null;
  private steps: ReferenceStep[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private abort = new AbortController();
  private neck: PaneNeck3D;
  private transport: SongTransport;

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.host.querySelector<T>(`#lesson-${id}`)!;
  }

  constructor(private host: HTMLElement, tuning: StringTuning[], private actions: LessonActions) {
    this.tuning = tuning;
    host.innerHTML = `
      <header class="lesson-header">
        <div><h2 id="lesson-heading">Theory lessons</h2><p>Understand the sound. Find it on your guitar.</p></div>
        <button id="lesson-circle" class="btn btn-secondary">Circle of fifths &amp; guitar practice</button>
      </header>
      <p class="lesson-path">Start with major and natural minor, simplify to pentatonics, then explore chords and key relationships. Every lesson works in any root.</p>
      <div class="lesson-topics" role="group" aria-label="Lesson topic">
        <button id="lesson-scales" class="btn btn-secondary" aria-pressed="true">Scales &amp; modes</button>
        <button id="lesson-chords" class="btn btn-secondary" aria-pressed="false">Chord construction</button>
      </div>
      <div class="lesson-selectors">
        <label>Root<select id="lesson-root"></select></label>
        <label id="lesson-scale-field">Scale lesson<select id="lesson-scale"></select></label>
        <label id="lesson-chord-field" hidden>Chord lesson<select id="lesson-chord"></select></label>
      </div>
      <div class="lesson-workspace">
        <article class="lesson-copy" aria-labelledby="lesson-title">
          <h3 id="lesson-title"></h3>
          <h4>How it is built</h4><p id="lesson-construction"></p>
          <p id="lesson-steps"></p>
          <h4>Where it is useful</h4><p id="lesson-use"></p>
          <h4>Try it on your guitar</h4><p id="lesson-try"></p>
          <button id="lesson-practice" class="btn btn-primary"></button>
          <p id="lesson-handoff-note" class="lesson-muted"></p>
          <details class="lesson-basics"><summary>Intervals, degrees and positions</summary>
            <p>A half step (H) is one fret; a whole step (W) is two. Scale degrees count from the tonic. Flats and sharps in a formula alter degrees of the parallel major scale, not necessarily a key signature.</p>
            <p>A scale is a pitch collection organized around a tonic. A chord sounds selected tones together. Moving a shape changes its voicing or register, not its formula. A mode is not a hand position.</p>
            <p>Inversions name the lowest sounding chord tone: root position, third in the bass, fifth in the bass, and so on. Doubling a note does not add a new chord tone.</p>
            <p>9, 11 and 13 are compound intervals corresponding to 2, 4 and 6 an octave higher. Guitar voicings can reorder them. Not every theoretical chord can be comfortably played on six strings.</p>
          </details>
        </article>
        <section class="card neck-card lesson-instrument" aria-label="Interactive lesson fretboard">
          <div class="card-header"><h3>See and hear the formula</h3>
            <div class="neck-view-switch" role="group" aria-label="Theory fretboard view">
              <button id="lesson-view-3d" aria-pressed="false">3D</button><button id="lesson-view-2d" aria-pressed="true">2D</button>
            </div>
          </div>
          <div id="lesson-tones" class="lesson-tones" role="group" aria-label="Formula tones: select and hear a tone"></div>
          <p class="lesson-status">Degree · note · semitones above the root. Select a tone to trace it on the neck.</p>
          <div class="lesson-audio-controls">
            <button id="lesson-hear" class="btn btn-secondary">Hear construction</button>
            <button id="lesson-shape" class="btn btn-secondary" hidden>Play shown shape</button>
            <button id="lesson-stop" class="btn btn-secondary" disabled>Stop audio</button>
          </div>
          <p id="lesson-status" class="lesson-status" role="status">Select a formula tone to hear it and highlight its positions.</p>
          <div class="lesson-neck-controls">
            <label>Guitar position<select id="lesson-position"></select></label>
            <label>Labels<select id="lesson-labels"><option value="notes">Note names</option><option value="degrees">Degrees</option></select></label>
          </div>
          <div class="neck-stage">
            <div class="neck-stage-top"><span id="lesson-caption" class="neck-caption"></span><span id="lesson-tuning" class="neck-tuning"></span></div>
            <div id="lesson-3d" class="neck-3d" hidden></div>
            <div id="lesson-2d" class="fretboard-container pane-neck-flat"></div>
            <div id="lesson-camera" class="neck-camera" role="group" aria-label="Theory 3D camera" hidden>
              <button id="lesson-zoom-in" aria-label="Zoom in">+</button><button id="lesson-zoom-out" aria-label="Zoom out">−</button><button id="lesson-reset" aria-label="Reset camera">⟲</button>
            </div>
            <p id="lesson-help" class="neck-help">Drag to rotate · Click a marked fret to hear it · + / − to zoom · R to reset</p>
          </div>
          <div class="neck-footer">
            <div class="neck-legend"><span><i class="root-dot"></i>Root</span><span><i></i>Formula tone</span><span><i class="live-dot"></i>Selected / sounding</span></div>
            <p id="lesson-position-status" class="neck-summary"></p>
            <p id="lesson-bass" class="lesson-muted"></p>
            <p class="lesson-muted">Fret numbers are relative to the capo; all note names are sounding pitches. Shapes recalculate for your tuning. Muted strings are ×. These are suggested finger locations, not guaranteed comfortable fingerings.</p>
            <p class="lesson-muted">Construction audio uses a concert-pitch reference octave. Play shown shape uses exactly the displayed strings and frets. Stop microphone listening before auditioning; these examples are never scored.</p>
          </div>
        </section>
      </div>`;
    SCALE_ROOTS.forEach(root => this.el<HTMLSelectElement>('root').add(new Option(displayNote(root), root)));
    const populate = (id: string, entries: Array<[string, string, string]>) => {
      const select = this.el<HTMLSelectElement>(id);
      const groups = new Map<string, HTMLOptGroupElement>();
      for (const [value, name, group] of entries) {
        if (!groups.has(group)) {
          const node = document.createElement('optgroup'); node.label = group; select.append(node); groups.set(group, node);
        }
        groups.get(group)!.append(new Option(name, value));
      }
    };
    populate('scale', Object.entries(SCALE_LESSONS).map(([key, copy]) => [key, WESTERN_SCALES[key].name, copy.group]));
    const chordGroups = ['Triads & power chords', 'Suspended & added tones', 'Sixths & sevenths', 'Extensions', 'Altered & suspended sevenths'];
    populate('chord', Object.entries(CHORD_LESSONS)
      .sort((a, b) => chordGroups.indexOf(a[1].group) - chordGroups.indexOf(b[1].group))
      .map(([key, copy]) => [key, copy.name, copy.group]));
    const flat = this.el('2d');
    flat.innerHTML = `<div class="fret-numbers">${Array.from({ length: 13 }, (_, f) => `<div class="fret-num">${f || 'Open'}</div>`).join('')}</div>`;
    for (let s = 0; s < 6; s++) {
      const row = document.createElement('div'); row.className = 'guitar-string-row';
      row.innerHTML = `<div class="string-header"><span data-string-label="${s}"></span></div><div class="fret-cells-container"><div class="string-wire str-${s + 1}"></div>${Array.from({ length: 13 }, (_, f) => `<button class="fret-cell" data-string="${s}" data-fret="${f}"></button>`).join('')}</div>`;
      flat.append(row);
    }
    this.neck = new PaneNeck3D(this.el('3d'), {
      toggle3d: this.el('view-3d'), toggle2d: this.el('view-2d'), twoD: flat, camera: this.el('camera'),
      zoomIn: this.el('zoom-in'), zoomOut: this.el('zoom-out'), reset: this.el('reset'), help: this.el('help'),
    }, (s, f) => this.pick(s, f), { defaultMode: '3d', preferenceKey: 'gcs-theory-neck-view', help2d: 'Scroll the neck · Tab to a marked fret, then Enter to hear it. Unmarked frets are outside this lesson or shape.' });
    this.neck.setActive(false);
    this.transport = new SongTransport({
      now: () => this.audio?.context.currentTime ?? 0,
      setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: id => window.clearTimeout(id),
    }, {
      play: (entry, at, end) => this.playStep(this.steps[entry.index], at, end),
      target: entry => {
        const step = this.steps[entry.index]; this.selectedTone = step.tone;
        this.status(`Playing ${step.label}`); this.renderNeck();
      },
      finish: () => {
        const tone = this.selectedTone;
        this.stop('Reference finished. Try the idea on your guitar.');
        this.selectedTone = tone; this.renderNeck();
      },
      stalled: () => this.status('Audio timing was interrupted; resuming without rushing.'),
    });
    const events = { signal: this.abort.signal };
    const change = () => { this.stop(); this.refresh(); };
    this.el('scales').addEventListener('click', () => { this.kind = 'scale'; change(); }, events);
    this.el('chords').addEventListener('click', () => { this.kind = 'chord'; if (this.register === 'all') this.register = 'open'; change(); }, events);
    this.el<HTMLSelectElement>('root').addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value;
      const root = SCALE_ROOTS.find(root => root === value);
      if (root) { this.root = root; change(); }
    }, events);
    this.el<HTMLSelectElement>('scale').addEventListener('change', event => { this.scaleKey = (event.target as HTMLSelectElement).value; change(); }, events);
    this.el<HTMLSelectElement>('chord').addEventListener('change', event => {
      const key = (event.target as HTMLSelectElement).value;
      const quality = (Object.keys(CHORD_LESSONS) as ChordQuality[]).find(quality => quality === key);
      if (quality) { this.quality = quality; change(); }
    }, events);
    this.el('position').addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value;
      if (isFretboardRegister(value)) { this.register = value; this.stop(); this.updatePosition(); }
    }, events);
    this.el('labels').addEventListener('change', event => {
      this.degreeLabels = (event.target as HTMLSelectElement).value === 'degrees'; this.renderNeck();
    }, events);
    flat.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-fret]');
      if (cell) this.pick(Number(cell.dataset.string), Number(cell.dataset.fret));
    }, events);
    this.el('hear').addEventListener('click', () => {
      const steps = this.lesson.tones.map((_, i) => this.toneStep(i));
      if (this.kind === 'scale') steps.push(this.toneStep(0, 1));
      void this.play(steps);
    }, events);
    this.el('shape').addEventListener('click', () => {
      if (this.positions.length) void this.play([{ notes: [...this.positions].reverse(), tone: null, label: `${lessonChordSymbol(this.root, this.quality)} · displayed voicing` }], 1.4);
    }, events);
    this.el('stop').addEventListener('click', () => this.stop(), events);
    this.el('practice').addEventListener('click', () => {
      this.stop();
      if (this.kind === 'scale') this.actions.scale(this.root, this.scaleKey);
      else if (this.frets) this.actions.chord(this.root, this.quality, [...this.frets]);
    }, events);
    this.el('circle').addEventListener('click', () => { this.stop(); this.actions.circle(); }, events);
    host.addEventListener('keydown', event => { if (event.key === 'Escape') this.stop(); }, events);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); }, events);
    window.addEventListener('pagehide', () => this.stop(), events);
    this.refresh();
  }

  private refresh(): void {
    this.lesson = theoryLesson(this.kind, this.root, this.kind === 'scale' ? this.scaleKey : this.quality);
    this.el<HTMLSelectElement>('root').value = this.root;
    this.el<HTMLSelectElement>('scale').value = this.scaleKey;
    this.el<HTMLSelectElement>('chord').value = this.quality;
    this.voicings = this.kind === 'chord' ? lessonVoicings(this.root, this.quality, this.tuning) : [];
    for (const field of ['construction', 'use'] as const) this.el(field).textContent = this.lesson[field];
    this.el('try').textContent = this.lesson.tryIt;
    this.el('title').textContent = this.lesson.title;
    this.el('steps').hidden = this.kind !== 'scale';
    this.el('steps').textContent = `Steps back to the tonic: ${this.lesson.steps.map(step => step === 1 ? 'H' : step === 2 ? 'W' : '3 semitones').join(' · ')}`;
    this.el('scale-field').hidden = this.kind !== 'scale'; this.el('chord-field').hidden = this.kind !== 'chord';
    this.el('scales').setAttribute('aria-pressed', String(this.kind === 'scale'));
    this.el('chords').setAttribute('aria-pressed', String(this.kind === 'chord'));
    this.el('shape').hidden = this.kind !== 'chord';
    const select = this.el<HTMLSelectElement>('position'); select.replaceChildren();
    if (this.kind === 'scale') select.add(new Option('Full neck (0–12)', 'all'));
    for (const register of ['open', 'middle', 'upper'] as const) select.add(new Option(REGISTER_LABELS[register], register));
    select.value = this.register;
    const tones = this.el('tones'); tones.replaceChildren();
    this.lesson.tones.forEach((tone, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.tone = String(index); button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${tone.name}, degree ${tone.degree}, ${tone.interval} semitones from root. Hear and highlight.`);
      button.innerHTML = `<span>${tone.degree}</span><strong>${tone.name}</strong><small>+${tone.interval}</small>`;
      button.addEventListener('click', () => { void this.play([this.toneStep(index)]); }, { signal: this.abort.signal });
      tones.append(button);
    });
    this.el('practice').textContent = this.kind === 'scale' ? 'Practise this scale in Scales' : 'Explore this shape in Chord library';
    this.el('handoff-note').textContent = this.kind === 'scale'
      ? 'Transfers only root and scale. Choose Guided there for note-by-note guitar checking, or Free play for exploration. Nothing starts automatically.'
      : 'Transfers only this verified shape. Library lets you pluck, strum and explore it; it does not grade a performance. Nothing starts automatically.';
    this.updatePosition();
    this.status('Select a formula tone to hear it and highlight its positions. No microphone is requested here.');
  }

  private updatePosition(): void {
    this.frets = this.voicings.find(voicing => voicing.register === this.register)?.frets ?? null;
    this.positions = lessonPositions(this.lesson, this.tuning, this.register, this.frets);
    const unavailable = this.kind === 'chord' && !this.frets;
    this.el<HTMLButtonElement>('shape').disabled = unavailable;
    this.el<HTMLButtonElement>('practice').disabled = unavailable;
    this.el('caption').textContent = this.lesson.title;
    this.el('tuning').textContent = `${[...this.tuning].reverse().map(s => displayNote(NOTE_NAMES[s.midi % 12])).join(' · ')} · capo ${this.capo}`;
    this.el('position-status').textContent = this.kind === 'scale'
      ? `${this.positions.length} scale-note locations in this area. All octaves shown; select a tone to trace it.`
      : this.frets ? `Low → high frets: ${[...this.frets].reverse().map(f => f === null ? '×' : f === 0 ? 'open' : f).join(' · ')}`
        : 'No complete four-finger-compatible shape in this area and tuning. Try another position or root. No chord tones have been silently omitted.';
    this.el('position-status').dataset.state = unavailable ? 'unavailable' : 'ready';
    const bass = this.positions.reduce<LessonPosition | null>((lowest, p) => !lowest || p.midi < lowest.midi ? p : lowest, null);
    this.el('bass').textContent = this.kind === 'chord' && bass
      ? `Lowest sounding tone: ${this.lesson.tones[bass.tone].name} (degree ${this.lesson.tones[bass.tone].degree}) · ${bass.tone === 0 ? 'root position' : 'inverted voicing'}. All listed pitch classes are present; octaves and note order may differ from the construction.`
      : '';
    this.renderNeck();
  }

  private renderNeck(): void {
    const positions = this.positions.map(position => {
      const tone = this.lesson.tones[position.tone];
      return {
        stringIndex: position.stringIndex, fret: position.fret,
        label: this.degreeLabels ? tone.degree : tone.name, role: position.tone === 0 ? 'root' as const : 'tone' as const,
        active: this.playingPosition ? position.stringIndex === this.playingPosition.stringIndex && position.fret === this.playingPosition.fret : position.tone === this.selectedTone,
      };
    });
    this.el('2d').querySelectorAll<HTMLButtonElement>('[data-fret]').forEach(cell => {
      const s = Number(cell.dataset.string), f = Number(cell.dataset.fret);
      const position = positions.find(p => p.stringIndex === s && p.fret === f);
      cell.disabled = !position;
      cell.setAttribute('aria-label', `String ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`}${position ? `, ${position.label}` : ', outside this lesson or shape'}`);
      cell.setAttribute('aria-pressed', String(position?.active ?? false));
      cell.innerHTML = position ? `<span class="finger-dot${position.role === 'root' ? ' root-note' : ''}${position.active ? ' lesson-playing' : ''}">${position.label}</span>` : '';
    });
    const stringLabels = this.tuning.map((string, s) =>
      `${displayNote(NOTE_NAMES[string.midi % 12])}${this.kind === 'chord' && this.frets?.[s] == null ? ' ×' : ''}`);
    this.el('2d').querySelectorAll<HTMLElement>('[data-string-label]').forEach(label => {
      const s = Number(label.dataset.stringLabel);
      label.textContent = stringLabels[s];
    });
    this.el('tones').querySelectorAll<HTMLElement>('[data-tone]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.tone) === this.selectedTone)));
    this.neck.update({ frets: this.frets ?? Array(6).fill(null), tuning: this.tuning, stringLabels, root: this.root, liveMidi: null, scalePositions: positions });
  }

  private toneStep(index: number, octave = 0): ReferenceStep {
    const tone = this.lesson.tones[index], midi = 48 + scaleRootPc(this.root) + tone.interval + octave * 12;
    const stringIndex = STANDARD_TUNING.findIndex(string => midi >= string.midi);
    return { notes: [{ midi, stringIndex }], tone: index, label: `${tone.name} · degree ${tone.degree} · concert-pitch construction` };
  }

  private pick(stringIndex: number, fret: number): void {
    const position = this.positions.find(p => p.stringIndex === stringIndex && p.fret === fret);
    if (!position) { this.status('Choose a marked position: this fret is not part of the displayed lesson or voicing.'); return; }
    void this.play([{ notes: [position], tone: position.tone, label: `${this.lesson.tones[position.tone].name} · string ${stringIndex + 1}, fret ${fret}` }], 0.7, position);
  }

  private async play(steps: ReferenceStep[], duration = 0.5, position: LessonPosition | null = null): Promise<void> {
    if (!this.active) return;
    this.stop(); const generation = this.generation; this.pending = true; this.syncAudio();
    try {
      const audio = await this.actions.audio();
      if (generation !== this.generation || !this.active || document.hidden) return;
      this.audio = audio; this.steps = steps; this.playingPosition = position;
      const entries: TimedEvent[] = steps.map((_, index) => ({
        event: { type: 'rest', beats: duration * 2 }, index, beat: index * duration * 2, start: index * duration, duration, bpm: 120,
      }));
      this.transport.start(entries, 0, false);
    } catch (error) {
      if (generation === this.generation) {
        this.stop(`Reference audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
        this.selectedTone = steps.length === 1 ? steps[0].tone : null; this.renderNeck();
      }
    } finally {
      if (generation === this.generation) { this.pending = false; this.syncAudio(); }
    }
  }

  private playStep(step: ReferenceStep, at: number, end: number): () => void {
    if (!this.audio) throw new Error('Lesson audio is not ready.');
    const { context, bus } = this.audio;
    const sources = step.notes.map((note, i) => {
      const source = playAcousticString(context, bus, {
        freq: 440 * 2 ** ((note.midi - 69) / 12), stringIndex: note.stringIndex,
        startTime: at + i * 0.025, endTime: end, velocity: step.notes.length > 1 ? 0.65 : 0.8,
      });
      this.sources.add(source); source.addEventListener('ended', () => this.sources.delete(source), { once: true });
      return source;
    });
    return () => sources.forEach(source => { if (this.sources.delete(source)) source.stop(); });
  }

  private syncAudio(): void { this.el<HTMLButtonElement>('stop').disabled = !this.pending && !this.transport.running; }
  private status(message: string): void { this.el('status').textContent = message; }
  stop(message = 'Reference stopped. Choose a tone or play your guitar.'): void {
    this.generation++; this.pending = false; this.transport.stop();
    this.sources.forEach(source => source.stop()); this.sources.clear();
    this.selectedTone = null; this.playingPosition = null;
    this.syncAudio(); this.renderNeck(); this.status(message);
  }
  setActive(active: boolean): void {
    this.active = active; this.neck.setActive(active);
    if (!active) this.stop();
  }
  setTuning(tuning: StringTuning[], capo: number): void {
    this.stop(); this.tuning = tuning; this.capo = capo; this.refresh();
  }
  dispose(): void { this.stop(); this.abort.abort(); this.neck.dispose(); }
}
