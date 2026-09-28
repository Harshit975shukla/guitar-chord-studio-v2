import type { DetectionResult } from '../types';
import { PerformanceGate, type PracticeTarget } from '../songs/performance';

/** A new check always starts from silence; each scale step needs its own fresh onset. */
export class EarTrainingPerformance {
  private gate = new PerformanceGate();
  private targets: PracticeTarget[] = [];
  private enabled = false;
  private index = 0;

  get progress(): number { return this.index; }
  get total(): number { return this.targets.length; }
  get checking(): boolean { return this.enabled; }
  get needsRelease(): boolean { return this.gate.needsRelease; }

  start(targets: readonly PracticeTarget[], now: number): void {
    this.targets = [...targets];
    this.index = 0;
    this.gate = new PerformanceGate();
    this.enabled = targets.length > 0;
    if (this.enabled) this.gate.setTarget(this.targets[0], now);
    this.gate.requireRelease();
  }

  stop(): void {
    this.enabled = false;
    this.gate.requireRelease();
  }

  consume(result: DetectionResult): 'waiting' | 'step' | 'complete' {
    if (!this.enabled) return 'waiting';
    if (result.isCalibrating || result.calibrationComplete) this.gate.requireRelease();
    const supported = result.mode !== 'chord' || (result.chord?.confidence ?? 0) >= 70;
    if (!this.gate.consume(supported ? result : { ...result, freshness: 'none' })) return 'waiting';
    this.index++;
    if (this.index === this.targets.length) { this.enabled = false; return 'complete'; }
    this.gate.setTarget(this.targets[this.index], result.performance!.frameAt);
    return 'step';
  }
}
