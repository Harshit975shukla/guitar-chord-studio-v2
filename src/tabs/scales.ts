/**
 * Western Guitar Scales & 3D Fretboard Studio
 * Complete scale library, 3D rosewood fretboard visualizer,
 * BPM tempo control, scale runs, and live microphone note practice.
 */

import { NOTE_NAMES, STANDARD_TUNING, StringTuning } from '../types';
import { playAcousticString, AcousticBus } from '../audio/engine';
import { PaneNeck3D } from '../ui/paneNeck3d';

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
  private activeRoot = 'A';
  private activeKey = 'pentatonic_minor';
  private activeLabelMode: 'note' | 'degree' = 'note';
  private activeRegister: 'all' | 'open' | 'middle' | 'upper' = 'all';
  private bpm = 120;
  private isAudioRunning = false;
  private audioRunTimer: number | null = null;
  private tuning: StringTuning[] = STANDARD_TUNING;
  private audioContext: AudioContext | null = null;
  private neck3d: PaneNeck3D | null = null;
  private acousticBus: AcousticBus | null = null;
  private isMicActive = false;

  constructor() {}

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[]): void {
    this.tuning = tuning;
    this.renderFretboard();
  }

  init(): void {
    this.initRootButtons();
    this.initControls();
    this.setupNeck3D();
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
      (s, f) => this.pluckNote(s, f),
    );
  }

  /** Push the scale pattern (+ optional live note) to the optional 3D neck. */
  private updateNeck3D(liveMidi: number | null = null): void {
    if (!this.neck3d) return;
    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot as any);
    const scalePcs = scale.intervals.map(semi => (rootIdx + semi) % 12);
    this.neck3d.update({
      frets: [null, null, null, null, null, null],
      tuning: this.tuning,
      liveMidi,
      root: this.activeRoot,
      scalePcs,
      rootPc: rootIdx,
    });
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
      filterSelect.onchange = () => this.setRegister(filterSelect.value as any);
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

  setRoot(root: string): void {
    this.activeRoot = root;
    document.querySelectorAll('.scale-root-btn').forEach(b => {
      b.classList.toggle('active', b.textContent?.trim() === root);
    });
    this.updateInfoRibbon();
    this.renderFretboard();
  }

  setScaleKey(key: string): void {
    if (WESTERN_SCALES[key]) {
      this.activeKey = key;
      this.updateInfoRibbon();
      this.renderFretboard();
    }
  }

  setLabelMode(mode: 'note' | 'degree'): void {
    this.activeLabelMode = mode;
    const noteBtn = document.getElementById('scale-mode-note');
    const degBtn = document.getElementById('scale-mode-degree');
    if (noteBtn) noteBtn.classList.toggle('active', mode === 'note');
    if (degBtn) degBtn.classList.toggle('active', mode === 'degree');
    this.renderFretboard();
  }

  setRegister(reg: 'all' | 'open' | 'middle' | 'upper'): void {
    this.activeRegister = reg;
    this.renderFretboard();
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
    const readout = document.getElementById('scale-tempo-readout');
    if (readout) readout.textContent = `${this.bpm} BPM`;

    if (this.isAudioRunning) {
      this.stopScaleAudioRun();
      this.startScaleAudioRun();
    }
  }

  updateInfoRibbon(): void {
    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot as any);
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
    container.innerHTML = '';

    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot as any);

    for (let s = 0; s < 6; s++) {
      const strInfo = this.tuning[s];
      const row = document.createElement('div');
      row.className = 'guitar-string-row';
      row.id = `scale-string-row-${s}`;

      const header = document.createElement('div');
      header.className = 'string-header';
      header.innerHTML = `<span style="font-weight:800; color:var(--accent-gold);">${s + 1}</span><span>${strInfo.note}</span>`;
      row.appendChild(header);

      const cellsContainer = document.createElement('div');
      cellsContainer.className = 'fret-cells-container';

      const wire = document.createElement('div');
      wire.className = `string-wire ${strInfo.gaugeClass}`;
      wire.id = `scale-string-wire-${s}`;
      cellsContainer.appendChild(wire);

      for (let f = 0; f <= 12; f++) {
        const cell = document.createElement('div');
        cell.className = 'fret-cell';
        cell.id = `scale-fret-cell-${s}-${f}`;

        let inRegister = true;
        if (this.activeRegister === 'open' && f > 4) inRegister = false;
        if (this.activeRegister === 'middle' && (f < 5 || f > 8)) inRegister = false;
        if (this.activeRegister === 'upper' && f < 9) inRegister = false;

        const midi = strInfo.midi + f;
        const noteName = NOTE_NAMES[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        const semitones = ((midi % 12) - rootIdx + 12) % 12;
        const intervalIdx = scale.intervals.indexOf(semitones);

        if (intervalIdx !== -1 && inRegister) {
          const isRoot = semitones === 0;
          const isBlue = this.activeKey === 'blues' && semitones === 6;
          const degree = scale.degrees[intervalIdx];

          const dot = document.createElement('div');
          dot.className = 'scale-dot' + (isRoot ? ' root' : isBlue ? ' blue' : ' tone');
          dot.id = `scale-dot-${s}-${f}`;
          dot.textContent = this.activeLabelMode === 'note' ? noteName : degree;
          dot.title = `${noteName}${octave} (${degree}) • String ${s + 1}, Fret ${f}`;

          dot.onclick = (e) => {
            e.stopPropagation();
            this.pluckNote(s, f, noteName, octave, degree);
          };

          cell.appendChild(dot);
        }

        cell.onclick = () => {
          this.pluckNote(s, f, noteName, octave, intervalIdx !== -1 ? scale.degrees[intervalIdx] : '-');
        };

        cellsContainer.appendChild(cell);
      }

      row.appendChild(cellsContainer);
      container.appendChild(row);
    }

    // Keep the optional 3D neck in sync with the current scale pattern
    this.updateNeck3D(null);
  }

  pluckNote(s: number, f: number, _noteName?: string, _octave?: number, _degree?: string): void {
    if (!this.audioContext || !this.acousticBus) return;

    const midi = this.tuning[s].midi + f;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    playAcousticString(this.audioContext, this.acousticBus, {
      freq,
      startTime: this.audioContext.currentTime + 0.005,
      stringIndex: s,
      velocity: 0.95,
    });

    // Wire vibration animation
    const wire = document.getElementById(`scale-string-wire-${s}`);
    if (wire) {
      wire.classList.add('vibrating');
      setTimeout(() => wire.classList.remove('vibrating'), 350);
    }

    // Dot flash animation
    const dot = document.getElementById(`scale-dot-${s}-${f}`);
    if (dot) {
      dot.classList.add('active-pluck');
      setTimeout(() => dot.classList.remove('active-pluck'), 350);
    }

    // Light the played note on the 3D neck, then revert to the static pattern
    this.updateNeck3D(midi);
    setTimeout(() => this.updateNeck3D(null), 350);
  }

  toggleScaleAudioRun(): void {
    if (this.isAudioRunning) {
      this.stopScaleAudioRun();
    } else {
      this.startScaleAudioRun();
    }
  }

  startScaleAudioRun(): void {
    if (!this.audioContext || !this.acousticBus) return;

    this.isAudioRunning = true;
    const runIcon = document.getElementById('btn-scale-run-icon');
    const runText = document.getElementById('btn-scale-run-text');
    if (runIcon) runIcon.textContent = '⏹️';
    if (runText) runText.textContent = 'Stop Scale Run';

    // Gather all scale notes across the neck in pitch order
    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot as any);
    const notesToPlay: Array<{ s: number; f: number; midi: number; noteName: string; octave: number; degree: string }> = [];

    for (let s = 5; s >= 0; s--) {
      for (let f = 0; f <= 12; f++) {
        let inRegister = true;
        if (this.activeRegister === 'open' && f > 4) inRegister = false;
        if (this.activeRegister === 'middle' && (f < 5 || f > 8)) inRegister = false;
        if (this.activeRegister === 'upper' && f < 9) inRegister = false;

        const midi = this.tuning[s].midi + f;
        const semi = ((midi % 12) - rootIdx + 12) % 12;
        const intervalIdx = scale.intervals.indexOf(semi);

        if (intervalIdx !== -1 && inRegister) {
          notesToPlay.push({
            s,
            f,
            midi,
            noteName: NOTE_NAMES[midi % 12],
            octave: Math.floor(midi / 12) - 1,
            degree: scale.degrees[intervalIdx],
          });
        }
      }
    }

    notesToPlay.sort((a, b) => a.midi - b.midi);
    if (notesToPlay.length === 0) {
      this.stopScaleAudioRun();
      return;
    }

    let currentIdx = 0;
    const stepInterval = (60 / this.bpm) * 1000;

    const playStep = () => {
      if (!this.isAudioRunning) return;

      if (currentIdx >= notesToPlay.length) {
        currentIdx = 0; // loop scale run
      }

      const note = notesToPlay[currentIdx];
      this.pluckNote(note.s, note.f, note.noteName, note.octave, note.degree);
      currentIdx++;

      this.audioRunTimer = window.setTimeout(playStep, stepInterval);
    };

    playStep();
  }

  stopScaleAudioRun(): void {
    this.isAudioRunning = false;
    if (this.audioRunTimer) {
      clearTimeout(this.audioRunTimer);
      this.audioRunTimer = null;
    }

    const runIcon = document.getElementById('btn-scale-run-icon');
    const runText = document.getElementById('btn-scale-run-text');
    if (runIcon) runIcon.textContent = '▶️';
    if (runText) runText.textContent = 'Play Scale Run';
  }

  toggleMicPractice(): void {
    this.isMicActive = !this.isMicActive;
    const micDot = document.getElementById('scale-mic-dot');
    const micStatus = document.getElementById('scale-mic-status');
    const micText = document.getElementById('btn-scale-mic-text');

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
    if (!this.isMicActive) return;

    // Check if detected note is in active scale
    const scale = WESTERN_SCALES[this.activeKey] || WESTERN_SCALES.pentatonic_minor;
    const rootIdx = NOTE_NAMES.indexOf(this.activeRoot as any);
    const targetIdx = NOTE_NAMES.indexOf(noteName as any);
    const semi = (targetIdx - rootIdx + 12) % 12;

    if (scale.intervals.includes(semi)) {
      // Flash matching dots on neck
      document.querySelectorAll(`.scale-dot`).forEach(d => {
        if (d.textContent?.trim() === noteName) {
          d.classList.add('active-pluck');
          setTimeout(() => d.classList.remove('active-pluck'), 600);
        }
      });
    }
  }
}
