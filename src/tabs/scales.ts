/**
 * Western Guitar Scales & 3D Fretboard Studio
 * Complete scale library, 3D rosewood fretboard visualizer,
 * BPM tempo control, scale runs, and live microphone note practice.
 */

import { NOTE_NAMES, STANDARD_TUNING, type NoteName, type StringTuning } from '../types';
import { playAcousticString, AcousticBus } from '../audio/engine';
import { PaneNeck3D } from '../ui/paneNeck3d';
import type { ScaleNeckPosition } from '../ui/fretboard3d';

const REGISTER_RANGES = { all: [0, 12], open: [0, 4], middle: [5, 8], upper: [9, 12] } as const;
type ScaleRegister = keyof typeof REGISTER_RANGES;

export interface ScaleDefinition {
  name: string;
  formula: string;
  intervals: number[]; // semitones from root
  degrees: string[];
  desc: string;
  solos: string;
}

export const WESTERN_SCALES: Record<string, ScaleDefinition> = {
  pentatonic_minor: {
    name: 'Pentatonic Minor',
    formula: '1 - ♭3 - 4 - 5 - ♭7',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', '♭3', '4', '5', '♭7'],
    desc: 'The bedrock foundation of rock, blues, and pop guitar lead playing. Zero dissonance, instant soulful melody across all styles.',
    solos: 'Jimmy Page (Stairway to Heaven), Jimi Hendrix, David Gilmour, Eric Clapton',
  },
  blues: {
    name: 'Blues Scale',
    formula: '1 - ♭3 - 4 - ♭5 - 5 - ♭7',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'],
    desc: 'The pentatonic minor turbocharged with the famous ♭5 "Blue Note". Delivers gritty grit, tension, and classic crying blues grit.',
    solos: 'Stevie Ray Vaughan (Texas Flood), B.B. King (The Thrill Is Gone), Gary Moore',
  },
  pentatonic_major: {
    name: 'Pentatonic Major',
    formula: '1 - 2 - 3 - 5 - 6',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6'],
    desc: 'Uplifting, sweet, and bright singing tones. Widely used in country, Southern rock, and soulful acoustic ballads.',
    solos: 'Dickey Betts (Jessica), Keith Richards, Brad Paisley, John Mayer',
  },
  natural_minor: {
    name: 'Natural Minor (Aeolian)',
    formula: '1 - 2 - ♭3 - 4 - 5 - ♭6 - ♭7',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
    desc: 'Full 7-note minor diatonic mode. Emotional, dark, dramatic, and essential for rock ballads and melodic metal.',
    solos: 'Kirk Hammett (Metallica), Randy Rhoads, Slash, Joe Satriani',
  },
  major: {
    name: 'Major Scale (Ionian)',
    formula: '1 - 2 - 3 - 4 - 5 - 6 - 7',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    desc: 'The master reference of all Western music theory. Bright, resolute, triumphant, and foundational for chord construction.',
    solos: 'Brian May (Queen), Eric Johnson (Cliffs of Dover), Mark Knopfler',
  },
  dorian: {
    name: 'Dorian Mode',
    formula: '1 - 2 - ♭3 - 4 - 5 - 6 - ♭7',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'],
    desc: 'The minor mode with a signature bright Major 6th. The hallmark sound of jazz-funk fusion and Latin rock.',
    solos: 'Carlos Santana (Oye Como Va), Pink Floyd (Breathe), Miles Davis (So What)',
  },
  mixolydian: {
    name: 'Mixolydian Mode',
    formula: '1 - 2 - 3 - 4 - 5 - 6 - ♭7',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'],
    desc: 'Major scale with a bluesy ♭7th degree. Matches dominant 7th chords perfectly for classic rock, jam band, and blues-rock.',
    solos: 'Jerry Garcia (Grateful Dead), Duane Allman, AC/DC, Guns N Roses',
  },
  harmonic_minor: {
    name: 'Harmonic Minor',
    formula: '1 - 2 - ♭3 - 4 - 5 - ♭6 - 7',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'],
    desc: 'Exotic Neo-classical and Spanish flamenco flavor created by the wide augmented 2nd step between ♭6 and Natural 7.',
    solos: 'Yngwie Malmsteen (Black Star), Ritchie Blackmore, Paco de Lucía',
  },
};

