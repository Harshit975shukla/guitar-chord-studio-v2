import { playAcousticString, type AcousticBus } from '../audio/engine';
import { guitarBankReady } from '../audio/guitarSamples';
import { STANDARD_TUNING, midiToPitch, type ChordQuality, type DetectionResult, type NoteName, type StringTuning } from '../types';
import { CHORD_QUALITY_DISPLAY } from '../chords/definitions';
import { WESTERN_SCALES } from '../scales/definitions';
import { displayNote } from '../scales/theory';
import {
  EAR_ROOTS, EAR_CHORD_QUALITIES, NOTE_INTERVALS, answerIsCorrect, buildEarExercise,
  buildEarReference, chordKeyMaterial, exercisePresentation,
  type ChordDifficulty, type EarActivity, type EarExercise, type EarSettings, type ExerciseType,
} from '../training/exercises';
import { EarTrainingPerformance } from '../training/practice';
import '../ui/earTraining.css';

type MicrophoneLease = { release(): void };
const pitchName = (midi: number) => {
  const pitch = midiToPitch(midi);
  return `${displayNote(pitch.note)}${pitch.octave}`;
};
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

/**
 * The host provides the effective tuning (including capo), shared recorded-guitar bus,
 * reference readiness and an owned/borrowed microphone lease. No global audio is stopped.
 * Constructor and pre-init lifecycle calls are safe before the trainer DOM exists.
 */
export class TrainerStudio {
  public onPlayRequested?: () => Promise<void>;
  public requestMicrophone?: (target: 'notes' | 'chords') => Promise<MicrophoneLease>;
  private pane: HTMLElement | null = null;
  private active = false;
  private tuning = STANDARD_TUNING.map(string => ({ ...string }));
  private audioContext: AudioContext | null = null;
  private acousticBus: AcousticBus | null = null;
  private activity: EarActivity = 'hear';
  private settings: EarSettings = { type: 'chords', root: 'C', minorKey: false, difficulty: 'beginner', quality: 'Major', interval: 0, scale: 'major' };
  private exercise: EarExercise | null = null;
  private answered = false;
  private heard = false;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private feedback = 'Choose a target, then hear it on the recorded guitar.';
  private feedbackState: 'neutral' | 'success' | 'error' = 'neutral';
  private audioStatus = '';
  private audioGeneration = 0;
  private audioPending = false;
  private audioPlaying = false;
  private timers = new Set<number>();
  private sources = new Set<AudioBufferSourceNode>();
  // Reference cancellation must not invalidate a permission request whose calibration calls stopAudio().
  private practiceGeneration = 0;
  private practicePending = false;
  private lease: MicrophoneLease | null = null;
  private performance = new EarTrainingPerformance();

