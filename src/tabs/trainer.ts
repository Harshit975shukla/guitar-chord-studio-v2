/**
 * Ear Training Quiz & Cadence Warm-Up Studio
 * Calibrates the ear with a 3-4 chord key cadence, plays mystery chords,
 * quizzes with 4 choices or real guitar microphone detection, and advances on correct answer.
 */

import { strumChord, playInTuneChime, AcousticBus } from '../audio/engine';
import { StringTuning, STANDARD_TUNING, parseChordSymbol } from '../types';
import { buildChordDefinition } from '../chords/definitions';

interface KeyConfig {
  name: string;
  cadence: string[]; // 3-4 reference chords
  beginnerPool: string[];
  intermediatePool: string[];
  masterPool: string[];
}

const KEY_CONFIGS: Record<string, KeyConfig> = {
  C: {
    name: 'C Major',
    cadence: ['C', 'Am', 'F', 'G'],
    beginnerPool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'],
    intermediatePool: ['C', 'Cmaj7', 'Dm', 'Dm7', 'Em', 'Em7', 'F', 'G', 'G7', 'Am', 'Am7'],
    masterPool: ['C', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bdim'],
  },
  G: {
    name: 'G Major',
    cadence: ['G', 'Em', 'C', 'D'],
    beginnerPool: ['G', 'C', 'D', 'Em', 'Am', 'Bm'],
    intermediatePool: ['G', 'Gmaj7', 'Am', 'Am7', 'Bm', 'C', 'D', 'D7', 'Em', 'Em7'],
    masterPool: ['G', 'Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F#dim'],
  },
  D: {
    name: 'D Major',
    cadence: ['D', 'Bm', 'G', 'A'],
    beginnerPool: ['D', 'G', 'A', 'Bm', 'Em', 'A7'],
    intermediatePool: ['D', 'Dmaj7', 'Em', 'Em7', 'F#m', 'G', 'A', 'A7', 'Bm'],
    masterPool: ['D', 'Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'A7', 'Bm7'],
  },
  Am: {
    name: 'A Minor',
    cadence: ['Am', 'Dm', 'F', 'E7'],
    beginnerPool: ['Am', 'C', 'Dm', 'Em', 'F', 'G', 'E7'],
    intermediatePool: ['Am', 'Am7', 'C', 'Cmaj7', 'Dm', 'Dm7', 'Em', 'F', 'G', 'E7'],
    masterPool: ['Am', 'Am7', 'Bdim', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'E7'],
  },
};

export class TrainerStudio {
  private mode: 'ear' | 'strum' = 'ear';
  private keyContext = 'C';
  private difficulty: 'beginner' | 'intermediate' | 'master' = 'beginner';
  private targetChord: string | null = null;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private isCadencePlaying = false;
  private isCooldown = false;
  private isMicActive = false;
  private tuning: StringTuning[] = STANDARD_TUNING;
  private audioContext: AudioContext | null = null;
  private acousticBus: AcousticBus | null = null;

  constructor() {}

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[]): void {
    this.tuning = tuning;
  }

  init(): void {
    this.initControls();
    this.updateStatsHUD();
    // Prompt user with warm-up ready
    this.showInitialPrompt();
  }

  private initControls(): void {
    const earBtn = document.getElementById('btn-trainer-mode-ear');
    const strumBtn = document.getElementById('btn-trainer-mode-strum');

    if (earBtn) earBtn.onclick = () => this.setMode('ear');
    if (strumBtn) strumBtn.onclick = () => this.setMode('strum');

    const keySelect = document.getElementById('quiz-key-context') as HTMLSelectElement;
    if (keySelect) {
      keySelect.value = this.keyContext;
      keySelect.onchange = () => {
        this.keyContext = keySelect.value;
        this.playCadenceAndStartQuiz();
      };
    }

    const diffSelect = document.getElementById('quiz-difficulty') as HTMLSelectElement;
    if (diffSelect) {
      diffSelect.value = this.difficulty;
      diffSelect.onchange = () => {
        this.difficulty = diffSelect.value as any;
        this.nextQuizChord();
      };
    }

    const playCadenceBtn = document.getElementById('btn-play-cadence');
    if (playCadenceBtn) {
      playCadenceBtn.onclick = () => this.playCadenceAndStartQuiz();
    }

    const replayBtn = document.getElementById('btn-quiz-replay');
    if (replayBtn) {
      replayBtn.onclick = () => this.replayMysteryChord();
    }

    const skipBtn = document.getElementById('btn-quiz-skip');
    if (skipBtn) {
      skipBtn.onclick = () => this.skipQuizChord();
    }

    const micBtn = document.getElementById('btn-quiz-mic');
    if (micBtn) {
      micBtn.onclick = () => this.toggleMic();
    }
  }

  setMode(mode: 'ear' | 'strum'): void {
    this.mode = mode;
    const earBtn = document.getElementById('btn-trainer-mode-ear');
    const strumBtn = document.getElementById('btn-trainer-mode-strum');
    if (earBtn) earBtn.classList.toggle('active', mode === 'ear');
    if (strumBtn) strumBtn.classList.toggle('active', mode === 'strum');

    const challengeBadge = document.getElementById('quiz-challenge-badge');
    const promptText = document.getElementById('quiz-prompt-text');
    const choicesGrid = document.getElementById('quiz-choices-grid');
    const diagramPreview = document.getElementById('quiz-diagram-preview');

    if (mode === 'ear') {
      if (challengeBadge) challengeBadge.textContent = '🎯 Ear Training Challenge';
      if (promptText) promptText.textContent = 'Listen to the mystery chord played below:';
      if (choicesGrid) choicesGrid.style.display = 'grid';
      if (diagramPreview) diagramPreview.style.display = 'none';
    } else {
      if (challengeBadge) challengeBadge.textContent = '🎸 Strum Training Challenge';
      if (promptText) promptText.textContent = 'Strum this chord on your guitar (Mic listens):';
      if (choicesGrid) choicesGrid.style.display = 'none';
      if (diagramPreview) diagramPreview.style.display = 'block';
    }

    this.nextQuizChord();
  }

  private showInitialPrompt(): void {
    const targetName = document.getElementById('quiz-target-chord-name');
    const targetNotes = document.getElementById('quiz-target-notes');
    const pill = document.getElementById('quiz-feedback-pill');

    if (targetName) targetName.textContent = '👂 Cadence Ready';
    if (targetNotes) targetNotes.textContent = 'Click "Play 3-4 Reference Chords" to calibrate your ear!';
    if (pill) {
      pill.innerHTML = '<span>🎵</span> First play 3-4 reference chords in key, then guess the mystery chord!';
      pill.style.background = 'rgba(255,179,0,0.12)';
      pill.style.borderColor = 'var(--accent-gold)';
      pill.style.color = 'var(--accent-gold)';
    }
  }

  playCadenceAndStartQuiz(): void {
    if (this.isCadencePlaying || !this.audioContext || !this.acousticBus) return;

    this.isCadencePlaying = true;
    const keyInfo = KEY_CONFIGS[this.keyContext] || KEY_CONFIGS.C;
    const cadenceChords = keyInfo.cadence;
    const cadenceText = document.getElementById('quiz-cadence-text');
    const pill = document.getElementById('quiz-feedback-pill');

    let step = 0;
    const playNextCadenceChord = () => {
      if (step < cadenceChords.length) {
        const chord = cadenceChords[step];
        this.strumChordByName(chord);

        if (cadenceText) {
          const playedSoFar = cadenceChords.slice(0, step + 1).map(c => `<strong>${c}</strong>`).join(' → ');
          cadenceText.innerHTML = `Calibrating Ear in ${keyInfo.name}: ${playedSoFar} ...`;
        }
        if (pill) {
          pill.innerHTML = `<span>🎵</span> Reference Chords: Playing <strong>${chord}</strong> (${step + 1}/${cadenceChords.length})`;
          pill.style.background = 'rgba(255,179,0,0.15)';
          pill.style.borderColor = 'var(--accent-gold)';
          pill.style.color = 'var(--accent-gold)';
        }

        step++;
        window.setTimeout(playNextCadenceChord, 750);
      } else {
        // Cadence complete!
        this.isCadencePlaying = false;
        if (cadenceText) {
          cadenceText.innerHTML = `✅ Ear calibrated in <strong>${keyInfo.name}</strong>! Starting quiz...`;
        }
        window.setTimeout(() => {
          this.nextQuizChord();
        }, 800);
      }
    };

    playNextCadenceChord();
  }

  nextQuizChord(): void {
    const keyInfo = KEY_CONFIGS[this.keyContext] || KEY_CONFIGS.C;
    let pool = keyInfo.beginnerPool;
    if (this.difficulty === 'intermediate') pool = keyInfo.intermediatePool;
    if (this.difficulty === 'master') pool = keyInfo.masterPool;

    // Pick a new chord different from previous
    let nextChord = pool[Math.floor(Math.random() * pool.length)];
    if (nextChord === this.targetChord && pool.length > 1) {
      nextChord = pool[(pool.indexOf(nextChord) + 1) % pool.length];
    }
    this.targetChord = nextChord;

    const targetName = document.getElementById('quiz-target-chord-name');
    const targetNotes = document.getElementById('quiz-target-notes');
    const choicesGrid = document.getElementById('quiz-choices-grid');
    const pill = document.getElementById('quiz-feedback-pill');

    if (this.mode === 'ear') {
      if (targetName) targetName.textContent = '❓ Mystery Chord';
      if (targetNotes) targetNotes.textContent = 'Which chord did you hear? Click your answer below:';

      // Pick 4 choices: correct one + 3 distractors from the key pool
      const distractors = pool.filter(c => c !== this.targetChord).sort(() => 0.5 - Math.random()).slice(0, 3);
      const choices = [this.targetChord, ...distractors].sort(() => 0.5 - Math.random());

      if (choicesGrid) {
        choicesGrid.innerHTML = choices.map((chord, idx) => `
          <button class="btn btn-secondary quiz-choice-btn" id="quiz-choice-${idx}" style="padding:16px 12px; font-size:1.25rem; font-weight:800; border:2px solid var(--border-light); background:rgba(0,0,0,0.4); border-radius:12px; cursor:pointer; color:var(--accent-gold); transition:all 0.2s ease;">
            ${chord}
          </button>
        `).join('');

        choices.forEach((chord, idx) => {
          const btn = document.getElementById(`quiz-choice-${idx}`);
          if (btn) {
            btn.onclick = () => this.handleChoice(chord, idx);
          }
        });
      }

      if (pill) {
        pill.innerHTML = '<span>👂</span> Mystery chord played! Choose from the 4 options or strum on your guitar.';
        pill.style.background = 'rgba(255,255,255,0.06)';
        pill.style.borderColor = 'var(--border-light)';
        pill.style.color = 'var(--text-main)';
      }

      // Play the mystery chord sound after brief pause
      window.setTimeout(() => {
        if (this.targetChord) {
          this.strumChordByName(this.targetChord);
        }
      }, 400);
    } else {
      // Strum Training mode
      if (targetName) targetName.textContent = this.targetChord;
      if (targetNotes) targetNotes.textContent = 'Strum this chord cleanly on your guitar. The mic is actively listening!';

      const diagramPreview = document.getElementById('quiz-diagram-preview');
      const miniFretboard = document.getElementById('quiz-mini-fretboard');
      if (diagramPreview) diagramPreview.style.display = 'block';

      const voicing = this.getVoicingFrets(this.targetChord);
      if (miniFretboard && voicing) {
        const strLabels = voicing.map(f => (f === null || f === -1 ? 'x' : String(f))).reverse().join('  ');
        miniFretboard.innerHTML = `<span style="color:var(--text-muted);">Frets (6th to 1st):</span> <strong style="color:var(--accent-gold);">${strLabels}</strong>`;
      }

      if (pill) {
        pill.innerHTML = '<span>🎸</span> Listening for chord on mic... Strike it now!';
        pill.style.background = 'rgba(255,255,255,0.06)';
        pill.style.borderColor = 'var(--border-light)';
        pill.style.color = 'var(--text-main)';
      }
    }
  }

  handleChoice(chosenChord: string, btnIdx: number): void {
    if (this.isCooldown || !this.targetChord) return;
    const btn = document.getElementById(`quiz-choice-${btnIdx}`);
    const pill = document.getElementById('quiz-feedback-pill');
    const targetName = document.getElementById('quiz-target-chord-name');
    const heroCard = document.getElementById('quiz-hero-card');

    if (chosenChord === this.targetChord) {
      this.isCooldown = true;
      this.score += 100 + this.streak * 20;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.updateStatsHUD();

      if (btn) {
        btn.style.background = 'rgba(16, 185, 129, 0.4)';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#34d399';
        btn.style.transform = 'scale(1.06)';
      }

      if (targetName) targetName.innerHTML = `✅ ${this.targetChord}`;
      if (heroCard) {
        heroCard.classList.add('hit-match');
        setTimeout(() => heroCard.classList.remove('hit-match'), 800);
      }

      if (pill) {
        pill.innerHTML = `<span>🎉</span> <strong>CORRECT! +100 PTS</strong> That was <strong>${this.targetChord}</strong>! Next chord coming...`;
        pill.style.background = 'rgba(16, 185, 129, 0.25)';
        pill.style.borderColor = '#10b981';
        pill.style.color = '#34d399';
      }

      if (this.audioContext) {
        playInTuneChime(this.audioContext);
      }

      window.setTimeout(() => {
        this.isCooldown = false;
        this.nextQuizChord();
      }, 1300);
    } else {
      this.streak = 0;
      this.updateStatsHUD();

      if (btn) {
        btn.style.background = 'rgba(239, 68, 68, 0.3)';
        btn.style.borderColor = '#ef4444';
        setTimeout(() => {
          btn.style.background = 'rgba(0,0,0,0.4)';
          btn.style.borderColor = 'var(--border-light)';
        }, 800);
      }

      if (pill) {
        pill.innerHTML = `<span>❌</span> Not quite! That was not ${chosenChord}. Replay or try another choice!`;
        pill.style.background = 'rgba(239, 68, 68, 0.2)';
        pill.style.borderColor = '#ef4444';
        pill.style.color = '#fca5a5';
      }
    }
  }

  replayMysteryChord(): void {
    if (this.targetChord) {
      this.strumChordByName(this.targetChord);
    }
  }

  skipQuizChord(): void {
    this.streak = 0;
    this.updateStatsHUD();
    this.nextQuizChord();
  }

  toggleMic(): void {
    this.isMicActive = !this.isMicActive;
    const micBtn = document.getElementById('btn-quiz-mic');
    if (micBtn) {
      micBtn.classList.toggle('btn-listen-active', this.isMicActive);
      micBtn.innerHTML = this.isMicActive ? '<span>🎙️</span> Mic Active (Strum to Answer)' : '<span>🎙️</span> Live Guitar Mic (Optional)';
    }
  }

  onChordDetected(detectedChord: string): void {
    if (this.isCooldown || !this.targetChord) return;

    const target = this.targetChord.trim();
    const det = detectedChord.trim();

    const isMatch = det === target ||
      (det.startsWith(target) && (det.length === target.length || det[target.length] === '7' || det[target.length] === 'm')) ||
      (target === 'C' && (det === 'C' || det === 'Cmaj7')) ||
      (target === 'Am' && (det === 'Am' || det === 'Am7')) ||
      (target === 'G' && (det === 'G' || det === 'G7')) ||
      (target === 'D' && (det === 'D' || det === 'D7')) ||
      (target === 'Em' && (det === 'Em' || det === 'Em7'));

    if (isMatch) {
      this.isCooldown = true;
      this.score += 100 + this.streak * 20;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      this.updateStatsHUD();

      const targetName = document.getElementById('quiz-target-chord-name');
      const pill = document.getElementById('quiz-feedback-pill');
      const heroCard = document.getElementById('quiz-hero-card');

      if (targetName) targetName.innerHTML = `✅ ${target}`;
      if (heroCard) {
        heroCard.classList.add('hit-match');
        setTimeout(() => heroCard.classList.remove('hit-match'), 800);
      }

      if (pill) {
        pill.innerHTML = `<span>🔥</span> <strong>CORRECT! +100 PTS</strong> Heard your guitar play <strong>${target}</strong>!`;
        pill.style.background = 'rgba(16, 185, 129, 0.25)';
        pill.style.borderColor = '#10b981';
        pill.style.color = '#34d399';
      }

      if (this.audioContext) {
        playInTuneChime(this.audioContext);
      }

      window.setTimeout(() => {
        this.isCooldown = false;
        this.nextQuizChord();
      }, 1300);
    }
  }

  private updateStatsHUD(): void {
    const scoreEl = document.getElementById('quiz-score');
    const streakEl = document.getElementById('quiz-streak');
    const bestStreakEl = document.getElementById('quiz-best-streak');

    if (scoreEl) scoreEl.textContent = String(this.score);
    if (streakEl) streakEl.textContent = `🔥 ${this.streak}`;
    if (bestStreakEl) bestStreakEl.textContent = `🏆 ${this.bestStreak}`;
  }

  private strumChordByName(chordSymbol: string): void {
    if (!this.audioContext || !this.acousticBus) return;
    const frets = this.getVoicingFrets(chordSymbol);
    if (!frets) return;

    strumChord(this.audioContext, this.acousticBus, {
      frets,
      style: 'down',
      velocity: 0.88,
      tuning: this.tuning,
      model: 'dreadnought',
    });
  }

  private getVoicingFrets(chordSymbol: string): (number | null)[] | null {
    const parsed = parseChordSymbol(chordSymbol);
    if (!parsed) return null;
    const def = buildChordDefinition(parsed.root, parsed.quality, this.tuning);
    if (def.voicings.length > 0) {
      return def.voicings[0].frets;
    }
    return null;
  }
}