export class ScalesStudio {
  private activeRoot: NoteName = 'A';
  private activeKey = 'pentatonic_minor';
  private activeLabelMode: 'note' | 'degree' = 'note';
  private activeRegister: ScaleRegister = 'all';
  private bpm = 120;
  private isAudioRunning = false;
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
    this.renderFretboard();
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
      liveMidi: null,
      root: this.activeRoot,
      scalePositions: positions,
    });
    const [minFret, maxFret] = REGISTER_RANGES[this.activeRegister];
    const caption = document.getElementById('scale-neck-caption');
    if (caption) caption.textContent = `${this.activeRoot} ${WESTERN_SCALES[this.activeKey].name} · Frets ${minFret}–${maxFret}`;
    const tuning = [...this.tuning].reverse().map(s => s.note).join(' · ');
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
    NOTE_NAMES.forEach(note => {
      const btn = document.createElement('button');
      btn.className = 'scale-root-btn' + (note === this.activeRoot ? ' active' : '');
      btn.id = 'scale-root-btn-' + note.replace('#', 's');
      btn.textContent = note;
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
  }

  setRoot(root: NoteName): void {
    this.activeRoot = root;
    document.querySelectorAll('.scale-root-btn').forEach(b => {
      b.classList.toggle('active', b.textContent?.trim() === root);
      b.setAttribute('aria-pressed', String(b.textContent?.trim() === root));
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
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot);
    const scaleNotes = scale.intervals.map(semi => NOTE_NAMES[(rootIdx + semi) % 12]);

    const titleEl = document.getElementById('scale-ribbon-title');
    const formEl = document.getElementById('scale-ribbon-formula');
    const notesEl = document.getElementById('scale-ribbon-notes');

    if (titleEl) titleEl.textContent = `${this.activeRoot} ${scale.name}`;
    if (formEl) formEl.textContent = `(${scale.formula})`;
    if (notesEl) notesEl.textContent = scaleNotes.join(' • ');
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
      container.querySelector(`[data-scale-string="${s}"]`)!.textContent = this.tuning[s].note;
      document.getElementById(`scale-string-wire-${s}`)?.classList.toggle('vibrating', this.highlightedPosition?.stringIndex === s);
      for (let f = 0; f <= 12; f++) {
        const cell = document.getElementById(`scale-fret-cell-${s}-${f}`)!;
        const midi = this.tuning[s].midi + f;
        const note = NOTE_NAMES[midi % 12];
        const position = positions.find(p => p.stringIndex === s && p.fret === f);
        const degree = this.degreeAt(midi);
        cell.setAttribute('aria-label', `${note}${Math.floor(midi / 12) - 1}, string ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`}, ${degree ? `degree ${degree}` : 'outside scale'}${position?.active ? ', playing' : ''}`);
        cell.classList.toggle('live-note', !!position?.active);
        cell.replaceChildren();
        if (position) {
          const dot = document.createElement('span');
          dot.className = `scale-dot ${position.role}${position.active ? ' active-pluck' : ''}`;
          dot.id = `scale-dot-${s}-${f}`;
          dot.textContent = position.label;
          dot.dataset.pc = String(midi % 12);
          cell.appendChild(dot);
        }
      }
    }
    this.updateNeck3D(positions);
  }

  private degreeAt(midi: number): string | undefined {
    const scale = WESTERN_SCALES[this.activeKey];
    const interval = (midi - NOTE_NAMES.indexOf(this.activeRoot) + 120) % 12;
    return scale.degrees[scale.intervals.indexOf(interval)];
  }

  private scalePositions(includeHighlight = true): ScaleNeckPosition[] {
    const positions: ScaleNeckPosition[] = [];
    const rootPc = NOTE_NAMES.indexOf(this.activeRoot);
    const [min, max] = REGISTER_RANGES[this.activeRegister];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= 12; f++) {
        const midi = this.tuning[s].midi + f;
        const pc = midi % 12;
        const degree = this.degreeAt(midi);
        const inPattern = !!degree && f >= min && f <= max;
        const active = includeHighlight && ((this.highlightedPosition?.stringIndex === s && this.highlightedPosition.fret === f)
          || (inPattern && pc === this.highlightedPc));
        if (!inPattern && !active) continue;
        positions.push({
          stringIndex: s, fret: f,
          label: this.activeLabelMode === 'degree' && degree ? degree : NOTE_NAMES[pc],
          role: !degree ? 'outside' : pc === rootPc ? 'root'
            : this.activeKey === 'blues' && (pc - rootPc + 12) % 12 === 6 ? 'blue' : 'tone',
          active,
        });
      }
    }
    return positions;
  }

  private refreshPattern(): void {
    const resume = this.isAudioRunning;
    this.stopScaleAudioRun();
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
    if (render) {
      if (this.initialized) this.renderFretboard();
      this.status('Choose a note to hear it, or play the selected scale run.');
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
    if (!await this.readyAudio() || generation !== this.pickGeneration || !this.active) return;
    this.playPosition(s, f);
  }

  private playPosition(s: number, f: number): void {
    if (!this.audioContext || !this.acousticBus) return;
    const midi = this.tuning[s].midi + f;
    playAcousticString(this.audioContext, this.acousticBus, {
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      startTime: this.audioContext.currentTime + 0.005,
      stringIndex: s, velocity: 0.95,
    });
    this.clearHighlight(false);
    this.highlightedPosition = { stringIndex: s, fret: f };
    this.renderFretboard();
    const degree = this.degreeAt(midi);
    const [min, max] = REGISTER_RANGES[this.activeRegister];
    this.status(`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} · String ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`} · ${degree ? `Degree ${degree}` : 'Outside this scale'}${f < min || f > max ? ' · Outside selected register' : ''}`);
    this.expireHighlight(350);
  }

  toggleScaleAudioRun(): void {
    if (this.isAudioRunning) {
      this.stopScaleAudioRun();
    } else {
      void this.startScaleAudioRun();
    }
  }

  async startScaleAudioRun(): Promise<void> {
    this.stopScaleAudioRun();
    if (!this.active) return;
    this.isAudioRunning = true;
    const generation = ++this.runGeneration;
    const runIcon = document.getElementById('btn-scale-run-icon');
    const runText = document.getElementById('btn-scale-run-text');
    if (runIcon) runIcon.textContent = '⏹️';
    if (runText) runText.textContent = 'Stop Scale Run';
    if (!await this.readyAudio()) {
      if (generation === this.runGeneration) {
        this.stopScaleAudioRun();
        this.status('Audio could not start. Try again or check your browser audio settings.');
      }
      return;
    }
    if (generation !== this.runGeneration || !this.isAudioRunning || !this.active) return;

    // Preserve the pitch-ordered run, including alternate string positions.
    const notesToPlay = this.scalePositions(false).map(p => ({
      s: p.stringIndex, f: p.fret, midi: this.tuning[p.stringIndex].midi + p.fret,
    })).reverse();
    notesToPlay.sort((a, b) => a.midi - b.midi);
    if (notesToPlay.length === 0) {
      this.stopScaleAudioRun();
      return;
    }

    let currentIdx = 0;
    const stepInterval = (60 / this.bpm) * 1000;

    const playStep = () => {
      if (!this.isAudioRunning || generation !== this.runGeneration) return;

      if (currentIdx >= notesToPlay.length) {
        currentIdx = 0; // loop scale run
      }

      const note = notesToPlay[currentIdx];
      this.playPosition(note.s, note.f);
      currentIdx++;

      this.audioRunTimer = window.setTimeout(playStep, stepInterval);
    };

    playStep();
  }

  stopScaleAudioRun(): void {
    this.isAudioRunning = false;
    this.runGeneration++;
    this.pickGeneration++;
    if (this.audioRunTimer !== null) {
      clearTimeout(this.audioRunTimer);
      this.audioRunTimer = null;
    }

    const runIcon = document.getElementById('btn-scale-run-icon');
    const runText = document.getElementById('btn-scale-run-text');
    if (runIcon) runIcon.textContent = '▶️';
    if (runText) runText.textContent = 'Play Scale Run';
    this.clearHighlight();
  }

  async toggleMicPractice(): Promise<void> {
    if (this.isMicActive) {
      this.setMicPracticeActive(false);
      return;
    }
    const generation = ++this.micGeneration;
    const button = document.getElementById('btn-scale-mic') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    try {
      if (!this.onMicStartRequested) throw new Error('Scale microphone is not connected');
      const started = await this.onMicStartRequested();
      if (generation !== this.micGeneration || !this.active) return;
      this.setMicPracticeActive(started);
      if (!started) this.status('Microphone unavailable. Allow access and try Practice with Guitar again.');
    } catch (error) {
      console.error('Scale microphone unavailable:', error);
      this.setMicPracticeActive(false);
      this.status('Microphone unavailable. Allow access and try Practice with Guitar again.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  setMicPracticeActive(active: boolean): void {
    this.isMicActive = active;
    this.micGeneration++;
    if (!active && this.highlightedPc !== null) this.clearHighlight();
    const micDot = document.getElementById('scale-mic-dot');
    const micStatus = document.getElementById('scale-mic-status');
    const micText = document.getElementById('btn-scale-mic-text');
    document.getElementById('btn-scale-mic')?.setAttribute('aria-pressed', String(active));

    if (this.isMicActive) {
      if (micDot) micDot.textContent = '🟢';
      if (micStatus) micStatus.textContent = 'Live Guitar Mic Active';
      if (micText) micText.textContent = 'Stop Mic Practice';
    } else {
      if (micDot) micDot.textContent = '⚪';
      if (micStatus) micStatus.textContent = 'Mic Idle';
      if (micText) micText.textContent = 'Practice with Guitar (Live Mic)';
    }
  }

  onSingleNoteDetected(noteName: string): void {
    if (!this.isMicActive || !this.active) return;
    const pc = NOTE_NAMES.findIndex(note => note === noteName);
    if (pc < 0) {
      console.warn('Unknown scale practice note:', noteName);
      return;
    }
    if (this.highlightedPc === pc) {
      if (this.highlightTimer !== null) window.clearTimeout(this.highlightTimer);
      this.expireHighlight(600);
      return;
    }
    this.clearHighlight(false);
    if (!this.degreeAt(pc)) {
      this.renderFretboard();
      this.status(`${noteName} · Outside ${this.activeRoot} ${WESTERN_SCALES[this.activeKey].name}`);
      return;
    }
    this.highlightedPc = pc;
    this.renderFretboard();
    this.status(`Live ${noteName} · Degree ${this.degreeAt(pc)} · Matching scale positions, not measured finger placement`);
    this.expireHighlight(600);
  }
}
