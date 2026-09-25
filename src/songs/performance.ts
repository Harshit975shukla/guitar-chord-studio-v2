import type { DetectionResult } from '../types';
import { chordIdentity } from './timing';

export type PracticeTarget = { type: 'chord'; chord: string } | { type: 'note'; midi: number } | { type: 'rest' };
export function matchesTarget(target: PracticeTarget, result: DetectionResult): boolean {
  if (result.freshness !== 'fresh') return false;
  if (target.type === 'note') return result.mode === 'single-note' && !!result.note &&
    Math.round(result.note.pitch.midi) === target.midi && result.note.confidence >= 70;
  if (target.type === 'chord' && result.mode === 'chord' && result.chord) {
    const expected = chordIdentity(target.chord), found = chordIdentity(result.chord.symbol);
    // The detector does not verify inversions. Slash-chord targets use manual Next.
    return !!expected && !!found && !expected.bass && expected.root === found.root && expected.quality === found.quality;
  }
  return false;
}

/** One accepted performance per target; signal release is required after auditions. */
export class PerformanceGate {
  private target: PracticeTarget = { type: 'rest' };
  private shownAt = 0;
  private usedId = 0;
  private observedId = 0;
  private releaseRequired = true;
  private quietSince: number | null = null;
  private supportedFrames = 0;
  private candidateId = 0;
  private accepted = false;

  setTarget(target: PracticeTarget, now: number): void {
    this.target = target;
    this.shownAt = now;
    this.usedId = Math.max(this.usedId, this.observedId);
    this.supportedFrames = 0;
    this.accepted = false;
  }
  requireRelease(): void {
    this.releaseRequired = true;
    this.quietSince = null;
    this.supportedFrames = 0;
    this.usedId = Math.max(this.usedId, this.observedId);
  }
  consume(result: DetectionResult): boolean {
    const evidence = result.performance;
    if (!evidence || result.isCalibrating || result.calibrationComplete) return false;
    this.observedId = Math.max(this.observedId, evidence.id);
    if (!evidence.signalPresent) {
      this.quietSince ??= evidence.frameAt;
      if (evidence.frameAt - this.quietSince >= 120) this.releaseRequired = false;
      this.supportedFrames = 0;
      return false;
    }
    this.quietSince = null;
    if (this.releaseRequired || this.accepted || evidence.id <= this.usedId || evidence.attackAt < this.shownAt) return false;
    if (!matchesTarget(this.target, result)) { this.supportedFrames = 0; return false; }
    if (this.candidateId !== evidence.id) { this.candidateId = evidence.id; this.supportedFrames = 0; }
    this.supportedFrames++;
    if (this.target.type === 'note' && this.supportedFrames < 2) return false;
    this.accepted = true;
    this.usedId = evidence.id;
    return true;
  }
}
