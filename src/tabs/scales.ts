/**
 * Western Guitar Scales & 3D Fretboard Studio
 * Complete scale library, 3D rosewood fretboard visualizer,
 * BPM tempo control, scale runs, and live microphone note practice.
 */

import { NOTE_NAMES, STANDARD_TUNING, type DetectionResult, type NoteName, type StringTuning } from '../types';
import { playAcousticString, AcousticBus } from '../audio/engine';
import { PaneNeck3D } from '../ui/paneNeck3d';
import type { ScaleNeckPosition } from '../ui/fretboard3d';
import { isPositionReach, REGISTER_RANGES, type FretboardRegister as ScaleRegister } from '../chords/positions';
import { assessScaleNote, buildScalePracticeRun, buildScaleReferenceLoop, type ScalePracticeMode, type ScalePracticePosition } from '../scales/practice';
import { PerformanceGate } from '../songs/performance';
import { displayNote, SCALE_ROOTS, scaleNoteName, scalePitchName, scaleRootPc, spellScale } from '../scales/theory';
import { buildTwoOctavePattern, HAND_LABELS, orientShiftPattern, type ScaleExerciseRange } from '../scales/shiftPattern';

import { WESTERN_SCALES } from '../scales/definitions';
export { WESTERN_SCALES, type ScaleDefinition } from '../scales/definitions';

export class ScalesStudio {
  private activeRoot: NoteName = 'A';
  private activeKey = 'pentatonic_minor';
  private activeLabelMode: 'note' | 'degree' = 'note';
  private activeRegister: ScaleRegister = 'all';
  private exerciseRange: ScaleExerciseRange = 'position';
  private shiftPattern: ScalePracticePosition[] = [];
  private referenceStep: ScalePracticePosition | null = null;
  private patternListKey = '';
  private bpm = 120;
  private isAudioRunning = false;
  private referenceComplete = false;
  private audioRunTimer: number | null = null;
  private tuning: StringTuning[] = STANDARD_TUNING;
  private audioContext: AudioContext | null = null;
  private neck3d: PaneNeck3D | null = null;
  private acousticBus: AcousticBus | null = null;
  private isMicActive = false;
  private active = false;
  private initialized = false;
  private highlightedPosition: { stringIndex: number; fret: number } | null = null;
  private highlightedPc: number | null = null;
  private highlightTimer: number | null = null;
  private runGeneration = 0;
  private pickGeneration = 0;
  private micGeneration = 0;
  private practiceMode: ScalePracticeMode = 'free';
  private practiceRun: ScalePracticePosition[] = [];
  private practiceIndex = 0;
  private practiceGate = new PerformanceGate();
  private lastAcceptedPerformance = 0;
  private practiceMessage = 'Start Check my playing, allow the microphone, then pluck one string at a time.';
  private practiceVerdict: 'neutral' | 'correct' | 'wrong' = 'neutral';
  private heardLabel = '—';
  private playbackSources = new Set<AudioBufferSourceNode>();
  private auditionUntil = 0;
  private auditionPending = false;
  private lastHeardMidi: number | null = null;
  public onPlayRequested?: () => Promise<void>;
  public onMicStartRequested?: () => Promise<boolean>;

