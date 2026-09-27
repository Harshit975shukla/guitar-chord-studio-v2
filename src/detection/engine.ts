/**
 * Real-time Audio Detection Engine
 * Spectral subtraction, onset detection, time-domain autocorrelation, chroma analysis, chord template matching
 */

import { 
  DetectionResult, 
  DetectedPeak, 
  NoiseProfile, 
  GuitarPosition,
  StringTuning,
  STANDARD_TUNING,
  NOTE_NAMES,
  DEGREE_NAMES,
  NoteName,
  ChordQuality,
  DetectionTargetMode
} from '../types';
import { calibrationWarning, median } from './inputHealth';
import { harmonicChroma } from './harmonicChroma';
import { estimateNotePitch, NOTE_PITCH_MIN, NOTE_PITCH_MAX } from './notePitch';

// ============================================================================
// Detection Configuration
// ============================================================================

export interface DetectionConfig {
  fftSize: number;
  smoothingTimeConstant: number;
  minFreq: number;
  maxFreq: number;
  noiseGateDb: number;
  micGainMultiplier: number;
  seventhStrictness: number;
  triggerMode: 'guitartuna' | 'continuous';
  targetMode: DetectionTargetMode;
  oversubtraction: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  fftSize: 4096,
  smoothingTimeConstant: 0.12,
  minFreq: 65,
  maxFreq: 1250,
  noiseGateDb: 18,
  micGainMultiplier: 4.0,
  seventhStrictness: 0.55,
  triggerMode: 'guitartuna',
  targetMode: 'chords',
  oversubtraction: 1.80,
};

// ============================================================================
// Core 10 Chord Templates (V1 Proven Set)
// ============================================================================

export interface ChordTemplate {
  name: string;
  short: string;
  weights: number[]; // 12 semitone weights
  formula: string;
  intervals: string;
}

export const CHORD_TEMPLATES: ChordTemplate[] = [
  { 
    name: 'Major', 
    short: '', 
    weights: [1.3, -0.6, -0.3, -0.7, 1.1, -0.4, -0.6, 1.0, -0.6, -0.4, -0.5, -0.05], 
    formula: '1 - 3 - 5', 
    intervals: 'Root, Major 3rd, Perfect 5th' 
  },
  { 
    name: 'Minor', 
    short: 'm', 
    weights: [1.3, -0.6, -0.3, 1.1, -0.7, -0.4, -0.6, 1.0, -0.4, -0.5, -0.05, -0.5], 
    formula: '1 - b3 - 5', 
    intervals: 'Root, Minor 3rd, Perfect 5th' 
  },
  { 
    name: 'Dominant 7th', 
    short: '7', 
    weights: [1.2, -0.5, -0.3, -0.6, 1.0, -0.4, -0.5, 0.9, -0.5, -0.4, 0.9, -0.5], 
    formula: '1 - 3 - 5 - b7', 
    intervals: 'Root, Maj 3rd, 5th, Min 7th' 
  },
  { 
    name: 'Major 7th', 
    short: 'maj7', 
    weights: [1.2, -0.5, -0.3, -0.6, 1.0, -0.4, -0.5, 0.9, -0.5, -0.4, -0.5, 0.9], 
    formula: '1 - 3 - 5 - 7', 
    intervals: 'Root, Maj 3rd, 5th, Maj 7th' 
  },
  { 
    name: 'Minor 7th', 
    short: 'm7', 
    weights: [1.2, -0.5, -0.3, 1.0, -0.6, -0.4, -0.5, 0.9, -0.5, -0.4, 0.9, -0.5], 
    formula: '1 - b3 - 5 - b7', 
    intervals: 'Root, Min 3rd, 5th, Min 7th' 
  },
  { 
    name: 'Suspended 4th', 
    short: 'sus4', 
    weights: [1.3, -0.5, -0.3, -0.6, -0.6, 1.1, -0.5, 1.0, -0.5, -0.4, -0.4, -0.5], 
    formula: '1 - 4 - 5', 
    intervals: 'Root, Perfect 4th, Perfect 5th' 
  },
  { 
    name: 'Suspended 2nd', 
    short: 'sus2', 
    weights: [1.3, -0.5, 1.1, -0.6, -0.6, -0.4, -0.5, 1.0, -0.5, -0.4, -0.4, -0.5], 
    formula: '1 - 2 - 5', 
    intervals: 'Root, Major 2nd, Perfect 5th' 
  },
  { 
    name: 'Power Chord (5)', 
    short: '5', 
    weights: [1.4, -0.5, -0.4, -0.5, -0.5, -0.4, -0.5, 1.2, -0.5, -0.4, -0.4, -0.5], 
    formula: '1 - 5', 
    intervals: 'Root, Perfect 5th' 
  },
  { 
    name: 'Diminished', 
    short: 'dim', 
    weights: [1.2, -0.5, -0.4, 1.1, -0.6, -0.4, 1.0, -0.6, -0.5, -0.4, -0.4, -0.5], 
    formula: '1 - b3 - b5', 
    intervals: 'Root, Minor 3rd, Diminished 5th' 
  },
  { 
    name: 'Augmented', 
    short: 'aug', 
    weights: [1.2, -0.5, -0.4, -0.6, 1.1, -0.4, -0.5, -0.6, 1.0, -0.4, -0.4, -0.5], 
    formula: '1 - 3 - #5', 
    intervals: 'Root, Major 3rd, Augmented 5th' 
  },
];

// ============================================================================
// Detection Engine Class
// ============================================================================

export class DetectionEngine {
  private config: DetectionConfig;
  private analyser: AnalyserNode | null = null;
  private noiseProfile: NoiseProfile | null = null;
  private isCalibrating = false;
  private calibrationFrames = 0;
  private calibrationBuffer: Float32Array | null = null;
  private calibrationPeakBuffer: Float32Array | null = null;
  private sumNoiseFloorDb = 0;
  private calibrationLevels: number[] = [];
  private calibrationWarmupFrames = 0;
  private calibrationRms: number[] = [];
  private calibrationSpectra: Float32Array[] = [];
  private gainSettleFrames = 0;
  private timeBuffer: Float32Array | null = null;
  
  // State
  private smoothedChroma = new Float32Array(12);
  private prevFrameBandEnergy = 0;
  
  // Anti-fluctuation hysteresis & continuous detection state
  private candidateVoteHistory: string[] = [];
  private lastLockedChord: string | null = null;


