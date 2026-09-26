import { playAcousticString, type AcousticBus } from '../audio/engine';
import { displayNote, scalePitchName } from '../scales/theory';
import { WESTERN_SCALES } from '../scales/definitions';
import { PerformanceGate } from '../songs/performance';
import { chordIdentity } from '../songs/timing';
import { SongTransport } from '../songs/transport';
import type { TimedEvent } from '../songs/timing';
import { STANDARD_TUNING, type DetectionResult, type NoteName } from '../types';
import { CIRCLE_KEYS, circleChordMidis, circleKey, circleSignature, circleTheory, type CircleChord, type CircleMode } from '../theory/circleOfFifths';
import { buildCircleRound, circlePracticeTarget, type CircleDirection, type CirclePracticeGoal, type CircleRoundTarget } from '../theory/circlePractice';

interface ReferenceStep { label: string; midis: number[]; duration: number; chordLabel?: string }
interface ReferenceAudio { context: AudioContext; bus: AcousticBus }
export interface CircleMicrophoneLease { release(): void }
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
  private practiceGoal: CirclePracticeGoal = 'chord';
  private direction: CircleDirection = 1;
  private round: CircleRoundTarget[] = [];
  private answers: Array<'correct' | 'skipped'> = [];
  private practiceRunning = false;
  private practicePending = false;
  private practiceGeneration = 0;
  private micLease: CircleMicrophoneLease | null = null;
  private practiceGate = new PerformanceGate();
  private practiceState: 'idle' | 'listening' | 'complete' | 'stopped' = 'idle';
  private practiceMessage = 'Choose a goal and direction, then start a round. No microphone is requested until Start.';
  private practiceVerdict: 'neutral' | 'correct' | 'wrong' = 'neutral';
  private heard = '—';
  private cursorRotation = 0;
  private previousPerformanceId = 0;
  private observedPerformanceId = 0;
  private feedbackAnimation: Animation | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private getAudio: () => Promise<ReferenceAudio>,
    private openScale: (root: NoteName, mode: CircleMode) => void,
    private requestMicrophone: (target: 'chords' | 'notes') => Promise<CircleMicrophoneLease>,
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
    const details = element('fifths-key-title').closest<HTMLElement>('.fifths-key-details')!;
    const stack = document.createElement('div');
    stack.className = 'fifths-panel-stack';
    details.before(stack);
    stack.append(element('fifths-practice-panel'), details);
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
      this.select(this.index, this.mode, true);
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
    element('fifths-practice-start').addEventListener('click', () => { void this.startPractice(); }, events);
    element('fifths-practice-stop').addEventListener('click', () => this.stopPractice('Round stopped. Start again when ready.'), events);
    element('fifths-practice-skip').addEventListener('click', () => this.advancePractice('skipped'), events);
    element('fifths-wheel-stop').addEventListener('click', () => this.stopPractice('Round stopped. Start again when ready.'), events);
    element('fifths-wheel-skip').addEventListener('click', () => this.advancePractice('skipped'), events);
    element('pane-fifths').addEventListener('keydown', event => {
      if (event.key === 'Escape' && (this.practiceRunning || this.practicePending)) {
        event.preventDefault(); this.stopPractice('Round stopped. Start again when ready.');
        element('fifths-practice-start').focus();
      }
    }, events);
    element<HTMLSelectElement>('fifths-practice-goal').addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value;
      if (value === 'chord' || value === 'root') { this.practiceGoal = value; this.resetPracticeView(); }
    }, events);
    element<HTMLSelectElement>('fifths-practice-direction').addEventListener('change', event => {
      this.direction = (event.target as HTMLSelectElement).value === 'counterclockwise' ? -1 : 1;
      this.resetPracticeView();
    }, events);
    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) { this.feedbackAnimation?.cancel(); this.feedbackAnimation = null; }
    }, events);
    window.addEventListener('pagehide', () => { this.stopPractice('Round stopped when leaving the page.'); this.stop('Reference audio stopped.'); }, events);
    this.render();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) { this.stopPractice('Round stopped when leaving the Circle.'); this.stop(''); }
  }

  private select(index: number, mode = this.mode, force = false): void {
    if (!force && index === this.index && mode === this.mode && (this.practiceRunning || this.practicePending)) return;
    this.resetPracticeView();
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
    this.renderPractice();
  }

  private chordStep(chord: CircleChord): ReferenceStep {
    return { label: `${chord.roman} · ${chord.label}`, midis: circleChordMidis(chord), duration: 1.2, chordLabel: chord.label };
  }

  private status(message: string): void {
    if (message) element('fifths-audio-status').textContent = message;
  }

  private syncAudioControls(): void {
    element<HTMLButtonElement>('fifths-stop').disabled = !this.playing && !this.pending;
    document.querySelectorAll<HTMLButtonElement>('[data-fifths-audio]').forEach(button => { button.disabled = this.pending || this.practicePending || this.practiceRunning; });
  }

  private clearPlayingChord(): void {
    element('fifths-chords').querySelectorAll('[aria-current]').forEach(row => row.removeAttribute('aria-current'));
  }

  private async play(steps: ReferenceStep[]): Promise<void> {
    if (!this.active || this.practiceRunning || this.practicePending) return;
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

  private resetPracticeView(): void {
    this.stopPractice('');
    this.round = []; this.answers = []; this.practiceState = 'idle';
    this.heard = '—'; this.practiceVerdict = 'neutral';
    this.practiceMessage = 'Selection changed. Start a new round from this key.';
    this.renderPractice();
  }

  async startPractice(): Promise<void> {
    this.stopPractice('');
    this.stop('');
    if (!this.active) return;
    this.round = buildCircleRound(this.index, this.mode, this.flatCrossover, this.direction);
    this.answers = [];
    this.cursorRotation = this.index * 30 + Math.round((this.cursorRotation - this.index * 30) / 360) * 360;
    this.previousPerformanceId = 0; this.observedPerformanceId = 0;
    this.practiceGate = new PerformanceGate();
    this.heard = '—'; this.practiceVerdict = 'neutral'; this.practiceState = 'idle';
    this.practicePending = true;
    const generation = this.practiceGeneration;
    this.practiceMessage = 'Waiting for microphone access. Allow access to begin, or Stop to cancel.';
    this.status('Reference audio is disabled during guitar practice.');
    this.renderPractice(); this.syncAudioControls();
    try {
      const lease = await this.requestMicrophone(this.practiceGoal === 'chord' ? 'chords' : 'notes');
      if (generation !== this.practiceGeneration || !this.active) { lease.release(); return; }
      this.micLease = lease;
      this.practicePending = false; this.practiceRunning = true; this.practiceState = 'listening';
      this.practiceGate.setTarget(circlePracticeTarget(this.round[0], this.practiceGoal), Date.now());
      this.practiceMessage = `Listening. Stay quiet briefly, then play ${this.targetLabel(this.round[0])} with a new attack.`;
      this.renderPractice(); this.syncAudioControls();
      element(`fifths-key-${this.index}`).focus({ preventScroll: true });
      if (window.innerWidth <= 860) element('fifths-wheel').scrollIntoView({ block: 'center', behavior: this.reducedMotion.matches ? 'instant' : 'smooth' });
    } catch (error) {
      if (generation !== this.practiceGeneration) return;
      this.stopPractice(`Microphone unavailable: ${error instanceof Error ? error.message : String(error)}. Allow access and retry.`);
    }
  }

  stopPractice(message: string): void {
    const wasPractising = this.practiceRunning || this.practicePending;
    this.practiceGeneration++;
    this.practiceRunning = false; this.practicePending = false;
    this.feedbackAnimation?.cancel(); this.feedbackAnimation = null;
    const lease = this.micLease; this.micLease = null;
    if (wasPractising) this.practiceState = 'stopped';
    this.practiceGate.requireRelease();
    lease?.release();
    if (message && wasPractising) {
      this.practiceMessage = message; this.practiceVerdict = 'neutral';
      this.status('Reference audio requires microphone listening to be off.');
    }
    this.renderPractice(); this.syncAudioControls();
  }

  onMicrophoneStopped(): void {
    if (this.practiceRunning || this.practicePending) this.stopPractice('Microphone stopped or disconnected. Start again to begin a new round.');
  }

  onDetectionResult(result: DetectionResult): void {
    if (!this.active || !this.practiceRunning) return;
    const target = this.round[this.answers.length];
    if (!target) return;
    if (result.isCalibrating || result.calibrationComplete) {
      this.practiceGate.requireRelease();
      this.practiceMessage = result.isCalibrating ? 'Calibrating room noise. Stay quiet.' : 'Calibration finished. Mute briefly, then play the target.';
      this.practiceVerdict = 'neutral'; this.renderPractice(); return;
    }
    const matched = this.practiceGate.consume(result);
    if (result.performance) this.observedPerformanceId = result.performance.id;
    const chord = result.mode === 'chord' ? result.chord : undefined;
    const note = result.mode === 'single-note' ? result.note : undefined;
    if (chord) {
      const identity = chordIdentity(chord.symbol);
      const written = this.current.chords.find(c => {
        const expected = chordIdentity(c.label);
        return identity && expected && expected.root === identity.root && expected.quality === identity.quality;
      });
      this.heard = written?.label || displayNote(chord.symbol);
    } else if (note && Number.isFinite(note.pitch.midi)) {
      this.heard = scalePitchName(note.pitch.midi, this.current.root, this.mode === 'major' ? WESTERN_SCALES.major : WESTERN_SCALES.natural_minor);
    } else this.heard = '—';
    if (matched) {
      this.previousPerformanceId = result.performance?.id || 0;
      this.advancePractice('correct');
      return;
    }
    this.practiceVerdict = 'neutral';
    if (result.freshness === 'held') {
      this.heard += ' (held)';
      this.practiceMessage = 'Last sound is held—not a new answer. Play the target again.';
    } else if (this.practiceGate.needsRelease) {
      this.practiceMessage = 'Mute the strings briefly, then play the target to begin checking.';
    } else if (!result.performance?.signalPresent) {
      this.practiceMessage = 'Listening for the target. Take your time.';
    } else if (this.previousPerformanceId > 0 && result.performance.id === this.previousPerformanceId) {
      this.practiceMessage = 'Previous sound is still ringing. Play the new target with a new attack.';
    } else if (result.freshness !== 'fresh' || this.practiceGoal === 'root' && (!note || note.confidence < 70)) {
      this.practiceMessage = this.practiceGoal === 'root' ? 'Pitch unclear. Pluck one string cleanly.' : 'Chord unclear. Strum a plain major/minor triad cleanly.';
    } else {
      const pitchTarget = circlePracticeTarget(target, this.practiceGoal);
      const matchingPitch = pitchTarget.type === 'pitch-class' && note && Math.round(note.pitch.midi) % 12 === pitchTarget.pitchClass;
      this.practiceMessage = matchingPitch ? 'Target pitch heard. Keep it clear for confirmation.'
        : `Heard ${this.heard}. Try ${this.targetLabel(target)}.`;
      this.practiceVerdict = matchingPitch ? 'neutral' : 'wrong';
    }
    this.renderPractice();
  }

  private targetLabel(target: CircleRoundTarget): string {
    return this.practiceGoal === 'root' ? `${displayNote(target.root)} root note (any detectable octave)` : `${target.label} chord`;
  }

  private advancePractice(outcome: 'correct' | 'skipped'): void {
    if (!this.practiceRunning) return;
    const answered = this.round[this.answers.length];
    if (!answered) return;
    const followFocus = document.activeElement === element(`fifths-key-${answered.index}`);
    if (outcome === 'skipped') this.previousPerformanceId = this.observedPerformanceId;
    this.answers.push(outcome);
    this.cursorRotation += this.direction * 30;
    const complete = this.answers.length === this.round.length;
    const next = complete ? this.round[0] : this.round[this.answers.length];
    this.index = next.index;
    this.current = circleTheory(this.index, this.mode, this.flatCrossover);
    if (complete) {
      this.stopPractice('');
      this.practiceState = 'complete';
      const correct = this.answers.filter(answer => answer === 'correct').length;
      this.practiceMessage = `Round complete: ${correct} matched, ${12 - correct} skipped. Back to ${this.round[0].label}.`;
      this.status('Guitar round finished. Reference audio requires microphone listening to be off.');
    } else {
      this.practiceGate.setTarget(circlePracticeTarget(next, this.practiceGoal), Date.now());
      if (outcome === 'skipped') this.practiceGate.requireRelease();
      this.practiceMessage = outcome === 'correct' ? `Correct. Next: ${this.targetLabel(next)}. Use a new attack.` : `Skipped—not counted as correct. Mute briefly, then play ${this.targetLabel(next)}.`;
    }
    this.practiceVerdict = outcome === 'correct' ? 'correct' : 'neutral';
    this.render();
    if (followFocus) element(`fifths-key-${next.index}`).focus({ preventScroll: true });
    if (outcome === 'correct' && !this.reducedMotion.matches) {
      this.feedbackAnimation?.cancel();
      const animation = element(`fifths-key-${answered.index}`).animate([
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(1.04)' },
        { transform: 'translate(-50%, -50%) scale(1)' },
      ], { duration: 260, easing: 'ease-out' });
      this.feedbackAnimation = animation;
      animation.onfinish = () => { if (this.feedbackAnimation === animation) this.feedbackAnimation = null; };
    }
  }

  private renderPractice(): void {
    const panel = element('fifths-practice-panel');
    if (!panel) return;
    const busy = this.practiceRunning || this.practicePending;
    element<HTMLButtonElement>('fifths-practice-start').disabled = busy;
    element<HTMLButtonElement>('fifths-practice-stop').disabled = !busy;
    element<HTMLButtonElement>('fifths-practice-skip').disabled = !this.practiceRunning;
    element<HTMLButtonElement>('fifths-wheel-stop').disabled = !busy;
    element<HTMLButtonElement>('fifths-wheel-skip').disabled = !this.practiceRunning;
    element('fifths-wheel-actions').hidden = !busy;
    element<HTMLSelectElement>('fifths-practice-goal').disabled = busy;
    element<HTMLSelectElement>('fifths-practice-direction').disabled = busy;
    panel.dataset.state = this.practiceState;
    panel.dataset.verdict = this.practiceVerdict;
    const target = this.practiceRunning ? this.round[this.answers.length] : null;
    const targetText = target ? `Play ${this.targetLabel(target)}` : this.practiceState === 'complete' ? '12-key round complete' : `Start from ${this.current.label}`;
    element('fifths-practice-target').textContent = targetText;
    element('fifths-wheel-target').textContent = targetText;
    element('fifths-practice-heard').textContent = this.heard;
    const message = element('fifths-practice-message');
    if (message.textContent !== this.practiceMessage) message.textContent = this.practiceMessage;
    const wheelMessage = element('fifths-wheel-message');
    if (wheelMessage.textContent !== this.practiceMessage) wheelMessage.textContent = this.practiceMessage;
    element('fifths-wheel-feedback').dataset.verdict = this.practiceVerdict;
    const correct = this.answers.filter(answer => answer === 'correct').length;
    element('fifths-practice-progress').textContent = `${this.answers.length}/12 visited · ${correct} matched · ${this.answers.length - correct} skipped`;
    const showingRound = this.round.length > 0;
    element('fifths-wheel-feedback').hidden = !showingRound;
    document.getElementById('fifths-round-meter')!.toggleAttribute('hidden', !showingRound);
    element('fifths-practice-cursor').hidden = !showingRound;
    element('fifths-round-legend').hidden = !showingRound;
    element('fifths-practice-cursor').style.transform = `rotate(${this.cursorRotation}deg)`;
    const meter = document.getElementById('fifths-round-progress')!;
    const circumference = 2 * Math.PI * 34;
    const startAngle = (this.round[0]?.index ?? this.index) * 30 - 90;
    meter.setAttribute('transform', `rotate(${startAngle} 50 50)${this.direction === -1 ? ' translate(0 100) scale(1 -1)' : ''}`);
    meter.setAttribute('stroke-dasharray', String(circumference));
    meter.setAttribute('stroke-dashoffset', String(circumference * (1 - this.answers.length / 12)));
    CIRCLE_KEYS.forEach((_, index) => {
      const button = element(`fifths-key-${index}`);
      const visit = this.round.findIndex(target => target.index === index);
      const result = visit >= 0 ? this.answers[visit] : undefined;
      if (result) button.dataset.roundResult = result; else delete button.dataset.roundResult;
      const label = button.getAttribute('aria-label')?.replace(/ Round result: (correct|skipped)\.$/, '') || '';
      button.setAttribute('aria-label', label + (result ? ` Round result: ${result}.` : ''));
    });
  }

  dispose(): void { this.stopPractice(''); this.stop(); this.abort.abort(); }
}