  constructor() {
    window.addEventListener('pagehide', () => { this.stopScaleAudioRun(); this.setMicPracticeActive(false); });
  }

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[]): void {
    // Capo tuning carries transposed MIDI but retains the physical string name.
    this.tuning = tuning.map(string => ({ ...string, note: NOTE_NAMES[string.midi % 12] }));
    if (this.initialized) this.refreshPattern();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.stopScaleAudioRun();
      this.setMicPracticeActive(false);
    }
    this.neck3d?.setActive(active);
  }

  init(): void {
    this.initRootButtons();
    this.initControls();
    this.setupNeck3D();
    this.initialized = true;
    this.neck3d?.setActive(this.active);
    this.updateInfoRibbon();
    if (!this.practiceRun.length) this.resetPractice();
    this.renderFretboard();
    this.renderPractice();
  }

  private setupNeck3D(): void {
    const host = document.getElementById('scale-neck-3d');
    if (!host || this.neck3d) return;
    this.neck3d = new PaneNeck3D(
      host,
      {
        toggle3d: document.getElementById('scale-neck-view-3d'),
        toggle2d: document.getElementById('scale-neck-view-2d'),
        twoD: document.getElementById('scale-neck-2d'),
        camera: document.getElementById('scale-neck-camera'),
        zoomIn: document.getElementById('scale-neck-zoom-in'),
        zoomOut: document.getElementById('scale-neck-zoom-out'),
        reset: document.getElementById('scale-neck-reset'),
        help: document.getElementById('scale-neck-help'),
      },
      (s, f) => { void this.pluckNote(s, f); },
      {
        defaultMode: '3d', preferenceKey: 'gcs-scale-neck-view',
        help2d: 'Scroll the neck · Tab to a fret, then Enter to play',
      },
    );
  }

  private updateNeck3D(positions: ScaleNeckPosition[]): void {
    this.neck3d?.update({
      frets: [null, null, null, null, null, null],
      tuning: this.tuning,
      stringLabels: this.tuning.map(string => this.noteName(string.midi)),
      liveMidi: null,
      root: this.activeRoot,
      scalePositions: positions,
    });
    const [minFret, maxFret] = REGISTER_RANGES[this.activeRegister];
    const caption = document.getElementById('scale-neck-caption');
    if (caption) caption.textContent = `${displayNote(this.activeRoot)} ${WESTERN_SCALES[this.activeKey].name} · ${this.exerciseRange === 'two-octaves' ? 'Two-octave shift pattern' : `Preferred frets ${minFret}–${maxFret}`}`;
    const tuning = [...this.tuning].reverse().map(s => this.noteName(s.midi)).join(' · ');
    for (const id of ['scale-neck-tuning', 'scale-tuning-label']) {
      const label = document.getElementById(id);
      if (label) label.textContent = tuning;
    }
    const blueLegend = document.getElementById('scale-blue-legend');
    if (blueLegend) blueLegend.hidden = this.activeKey !== 'blues';
  }

  private initRootButtons(): void {
    const container = document.getElementById('scale-root-buttons');
    if (!container || container.children.length > 0) return;

    container.innerHTML = '';
    SCALE_ROOTS.forEach(note => {
      const btn = document.createElement('button');
      btn.className = 'scale-root-btn' + (note === this.activeRoot ? ' active' : '');
      btn.id = 'scale-root-btn-' + note.replace('#', 's');
      btn.textContent = displayNote(note);
      btn.dataset.root = note;
      btn.setAttribute('aria-pressed', String(note === this.activeRoot));
      btn.onclick = () => this.setRoot(note);
      container.appendChild(btn);
    });
  }

  private initControls(): void {
    const presetSelect = document.getElementById('scale-preset-select') as HTMLSelectElement;
    if (presetSelect) {
      presetSelect.value = this.activeKey;
      presetSelect.onchange = () => this.setScaleKey(presetSelect.value);
    }

    const filterSelect = document.getElementById('scale-position-filter') as HTMLSelectElement;
    if (filterSelect) {
      filterSelect.value = this.activeRegister;
      filterSelect.onchange = () => {
        const register = filterSelect.value;
        if (register === 'all' || register === 'open' || register === 'middle' || register === 'upper') this.setRegister(register);
      };
    }
    const rangeSelect = document.getElementById('scale-exercise-range') as HTMLSelectElement;
    rangeSelect.value = this.exerciseRange;
    rangeSelect.onchange = () => {
      if (rangeSelect.value === 'position' || rangeSelect.value === 'two-octaves') this.setExerciseRange(rangeSelect.value);
    };

    const noteBtn = document.getElementById('scale-mode-note');
    const degBtn = document.getElementById('scale-mode-degree');
    if (noteBtn) noteBtn.onclick = () => this.setLabelMode('note');
    if (degBtn) degBtn.onclick = () => this.setLabelMode('degree');

    const tempoSlider = document.getElementById('scale-tempo-slider') as HTMLInputElement;
    if (tempoSlider) {
      tempoSlider.value = String(this.bpm);
      tempoSlider.oninput = (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.setBpm(val);
      };
    }

    const runBtn = document.getElementById('btn-scale-run');
    if (runBtn) {
      runBtn.onclick = () => this.toggleScaleAudioRun();
    }

    const micBtn = document.getElementById('btn-scale-mic');
    if (micBtn) {
      micBtn.onclick = () => this.toggleMicPractice();
    }
    const practice = document.getElementById('scale-practice-mode') as HTMLSelectElement;
    practice.value = this.practiceMode;
    practice.onchange = () => {
      if (practice.value === 'free' || practice.value === 'ascending' || practice.value === 'descending') this.setPracticeMode(practice.value);
    };
    document.getElementById('scale-practice-restart')!.onclick = () => { this.stopScaleAudioRun(); this.resetPractice(); };
  }

  setRoot(root: NoteName): void {
    this.activeRoot = root;
    document.querySelectorAll('.scale-root-btn').forEach(b => {
      const selected = (b as HTMLElement).dataset.root === root;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    this.updateInfoRibbon();
    this.refreshPattern();
  }

  setScaleKey(key: string): void {
    if (WESTERN_SCALES[key]) {
      this.activeKey = key;
      const select = document.getElementById('scale-preset-select') as HTMLSelectElement | null;
      if (select) select.value = key;
      this.updateInfoRibbon();
      this.refreshPattern();
    }
  }

  setLabelMode(mode: 'note' | 'degree'): void {
    this.activeLabelMode = mode;
    const noteBtn = document.getElementById('scale-mode-note');
    const degBtn = document.getElementById('scale-mode-degree');
    if (noteBtn) noteBtn.classList.toggle('active', mode === 'note');
    if (degBtn) degBtn.classList.toggle('active', mode === 'degree');
    noteBtn?.setAttribute('aria-pressed', String(mode === 'note'));
    degBtn?.setAttribute('aria-pressed', String(mode === 'degree'));
    this.renderFretboard();
  }

  setRegister(reg: ScaleRegister): void {
    this.activeRegister = reg;
    const select = document.getElementById('scale-position-filter') as HTMLSelectElement | null;
    if (select) select.value = reg;
    this.refreshPattern();
  }

  setExerciseRange(range: ScaleExerciseRange): void {
    this.exerciseRange = range;
    const select = document.getElementById('scale-exercise-range') as HTMLSelectElement | null;
    if (select) select.value = range;
    this.refreshPattern();
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
    const readout = document.getElementById('scale-tempo-readout');
    if (readout) readout.textContent = `${this.bpm} BPM`;

    if (this.isAudioRunning) {
      this.stopScaleAudioRun();
      void this.startScaleAudioRun();
    }
  }

  updateInfoRibbon(): void {
    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const scaleNotes = spellScale(this.activeRoot, scale);

    const titleEl = document.getElementById('scale-ribbon-title');
    const formEl = document.getElementById('scale-ribbon-formula');
    const notesEl = document.getElementById('scale-ribbon-notes');

    if (titleEl) titleEl.textContent = `${displayNote(this.activeRoot)} ${scale.name}`;
    if (formEl) formEl.textContent = `(${scale.formula})`;
    if (notesEl) notesEl.textContent = [...scaleNotes, scaleNotes[0]].join(' • ');
  }

  renderFretboard(): void {
    const container = document.getElementById('scale-fretboard-strings-rows');
    if (!container) return;
    // Keep native buttons stable while notes flash so keyboard focus is retained.
    if (container.children.length === 0) {
      for (let s = 0; s < 6; s++) {
        const row = document.createElement('div');
        row.className = 'guitar-string-row';
        row.id = `scale-string-row-${s}`;
        row.innerHTML = `<div class="string-header"><span>${s + 1}</span><span data-scale-string="${s}"></span></div>`;
        const cells = document.createElement('div');
        cells.className = 'fret-cells-container';
        cells.innerHTML = `<div class="string-wire ${this.tuning[s].gaugeClass}" id="scale-string-wire-${s}"></div>`;
        for (let f = 0; f <= 12; f++) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'fret-cell';
          cell.id = `scale-fret-cell-${s}-${f}`;
          cell.onclick = () => { void this.pluckNote(s, f); };
          cells.appendChild(cell);
        }
        row.appendChild(cells);
        container.appendChild(row);
      }
    }

    const positions = this.scalePositions();
    for (let s = 0; s < 6; s++) {
      container.querySelector(`[data-scale-string="${s}"]`)!.textContent = this.noteName(this.tuning[s].midi);
      document.getElementById(`scale-string-wire-${s}`)?.classList.toggle('vibrating', this.highlightedPosition?.stringIndex === s);
      for (let f = 0; f <= 12; f++) {
        const cell = document.getElementById(`scale-fret-cell-${s}-${f}`)!;
        const midi = this.tuning[s].midi + f;
        const position = positions.find(p => p.stringIndex === s && p.fret === f);
        const degree = this.degreeAt(midi);
        cell.setAttribute('aria-label', `${this.pitchName(midi)}, string ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`}, ${degree ? `degree ${degree}` : 'outside scale'}${position?.active ? ', playing' : ''}`);
        cell.classList.toggle('live-note', !!position?.active);
        cell.replaceChildren();
        if (position) {
          const dot = document.createElement('span');
          dot.className = `scale-dot ${position.role}${position.active ? ' active-pluck' : ''}`;
          if (position.target) dot.classList.add('practice-target');
          dot.id = `scale-dot-${s}-${f}`;
          dot.textContent = position.label;
          dot.dataset.pc = String(midi % 12);
          cell.appendChild(dot);
        }
      }
    }
    this.updateNeck3D(positions);
    this.renderShiftGuide();
  }

  private degreeAt(midi: number): string | undefined {
    const scale = WESTERN_SCALES[this.activeKey];
    const interval = (midi - scaleRootPc(this.activeRoot) + 120) % 12;
    return scale.degrees[scale.intervals.indexOf(interval)];
  }

  private noteName(midi: number): string {
    return scaleNoteName(midi % 12, this.activeRoot, WESTERN_SCALES[this.activeKey]);
  }

  private pitchName(midi: number): string {
    return scalePitchName(midi, this.activeRoot, WESTERN_SCALES[this.activeKey]);
  }

  private scalePositions(includeHighlight = true): ScaleNeckPosition[] {
    const positions: ScaleNeckPosition[] = [];
    const rootPc = scaleRootPc(this.activeRoot);
    const [min, max] = REGISTER_RANGES[this.activeRegister];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= 12; f++) {
        const midi = this.tuning[s].midi + f;
        const pc = midi % 12;
        const degree = this.degreeAt(midi);
        const inPattern = !!degree && (this.exerciseRange === 'two-octaves'
          ? this.shiftPattern.some(step => step.stringIndex === s && step.fret === f)
          : f >= min && f <= max);
        const next = this.practiceMode === 'free' ? undefined : this.practiceRun[this.practiceIndex];
        const target = next?.stringIndex === s && next.fret === f;
        const active = includeHighlight && ((this.highlightedPosition?.stringIndex === s && this.highlightedPosition.fret === f)
          || ((inPattern || this.exerciseRange === 'position' && !!degree && isPositionReach(f, this.activeRegister)) && pc === this.highlightedPc));
        if (!inPattern && !active && !target) continue;
        positions.push({
          stringIndex: s, fret: f,
          label: this.activeLabelMode === 'degree' && degree ? degree : this.noteName(midi),
          role: !degree ? 'outside' : pc === rootPc ? 'root'
            : this.activeKey === 'blues' && (pc - rootPc + 12) % 12 === 6 ? 'blue' : 'tone',
          active,
          ...(target ? { target: true } : {}),
        });
      }
    }
    return positions;
  }

  private refreshPattern(): void {
    const resume = this.isAudioRunning;
    this.stopScaleAudioRun();
    this.resetPractice();
    if (!this.initialized) this.renderFretboard();
    if (resume) void this.startScaleAudioRun();
  }

  private status(message: string): void {
    const summary = document.getElementById('scale-neck-summary');
    if (summary) summary.textContent = message;
  }

  private clearHighlight(render = true): void {
    if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
    this.highlightTimer = null;
    this.highlightedPosition = null;
    this.highlightedPc = null;
    this.lastHeardMidi = null;
    if (render) {
      if (this.initialized) this.renderFretboard();
      this.status(this.referenceComplete ? `${displayNote(this.activeRoot)}-to-${displayNote(this.activeRoot)} scale complete. Play the scale again to repeat.` : 'Choose a note to hear it, or play the selected scale run.');
    }
  }

  private expireHighlight(ms: number): void {
    this.highlightTimer = window.setTimeout(() => this.clearHighlight(), ms);
  }

  private async readyAudio(): Promise<boolean> {
    try {
      if (this.onPlayRequested) await this.onPlayRequested();
      if (!this.audioContext || !this.acousticBus) throw new Error('Scale audio is not initialized');
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      return true;
    } catch (error) {
      console.error('Scale playback unavailable:', error);
      this.status('Audio could not start. Try again or check your browser audio settings.');
      return false;
    }
  }

  async pluckNote(s: number, f: number): Promise<void> {
    const generation = ++this.pickGeneration;
    this.auditionPending = true;
    this.practiceGate.requireRelease();
    try {
      if (!await this.readyAudio() || generation !== this.pickGeneration || !this.active) return;
      this.referenceStep = null;
      this.playPosition(s, f);
    } finally {
      if (generation === this.pickGeneration) this.auditionPending = false;
    }
  }

  private playPosition(s: number, f: number, duration?: number): void {
    if (!this.audioContext || !this.acousticBus) return;
    const midi = this.tuning[s].midi + f;
    const startTime = this.audioContext.currentTime + 0.005;
    const endTime = duration === undefined ? undefined : startTime + duration;
    const source = playAcousticString(this.audioContext, this.acousticBus, {
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      startTime, endTime,
      stringIndex: s, velocity: 0.95,
    });
    this.playbackSources.add(source);
    source.addEventListener('ended', () => this.playbackSources.delete(source), { once: true });
    this.auditionUntil = (endTime ?? startTime + (source.buffer?.duration ?? 3.2)) + 0.25;
    this.practiceGate.requireRelease();
    if (this.isMicActive) this.practiceFeedback('Reference sound is playing; checking is paused. Let it finish, stay quiet briefly, then play your guitar.');
    this.clearHighlight(false);
    this.highlightedPosition = { stringIndex: s, fret: f };
    this.renderFretboard();
    const degree = this.degreeAt(midi);
    const [min, max] = REGISTER_RANGES[this.activeRegister];
    const positionInfo = this.exerciseRange === 'two-octaves'
      ? this.referenceStep?.handPosition
        ? ` · ${this.referenceStep.shift ? `Shift ${this.referenceStep.shift} to ` : ''}${HAND_LABELS[this.referenceStep.handPosition]}${this.referenceStep.reach ? ' · One-fret reach' : ''}`
        : this.shiftPattern.some(step => step.stringIndex === s && step.fret === f) ? ' · Pattern position' : ' · Free exploration outside the planned fingering'
      : isPositionReach(f, this.activeRegister) ? ' · One-fret reach outside preferred area' : f < min || f > max ? ' · Outside selected register' : '';
    this.status(`${this.pitchName(midi)} · String ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`} · ${degree ? `Degree ${degree}` : 'Outside this scale'}${positionInfo}`);
    this.expireHighlight(350);
  }

  toggleScaleAudioRun(): void {
    if (this.isAudioRunning) {
      this.stopScaleAudioRun();
    } else {
      void this.startScaleAudioRun();
    }
  }

  private renderRunControls(): void {
    const icon = document.getElementById('btn-scale-run-icon');
    const text = document.getElementById('btn-scale-run-text');
    const help = document.getElementById('scale-run-help');
    if (icon) icon.textContent = this.isAudioRunning ? '⏹️' : '▶️';
    if (text) text.textContent = this.isAudioRunning ? 'Stop scale' : this.practiceMode === 'free' ? 'Play up/down loop' : 'Play scale once';
    if (help) help.textContent = this.practiceMode === 'free'
      ? this.exerciseRange === 'two-octaves' ? 'Two octaves up, then back along the same pattern. Marked hand shifts; repeats until Stop.' : 'Root → highest reachable root → starting root. Repeats until Stop.'
      : `${this.exerciseRange === 'two-octaves' ? 'Two complete root-to-root octaves' : 'One complete root-to-root octave'} in the guided direction, then stops.`;
  }

  async startScaleAudioRun(): Promise<void> {
    this.stopScaleAudioRun();
    if (!this.active) return;
    const looping = this.practiceMode === 'free';
    const notesToPlay = this.exerciseRange === 'two-octaves'
      ? orientShiftPattern(this.shiftPattern, looping ? 'loop' : this.practiceMode === 'descending' ? 'descending' : 'ascending')
      : looping ? buildScaleReferenceLoop(this.activeRoot, WESTERN_SCALES[this.activeKey].intervals, this.tuning, this.activeRegister, true)
        : buildScalePracticeRun(this.activeRoot, WESTERN_SCALES[this.activeKey].intervals, this.tuning, this.activeRegister, this.practiceMode === 'descending', true);
    if (!notesToPlay.length) {
      const message = this.exerciseRange === 'two-octaves'
        ? 'Two complete octaves cannot start in this area within frets 0–12. Choose a lower starting position or Automatic start; no notes were changed.'
        : `No complete ${displayNote(this.activeRoot)}-to-${displayNote(this.activeRoot)} run fits this position, including adjacent reaches. Choose Full neck or another position.`;
      this.status(message);
      this.practiceFeedback(message);
      return;
    }
    this.isAudioRunning = true;
    const generation = ++this.runGeneration;
    this.renderRunControls();
    this.practiceGate.requireRelease();
    if (!await this.readyAudio()) {
      if (generation === this.runGeneration) {
        this.stopScaleAudioRun();
        this.status('Audio could not start. Try again or check your browser audio settings.');
      }
      return;
    }
    if (generation !== this.runGeneration || !this.isAudioRunning || !this.active) return;

    let currentIdx = 0;
    const stepInterval = (60 / this.bpm) * 1000;

    const playStep = () => {
      if (!this.isAudioRunning || generation !== this.runGeneration) return;
      this.audioRunTimer = null;

      if (currentIdx >= notesToPlay.length) {
        if (looping) {
          // The final note already is the starting tonic; don't strike it twice.
          currentIdx = 1;
        } else {
          this.isAudioRunning = false;
          this.referenceComplete = true;
          this.renderRunControls();
          this.renderShiftGuide();
          this.status(`${displayNote(this.activeRoot)}-to-${displayNote(this.activeRoot)} scale complete. Play the scale again to repeat.`);
          return;
        }
      }

      const note = notesToPlay[currentIdx];
      this.referenceStep = note;
      this.playPosition(note.stringIndex, note.fret, stepInterval / 1000);
      currentIdx++;

      this.audioRunTimer = window.setTimeout(playStep, stepInterval);
    };

    playStep();
  }

  stopScaleAudioRun(): void {
    this.isAudioRunning = false;
    this.referenceComplete = false;
    this.referenceStep = null;
    this.runGeneration++;
    this.pickGeneration++;
    this.auditionPending = false;
    if (this.playbackSources.size) {
      this.playbackSources.forEach(source => source.stop());
      this.playbackSources.clear();
      this.auditionUntil = (this.audioContext?.currentTime ?? 0) + 0.25;
      this.practiceGate.requireRelease();
    }
    if (this.audioRunTimer !== null) {
      clearTimeout(this.audioRunTimer);
      this.audioRunTimer = null;
    }

    this.renderRunControls();
    this.clearHighlight();
  }

  async toggleMicPractice(): Promise<void> {
    if (this.isMicActive) {
      this.setMicPracticeActive(false);
      return;
    }
    this.stopScaleAudioRun();
    const generation = ++this.micGeneration;
    const button = document.getElementById('btn-scale-mic') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    this.practiceFeedback('Waiting for microphone permission. Allow access to check your playing.');
    try {
      if (!this.onMicStartRequested) throw new Error('Scale microphone is not connected');
      const started = await this.onMicStartRequested();
      if (generation !== this.micGeneration || !this.active) return;
      this.setMicPracticeActive(started);
      if (!started) {
        this.status('Microphone unavailable. Allow access and try Check my playing again.');
        this.practiceFeedback('Microphone unavailable. Allow access in the browser and try Check my playing again.');
      }
    } catch (error) {
      console.error('Scale microphone unavailable:', error);
      this.setMicPracticeActive(false);
      this.status('Microphone unavailable. Allow access and try Check my playing again.');
      this.practiceFeedback('Microphone unavailable. Check browser permission and retry.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  setMicPracticeActive(active: boolean): void {
    this.isMicActive = active;
    this.micGeneration++;
    this.practiceGate.requireRelease();
    this.setPracticeTarget();
    this.heardLabel = '—';
    this.lastHeardMidi = null;
    if (!active && this.highlightedPc !== null) this.clearHighlight();
    const micDot = document.getElementById('scale-mic-dot');
    const micStatus = document.getElementById('scale-mic-status');
    const micText = document.getElementById('btn-scale-mic-text');
    document.getElementById('btn-scale-mic')?.setAttribute('aria-pressed', String(active));

    if (this.isMicActive) {
      if (micDot) micDot.textContent = '🟢';
      if (micStatus) micStatus.textContent = 'Live Guitar Mic Active';
      if (micText) micText.textContent = 'Stop Mic Practice';
      this.practiceFeedback('Listening. Stay quiet briefly, then pluck a note on your guitar.');
    } else {
      if (micDot) micDot.textContent = '⚪';
      if (micStatus) micStatus.textContent = 'Mic Idle';
      if (micText) micText.textContent = 'Check my playing';
      this.practiceFeedback('Microphone checking is off. Start Check my playing to continue.');
    }
  }

  setPracticeMode(mode: ScalePracticeMode): void {
    this.stopScaleAudioRun();
    this.practiceMode = mode;
    const select = document.getElementById('scale-practice-mode') as HTMLSelectElement | null;
    if (select) select.value = mode;
    this.resetPractice();
  }

  private resetPractice(): void {
    this.practiceIndex = 0;
    this.shiftPattern = this.exerciseRange === 'two-octaves'
      ? buildTwoOctavePattern(this.activeRoot, WESTERN_SCALES[this.activeKey].intervals, this.tuning, this.activeRegister) : [];
    this.practiceRun = this.exerciseRange === 'two-octaves'
      ? orientShiftPattern(this.shiftPattern, this.practiceMode === 'descending' ? 'descending' : 'ascending')
      : buildScalePracticeRun(this.activeRoot, WESTERN_SCALES[this.activeKey].intervals, this.tuning, this.activeRegister, this.practiceMode === 'descending', true);
    this.practiceGate = new PerformanceGate();
    this.lastAcceptedPerformance = 0;
    this.lastHeardMidi = null;
    this.heardLabel = '—';
    this.setPracticeTarget();
    this.practiceFeedback(this.isMicActive ? 'Ready. Stay quiet briefly, then play a new note.' : 'Start Check my playing to hear and check your guitar.');
    if (this.initialized) this.renderFretboard();
  }

  private setPracticeTarget(): void {
    const target = this.practiceRun[this.practiceIndex];
    this.practiceGate.setTarget(target && this.practiceMode !== 'free' ? { type: 'note', midi: target.midi } : { type: 'rest' }, Date.now());
  }

  private practiceFeedback(text: string, verdict: 'neutral' | 'correct' | 'wrong' = 'neutral'): void {
    this.practiceMessage = text;
    this.practiceVerdict = verdict;
    this.renderPractice();
  }

  private renderShiftGuide(): void {
    const panel = document.getElementById('scale-shift-guide');
    if (!panel) return;
    const twoOctaves = this.exerciseRange === 'two-octaves';
    panel.hidden = !twoOctaves;
    document.getElementById('scale-position-label')!.textContent = twoOctaves ? 'Starting position' : 'Playing position';
    const automatic = document.querySelector<HTMLOptionElement>('#scale-position-filter option[value="all"]');
    if (automatic) automatic.textContent = twoOctaves ? 'Automatic start' : 'Full neck (frets 0–12)';
    document.getElementById('scale-position-help')!.textContent = twoOctaves
      ? 'Where the ascending pattern starts. Later notes may shift across frets 0–12; descending follows the same route in reverse.'
      : 'Middle/Upper allow a labeled one-fret reach when needed, within frets 0–12.';
    if (!twoOctaves) return;

    const first = this.shiftPattern[0], last = this.shiftPattern.at(-1);
    document.getElementById('scale-pattern-status')!.textContent = first && last
      ? `${this.pitchName(first.midi)} → ${this.pitchName(last.midi)} · two octaves. Follow the pattern upward; reverse the same fingerings to return.`
      : 'No complete two-octave pattern fits this starting area within frets 0–12. Choose a lower position or Automatic start.';
    const step = this.isAudioRunning ? this.referenceStep ?? (this.practiceMode === 'descending' ? last : first)
      : this.practiceMode === 'free' ? first : this.practiceRun[this.practiceIndex];
    const cue = step?.handPosition
      ? `${this.isAudioRunning ? 'Now' : this.practiceMode === 'free' ? 'Start' : 'Next target'}: ${step.shift ? `shift ${step.shift} to ` : ''}${HAND_LABELS[step.handPosition]}${step.reach ? ` · reach to fret ${step.fret}` : ''}`
      : first ? 'Pattern complete. Restart the run to practise again.' : 'Pattern unavailable for this start.';
    const cueElement = document.getElementById('scale-shift-cue')!;
    if (cueElement.textContent !== cue) cueElement.textContent = cue;

    const list = document.getElementById('scale-pattern-steps')!;
    const key = JSON.stringify([this.activeRoot, this.activeKey, this.shiftPattern]);
    if (key !== this.patternListKey) {
      this.patternListKey = key;
      list.replaceChildren();
      this.shiftPattern.forEach((position, index) => {
        const item = document.createElement('li');
        item.dataset.index = String(index);
        item.textContent = `${this.pitchName(position.midi)} · string ${position.stringIndex + 1}, fret ${position.fret}`
          + (position.handPosition ? ` · ${position.shift ? 'Shift up: ' : ''}${HAND_LABELS[position.handPosition]}` : '')
          + (position.reach ? ' · reach' : '');
        list.append(item);
      });
    }
    const activeIndex = step ? this.shiftPattern.findIndex(p => p.midi === step.midi && p.stringIndex === step.stringIndex && p.fret === step.fret) : -1;
    list.querySelectorAll('li').forEach((item, index) => {
      if (index === activeIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  private renderPractice(): void {
    this.renderRunControls();
    this.renderShiftGuide();
    const panel = document.getElementById('scale-practice-feedback');
    if (!panel) return;
    panel.dataset.verdict = this.practiceVerdict;
    document.getElementById('scale-practice-message')!.textContent = this.practiceMessage;
    document.getElementById('scale-practice-heard')!.textContent = this.heardLabel;
    document.getElementById('scale-practice-selected')!.textContent = `${displayNote(this.activeRoot)} ${WESTERN_SCALES[this.activeKey].name}`;
    const guided = this.practiceMode !== 'free';
    const target = this.practiceRun[this.practiceIndex];
    const targetText = document.getElementById('scale-practice-target')!;
    targetText.textContent = !guided ? 'Free play: any note from the selected scale, in any order.'
      : !this.practiceRun.length ? `No complete ${this.exerciseRange === 'two-octaves' ? 'two-octave' : 'one-octave'} run fits this starting position/tuning. Choose another position.`
      : !target ? `Complete: ${this.practiceRun.length}/${this.practiceRun.length} notes. Restart for another run.`
      : `Play ${this.pitchName(target.midi)} · suggested string ${target.stringIndex + 1}, fret ${target.fret}${target.reach ? ' (one-fret reach)' : ''}${target.shift && target.handPosition ? ` · Shift ${target.shift} to ${HAND_LABELS[target.handPosition]}` : ''} · ${this.practiceIndex}/${this.practiceRun.length} correct`;
    (document.getElementById('scale-practice-restart') as HTMLButtonElement).disabled = !guided;
  }

  onDetectionResult(result: DetectionResult): void {
    if (!this.isMicActive || !this.active) return;
    if (this.isAudioRunning || this.auditionPending || (this.audioContext && this.audioContext.currentTime < this.auditionUntil)) {
      this.practiceGate.requireRelease();
      this.practiceFeedback('Reference sound is playing; checking is paused. Let it finish, stay quiet briefly, then play your guitar.');
      return;
    }
    if (result.isCalibrating || result.calibrationComplete) {
      this.practiceGate.requireRelease();
      this.practiceFeedback(result.isCalibrating ? 'Calibrating room noise. Stay quiet.' : 'Calibration finished. Stay quiet briefly, then pluck your guitar.');
      return;
    }
    const matched = this.practiceGate.consume(result);
    const assessment = assessScaleNote(result, this.activeRoot, WESTERN_SCALES[this.activeKey].intervals, this.tuning,
      this.exerciseRange === 'two-octaves' ? 'all' : this.activeRegister, true);
    const note = assessment ? { ...assessment, name: this.pitchName(assessment.midi) } : null;
    if (!note) {
      const hadHighlight = this.lastHeardMidi !== null || this.highlightedPc !== null;
      this.clearHighlight(false);
      this.lastHeardMidi = null;
      if (hadHighlight) this.renderFretboard();
      if (result.freshness === 'held' && result.note) {
        this.heardLabel = `${this.pitchName(result.note.pitch.midi)} (last heard, held)`;
        this.practiceFeedback('Last note is held—not a new correct answer. Pluck again to check.');
      } else {
        this.heardLabel = '—';
        this.practiceFeedback(result.performance?.signalPresent ? 'Pitch unclear. Pluck one string cleanly and let it ring.' : 'Listening for your next note.');
      }
      return;
    }
    this.heardLabel = note.name;
    if (this.practiceGate.needsRelease) {
      this.practiceFeedback('Mute the strings briefly, then pluck again to begin checking. Reference audio is never scored.');
      return;
    }
    const needsRender = this.lastHeardMidi !== note.midi || matched;
    const pc = note.pc;
    this.clearHighlight(false);
    if (note.inScale) this.highlightedPc = pc;
    const target = this.practiceRun[this.practiceIndex];
    if (this.practiceMode === 'free') {
      this.practiceFeedback(note.inScale
        ? `Correct: ${note.name} is in this scale (degree ${WESTERN_SCALES[this.activeKey].degrees[note.degreeIndex]}).${this.exerciseRange === 'two-octaves' && !this.shiftPattern.some(step => step.midi === note.midi) ? ' This octave is outside the selected two-octave pattern.' : note.needsReach ? ' This pitch needs a one-fret reach in this position.' : note.inRegister ? '' : ' This pitch has no location in the selected register.'}`
        : `Outside this scale: ${note.name}. Try ${spellScale(this.activeRoot, WESTERN_SCALES[this.activeKey]).join(', ')}.`, note.inScale ? 'correct' : 'wrong');
    } else if (matched) {
      this.lastAcceptedPerformance = result.performance?.id ?? 0;
      this.practiceIndex++;
      this.setPracticeTarget();
      this.practiceFeedback(this.practiceIndex === this.practiceRun.length ? `Scale run complete! All ${this.practiceRun.length} target notes matched.` : `Correct: ${note.name}. Pluck the next target with a new attack.`, 'correct');
    } else if (!target) {
      this.practiceFeedback(this.practiceRun.length ? 'Run complete. Choose Restart run to try again.' : 'No complete run available here. Change the register or tuning.');
    } else if (result.performance?.id === this.lastAcceptedPerformance) {
      this.practiceFeedback('Previous note is still ringing. Pluck the next target with a new attack.');
    } else {
      this.practiceFeedback(note.midi === target.midi ? 'Target pitch heard. Stay quiet briefly if needed, then pluck cleanly; two fresh supported frames confirm it.'
        : `${note.name} ${note.inScale ? 'belongs to the scale, but is not the next target' : 'is outside this scale'}. Play ${this.pitchName(target.midi)}.`,
      note.midi === target.midi ? 'neutral' : 'wrong');
    }
    this.lastHeardMidi = note.midi;
    if (needsRender) this.renderFretboard();
    this.status(`Live ${note.name} · Matching scale locations are possibilities, not measured finger placement`);
    this.expireHighlight(600);
  }
}