  constructor() {}

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[]): void {
    this.stopAudio();
    this.cancelPractice();
    this.tuning = tuning.map(string => ({ ...string }));
    if (this.pane) this.newExercise();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      const wasChecking = this.practicePending || this.performance.checking;
      this.stopAudio();
      this.cancelPractice();
      if (wasChecking) this.feedback = 'Checking stopped. Start a new microphone check when you return.';
      this.render();
    } else this.renderState();
  }

  stopAudio(): void {
    const wasPlaying = this.audioPending || this.audioPlaying;
    this.audioGeneration++;
    this.audioPending = false;
    this.audioPlaying = false;
    this.timers.forEach(id => window.clearTimeout(id));
    this.timers.clear();
    this.sources.forEach(source => {
      try { source.stop(); } catch { /* An already-ended owned source needs no further cleanup. */ }
    });
    this.sources.clear();
    if (wasPlaying) this.audioStatus = 'Reference stopped. Hear it again when ready.';
    this.renderState();
  }

  init(): void {
    if (this.pane) return;
    this.pane = document.getElementById('pane-trainer');
    if (!this.pane) return;
    this.pane.classList.add('ear-training');
    this.pane.innerHTML = `
      <header class="ear-heading">
        <div><h2>Ear training</h2><p>Hear the sound. Name it. Find it on your guitar.</p></div>
        <dl class="ear-stats" aria-label="This session">
          <div><dt>Score</dt><dd id="quiz-score">0</dd></div>
          <div><dt>Streak</dt><dd id="quiz-streak">0</dd></div>
          <div><dt>Best</dt><dd id="quiz-best-streak">0</dd></div>
        </dl>
      </header>
      <div class="ear-switches">
        <fieldset class="ear-segmented"><legend>Train your ear for</legend>
          ${(['chords', 'notes', 'scales'] as const).map(type => `<button type="button" id="ear-type-${type}" data-ear-type="${type}" aria-pressed="false">${type[0].toUpperCase() + type.slice(1)}</button>`).join('')}
        </fieldset>
        <fieldset class="ear-segmented ear-activities"><legend>Activity</legend>
          <button type="button" id="ear-activity-hear" data-ear-activity="hear" aria-pressed="false">Hear</button>
          <button type="button" id="ear-activity-identify" data-ear-activity="identify" aria-pressed="false">Identify</button>
          <button type="button" id="ear-activity-play-back" data-ear-activity="play-back" aria-pressed="false">Play-back with guitar</button>
        </fieldset>
      </div>
      <div class="ear-workspace">
        <section class="ear-settings" aria-labelledby="ear-settings-title">
          <h3 id="ear-settings-title">Set your practice</h3>
          <label id="ear-tonic-control" for="ear-tonic">Tonic / home note
            <select id="ear-tonic">${EAR_ROOTS.map(root => `<option value="${root}">${displayNote(root)}</option>`).join('')}</select>
          </label>
          <label id="ear-key-control" for="quiz-key-context">Chord quiz key
            <select id="quiz-key-context">${EAR_ROOTS.flatMap(root => [false, true].map(minor =>
              `<option value="${root}${minor ? 'm' : ''}">${displayNote(root)} ${minor ? 'minor' : 'major'}</option>`)).join('')}</select>
          </label>
          <label id="ear-difficulty-control" for="quiz-difficulty">Chord choices
            <select id="quiz-difficulty"><option value="beginner">Beginner · familiar chords</option><option value="intermediate">Intermediate · add sevenths</option><option value="master">Master · add diminished</option></select>
          </label>
          <label id="ear-quality-control" for="ear-chord-quality">Chord quality
            <select id="ear-chord-quality">${EAR_CHORD_QUALITIES.map(quality => `<option value="${quality}">${quality === '5' ? 'Power chord (5)' : quality === '7' ? 'Dominant 7th' : quality === 'Major' || quality === 'Minor' ? quality : CHORD_QUALITY_DISPLAY[quality]}</option>`).join('')}</select>
          </label>
          <label id="ear-note-control" for="ear-note-interval">Target note above the tonic
            <select id="ear-note-interval"></select>
          </label>
          <label id="ear-scale-control" for="ear-scale">Scale / mode
            <select id="ear-scale">${Object.entries(WESTERN_SCALES).map(([key, scale]) => `<option value="${key}">${scale.name}</option>`).join('')}</select>
          </label>
          <p id="ear-context" class="ear-context"></p>
          <p class="ear-settings-note">Uses your current guitar sound, tuning and capo. These controls do not change your guitar settings.</p>
        </section>
        <section id="quiz-hero-card" class="ear-exercise" aria-labelledby="quiz-target-chord-name">
          <p id="quiz-prompt-text" class="ear-instruction"></p>
          <h3 id="quiz-target-chord-name"></h3>
          <p id="quiz-target-notes" class="ear-description"></p>
          <div class="ear-actions">
            <button type="button" class="btn btn-primary" id="btn-play-cadence">Hear cadence + chord</button>
            <button type="button" class="btn btn-secondary" id="btn-quiz-replay">Hear again</button>
            <button type="button" class="btn btn-secondary" id="ear-stop-reference">Stop reference</button>
          </div>
          <p id="quiz-audio-status" class="ear-audio-status" role="status" aria-live="polite"></p>
          <div id="quiz-choices-grid" class="ear-choices" role="group" aria-label="Identify the sound"></div>
          <div id="ear-playing-guide" class="ear-playing-guide"></div>
          <div class="ear-practice-actions">
            <button type="button" class="btn btn-primary" id="btn-quiz-mic">Check with microphone</button>
            <button type="button" class="btn btn-secondary" id="btn-quiz-skip">Next mystery</button>
          </div>
          <p id="quiz-feedback-pill" class="ear-feedback" role="status" aria-live="polite"></p>
          <p id="ear-practice-progress" class="ear-progress"></p>
          <p class="ear-limits">Microphone checking needs a fresh pluck or strum. Notes are checked at the shown octave; scales need every note in order. Chords are checked by identity. Rhythm, inversions and finger placement are not graded.</p>
        </section>
      </div>`;
    this.pane.querySelectorAll<HTMLButtonElement>('[data-ear-type]').forEach(button => {
      button.onclick = () => { this.settings.type = button.dataset.earType as ExerciseType; this.newExercise(); };
    });
    this.pane.querySelectorAll<HTMLButtonElement>('[data-ear-activity]').forEach(button => {
      button.onclick = () => { this.activity = button.dataset.earActivity as EarActivity; this.newExercise(); };
    });
    this.select('ear-tonic').onchange = event => {
      this.settings.root = (event.target as HTMLSelectElement).value as NoteName;
      this.newExercise();
    };
    this.select('quiz-key-context').onchange = event => {
      const value = (event.target as HTMLSelectElement).value;
      this.settings.minorKey = value.endsWith('m');
      this.settings.root = (this.settings.minorKey ? value.slice(0, -1) : value) as NoteName;
      this.newExercise();
    };
    this.select('quiz-difficulty').onchange = event => { this.settings.difficulty = (event.target as HTMLSelectElement).value as ChordDifficulty; this.newExercise(); };
    this.select('ear-chord-quality').onchange = event => { this.settings.quality = (event.target as HTMLSelectElement).value as ChordQuality; this.newExercise(); };
    this.select('ear-note-interval').onchange = event => { this.settings.interval = Number((event.target as HTMLSelectElement).value); this.newExercise(); };
    this.select('ear-scale').onchange = event => { this.settings.scale = (event.target as HTMLSelectElement).value; this.newExercise(); };
    this.button('btn-play-cadence').onclick = () => this.playCadenceAndStartQuiz();
    this.button('btn-quiz-replay').onclick = () => this.replayMysteryChord();
    this.button('ear-stop-reference').onclick = () => this.stopAudio();
    this.button('btn-quiz-skip').onclick = () => this.skipQuizChord();
    this.button('btn-quiz-mic').onclick = () => void this.toggleMic();
    this.newExercise();
  }

  private element(id: string): HTMLElement { return this.pane!.querySelector<HTMLElement>(`#${id}`)!; }
  private button(id: string): HTMLButtonElement { return this.element(id) as HTMLButtonElement; }
  private select(id: string): HTMLSelectElement { return this.element(id) as HTMLSelectElement; }
  private show(id: string, visible: boolean): void { this.element(id).hidden = !visible; }
  private text(id: string, text: string): void {
    if (this.element(id).textContent !== text) this.element(id).textContent = text;
  }

  private newExercise(avoidPrevious = false): void {
    const previous = avoidPrevious ? this.exercise?.target.id : undefined;
    this.stopAudio();
    this.cancelPractice();
    this.exercise = buildEarExercise(this.settings, this.activity, this.tuning, Math.random, previous);
    this.answered = false;
    this.heard = false;
    this.audioStatus = '';
    this.feedbackState = 'neutral';
    this.feedback = this.activity === 'hear' ? 'Choose a target, then hear it on the recorded guitar.'
      : this.activity === 'identify' ? 'Hear the reference and mystery sound before choosing an answer.'
        : 'Hear the target first, then check your own guitar. Microphone access starts only when you ask.';
    if (!this.exercise) {
      this.feedback = 'No complete playable target is available in this tuning. Choose another target or adjust your guitar tuning.';
      this.feedbackState = 'error';
    }
    this.render();
  }

  private render(): void {
    if (!this.pane) return;
    const { type, root } = this.settings;
    const identifying = this.activity === 'identify';
    this.pane.querySelectorAll<HTMLButtonElement>('[data-ear-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.earType === type)));
    this.pane.querySelectorAll<HTMLButtonElement>('[data-ear-activity]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.earActivity === this.activity)));
    this.select('ear-tonic').value = root;
    this.select('quiz-key-context').value = root + (this.settings.minorKey ? 'm' : '');
    this.select('quiz-difficulty').value = this.settings.difficulty;
    this.select('ear-chord-quality').value = this.settings.quality;
    this.select('ear-scale').value = this.settings.scale;
    this.select('ear-note-interval').innerHTML = NOTE_INTERVALS.map((interval, index) => {
      const pc = (EAR_ROOTS.indexOf(root) + index) % 12;
      return `<option value="${index}">${displayNote(EAR_ROOTS[pc])} · ${interval}</option>`;
    }).join('');
    this.select('ear-note-interval').value = String(this.settings.interval);
    this.show('ear-tonic-control', type !== 'chords');
    this.show('ear-key-control', type === 'chords');
    this.show('ear-difficulty-control', type === 'chords' && identifying);
    this.show('ear-quality-control', type === 'chords' && !identifying);
    this.show('ear-note-control', type === 'notes' && !identifying);
    this.show('ear-scale-control', type === 'scales' && !identifying);
    this.text('ear-context', type === 'chords'
      ? `${displayNote(root)} ${this.settings.minorKey ? 'minor' : 'major'} cadence: ${chordKeyMaterial(root, this.settings.minorKey, this.settings.difficulty).cadence.map(displayNote).join(' → ')}. ${identifying ? 'Only the mystery chord is hidden.' : 'The selected chord follows the cadence.'}`
      : `${displayNote(root)} is home. Hear this tonic first, followed by ${type === 'notes' ? 'one note above it' : 'a full root-to-octave scale'}. ${identifying ? type === 'scales' ? 'All 12 scale/mode patterns are in the mystery pool.' : 'The mystery pool spans unison through octave.' : ''}`);
    this.text('quiz-prompt-text', this.activity === 'hear' ? 'Listen to your selected target'
      : identifying ? 'Listen, compare, then choose' : 'Listen first. Then play it back.');
    const presentation = this.exercise && exercisePresentation(this.exercise, this.activity, this.answered);
    this.text('quiz-target-chord-name', presentation?.title ?? 'Target unavailable');
    const hidden = identifying && !this.answered;
    this.text('quiz-target-notes', hidden ? (type === 'notes' ? 'Which note and interval followed the tonic?' : type === 'scales' ? 'Which scale or mode followed the tonic?' : 'Which chord followed the key cadence?')
      : type === 'scales' ? 'One complete ascending octave, including the final tonic.'
        : type === 'notes' ? 'Match this sounding pitch, including its octave.' : 'A complete chord voicing in your current tuning.');
    this.button('btn-play-cadence').textContent = type === 'chords' ? hidden ? 'Hear cadence + mystery' : 'Hear cadence + chord' : hidden ? 'Hear tonic + mystery' : 'Hear tonic + target';
    this.button('btn-quiz-replay').textContent = type === 'chords' ? 'Hear chord only' : 'Hear again with tonic';
    this.show('quiz-choices-grid', identifying);
    this.show('btn-quiz-skip', identifying);
    this.show('btn-quiz-mic', this.activity === 'play-back');
    this.element('quiz-choices-grid').innerHTML = identifying && this.exercise
      ? this.exercise.choices.map((choice, index) => `<button type="button" class="ear-choice" id="quiz-choice-${index}">${escapeHTML(choice.label)}</button>`).join('') : '';
    if (identifying && this.exercise) this.exercise.choices.forEach((choice, index) => {
      this.button(`quiz-choice-${index}`).onclick = () => this.handleChoice(choice.id, index);
    });
    const guide = this.element('ear-playing-guide');
    guide.replaceChildren();
    if (presentation && !hidden) {
      const heading = document.createElement('h4');
      heading.textContent = presentation.frets ? 'Suggested voicing · strings 6 → 1' : 'Sounding pitches · suggested positions';
      guide.append(heading);
      if (presentation.frets) {
        const frets = document.createElement('p');
        frets.className = 'ear-frets';
        frets.textContent = [...presentation.frets].reverse().map(fret => fret === null ? '×' : String(fret)).join('  ·  ');
        guide.append(frets);
      } else {
        const list = document.createElement('ol');
        list.className = 'ear-note-run';
        presentation.notes.forEach((note, index) => {
          const item = document.createElement('li');
          if (this.performance.checking && index === this.performance.progress) item.setAttribute('aria-current', 'step');
          item.textContent = `${pitchName(note.midi)} · string ${note.stringIndex + 1}, fret ${note.fret}`;
          list.append(item);
        });
        guide.append(list);
      }
      const note = document.createElement('p');
      note.className = 'ear-position-note';
      note.textContent = presentation.frets ? '× = mute. Fret numbers are relative to the nut or capo; other voicings of this chord can also match.' : 'Fret numbers are relative to the nut or capo. Other positions at the same pitch can also match.';
      guide.append(note);
    }
    this.show('ear-playing-guide', !!presentation && !hidden);
    this.renderState();
  }

  private renderState(): void {
    if (!this.pane) return;
    const busy = this.audioPending || this.audioPlaying;
    for (const id of ['btn-play-cadence', 'btn-quiz-replay']) this.button(id).disabled = !this.active || !this.exercise || busy || this.practicePending;
    this.button('ear-stop-reference').disabled = !busy;
    this.button('btn-quiz-mic').disabled = !this.active || !this.exercise || busy;
    this.button('btn-quiz-mic').textContent = this.practicePending ? 'Cancel microphone request' : this.lease ? 'Stop checking' : this.answered ? 'Check again with microphone' : 'Check with microphone';
    this.button('btn-quiz-mic').setAttribute('aria-pressed', String(this.performance.checking));
    this.button('btn-quiz-skip').disabled = !this.active;
    this.pane.querySelectorAll<HTMLButtonElement>('.ear-choice').forEach(button => { button.disabled = !this.active || !this.heard || this.answered || busy; });
    this.text('quiz-audio-status', this.audioStatus);
    this.element('quiz-hero-card').setAttribute('aria-busy', String(this.audioPending || this.practicePending));
    this.text('quiz-feedback-pill', this.feedback);
    this.element('quiz-feedback-pill').dataset.state = this.feedbackState;
    this.text('quiz-score', String(this.score));
    this.text('quiz-streak', String(this.streak));
    this.text('quiz-best-streak', String(this.bestStreak));
    this.text('ear-practice-progress', this.performance.checking
      ? `${this.performance.progress} / ${this.performance.total} pitches or chords accepted. ${this.performance.needsRelease ? 'Mute the strings briefly, then play.' : 'Ready for a fresh pluck or strum.'}` : '');
  }

  private cancelPractice(): void {
    this.practiceGeneration++;
    this.practicePending = false;
    this.performance.stop();
    const lease = this.lease;
    this.lease = null;
    lease?.release();
  }

  private schedule(action: () => void, milliseconds: number): void {
    const generation = this.audioGeneration;
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (generation === this.audioGeneration && this.active) action();
    }, milliseconds);
    this.timers.add(id);
  }

  private async audition(includeCadence: boolean): Promise<void> {
    if (!this.active || !this.exercise || this.audioPending || this.audioPlaying || this.practicePending) return;
    this.cancelPractice();
    this.stopAudio();
    this.heard = false;
    this.audioPending = true;
    this.audioStatus = 'Preparing recorded guitar audio…';
    this.feedback = 'Reference playback is not graded. Microphone checking is stopped.';
    this.feedbackState = 'neutral';
    const generation = this.audioGeneration;
    const exercise = this.exercise;
    this.render();
    try {
      const steps = buildEarReference(exercise, this.settings, this.tuning, includeCadence);
      if (!steps) throw new Error('The complete key cadence is unavailable in this tuning. Try “Hear chord only” or another key.');
      await this.onPlayRequested?.();
      if (!this.active || generation !== this.audioGeneration) return;
      const ctx = this.audioContext, bus = this.acousticBus;
      if (!ctx || !bus || ctx.state !== 'running' || !guitarBankReady(ctx, bus.sampleBank)) throw new Error('Recorded guitar is not ready. Try Hear again after the guitar recordings load.');
      this.audioPending = false;
      this.audioPlaying = true;
      this.audioStatus = exercise.type === 'chords' ? 'Playing recorded guitar reference…' : `Tonic ${displayNote(exercise.tonic)} first, then the ${exercise.type === 'notes' ? 'note' : 'scale'}…`;
      const start = ctx.currentTime + .025;
      for (const step of steps) {
        [...step.notes].sort((a, b) => b.stringIndex - a.stringIndex).forEach((note, index) => {
          const source = playAcousticString(ctx, bus, {
            freq: 440 * 2 ** ((note.midi - 69) / 12), stringIndex: note.stringIndex, velocity: .82,
            startTime: start + step.offset + index * .022, endTime: start + step.offset + step.duration,
          });
          this.sources.add(source);
          source.addEventListener('ended', () => this.sources.delete(source), { once: true });
        });
      }
      const last = steps[steps.length - 1];
      this.schedule(() => {
        this.audioPlaying = false;
        this.heard = true;
        this.audioStatus = 'Reference finished.';
        this.feedback = this.activity === 'identify' && !this.answered ? 'Choose the sound you heard. Replay if you need another listen.'
          : this.activity === 'play-back' ? 'Now check with the microphone. Mute the reference, then play a fresh pluck or strum.'
            : 'Listen again, or switch to Identify or Play-back with guitar.';
        this.renderState();
      }, (last.offset + last.duration + .2) * 1000);
      this.renderState();
    } catch (error) {
      if (generation !== this.audioGeneration || !this.active) return;
      this.stopAudio();
      this.audioStatus = `Audio unavailable: ${error instanceof Error ? error.message : String(error)}`;
      this.feedback = 'No answer is scored until the reference finishes. Resolve the audio issue, then try Hear again.';
      this.feedbackState = 'error';
      this.renderState();
    }
  }

  playCadenceAndStartQuiz(): void { void this.audition(true); }
  replayMysteryChord(): void { void this.audition(false); }
  nextQuizChord(): void { this.newExercise(true); }
  skipQuizChord(): void {
    if (!this.answered) this.streak = 0;
    this.newExercise(true);
  }
  setMode(mode: 'ear' | 'strum'): void {
    this.activity = mode === 'ear' ? 'identify' : 'play-back';
    this.newExercise();
  }

  handleChoice(choiceId: string, _buttonIndex?: number): void {
    if (!this.active || this.activity !== 'identify' || !this.exercise || !this.heard || this.answered || this.audioPending || this.audioPlaying) return;
    if (!this.exercise.choices.some(choice => choice.id === choiceId)) return;
    this.answered = true;
    if (answerIsCorrect(this.exercise, choiceId)) {
      this.award();
      this.feedback = `Correct — ${this.exercise.target.label}. Choose Next mystery for another sound.`;
    } else {
      this.streak = 0;
      this.feedbackState = 'error';
      this.feedback = `Not this time. The answer was ${this.exercise.target.label}. Hear it again, then try the next mystery.`;
    }
    this.render();
  }

  private award(): void {
    this.score += 100 + this.streak * 20;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.feedbackState = 'success';
  }

  async toggleMic(): Promise<void> {
    if (this.practicePending || this.lease) {
      this.cancelPractice();
      this.feedback = 'Checking stopped. Any listening that was already active is preserved.';
      this.render();
      return;
    }
    if (!this.active || this.activity !== 'play-back' || !this.exercise || this.audioPending || this.audioPlaying) return;
    if (!this.requestMicrophone) {
      this.feedback = 'Microphone checking is unavailable. You can still hear targets and use Identify.';
      this.feedbackState = 'error';
      this.renderState();
      return;
    }
    this.stopAudio();
    const generation = ++this.practiceGeneration;
    const exercise = this.exercise;
    this.practicePending = true;
    this.feedback = 'Requesting microphone access. If prompted, allow access and keep the strings quiet for calibration.';
    this.feedbackState = 'neutral';
    this.renderState();
    try {
      const lease = await this.requestMicrophone(this.settings.type === 'chords' ? 'chords' : 'notes');
      if (!this.active || generation !== this.practiceGeneration || this.exercise !== exercise) { lease.release(); return; }
      this.lease = lease;
      this.practicePending = false;
      this.answered = false;
      this.performance.start(exercise.target.practice, performance.now());
      this.feedback = this.settings.type === 'scales' ? 'Mute briefly, then play each shown pitch in order, root to octave. Pluck each note separately.'
        : 'Mute briefly, then play the target with a fresh pluck or strum.';
      this.render();
    } catch (error) {
      if (generation !== this.practiceGeneration || !this.active) return;
      this.practicePending = false;
      this.feedback = `Microphone unavailable: ${error instanceof Error ? error.message : String(error)}. Check access, then try again.`;
      this.feedbackState = 'error';
      this.renderState();
    }
  }

  onDetectionResult(result: DetectionResult): void {
    if (!this.active || !this.lease || this.activity !== 'play-back' || this.audioPlaying || this.audioPending || !this.performance.checking) return;
    const outcome = this.performance.consume(result);
    if (outcome === 'complete') {
      this.answered = true;
      this.award();
      this.feedback = `Matched ${this.exercise!.target.label}${this.settings.type === 'scales' ? ' — the complete root-to-octave sequence' : ''}.`;
      this.cancelPractice();
      this.render();
    } else if (outcome === 'step') {
      this.feedback = `Pitch ${this.performance.progress} accepted. Play the next shown pitch with a new pluck.`;
      this.render();
    } else {
      this.renderState();
    }
  }

  /** Raw chord strings intentionally cannot award points; hosts should forward full evidence. */
  onChordDetected(_chord: string): void {}

  onMicrophoneStopped(): void {
    const wasChecking = this.performance.checking || this.practicePending;
    this.cancelPractice();
    if (wasChecking) {
      this.feedback = 'Microphone stopped. Check with the microphone again when ready.';
      this.feedbackState = 'neutral';
    }
    this.render();
  }
}
