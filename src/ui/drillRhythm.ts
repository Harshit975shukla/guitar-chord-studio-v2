import { playMetronomeClick } from '../audio/engine';
import { buildDrillRhythm } from '../rhythm/drillTimeline';
import { getStrummingPattern, patternNotation, STRUM_COUNTS, type StrummingPattern } from '../rhythm/strumming';
import { PerformanceGate } from '../songs/performance';
import { SongTransport } from '../songs/transport';
import { transposeSongChord } from '../songs/timing';
import type { DetectionResult, DrillConfig, DrillResult } from '../types';

export function renderStrummingGrid(container: HTMLElement, pattern: StrummingPattern): void {
  container.replaceChildren();
  container.setAttribute('aria-label', `${pattern.name}: ${patternNotation(pattern)}. Counts 1 and 2 and 3 and 4 and.`);
  pattern.steps.forEach((stroke, index) => {
    const item = document.createElement('span');
    item.className = 'strumming-step';
    const count = document.createElement('span'); count.textContent = STRUM_COUNTS[index];
    const direction = document.createElement('strong'); direction.textContent = stroke === 'D' ? '↓' : stroke === 'U' ? '↑' : '—';
    item.setAttribute('aria-label', `${STRUM_COUNTS[index]}: ${stroke === 'D' ? 'down' : stroke === 'U' ? 'up' : 'no stroke'}`);
    item.append(count, direction); container.append(item);
  });
}

export class DrillRhythm {
  private transport: SongTransport;
  private plan: ReturnType<typeof buildDrillRhythm>;
  private currentChord = -1;
  private recorded = false;
  private canRecordMiss = true;
  private startedAt = 0;
  private gate = new PerformanceGate();
  private running = false;
  constructor(
    ctx: AudioContext,
    private config: DrillConfig,
    private chords: string[],
    capo: number,
    private callbacks: {
      chord(index: number): void;
      result(result: DrillResult['chordResults'][number]): void;
      finish(): void;
      status(message: string): void;
    },
  ) {
    this.plan = buildDrillRhythm(config, chords.length);
    renderStrummingGrid(document.getElementById('drill-pattern-grid')!, getStrummingPattern(config.strummingPatternId || 'quarter-down'));
    this.transport = new SongTransport({
      now: () => ctx.currentTime,
      setTimer: (fn, milliseconds) => window.setTimeout(fn, milliseconds),
      clearTimer: id => window.clearTimeout(id),
    }, {
      play: (entry, at) => {
        const cue = this.plan.cues[entry.index];
        const click = cue.countIn ? cue.step % 2 === 0 : cue.stroke !== '-';
        return config.rhythmClicks && click ? playMetronomeClick(ctx, cue.step === 0, at) : () => {};
      },
      target: entry => {
        if (!this.running) return;
        const cue = this.plan.cues[entry.index];
        if (!cue.countIn && cue.chordIndex !== this.currentChord) {
          this.finishCurrent();
          this.currentChord = cue.chordIndex; this.recorded = false; this.canRecordMiss = true; this.startedAt = Date.now();
          this.gate.setTarget({ type: 'chord', chord: transposeSongChord(chords[this.currentChord], capo) }, this.startedAt);
          callbacks.chord(this.currentChord);
        }
        document.querySelectorAll('#drill-pattern-grid .strumming-step').forEach((item, index) => {
          if (index === cue.step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
        });
        const stroke = cue.stroke === 'D' ? 'Down' : cue.stroke === 'U' ? 'Up' : 'No stroke';
        document.getElementById('drill-rhythm-position')!.textContent = cue.countIn
          ? `Count-in · ${STRUM_COUNTS[cue.step]} · get ready for ${chords[0]}`
          : `${this.currentChord + 1}/${chords.length} · bar ${cue.bar + 1}/${config.barsPerChord} · ${STRUM_COUNTS[cue.step]} · ${stroke}`;
        document.getElementById('drill-next-chord')!.textContent = cue.countIn ? chords[0] : chords[this.currentChord + 1] || 'Finish';
      },
      finish: () => { this.finishCurrent(); this.running = false; callbacks.finish(); },
      stalled: () => callbacks.status('Timing interrupted; resumed at the next pulse without rushing to catch up.'),
    });
  }

  start(): void {
    this.running = true;
    this.transport.start(this.plan.entries, 0, false);
  }

  evaluate(result: DetectionResult): void {
    if (!this.running || !this.config.checkChords || this.recorded) return;
    if (result.isCalibrating || result.calibrationComplete) {
      this.canRecordMiss = false;
      this.gate.requireRelease();
      this.callbacks.status('Microphone calibration is in progress. A chord window overlapping calibration will not count as a miss.');
      return;
    }
    if (!this.gate.consume(result) || this.currentChord < 0) return;
    this.recorded = true;
    this.callbacks.result({
      targetChord: this.chords[this.currentChord],
      detectedChord: result.chord?.symbol || null, matched: true,
      latencyMs: Math.max(0, Date.now() - this.startedAt), confidence: result.chord?.confidence || 0,
    });
    const banner = document.getElementById('drill-feedback-banner');
    if (banner) banner.textContent = `Chord matched: ${result.chord?.symbol}. Keep following the pattern; stroke direction and rhythm are not graded.`;
  }

  private finishCurrent(): void {
    if (this.currentChord < 0 || this.recorded || !this.config.checkChords || !this.canRecordMiss) return;
    this.recorded = true;
    this.callbacks.result({ targetChord: this.chords[this.currentChord], detectedChord: null, matched: false, latencyMs: 0, confidence: 0 });
  }

  next(): void {
    this.finishCurrent();
    const nextChord = this.currentChord + 1;
    if (nextChord >= this.chords.length) { this.stop(); this.callbacks.finish(); return; }
    const index = this.plan.cues.findIndex(cue => cue.chordIndex === nextChord && cue.bar === 0 && cue.step === 0);
    this.transport.start(this.plan.entries, index, false);
  }

  stop(): void {
    this.running = false;
    this.transport.stop();
    document.querySelectorAll('#drill-pattern-grid [aria-current]').forEach(item => item.removeAttribute('aria-current'));
  }
}
