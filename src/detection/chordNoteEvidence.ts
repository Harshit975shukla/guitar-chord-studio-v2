import type { DetectedPeak } from '../types';

interface EvidenceFrame {
  at: number;
  binWidth: number;
  tones: readonly Pick<DetectedPeak, 'freq' | 'midi' | 'amp' | 'pitchClass'>[];
}

/** Distinguish a struck note from a lower string's partial before folding octaves away. */
export class ChordNoteEvidence {
  private frames: EvidenceFrame[] = [];

  reset(): void { this.frames = []; }

  hasPitch(pitchClass: number): boolean {
    return this.frames[this.frames.length - 1]?.tones.some(tone => tone.pitchClass === pitchClass) ?? false;
  }

  hasRecentOctaves(pitchClass: number): boolean {
    return this.frames.some(frame => frame.tones.some(lower => lower.pitchClass === pitchClass
      && frame.tones.some(upper => upper.pitchClass === pitchClass && Math.abs(upper.midi - lower.midi - 12) < .2)));
  }

  observe(peaks: readonly DetectedPeak[], at: number, binWidth: number): void {
    if (!Number.isFinite(at) || !Number.isFinite(binWidth) || binWidth <= 0) throw new Error('Invalid chord evidence frame.');
    if (this.frames.length && at < this.frames[this.frames.length - 1].at) this.reset();
    const maximum = peaks.reduce((value, peak) => Math.max(value, peak.amp), 0);
    const tones = peaks.filter(peak => peak.amp >= maximum * .08
      && Math.abs(peak.midi - Math.round(peak.midi)) <= .35)
      .map(({ freq, midi, amp, pitchClass }) => ({ freq, midi, amp, pitchClass }))
      .sort((a, b) => a.freq - b.freq);
    this.frames.push({ at, binWidth, tones });
    while (this.frames.length > 32 || (this.frames.length && this.frames[0].at < at - 320)) this.frames.shift();
  }

  isHarmonicOnly(pitchClass: number, otherTones: readonly number[]): boolean {
    const current = this.frames[this.frames.length - 1];
    if (!current || this.frames.length < 3) return false;
    const upper = current.tones.find(tone => tone.pitchClass === pitchClass);
    if (!upper) return false;
    // Limit this check to energy inflated by a bright octave stack. A single weak
    // played tone is not disproved just because it happens to coincide with a partial.
    if (!current.tones.some(tone => tone.pitchClass === pitchClass
      && tone.freq > upper.freq * 1.8 && tone.amp >= upper.amp)) return false;

    // A quiet fundamental next to a stronger root can share its FFT main lobe.
    // In that case upper partials alone cannot prove the seventh is an overtone.
    const root = otherTones[0];
    const rootBass = current.tones.find(tone => tone.pitchClass === root)?.freq;
    if (rootBass) {
      for (let fundamental = upper.freq / 2; fundamental > rootBass; fundamental /= 2) {
        if (current.tones.some(tone => tone.pitchClass === root && tone.amp > upper.amp
          && Math.abs(tone.freq - fundamental) < current.binWidth * 3)) return false;
      }
    }

    // Higher octaves of this same partial do not provide independent note evidence.
    const parents = current.tones.filter(lower => {
      if (!otherTones.includes(lower.pitchClass) || lower.freq >= upper.freq) return false;
      const harmonic = Math.round(upper.freq / lower.freq);
      return harmonic >= 3 && harmonic <= 8
        && Math.abs(upper.freq - lower.freq * harmonic) <= Math.max(current.binWidth * 1.5, upper.freq * .015);
    });
    return parents.some(lower => {
      if (upper.amp > lower.amp) return false;
      const currentRatio = upper.amp / lower.amp;
      // A real seventh can coincide with a lower note's partial. Preserve it when a
      // later pluck grows that note independently of the already-sounding lower string.
      return !this.frames.some(frame => {
        if (current.at - frame.at < 32) return false;
        const previousLower = frame.tones.find(tone => Math.abs(tone.midi - lower.midi) < .4);
        const previousUpper = frame.tones.find(tone => Math.abs(tone.midi - upper.midi) < .4);
        // Upstrokes provide the same evidence in reverse: the upper note was
        // already sounding before the candidate lower-string source arrived.
        if (previousUpper && previousUpper.amp >= upper.amp * .5
          && (!previousLower || previousLower.amp < lower.amp * .5)
          && previousUpper.amp / Math.max(.000001, previousLower?.amp ?? 0) > currentRatio * 2) return true;
        if (!previousLower || previousLower.amp <= lower.amp * .35) return false;
        if (previousUpper && previousUpper.amp >= upper.amp * .5) return false;
        const previousRatio = (previousUpper?.amp ?? 0) / previousLower.amp;
        return currentRatio > Math.max(.01, previousRatio) * 2;
      });
    });
  }
}
