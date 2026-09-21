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
  midiToPitch,
  NoteName,
  ChordQuality,
  DetectionTargetMode
} from '../types';

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
  private maxObservedNoiseFloorDb = -120;
  private sumNoiseFloorDb = 0;
  private timeBuffer: Float32Array | null = null;
  
  // State
  private smoothedChroma = new Float32Array(12);
  private prevFrameBandEnergy = 0;
  
  // Anti-fluctuation hysteresis & continuous detection state
  private candidateVoteHistory: string[] = [];
  private lastLockedChord: string | null = null;


  // GuitarTuna Strum Capture State Machine
  private strumState: 'idle' | 'attack' = 'idle';
  private strumAttackTimestamp = 0;
  private strumChromaBuffer: Float32Array[] = [];
  private lockedChordResult: DetectionResult | null = null;
  private lockedChordUntil = 0;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config };
  }

  setConfig(config: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setAnalyser(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.timeBuffer = new Float32Array(analyser.fftSize);
  }

  // ============================================================================
  // Noise Calibration
  // ============================================================================

  startNoiseCalibration(): void {
    if (!this.analyser) return;
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    const bufferLength = this.analyser.frequencyBinCount;
    this.calibrationBuffer = new Float32Array(bufferLength).fill(0);
    this.calibrationPeakBuffer = new Float32Array(bufferLength).fill(0);
    this.maxObservedNoiseFloorDb = -120;
    this.sumNoiseFloorDb = 0;
  }

  processCalibrationFrame(freqData: Float32Array): { complete: boolean; noiseFloorDb: number; progress: number } | null {
    if (!this.isCalibrating || !this.calibrationBuffer || !this.calibrationPeakBuffer) return null;

    this.calibrationFrames++;
    let frameMaxDb = -120;
    for (let b = 0; b < freqData.length; b++) {
      if (freqData[b] > frameMaxDb) frameMaxDb = freqData[b];
      const linAmp = Math.pow(10, freqData[b] / 20);
      this.calibrationBuffer[b] += linAmp;
      if (linAmp > this.calibrationPeakBuffer[b]) {
        this.calibrationPeakBuffer[b] = linAmp;
      }
    }
    if (frameMaxDb > this.maxObservedNoiseFloorDb) {
      this.maxObservedNoiseFloorDb = frameMaxDb;
    }
    this.sumNoiseFloorDb += frameMaxDb;

    const TARGET_FRAMES = 45; // ~1.5s at 30 FPS
    const progress = Math.min(100, Math.round((this.calibrationFrames / TARGET_FRAMES) * 100));

    if (this.calibrationFrames >= TARGET_FRAMES) {
      for (let b = 0; b < this.calibrationBuffer.length; b++) {
        this.calibrationBuffer[b] /= this.calibrationFrames;
      }
      
      this.noiseProfile = {
        amps: this.calibrationBuffer,
        peakAmps: this.calibrationPeakBuffer,
        measuredNoiseFloorDb: this.maxObservedNoiseFloorDb,
        avgNoiseFloorDb: this.sumNoiseFloorDb / this.calibrationFrames,
        calibrated: true,
        timestamp: Date.now(),
      };
      
      this.isCalibrating = false;
      this.calibrationBuffer = null;
      this.calibrationPeakBuffer = null;
      return { complete: true, noiseFloorDb: this.maxObservedNoiseFloorDb, progress: 100 };
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
      // Calibrated room noise floor + margin (e.g. -48 dB + 14 dB = -34 dB)
      return this.noiseProfile.measuredNoiseFloorDb + margin;
    }
    // Safe uncalibrated baseline: -36.0 dB + (noiseGateDb - 14) * 0.6
    // Guaranteed to reject typical room noise (-55 to -44 dB)
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

    // First-peak selection to eliminate subharmonic octave doubling (preventing 2*T trap)
    let chosenPeriod = bestPeriod;
    for (let lag = minPeriod + 1; lag < bestPeriod - 2; lag++) {
      if (correlations[lag] > correlations[lag - 1] &&
          correlations[lag] > correlations[lag + 1] &&
          correlations[lag] >= maxCorr * 0.80) {
        chosenPeriod = lag;
        break;
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

  extractPeaks(cleanAmps: Float32Array, sampleRate: number): DetectedPeak[] {
    const binWidth = sampleRate / this.config.fftSize;
    const minBin = Math.floor(this.config.minFreq / binWidth);
    const maxBin = Math.min(cleanAmps.length - 2, Math.ceil(this.config.maxFreq / binWidth));

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

  buildChroma(peaks: DetectedPeak[]): Float32Array {
    const rawChroma = new Float32Array(12);
    
    peaks.forEach(pk => {
      // Guitar fundamentals (80 - 350 Hz) have full weight; upper harmonics gently roll off so overtones don't overpower the fundamental note
      const freqWeight = pk.freq <= 350 ? 1.0 : Math.max(0.35, 350 / pk.freq);
      rawChroma[pk.pitchClass] += pk.amp * freqWeight;
    });
    
    // Normalize only if the peak energy is substantial (not background hiss)
    let maxChroma = 0;
    for (let i = 0; i < 12; i++) {
      if (rawChroma[i] > maxChroma) maxChroma = rawChroma[i];
    }
    if (maxChroma >= 0.010) {
      for (let i = 0; i < 12; i++) rawChroma[i] /= maxChroma;
    }
    
    return rawChroma;
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

    // 1. Try autocorrelation on time-domain buffer
    const autoCorr = this.timeBuffer ? this.fastAutocorrelate(this.timeBuffer, sampleRate) : { freq: -1, confidence: 0, rms: 0 };
    const isHum = (Math.abs(autoCorr.freq - 50) < 2 || Math.abs(autoCorr.freq - 60) < 2 || 
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
      // Check for subharmonic fundamentals (e.g. if 2nd harmonic 164Hz or 220Hz was louder than fundamental 82Hz / 110Hz)
      const subharmonic2 = peaks.find(p => Math.abs(p.freq - topFreq / 2) < 5 && p.amp > 0.12 * peaks[0].amp);
      const subharmonic3 = peaks.find(p => Math.abs(p.freq - topFreq / 3) < 5 && p.amp > 0.12 * peaks[0].amp);

      if (subharmonic3) {
        f0 = subharmonic3.freq;
      } else if (subharmonic2) {
        f0 = subharmonic2.freq;
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

  processSingleNote(
    f0: number, 
    peaks: DetectedPeak[], 
    _dominantPc?: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult {
    const midi = 69 + 12 * Math.log2(f0 / 440);
    const roundMidi = Math.round(midi);
    const pitch = midiToPitch(roundMidi);
    const cents = Math.round((midi - roundMidi) * 100);
    const pitchClass = ((roundMidi % 12) + 12) % 12;
    
    const guitarPos = this.findGuitarPosition(roundMidi, tuning);
    const tunerVerdict: 'in-tune' | 'flat' | 'sharp' = 
      Math.abs(cents) <= 4 ? 'in-tune' : (cents < 0 ? 'flat' : 'sharp');

    // Build dedicated single-note chroma for 12 Semitone Energy
    const singleNoteChroma = new Float32Array(12);
    singleNoteChroma[pitchClass] = 1.0;
    singleNoteChroma[(pitchClass + 7) % 12] = 0.20; // natural 5th harmonic overtone
    for (let i = 0; i < 12; i++) {
      this.smoothedChroma[i] = 0.50 * this.smoothedChroma[i] + 0.50 * singleNoteChroma[i];
    }

    const ringingNotes = this.extractRingingNotes(peaks);
    
    const result: DetectionResult = {
      mode: 'single-note',
      timestamp: Date.now(),
      note: {
        pitch,
        guitarPosition: guitarPos || undefined,
        confidence: Math.max(70, Math.min(99, Math.round(55 + (peaks[0]?.amp || 0.1) * 100))),
        tunerVerdict,
      },
      chroma: new Float32Array(this.smoothedChroma),
      peaks,
      ringingNotes,
      spectrum: new Float32Array(0),
      signalLevelDb: 0,
      statusMessage: `🎵 Plucked Note: ${pitch.note}${pitch.octave} (${pitch.freq.toFixed(1)} Hz) • ${tunerVerdict}`,
    };

    return result;
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

    // Consensus voting buffer (3 frames)
    this.candidateVoteHistory.push(best.short);
    if (this.candidateVoteHistory.length > 3) this.candidateVoteHistory.shift();
    
    const voteCount = this.candidateVoteHistory.filter(c => c === best.short).length;
    const isIncumbent = (this.lastLockedChord === best.short);

    // Establishing a NEW chord requires strict certainty (anti-randomness guard):
    // 1) 3 frames in agreement with corr >= 0.32, OR 2 frames with corr >= 0.40, OR single frame with corr >= 0.52
    // 2) Minimum correlation of 0.34 (~70% confidence)
    const isConsensusWinner = isIncumbent 
      ? (voteCount >= 1) 
      : ((voteCount >= 3 && best.corr >= 0.32) || (voteCount >= 2 && best.corr >= 0.40) || (best.corr >= 0.52));

    const topCandidates = matches.slice(0, 3).map(m => ({
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

    // A chord must have at least 2 distinct pitch classes with energy (or be a valid power chord)
    const isPowerChord = best.quality.includes('5');
    const thirdIdx = isMinor ? (rootIdx2 + 3) % 12 : (rootIdx2 + 4) % 12;
    const fifthIdx = (rootIdx2 + 7) % 12;
    const hasThirdOrFifth = (smoothedChroma[thirdIdx] > 0.20 || smoothedChroma[fifthIdx] > 0.20);

    if (!isPowerChord && (activeNotes.length < 2 || smoothedChroma[rootIdx2] < 0.25 || !hasThirdOrFifth)) {
      return {
        mode: 'idle',
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

  processFrame(
    freqData: Float32Array, 
    sampleRate: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult | null {
    if (!this.analyser) return null;
    const now = Date.now();

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
      const calRes = this.processCalibrationFrame(freqData);
      if (calRes && calRes.complete) {
        return {
          mode: 'idle',
          timestamp: now,
          chroma: new Float32Array(12),
          peaks: [],
          ringingNotes: [],
          spectrum: freqData,
          signalLevelDb: maxDb,
          isCalibrating: false,
          calibrationComplete: true,
          calibratedDb: calRes.noiseFloorDb,
          statusMessage: `✅ Room Noise Calibrated (${Math.round(calRes.noiseFloorDb)} dB) • Ready! Strum any chord or pluck note`,
        };
      } else {
        const pct = calRes ? calRes.progress : 0;
        return {
          mode: 'idle',
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

    // 4. Total guitar band energy (65 Hz to 1250 Hz ONLY)
    const binWidth = sampleRate / this.config.fftSize;
    const minGuitarBin = Math.max(1, Math.floor(65 / binWidth));
    const maxGuitarBin = Math.min(cleanAmps.length - 1, Math.ceil(1250 / binWidth));

    let totalGuitarBandEnergy = 0;
    let maxCleanAmp = 0;
    for (let b = minGuitarBin; b <= maxGuitarBin; b++) {
      const amp = cleanAmps[b];
      totalGuitarBandEnergy += amp;
      if (amp > maxCleanAmp) maxCleanAmp = amp;
    }

    const energyFlux = totalGuitarBandEnergy - this.prevFrameBandEnergy;
    this.prevFrameBandEnergy = totalGuitarBandEnergy;

    // 5. Signal presence & Gate Check (Rejects room noise cleanly)
    const minDbThreshold = this.getGateThresholdDb();
    const isGatePassed = (maxDb > minDbThreshold) && (currentRms > 0.018);
    const isStrumAttack = (energyFlux > 0.028 || (totalGuitarBandEnergy > 0.08 && energyFlux > 0.014)) && 
                          isGatePassed && (currentRms > 0.024);

    const targetMode = this.config.targetMode || 'chords';

    if (!isGatePassed) {
      this.lastLockedChord = null;
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.75;
      return {
        mode: 'idle',
        timestamp: now,
        chord: undefined,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: this.config.triggerMode === 'guitartuna'
          ? '🎸 GuitarTuna Mode • Waiting for guitar strum or note...'
          : 'Ready • Continuous listening active... strum any chord or pluck note',
      };
    }

    // 6. Extract peaks and verify tonal content
    const peaks = this.extractPeaks(cleanAmps, sampleRate);
    peaks.sort((a, b) => b.amp - a.amp);

    const numGuitarBins = maxGuitarBin - minGuitarBin + 1;
    const meanBandAmp = totalGuitarBandEnergy / numGuitarBins;
    const crestFactor = (peaks[0]?.amp || 0) / (meanBandAmp + 1e-6);

    if (peaks.length === 0 || peaks[0].amp < 0.005 || crestFactor < 2.6) {
      return {
        mode: 'idle',
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
    const isPolyphonicChord = (activePeakPcs.size >= 3);

    // --------------------------------------------------------------------------
    // SINGLE NOTE PROCESSING (Accurately lights up in 12 Semitone Energy C to B)
    // --------------------------------------------------------------------------
    if (!isPolyphonicChord) {
      const singleNote = this.detectSingleNote(peaks, sampleRate, tuning);
      if (singleNote) {
        // Build dedicated single note chroma: 100% on the single note semitone!
        const singleNoteChroma = new Float32Array(12);
        singleNoteChroma[singleNote.pitchClass] = 1.0;
        singleNoteChroma[(singleNote.pitchClass + 7) % 12] = 0.20; // natural 5th overtone
        for (let i = 0; i < 12; i++) {
          this.smoothedChroma[i] = 0.50 * this.smoothedChroma[i] + 0.50 * singleNoteChroma[i];
        }

        const ringingNotes: Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> = [{
          note: singleNote.note,
          freq: Math.round(singleNote.freq * 10) / 10,
          octave: singleNote.octave,
          amp: peaks[0]?.amp || 0.1,
          cents: singleNote.cents,
        }];

        // In Chords Only mode, user requested: "for single note it only shows in 12 Semitone Energy (C to B)"
        // so chord is undefined, mode is idle (no fake chords guessed)
        if (targetMode === 'chords') {
          return {
            mode: 'idle',
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

        // In Notes & Tuner or Auto mode, return single-note with full tuning info
        return {
          mode: 'single-note',
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
      }
    }

    // --------------------------------------------------------------------------
    // POLYPHONIC CHORD PROCESSING (>= 3 Distinct Active Pitch Classes)
    // --------------------------------------------------------------------------
    const rawChroma = this.buildChroma(peaks);
    for (let i = 0; i < 12; i++) {
      this.smoothedChroma[i] = 0.55 * this.smoothedChroma[i] + 0.45 * rawChroma[i];
    }

    if (targetMode === 'notes') {
      const f0 = peaks[0]?.freq || 0;
      return this.processSingleNote(f0, peaks, peaks[0]?.pitchClass, tuning);
    }

    // GuitarTuna Strum Capture State Machine for Chords
    if (this.config.triggerMode === 'guitartuna') {
      if (this.strumState === 'idle') {
        if (!isStrumAttack) {
          if (this.lockedChordResult && now < this.lockedChordUntil) {
            return {
              ...this.lockedChordResult,
              timestamp: now,
              spectrum: freqData,
              signalLevelDb: maxDb,
              statusMessage: `🎸 Captured Chord: ${this.lockedChordResult.chord?.symbol} • Strum next chord to update`,
            };
          }
          this.lockedChordResult = null;
          this.lastLockedChord = null;
          return {
            mode: 'idle',
            timestamp: now,
            chord: undefined,
            chroma: new Float32Array(this.smoothedChroma),
            peaks,
            ringingNotes: this.extractRingingNotes(peaks),
            spectrum: freqData,
            signalLevelDb: maxDb,
            statusMessage: '🎸 GuitarTuna Trigger • Waiting for guitar strum attack...',
          };
        }

        // Strum attack detected!
        this.strumState = 'attack';
        this.strumAttackTimestamp = now;
        this.strumChromaBuffer = [];
        this.candidateVoteHistory = [];
      }

      if (this.strumState === 'attack') {
        const elapsed = now - this.strumAttackTimestamp;
        if (isStrumAttack && energyFlux > 0.045) {
          this.strumAttackTimestamp = now;
          this.strumChromaBuffer = [];
        }

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
            this.lockedChordUntil = now + 2000;
            this.lastLockedChord = chordRes.chord.symbol;
            this.strumState = 'idle';
            return chordRes;
          } else if (elapsed > 350) {
            this.strumState = 'idle';
            return {
              mode: 'idle',
              timestamp: now,
              chord: undefined,
              chroma: new Float32Array(this.smoothedChroma),
              peaks,
              ringingNotes: this.extractRingingNotes(peaks),
              spectrum: freqData,
              signalLevelDb: maxDb,
              statusMessage: 'Listening • Strum all chord strings cleanly...',
            };
          }
        }

        return {
          mode: 'idle',
          timestamp: now,
          chord: this.lockedChordResult?.chord,
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
    return this.processChord(this.smoothedChroma, peaks);
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

  getSmoothedChroma(): Float32Array {
    return new Float32Array(this.smoothedChroma);
  }

  getLastLockedChord(): string | null {
    return this.lastLockedChord;
  }

  reset(): void {
    this.smoothedChroma.fill(0);
    this.prevFrameBandEnergy = 0;
    this.candidateVoteHistory = [];
    this.lastLockedChord = null;
    this.strumState = 'idle';
    this.strumAttackTimestamp = 0;
    this.strumChromaBuffer = [];
    this.lockedChordResult = null;
    this.lockedChordUntil = 0;
  }
}