  // Strum capture state machine
  private strumState: 'idle' | 'attack' = 'idle';
  private strumAttackTimestamp = 0;
  private strumChromaBuffer: Float32Array[] = [];
  private lockedChordResult: DetectionResult | null = null;
  private lockedNoteResult: DetectionResult | null = null;
  private lastAudioActivityTimestamp = 0;
  private performanceId = 0;
  private performanceAttackAt = 0;
  private frameSignalPresent = false;
  private pendingNoteMidi: number | null = null;
  private pendingNoteFrames = 0;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config };
  }

  setConfig(config: Partial<DetectionConfig>): void {
    if (config.micGainMultiplier !== undefined && config.micGainMultiplier !== this.config.micGainMultiplier && this.analyser) {
      const ratio = config.micGainMultiplier / this.config.micGainMultiplier;
      if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Microphone sensitivity must be positive and finite.');
      if (this.noiseProfile) {
        for (let i = 0; i < this.noiseProfile.amps.length; i++) {
          this.noiseProfile.amps[i] *= ratio;
          if (this.noiseProfile.peakAmps) this.noiseProfile.peakAmps[i] *= ratio;
        }
        const dbChange = 20 * Math.log10(ratio);
        this.noiseProfile.measuredNoiseFloorDb += dbChange;
        if (this.noiseProfile.avgNoiseFloorDb !== undefined) this.noiseProfile.avgNoiseFloorDb += dbChange;
        if (this.noiseProfile.rms !== undefined) this.noiseProfile.rms *= ratio;
      }
      this.prevFrameBandEnergy *= ratio;
      this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
      this.clearStrumAttempt();
      this.gainSettleFrames = Math.ceil(this.analyser.fftSize / (this.analyser.context?.sampleRate || 44100) / .032) + 2;
      if (this.isCalibrating) this.startNoiseCalibration();
    }
    if ((config.triggerMode && config.triggerMode !== this.config.triggerMode) ||
        (config.targetMode && config.targetMode !== this.config.targetMode)) {
      this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
      this.clearStrumAttempt();
    }
    this.config = { ...this.config, ...config };
  }

  setAnalyser(analyser: AnalyserNode): void {
    this.clearNoiseCalibration();
    this.gainSettleFrames = 0;
    this.reset();
    this.analyser = analyser;
    this.timeBuffer = new Float32Array(analyser.fftSize);
  }

  // ============================================================================
  // Noise Calibration
  // ============================================================================

  clearNoiseCalibration(): void {
    this.noiseProfile = null;
    this.isCalibrating = false;
    this.calibrationFrames = 0;
    this.calibrationBuffer = null;
    this.calibrationPeakBuffer = null;
    this.calibrationLevels = [];
    this.calibrationWarmupFrames = 0;
    this.calibrationRms = [];
    this.calibrationSpectra = [];
    this.clearStrumAttempt();
  }

  needsNoiseCalibration(): boolean { return !this.noiseProfile?.calibrated && !this.isCalibrating; }
  isNoiseCalibrating(): boolean { return this.isCalibrating; }
  isInputSettling(): boolean { return this.gainSettleFrames > 0; }

  startNoiseCalibration(): void {
    if (!this.analyser) return;
    this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
    this.clearStrumAttempt();
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    const bufferLength = this.analyser.frequencyBinCount;
    this.calibrationBuffer = new Float32Array(bufferLength).fill(0);
    this.calibrationPeakBuffer = new Float32Array(bufferLength).fill(0);
    this.sumNoiseFloorDb = 0;
    this.calibrationLevels = [];
    this.calibrationRms = [];
    this.calibrationSpectra = [];
    // Discard one FFT window plus smoothing frames so a just-muted strum is not learned as room noise.
    this.calibrationWarmupFrames = Math.ceil(this.analyser.fftSize / (this.analyser.context?.sampleRate || 44100) / .032) + 2;
  }

  processCalibrationFrame(freqData: Float32Array, rms?: number): { complete: boolean; noiseFloorDb: number; progress: number } | null {
    if (!this.isCalibrating || !this.calibrationBuffer || !this.calibrationPeakBuffer) return null;
    if (this.calibrationWarmupFrames > 0) {
      this.calibrationWarmupFrames--;
      return { complete: false, noiseFloorDb: -120, progress: 0 };
    }

    this.calibrationFrames++;
    if (rms !== undefined) this.calibrationRms.push(rms);
    const snapshot = new Float32Array(freqData.length);
    let frameMaxDb = -120;
    for (let b = 0; b < freqData.length; b++) {
      if (freqData[b] > frameMaxDb) frameMaxDb = freqData[b];
      const linAmp = Math.pow(10, freqData[b] / 20);
      snapshot[b] = linAmp;
      this.calibrationBuffer[b] += linAmp;
      if (linAmp > this.calibrationPeakBuffer[b]) {
        this.calibrationPeakBuffer[b] = linAmp;
      }
    }
    this.sumNoiseFloorDb += frameMaxDb;
    this.calibrationLevels.push(frameMaxDb);
    this.calibrationSpectra.push(snapshot);

    const TARGET_FRAMES = 45; // ~1.5s at 30 FPS
    const progress = Math.min(100, Math.round((this.calibrationFrames / TARGET_FRAMES) * 100));

    if (this.calibrationFrames >= TARGET_FRAMES) {
      for (let b = 0; b < this.calibrationBuffer.length; b++) {
        const typical = median(this.calibrationSpectra.map(frame => frame[b]));
        this.calibrationBuffer[b] = typical;
        this.calibrationPeakBuffer[b] = Math.min(this.calibrationPeakBuffer[b], typical * 3);
      }
      
      this.noiseProfile = {
        amps: this.calibrationBuffer,
        peakAmps: this.calibrationPeakBuffer,
        measuredNoiseFloorDb: median(this.calibrationLevels),
        avgNoiseFloorDb: this.sumNoiseFloorDb / this.calibrationFrames,
        calibrated: true,
        timestamp: Date.now(),
        warning: calibrationWarning(this.calibrationLevels, Math.max(10, this.config.noiseGateDb)),
        rms: this.calibrationRms.length ? median(this.calibrationRms) : undefined,
      };
      
      this.isCalibrating = false;
      this.gainSettleFrames = 0;
      this.calibrationBuffer = null;
      this.calibrationPeakBuffer = null;
      this.calibrationSpectra = [];
      return { complete: true, noiseFloorDb: this.noiseProfile.measuredNoiseFloorDb, progress: 100 };
    }
    
    return { complete: false, noiseFloorDb: -120, progress };
  }

  // ============================================================================
  // Spectral Subtraction
  // ============================================================================

  applySpectralSubtraction(rawAmps: Float32Array): Float32Array {
    const cleanAmps = new Float32Array(rawAmps.length);
    if (this.noiseProfile?.calibrated && this.noiseProfile.amps) {
      const pAmps = this.noiseProfile.peakAmps;
      const oversub = this.config.oversubtraction;
      for (let b = 0; b < rawAmps.length; b++) {
        // Subtract peak noise floor or oversub * average noise floor
        const noiseFloor = pAmps 
          ? Math.max(pAmps[b] * 1.15, this.noiseProfile.amps[b] * oversub)
          : (this.noiseProfile.amps[b] * oversub);
        cleanAmps[b] = Math.max(0, rawAmps[b] - noiseFloor);
      }
    } else {
      cleanAmps.set(rawAmps);
    }
    return cleanAmps;
  }

  getGateThresholdDb(): number {
    const margin = Math.max(10, this.config.noiseGateDb);
    if (this.noiseProfile?.calibrated) {
      // Reference level for diagnostics; actual calibrated gating is frequency-specific.
      return this.noiseProfile.measuredNoiseFloorDb + margin;
    }
    // Safe uncalibrated baseline: -36.0 dB + (noiseGateDb - 14) * 0.6
    return -36.0 + (this.config.noiseGateDb - 14) * 0.6;
  }

  // ============================================================================
  // Time-Domain Autocorrelation (Rock-Solid Monophonic Single Note Detection)
  // ============================================================================

  fastAutocorrelate(timeBuf: Float32Array, sampleRate: number): { freq: number; confidence: number; rms: number } {
    const bufLen = timeBuf.length;
    let sumSquares = 0;
    for (let i = 0; i < bufLen; i++) {
      const val = timeBuf[i];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / bufLen);
    if (rms < 0.010) return { freq: -1, confidence: 0, rms };

    const minPeriod = Math.floor(sampleRate / 880); // ~50 samples (A5)
    const maxPeriod = Math.floor(sampleRate / 65);  // ~740 samples (low C2 ~65 Hz)
    const windowLen = Math.min(1024, bufLen - maxPeriod);
    if (windowLen <= 0) return { freq: -1, confidence: 0, rms };

    let energy0 = 0;
    for (let i = 0; i < windowLen; i++) {
      energy0 += timeBuf[i] * timeBuf[i];
    }
    if (energy0 < 1e-5) return { freq: -1, confidence: 0, rms };

    let bestPeriod = -1;
    let maxCorr = -1;
    const correlations = new Float32Array(maxPeriod + 2);
    let pastZeroDip = false;

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      let dot = 0;
      let energyLag = 0;
      for (let i = 0; i < windowLen; i++) {
        const v0 = timeBuf[i];
        const vk = timeBuf[i + lag];
        dot += v0 * vk;
        energyLag += vk * vk;
      }
      const norm = Math.sqrt(energy0 * energyLag) + 1e-9;
      const r = dot / norm;
      correlations[lag] = r;

      if (!pastZeroDip && (r < 0.35 || (lag > minPeriod + 2 && correlations[lag] > correlations[lag - 1] && correlations[lag - 1] < correlations[lag - 2]))) {
        pastZeroDip = true;
      }
      if (pastZeroDip && r > maxCorr) {
        maxCorr = r;
        bestPeriod = lag;
      }
    }

    if (maxCorr < 0.40 || bestPeriod <= 0) {
      return { freq: -1, confidence: maxCorr > 0 ? maxCorr : 0, rms };
    }

    // Safe octave-doubling check: ONLY check around bestPeriod / 2 (an exact octave, same note!)
    // Never jump to bestPeriod / 3 (which is a 12th / perfect 5th, corrupting notes of the B string)
    let chosenPeriod = bestPeriod;
    const halfPeriod = Math.round(bestPeriod / 2);
    if (halfPeriod >= minPeriod) {
      let maxHalfCorr = -1;
      let halfLag = halfPeriod;
      for (let d = -2; d <= 2; d++) {
        const lagIdx = halfPeriod + d;
        if (lagIdx >= minPeriod && lagIdx <= maxPeriod) {
          const c = correlations[lagIdx] || 0;
          if (c > maxHalfCorr) {
            maxHalfCorr = c;
            halfLag = lagIdx;
          }
        }
      }
      if (maxHalfCorr >= maxCorr * 0.88) {
        chosenPeriod = halfLag;
      }
    }

    // Parabolic sub-sample peak refinement
    const alpha = correlations[chosenPeriod - 1];
    const beta = correlations[chosenPeriod];
    const gamma = correlations[chosenPeriod + 1];
    const delta = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma + 1e-9);
    const refinedPeriod = chosenPeriod + delta;
    const freq = sampleRate / refinedPeriod;

    return { freq, confidence: beta, rms };
  }

  // ============================================================================
  // Peak Extraction with Sub-bin Interpolation
  // ============================================================================

  extractPeaks(cleanAmps: Float32Array, sampleRate: number, maxFreq = this.config.maxFreq, minFreq = this.config.minFreq): DetectedPeak[] {
    const binWidth = sampleRate / this.config.fftSize;
    const minBin = Math.max(1, Math.floor(minFreq / binWidth));
    const maxBin = Math.min(cleanAmps.length - 2, Math.ceil(maxFreq / binWidth));

    const peaks: DetectedPeak[] = [];

    for (let b = minBin; b <= maxBin; b++) {
      const val = cleanAmps[b];
      // Requiring cleanAmp > 0.0035 to filter out small noise ripples and ambient mic hiss
      if (val > 0.0035 && val > cleanAmps[b - 1] && val > cleanAmps[b + 1]) {
        const alpha = cleanAmps[b - 1];
        const beta = cleanAmps[b];
        const gamma = cleanAmps[b + 1];
        const delta = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma + 1e-9);
        const interpBin = b + delta;
        const peakFreq = interpBin * binWidth;
        
        const midi = 69 + 12 * Math.log2(peakFreq / 440);
        const nearestPitch = Math.round(midi);
        const pitchClass = ((nearestPitch % 12) + 12) % 12;
        
        peaks.push({
          freq: peakFreq,
          midi,
          note: NOTE_NAMES[pitchClass],
          amp: val,
          pitchClass,
          bin: interpBin,
        });
      }
    }
    
    return peaks;
  }

  extractRingingNotes(peaks: DetectedPeak[]): Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> {
    if (!peaks || peaks.length === 0) return [];
    const sorted = [...peaks].sort((a, b) => b.amp - a.amp);
    const seenPcs = new Set<number>();
    const ringing: Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> = [];
    for (const pk of sorted) {
      if (!seenPcs.has(pk.pitchClass) && ringing.length < 5) {
        seenPcs.add(pk.pitchClass);
        const oct = Math.floor(pk.midi / 12) - 1;
        const nearestMidi = Math.round(pk.midi);
        const cents = Math.round((pk.midi - nearestMidi) * 100);
        ringing.push({
          note: pk.note,
          freq: Math.round(pk.freq * 10) / 10,
          octave: oct,
          amp: pk.amp,
          cents,
        });
      }
    }
    return ringing;
  }

  // ============================================================================
  // Build Chroma Vector
  // ============================================================================

  /**
   * Harmonic whitening: a note's 5th harmonic adds phantom energy a major-3rd
   * above it (+4 semitones) — the main cause of minor→major errors — and its
   * 3rd/6th harmonics add a phantom perfect-5th (+7). Subtract the major-third
   * phantom more; touch the fifth only lightly (it overlaps the genuine fifth
   * present in almost every chord, so heavy subtraction turns minor into dim).
   */
  private whitenChroma(chroma: Float32Array): Float32Array {
    const out = new Float32Array(chroma);
    for (let i = 0; i < 12; i++) {
      const e = chroma[i];
      if (e <= 0) continue;
      out[(i + 4) % 12] = Math.max(0, out[(i + 4) % 12] - e * 0.14);
      out[(i + 7) % 12] = Math.max(0, out[(i + 7) % 12] - e * 0.05);
    }
    return out;
  }

  private normalizeChroma(chroma: Float32Array): Float32Array {
    let max = 0;
    for (let i = 0; i < 12; i++) if (chroma[i] > max) max = chroma[i];
    if (max >= 0.010) for (let i = 0; i < 12; i++) chroma[i] /= max;
    return chroma;
  }

  buildChroma(peaks: DetectedPeak[]): Float32Array {
    const rawChroma = new Float32Array(12);
    peaks.forEach(pk => {
      const freqWeight = pk.freq <= 350 ? 1.0 : Math.max(0.35, 350 / pk.freq);
      rawChroma[pk.pitchClass] += pk.amp * freqWeight;
    });
    return this.normalizeChroma(this.whitenChroma(rawChroma));
  }

  /** Keep the existing entry point while using harmonic-aware note activations. */
  buildChromaCQT(cleanAmps: Float32Array, sampleRate: number, peaks = this.extractPeaks(cleanAmps, sampleRate)): Float32Array {
    return harmonicChroma(cleanAmps, sampleRate, this.config.fftSize, peaks);
  }

  private isSingleHarmonicSpectrum(peaks: DetectedPeak[], sampleRate: number): boolean {
    const strong = peaks.filter(peak => peak.amp >= (peaks[0]?.amp ?? 0) * .08);
    if (!strong.length) return false;
    const energy = strong.reduce((sum, peak) => sum + peak.amp * peak.amp, 0);
    return strong.some(fundamental => {
      let explained = 0, independentUpperTone = false;
      for (const peak of strong) {
        const harmonic = Math.round(peak.freq / fundamental.freq);
        const fits = harmonic >= 1 && Math.abs(peak.freq - fundamental.freq * harmonic) <= Math.max(sampleRate / this.config.fftSize * 1.5, peak.freq * .015);
        if (fits) explained += peak.amp * peak.amp;
        else if (peak.freq > fundamental.freq * 1.4) independentUpperTone = true;
      }
      // Allow weak low body resonances, but not an independent upper chord tone.
      return !independentUpperTone && explained >= energy * .92;
    });
  }

  // ============================================================================
  // Single Note Detection & Processing
  // ============================================================================

  detectSingleNote(
    peaks: DetectedPeak[],
    sampleRate: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): {
    freq: number;
    midi: number;
    pitchClass: number;
    note: NoteName;
    octave: number;
    cents: number;
    confidence: number;
    guitarPosition?: GuitarPosition;
    tunerVerdict: 'in-tune' | 'flat' | 'sharp';
  } | null {
    if (!peaks || peaks.length === 0) return null;

    if (this.config.targetMode !== 'chords') {
      const estimate = this.timeBuffer ? estimateNotePitch(this.timeBuffer, sampleRate) : null;
      if (!estimate) return null;
      const estimateMidi = 69 + 12 * Math.log2(estimate.freq / 440);
      const fundamental = peaks.find(peak => Math.abs(peak.midi - estimateMidi) < .35 && peak.amp >= peaks[0].amp * .08);
      if (!fundamental) return null;
      let energy = 0, supported = 0;
      for (const peak of peaks) {
        energy += peak.amp * peak.amp;
        const harmonic = Math.round(peak.freq / estimate.freq);
        if (harmonic >= 1 && Math.abs(peak.freq - estimate.freq * harmonic) <= Math.max(sampleRate / this.config.fftSize, peak.freq * .01)) supported += peak.amp * peak.amp;
      }
      if (supported < energy * .80) return null;
      const midi = 69 + 12 * Math.log2(estimate.freq / 440), rounded = Math.round(midi);
      const cents = Math.round((midi - rounded) * 100), pitchClass = ((rounded % 12) + 12) % 12;
      return {
        freq: estimate.freq, midi, pitchClass, note: NOTE_NAMES[pitchClass], octave: Math.floor(rounded / 12) - 1,
        cents, confidence: Math.min(99, Math.round(estimate.confidence * 100)),
        guitarPosition: this.findGuitarPosition(rounded, tuning) ?? undefined,
        tunerVerdict: Math.abs(cents) <= 4 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp',
      };
    }

    // 1. Try autocorrelation on time-domain buffer
    const autoCorr = this.timeBuffer ? this.fastAutocorrelate(this.timeBuffer, sampleRate) : { freq: -1, confidence: 0, rms: 0 };
    const isHum = !this.noiseProfile?.calibrated && (Math.abs(autoCorr.freq - 50) < 2 || Math.abs(autoCorr.freq - 60) < 2 ||
                   Math.abs(autoCorr.freq - 100) < 2 || Math.abs(autoCorr.freq - 120) < 2) && autoCorr.rms < 0.035;

    let f0 = -1;
    let confidence = 0;

    if (!isHum && autoCorr.freq >= 70 && autoCorr.freq <= 900 && autoCorr.confidence >= 0.40) {
      f0 = autoCorr.freq;
      confidence = Math.round(autoCorr.confidence * 100);
    }

    // 2. If autocorrelation failed or is in doubt, check strongest FFT peaks with subharmonic inspection
    if (f0 <= 0 && peaks[0] && peaks[0].amp >= 0.005) {
      const topFreq = peaks[0].freq;
      // Check for subharmonic fundamentals (e.g. if 2nd harmonic was louder than fundamental)
      const subharmonic2 = peaks.find(p => Math.abs(p.freq - topFreq / 2) < Math.max(8, (topFreq / 2) * 0.06) && p.amp > 0.15 * peaks[0].amp);
      const subharmonic3 = (topFreq / 3 >= 70) ? peaks.find(p => Math.abs(p.freq - topFreq / 3) < Math.max(8, (topFreq / 3) * 0.06) && p.amp > 0.18 * peaks[0].amp) : undefined;

      if (subharmonic2) {
        f0 = subharmonic2.freq;
      } else if (subharmonic3) {
        f0 = subharmonic3.freq;
      } else {
        f0 = topFreq;
      }
      confidence = Math.min(95, Math.round(50 + peaks[0].amp * 200));
    }

    if (f0 <= 0 || f0 < 65 || f0 > 1100) return null;

    const midi = 69 + 12 * Math.log2(f0 / 440);
    const roundMidi = Math.round(midi);
    const cents = Math.round((midi - roundMidi) * 100);
    const pitchClass = ((roundMidi % 12) + 12) % 12;
    const note = NOTE_NAMES[pitchClass];
    const octave = Math.floor(roundMidi / 12) - 1;
    const guitarPosition = this.findGuitarPosition(roundMidi, tuning) || undefined;
    const tunerVerdict: 'in-tune' | 'flat' | 'sharp' = 
      Math.abs(cents) <= 4 ? 'in-tune' : (cents < 0 ? 'flat' : 'sharp');

    return {
      freq: f0,
      midi,
      pitchClass,
      note,
      octave,
      cents,
      confidence,
      guitarPosition,
      tunerVerdict,
    };
  }

  // ============================================================================
  // Chord Processing (Template Correlation + 7th Disambiguation + Hysteresis)
  // ============================================================================

  processChord(
    smoothedChroma: Float32Array,
    peaks: DetectedPeak[]
  ): DetectionResult {
    // 1. Chroma Sparsity / Contrast Check
    // Diffuse noise distributes energy flatly across all 12 semitones (low std dev).
    // Guitar chords concentrate energy into 3-5 distinct pitch classes.
    let sumChroma = 0;
    for (let i = 0; i < 12; i++) sumChroma += smoothedChroma[i];
    const meanChroma = sumChroma / 12;
    let varChroma = 0;
    for (let i = 0; i < 12; i++) {
      const diff = smoothedChroma[i] - meanChroma;
      varChroma += diff * diff;
    }
    const stdChroma = Math.sqrt(varChroma / 12);

    if (stdChroma < 0.18) {
      return {
        mode: 'idle',
        freshness: 'none',
        timestamp: Date.now(),
        chord: undefined,
        chroma: new Float32Array(smoothedChroma),
        peaks,
        ringingNotes: this.extractRingingNotes(peaks),
        spectrum: new Float32Array(0),
        signalLevelDb: 0,
        statusMessage: 'Noise filtered • Strum guitar chord cleanly',
      };
    }

    const matches: Array<{
      name: string;
      short: string;
      root: string;
      quality: string;
      formula: string;
      intervals: string;
      corr: number;
      tones: number[];
    }> = [];

    // Template correlation for all 12 roots and 10 qualities
    for (let root = 0; root < 12; root++) {
      const rootName = NOTE_NAMES[root];
      
      CHORD_TEMPLATES.forEach(tpl => {
        let dotProduct = 0;
        let normTemplate = 0;
        let normChroma = 0;
        
        for (let i = 0; i < 12; i++) {
          const tplWeight = tpl.weights[i];
          const chromaVal = smoothedChroma[(root + i) % 12];
          dotProduct += tplWeight * chromaVal;
          normTemplate += tplWeight * tplWeight;
          normChroma += chromaVal * chromaVal;
        }
        
        const correlation = dotProduct / (Math.sqrt(normTemplate) * Math.sqrt(normChroma) + 1e-5);
        
        matches.push({
          name: `${rootName} ${tpl.name}`,
          short: `${rootName}${tpl.short}`,
          root: rootName,
          quality: tpl.name,
          formula: tpl.formula,
          intervals: tpl.intervals,
          corr: correlation,
          tones: tpl.weights.flatMap((weight, i) => weight > 0 ? [i] : []),
        });
      });
    }

    // Incumbent hysteresis bonus (+0.05)
    matches.forEach(m => {
      if (this.lastLockedChord === m.short) {
        m.corr += 0.05;
      }
    });

    matches.sort((a, b) => b.corr - a.corr);
    let best = matches[0];

    // 7th Note Disambiguation & Gating Engine (Am vs Am7, C vs Cmaj7)
    const rootIdx = NOTE_NAMES.indexOf(best.root as NoteName);
    const isMinor = best.quality.includes("Minor") || best.quality.includes("m7");
    const triadQuality = isMinor ? "Minor" : "Major";
    const triadMatch = matches.find(m => m.root === best.root && m.quality === triadQuality);

    const seventhInterval = (best.quality === "Major 7th") ? 11 : 10;
    const thirdInterval = isMinor ? 3 : 4;
    const rootEnergy = smoothedChroma[rootIdx];
    const thirdEnergy = smoothedChroma[(rootIdx + thirdInterval) % 12];
    const fifthEnergy = smoothedChroma[(rootIdx + 7) % 12];
    const seventhEnergy = smoothedChroma[(rootIdx + seventhInterval) % 12];
    const triadAvg = (rootEnergy + thirdEnergy + fifthEnergy) / 3;
    const seventhRatio = seventhEnergy / (triadAvg + 0.001);

    if (best.quality.includes("7") || best.quality.includes("7th")) {
      if (triadMatch && seventhRatio < this.config.seventhStrictness) {
        best = triadMatch;
      }
    }

    // Sus2/sus4 and augmented spellings can describe the same pitch set.
    // Prefer the observed bass only within that equivalent set, not for arbitrary inversions.
    const bassPitchClass = [...peaks].filter(peak => peak.amp >= (peaks[0]?.amp ?? 0) * .10 && Math.abs(peak.midi - Math.round(peak.midi)) <= .35)
      .sort((a, b) => a.freq - b.freq)[0]?.pitchClass;
    if (bassPitchClass !== undefined) {
      const pitchMask = (match: typeof best) => match.tones.reduce((mask, tone) => mask | (1 << ((NOTE_NAMES.indexOf(match.root as NoteName) + tone) % 12)), 0);
      const mask = pitchMask(best);
      best = matches.find(match => NOTE_NAMES.indexOf(match.root as NoteName) === bassPitchClass && pitchMask(match) === mask) ?? best;
    }

    if (best.tones.length === 2) {
      const root = NOTE_NAMES.indexOf(best.root as NoteName);
      const strong = peaks.filter(peak => peak.amp >= (peaks[0]?.amp ?? 0) * .08);
      const fundamental = strong.filter(peak => peak.pitchClass === root).sort((a, b) => a.freq - b.freq)[0];
      if (fundamental && strong.every(peak => {
        const harmonic = Math.round(peak.freq / fundamental.freq);
        return harmonic >= 1 && Math.abs(peak.freq - fundamental.freq * harmonic) <= Math.max(fundamental.freq * .08, peak.freq * .015);
      })) {
        return { mode: 'idle', freshness: 'none', timestamp: Date.now(), chroma: new Float32Array(smoothedChroma),
          peaks, ringingNotes: this.extractRingingNotes(peaks), spectrum: new Float32Array(0), signalLevelDb: 0,
          statusMessage: 'Single-note harmonics detected. Strum independent chord tones.' };
      }
    }

    // Consensus voting buffer (5 frames — a little more temporal smoothing to
    // outvote brief single-frame misfires without slowing real changes much)
    this.candidateVoteHistory.push(best.short);
    if (this.candidateVoteHistory.length > 5) this.candidateVoteHistory.shift();
    
    const voteCount = this.candidateVoteHistory.filter(c => c === best.short).length;
    const isIncumbent = (this.lastLockedChord === best.short);

    // Establishing a NEW chord requires strict certainty (anti-randomness guard):
    // 1) 3 frames in agreement with corr >= 0.32, OR 2 frames with corr >= 0.40, OR single frame with corr >= 0.52
    // 2) Minimum correlation of 0.34 (~70% confidence)
    const isConsensusWinner = isIncumbent 
      ? (voteCount >= 1) 
      : ((voteCount >= 3 && best.corr >= 0.32) || (voteCount >= 2 && best.corr >= 0.40) || (best.corr >= 0.52));

    const topCandidates = [best, ...matches.filter(match => match !== best)].slice(0, 3).map(m => ({
      symbol: m.short,
      confidence: Math.min(99, Math.max(0, Math.round(m.corr * 100))),
      name: m.name,
    }));

    // Minimum correlation threshold:
    // 0.35 for establishing a NEW chord lock; 0.28 for sustaining an incumbent chord during decay
    const minRequiredCorr = isIncumbent ? 0.28 : 0.35;

    if (best.corr < minRequiredCorr || !isConsensusWinner) {
      return {
        mode: 'idle',
        freshness: 'none',
        timestamp: Date.now(),
        chord: undefined,
        chroma: new Float32Array(smoothedChroma),
        peaks,
        ringingNotes: this.extractRingingNotes(peaks),
        spectrum: new Float32Array(0),
        signalLevelDb: 0,
        statusMessage: isIncumbent 
          ? `Chord ${this.lastLockedChord} decaying...` 
          : 'Listening • Strum chord clearly to confirm...',
      };
    }

    const confidencePct = Math.min(99, Math.round(best.corr * 100)) + '%';
    const activeNotes: NoteName[] = [];
    const rootIdx2 = NOTE_NAMES.indexOf(best.root as NoteName);
    for (let i = 0; i < 12; i++) {
      if (smoothedChroma[i] > 0.28) activeNotes.push(NOTE_NAMES[i]);
    }

    const supported = best.tones.every(tone => smoothedChroma[(rootIdx2 + tone) % 12] > .20);
    if (activeNotes.length < best.tones.length || smoothedChroma[rootIdx2] < .25 || !supported) {
      return {
        mode: 'idle',
        freshness: 'none',
        timestamp: Date.now(),
        chord: undefined,
        chroma: new Float32Array(smoothedChroma),
        peaks,
        ringingNotes: this.extractRingingNotes(peaks),
        spectrum: new Float32Array(0),
        signalLevelDb: 0,
        statusMessage: 'Listening • Strum all chord strings cleanly...',
      };
    }
    
    const intervalsStr = activeNotes.map(n => {
      const noteIdx = NOTE_NAMES.indexOf(n);
      const diff = (noteIdx - rootIdx2 + 12) % 12;
      return DEGREE_NAMES[diff];
    }).join(' - ');
    
    this.lastLockedChord = best.short;

    const ringingNotes = this.extractRingingNotes(peaks);

    const result: DetectionResult = {
      mode: 'chord',
      freshness: 'fresh',
      timestamp: Date.now(),
      chord: {
        symbol: best.short,
        root: best.root as NoteName,
        quality: best.quality as ChordQuality,
        confidence: parseInt(confidencePct),
        activeNotes: activeNotes.length > 0 ? activeNotes : [best.root as NoteName],
        intervals: intervalsStr || best.formula,
        formula: best.formula,
        sargam: intervalsStr || best.formula,
        candidates: topCandidates,
      },
      chroma: new Float32Array(smoothedChroma),
      peaks,
      ringingNotes,
      spectrum: new Float32Array(0),
      signalLevelDb: 0,
      statusMessage: `Confirmed Chord: ${best.short} (${confidencePct}) • Listening for next change...`,
    };

    return result;
  }

  // ============================================================================
  // Main Processing Loop
  // ============================================================================

  private clearStrumAttempt(): void {
    this.strumState = 'idle';
    this.strumAttackTimestamp = 0;
    this.strumChromaBuffer = [];
    this.candidateVoteHistory = [];
  }

  private holdResult(result: DetectionResult, spectrum: Float32Array, signalLevelDb: number): DetectionResult {
    const label = result.chord?.symbol ?? `${result.note?.pitch.note}${result.note?.pitch.octave}`;
    return {
      ...result,
      freshness: 'held',
      spectrum,
      signalLevelDb,
      chroma: new Float32Array(this.smoothedChroma),
      peaks: [],
      ringingNotes: [],
      statusMessage: `Last confirmed: ${label} • Held, not a new detection • Play again to update`,
    };
  }

  processFrame(
    freqData: Float32Array,
    sampleRate: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult | null {
    this.frameSignalPresent = false;
    const result = this.processFrameResult(freqData, sampleRate, tuning);
    if (result) result.performance = {
      id: this.performanceId, attackAt: this.performanceAttackAt,
      frameAt: Date.now(), signalPresent: this.frameSignalPresent,
    };
    return result;
  }

  private processFrameResult(
    freqData: Float32Array, 
    sampleRate: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult | null {
    if (!this.analyser) return null;
    const now = Date.now();
    // Expire before every gate/early return, even if fewer than three usable
    // frames arrived. A later attempt must start with a new attack.
    if (this.strumState === 'attack' && now - this.strumAttackTimestamp > 350) {
      this.clearStrumAttempt();
    }

    // 1. Calculate signal level & true time-domain RMS
    let maxDb = -120;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > maxDb) maxDb = freqData[i];
    }

    if (!this.timeBuffer || this.timeBuffer.length !== this.analyser.fftSize) {
      this.timeBuffer = new Float32Array(this.analyser.fftSize);
    }
    this.analyser.getFloatTimeDomainData(this.timeBuffer as any);
    let sumSq = 0;
    for (let i = 0; i < this.timeBuffer.length; i++) {
      const v = this.timeBuffer[i];
      sumSq += v * v;
    }
    const currentRms = Math.sqrt(sumSq / this.timeBuffer.length);

    // 2. Handle calibration
    if (this.isCalibrating) {
      const calRes = this.processCalibrationFrame(freqData, currentRms);
      if (calRes && calRes.complete) {
        return {
          mode: 'idle',
          freshness: 'none',
          timestamp: now,
          chroma: new Float32Array(12),
          peaks: [],
          ringingNotes: [],
          spectrum: freqData,
          signalLevelDb: maxDb,
          isCalibrating: false,
          calibrationComplete: true,
          calibratedDb: calRes.noiseFloorDb,
          calibrationWarning: this.noiseProfile?.warning,
          statusMessage: this.noiseProfile?.warning ?? `Room reference captured (${Math.round(calRes.noiseFloorDb)} dB). Strum a chord or pluck a note.`,
        };
      } else {
        const pct = calRes ? calRes.progress : 0;
        return {
          mode: 'idle',
          freshness: 'none',
          timestamp: now,
          chroma: new Float32Array(12),
          peaks: [],
          ringingNotes: [],
          spectrum: freqData,
          signalLevelDb: maxDb,
          isCalibrating: true,
          calibrationProgress: pct,
          statusMessage: `🧹 Checking room noise... (${pct}%) Please stay silent`,
        };
      }
    }

    // 3. Spectral subtraction
    const rawAmps = new Float32Array(freqData.length);
    for (let i = 0; i < freqData.length; i++) {
      rawAmps[i] = Math.pow(10, freqData[i] / 20);
    }
    const cleanAmps = this.applySpectralSubtraction(rawAmps);
    const calibratedRms = this.noiseProfile?.rms;
    const analysisScale = calibratedRms !== undefined ? Math.max(1, Math.min(12, .10 / Math.max(currentRms, .000001))) : 1;

    const targetMode = this.config.targetMode || 'chords';
    const upperFrequency = targetMode === 'chords' ? 1250 : Math.max(NOTE_PITCH_MAX, this.config.maxFreq);
    // Chord analysis retains its existing band; note/tuner input also covers the upper register.
    const binWidth = sampleRate / this.config.fftSize;
    const minGuitarBin = Math.max(1, Math.floor((targetMode === 'chords' ? 65 : NOTE_PITCH_MIN) / binWidth));
    const maxGuitarBin = Math.min(cleanAmps.length - 1, Math.ceil(upperFrequency / binWidth));

    let totalGuitarBandEnergy = 0;
    let maxCleanAmp = 0;
    for (let b = minGuitarBin; b <= maxGuitarBin; b++) {
      const amp = cleanAmps[b];
      totalGuitarBandEnergy += amp;
      if (amp > maxCleanAmp) maxCleanAmp = amp;
    }

    const energyFlux = (totalGuitarBandEnergy - this.prevFrameBandEnergy) * analysisScale;
    this.prevFrameBandEnergy = totalGuitarBandEnergy;
    totalGuitarBandEnergy *= analysisScale;
    maxCleanAmp *= analysisScale;
    for (let i = 0; i < cleanAmps.length; i++) cleanAmps[i] *= analysisScale;

    // 5. Signal presence & Gate Check (Rejects room noise cleanly)
    const minDbThreshold = this.getGateThresholdDb();
    let spectralGatePassed = maxDb > minDbThreshold;
    if (this.noiseProfile?.calibrated) {
      const ratio = 10 ** (Math.max(10, this.config.noiseGateDb) / 20);
      const upper = Math.min(rawAmps.length - 1, Math.ceil((targetMode === 'chords' ? this.config.maxFreq : upperFrequency) / binWidth));
      spectralGatePassed = false;
      for (let b = minGuitarBin; b <= upper; b++) {
        if (cleanAmps[b] > .005 && rawAmps[b] > this.noiseProfile.amps[b] * ratio) { spectralGatePassed = true; break; }
      }
    }
    const rmsFloor = calibratedRms !== undefined ? Math.max(.0015, calibratedRms * 2.5) : .018;
    const isGatePassed = spectralGatePassed && currentRms > rmsFloor;
    this.frameSignalPresent = isGatePassed;
    if (this.gainSettleFrames > 0) {
      this.gainSettleFrames--;
      const held = this.lockedChordResult ?? this.lockedNoteResult;
      if (held) return this.holdResult(held, freqData, maxDb);
      return { mode: 'idle', freshness: 'none', timestamp: now, chroma: new Float32Array(this.smoothedChroma),
        peaks: [], ringingNotes: [], spectrum: freqData, signalLevelDb: maxDb, statusMessage: 'Adjusting microphone sensitivity. Listening resumes automatically.' };
    }
    const isStrumAttack = (energyFlux > 0.028 || (totalGuitarBandEnergy > 0.08 && energyFlux > 0.014)) &&
                          isGatePassed && (currentRms > rmsFloor * (4 / 3));
    if (isStrumAttack) {
      this.performanceId++;
      this.performanceAttackAt = now;
    }

    const silenceDuration = now - this.lastAudioActivityTimestamp;
    if (!isGatePassed) {
      this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
      // If sustained silence for > 5 seconds, clear the held chord/note
      if (this.lastAudioActivityTimestamp > 0 && silenceDuration > 5000) {
        this.lockedChordResult = null;
        this.lockedNoteResult = null;
        this.lastLockedChord = null;
        this.clearStrumAttempt();
        for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.50;
        return {
          mode: 'idle',
          freshness: 'none',
          timestamp: now,
          chord: undefined,
          chroma: new Float32Array(this.smoothedChroma),
          peaks: [],
          ringingNotes: [],
          spectrum: freqData,
          signalLevelDb: maxDb,
          statusMessage: this.config.triggerMode === 'guitartuna'
            ? '🎸 Ready • Strum any guitar chord or pluck note'
            : 'Ready • Continuous listening active...',
        };
      }

      // Within 5 seconds, hold the previously identified chord or note!
      if (this.lockedChordResult) {
        return this.holdResult(this.lockedChordResult, freqData, maxDb);
      }
      if (this.lockedNoteResult && targetMode !== 'chords') {
        return this.holdResult(this.lockedNoteResult, freqData, maxDb);
      }

      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.85;
      return {
        mode: 'idle',
        freshness: 'none',
        timestamp: now,
        chord: undefined,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: this.config.triggerMode === 'guitartuna'
          ? 'Strum capture · Waiting for a clear guitar attack...'
          : 'Ready • Continuous listening active... strum any chord or pluck note',
      };
    }

    // Audio is present! Update activity timestamp
    this.lastAudioActivityTimestamp = now;

    // 6. Extract peaks and verify tonal content
    if (analysisScale !== 1) for (let i = 0; i < this.timeBuffer.length; i++) this.timeBuffer[i] *= analysisScale;
    const peaks = this.extractPeaks(cleanAmps, sampleRate, targetMode === 'chords' ? this.config.maxFreq : upperFrequency,
      targetMode === 'chords' ? this.config.minFreq : NOTE_PITCH_MIN);
    peaks.sort((a, b) => b.amp - a.amp);

    const numGuitarBins = maxGuitarBin - minGuitarBin + 1;
    const meanBandAmp = totalGuitarBandEnergy / numGuitarBins;
    const crestFactor = (peaks[0]?.amp || 0) / (meanBandAmp + 1e-6);

    if (peaks.length === 0 || peaks[0].amp < 0.005 || crestFactor < 2.6) {
      this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
      if (this.lockedChordResult) {
        return this.holdResult(this.lockedChordResult, freqData, maxDb);
      }
      if (this.lockedNoteResult && targetMode !== 'chords') {
        return this.holdResult(this.lockedNoteResult, freqData, maxDb);
      }
      return {
        mode: 'idle',
        freshness: 'none',
        timestamp: now,
        chord: undefined,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: 'Ambient noise filtered • Awaiting clear guitar sound',
      };
    }

    // 7. Check for Single Note vs Polyphonic Chord (1-2 pitch classes vs >= 3)
    const activePeakPcs = new Set<number>();
    const maxAmp = peaks[0].amp;
    for (const pk of peaks) {
      if (pk.amp > 0.22 * maxAmp) {
        activePeakPcs.add(pk.pitchClass);
      }
    }
    const isPolyphonicChord = (activePeakPcs.size >= 3 || (targetMode === 'chords' && activePeakPcs.size >= 2))
      && !this.isSingleHarmonicSpectrum(peaks, sampleRate);

    // --------------------------------------------------------------------------
    // SINGLE NOTE PROCESSING (Accurately lights up in 12 Semitone Energy C to B)
    // --------------------------------------------------------------------------
    if (!isPolyphonicChord || targetMode === 'notes') {
      const singleNote = this.detectSingleNote(peaks, sampleRate, tuning);
      if (singleNote) {
        // Build dedicated single note chroma: 100% on the single note semitone!
        const singleNoteChroma = new Float32Array(12);
        singleNoteChroma[singleNote.pitchClass] = 1.0;
        singleNoteChroma[(singleNote.pitchClass + 7) % 12] = 0.20; // natural 5th overtone
        for (let i = 0; i < 12; i++) {
          this.smoothedChroma[i] = 0.40 * this.smoothedChroma[i] + 0.60 * singleNoteChroma[i];
        }

        const ringingNotes: Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> = [{
          note: singleNote.note,
          freq: Math.round(singleNote.freq * 10) / 10,
          octave: singleNote.octave,
          amp: peaks[0]?.amp || 0.1,
          cents: singleNote.cents,
        }];

        // Chords-only mode visualizes single-note energy without guessing a
        // chord. An earlier confirmed chord may remain as display-only history.
        if (targetMode === 'chords') {
          if (this.lockedChordResult) return this.holdResult(this.lockedChordResult, freqData, maxDb);
          return {
            mode: 'idle',
            freshness: 'none',
            timestamp: now,
            chord: undefined,
            chroma: new Float32Array(this.smoothedChroma),
            peaks,
            ringingNotes,
            spectrum: freqData,
            signalLevelDb: maxDb,
            statusMessage: `🎵 Note: ${singleNote.note}${singleNote.octave} (${singleNote.freq.toFixed(1)} Hz) in 12 Semitone Energy • Strum >= 3 strings for chords`,
          };
        }

        const noteMidi = Math.round(singleNote.midi);
        if (this.pendingNoteMidi !== noteMidi) {
          this.pendingNoteMidi = noteMidi; this.pendingNoteFrames = 1;
        } else this.pendingNoteFrames = Math.min(2, this.pendingNoteFrames + 1);
        if (this.pendingNoteFrames < 2) {
          if (this.lockedNoteResult) return this.holdResult(this.lockedNoteResult, freqData, maxDb);
          return { mode: 'idle', freshness: 'none', timestamp: now, chroma: new Float32Array(this.smoothedChroma),
            peaks, ringingNotes: [], spectrum: freqData, signalLevelDb: maxDb, statusMessage: 'Checking note pitch. Let one string ring.' };
        }

        // In Notes & Tuner or Auto mode, return single-note with full tuning info
        const noteRes: DetectionResult = {
          mode: 'single-note',
          freshness: 'fresh',
          timestamp: now,
          chord: undefined,
          note: {
            pitch: {
              note: singleNote.note,
              octave: singleNote.octave,
              freq: singleNote.freq,
              cents: singleNote.cents,
              midi: singleNote.midi,
            },
            guitarPosition: singleNote.guitarPosition,
            confidence: singleNote.confidence,
            tunerVerdict: singleNote.tunerVerdict,
          },
          chroma: new Float32Array(this.smoothedChroma),
          peaks,
          ringingNotes,
          spectrum: freqData,
          signalLevelDb: maxDb,
          statusMessage: `🎵 Plucked: ${singleNote.note}${singleNote.octave} (${singleNote.freq.toFixed(1)} Hz, ${singleNote.cents > 0 ? '+' : ''}${singleNote.cents}¢) • ${singleNote.tunerVerdict}`,
        };

        this.lockedNoteResult = noteRes;
        this.lockedChordResult = null; // Plucking a single note clears chord lock
        this.lastLockedChord = null;
        this.clearStrumAttempt();
        return noteRes;
      } else if (targetMode !== 'chords') {
        this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
        if (this.lockedNoteResult) return this.holdResult(this.lockedNoteResult, freqData, maxDb);
        if (targetMode === 'notes') return { mode: 'idle', freshness: 'none', timestamp: now,
          chroma: new Float32Array(this.smoothedChroma), peaks, ringingNotes: [], spectrum: freqData, signalLevelDb: maxDb,
          statusMessage: 'No stable single-note pitch yet. Pluck one string and reduce nearby noise.' };
      }
    }

    // --------------------------------------------------------------------------
    // POLYPHONIC CHORD PROCESSING (>= 3 Distinct Active Pitch Classes)
    // --------------------------------------------------------------------------
    // Fit harmonic note evidence before folding it into pitch classes.
    this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
    const rawChroma = this.buildChromaCQT(cleanAmps, sampleRate, peaks);
    for (let i = 0; i < 12; i++) {
      this.smoothedChroma[i] = 0.55 * this.smoothedChroma[i] + 0.45 * rawChroma[i];
    }

    // Strum capture state machine for chords
    if (this.config.triggerMode === 'guitartuna') {
      if (this.strumState === 'idle') {
        if (!isStrumAttack) {
          if (this.lockedChordResult) {
            return this.holdResult(this.lockedChordResult, freqData, maxDb);
          }
          return {
            mode: 'idle',
            freshness: 'none',
            timestamp: now,
            chord: undefined,
            chroma: new Float32Array(this.smoothedChroma),
            peaks,
            ringingNotes: this.extractRingingNotes(peaks),
            spectrum: freqData,
            signalLevelDb: maxDb,
            statusMessage: 'Strum capture · Waiting for a clear guitar attack...',
          };
        }

        // Strum attack detected!
        this.strumState = 'attack';
        this.strumAttackTimestamp = now;
        this.strumChromaBuffer = [];
        this.candidateVoteHistory = [];
        this.lockedNoteResult = null;
      }

      if (this.strumState === 'attack') {
        if (isStrumAttack && energyFlux > 0.045) {
          this.strumAttackTimestamp = now;
          this.strumChromaBuffer = [];
          this.candidateVoteHistory = [];
        }
        const elapsed = now - this.strumAttackTimestamp;

        if (elapsed >= 30 && elapsed <= 320) {
          this.strumChromaBuffer.push(rawChroma);
        }

        if (this.strumChromaBuffer.length >= 3) {
          const avgChroma = new Float32Array(12);
          for (const ch of this.strumChromaBuffer) {
            for (let i = 0; i < 12; i++) avgChroma[i] += ch[i];
          }
          for (let i = 0; i < 12; i++) avgChroma[i] /= this.strumChromaBuffer.length;
          for (let i = 0; i < 12; i++) this.smoothedChroma[i] = avgChroma[i];

          const chordRes = this.processChord(avgChroma, peaks);
          if (chordRes.mode === 'chord' && chordRes.chord) {
            this.lockedChordResult = chordRes;
            this.lastLockedChord = chordRes.chord.symbol;
            this.clearStrumAttempt();
            return chordRes;
          }
        }

        if (this.lockedChordResult) {
          const held = this.holdResult(this.lockedChordResult, freqData, maxDb);
          held.statusMessage += ' • Analyzing new strum...';
          return held;
        }
        return {
          mode: 'idle',
          freshness: 'none',
          timestamp: now,
          chroma: new Float32Array(this.smoothedChroma),
          peaks,
          ringingNotes: this.extractRingingNotes(peaks),
          spectrum: freqData,
          signalLevelDb: maxDb,
          statusMessage: '🎸 Strum detected • Analyzing chord resonance...',
        };
      }
    }

    // Continuous Mode for Chords
    const continuousRes = this.processChord(this.smoothedChroma, peaks);
    if (continuousRes.mode === 'chord' && continuousRes.chord) {
      this.lockedChordResult = continuousRes;
      this.lastLockedChord = continuousRes.chord.symbol;
      return continuousRes;
    } else if (this.lockedChordResult) {
      return this.holdResult(this.lockedChordResult, freqData, maxDb);
    }
    return continuousRes;
  }

  // ============================================================================
  // Guitar Position Finder
  // ============================================================================

  findGuitarPosition(midi: number, tuning: StringTuning[] = STANDARD_TUNING): GuitarPosition | null {
    const roundMidi = Math.round(midi);
    const candidates: GuitarPosition[] = [];
    
    tuning.forEach(str => {
      const fret = roundMidi - str.midi;
      if (fret >= 0 && fret <= 24) {
        candidates.push({
          stringIndex: str.stringIndex,
          stringName: str.note + (str.stringIndex + 1),
          fret,
          midi: roundMidi,
        });
      }
    });
    
    candidates.sort((a, b) => a.fret - b.fret);
    return candidates[0] || null;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getNoiseProfile(): NoiseProfile | null {
    return this.noiseProfile;
  }
  getInputSignalPresent(): boolean { return this.frameSignalPresent; }

  getSmoothedChroma(): Float32Array {
    return new Float32Array(this.smoothedChroma);
  }

  getLastLockedChord(): string | null {
    return this.lastLockedChord;
  }

  reset(): void {
    this.pendingNoteMidi = null; this.pendingNoteFrames = 0;
    this.frameSignalPresent = false;
    this.smoothedChroma.fill(0);
    this.prevFrameBandEnergy = 0;
    this.candidateVoteHistory = [];
    this.lastLockedChord = null;
    this.clearStrumAttempt();
    this.lockedChordResult = null;
    this.lockedNoteResult = null;
    this.lastAudioActivityTimestamp = 0;
  }
}