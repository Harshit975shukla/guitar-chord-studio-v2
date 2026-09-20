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
  ChordQuality
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
  oversubtraction: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  fftSize: 4096,
  smoothingTimeConstant: 0.15, // balanced smoothing
  minFreq: 65,
  maxFreq: 1400,
  noiseGateDb: 30, // moderate to high noise gate to avoid false triggers
  micGainMultiplier: 4.0,
  seventhStrictness: 0.55,
  triggerMode: 'continuous',
  oversubtraction: 1.30,
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
  private timeBuffer: Float32Array | null = null;
  
  // State
  private smoothedChroma = new Float32Array(12);
  private prevFrameBandEnergy = 0;
  
  // Anti-fluctuation hysteresis & continuous detection state
  private candidateVoteHistory: string[] = [];
  private lastLockedChord: string | null = null;
  private consecutiveNoteFrames = 0;
  private consecutiveChordFrames = 0;
  private currentDisplayMode: 'idle' | 'note' | 'chord' = 'idle';
  
  // Sustain hold & snapshot memory
  private lastDetectedChordSnapshot: any = null;
  private lastDetectedNoteSnapshot: any = null;
  private chordSustainHoldUntil = 0;
  private noteSustainHoldUntil = 0;

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
  }

  processCalibrationFrame(freqData: Float32Array): { complete: boolean; noiseFloorDb: number; progress: number } | null {
    if (!this.isCalibrating || !this.calibrationBuffer) return null;

    this.calibrationFrames++;
    for (let b = 0; b < freqData.length; b++) {
      const linAmp = Math.pow(10, freqData[b] / 20);
      this.calibrationBuffer[b] += linAmp;
    }

    const TARGET_FRAMES = 45; // ~1.5s at 30 FPS
    const progress = Math.min(100, Math.round((this.calibrationFrames / TARGET_FRAMES) * 100));

    if (this.calibrationFrames >= TARGET_FRAMES) {
      for (let b = 0; b < this.calibrationBuffer.length; b++) {
        this.calibrationBuffer[b] /= this.calibrationFrames;
      }
      
      let maxDb = -120;
      for (let i = 0; i < freqData.length; i++) {
        if (freqData[i] > maxDb) maxDb = freqData[i];
      }
      
      this.noiseProfile = {
        amps: this.calibrationBuffer,
        measuredNoiseFloorDb: maxDb,
        calibrated: true,
        timestamp: Date.now(),
      };
      
      this.isCalibrating = false;
      this.calibrationBuffer = null;
      return { complete: true, noiseFloorDb: maxDb, progress: 100 };
    }
    
    return { complete: false, noiseFloorDb: -120, progress };
  }

  // ============================================================================
  // Spectral Subtraction
  // ============================================================================

  applySpectralSubtraction(rawAmps: Float32Array): Float32Array {
    const cleanAmps = new Float32Array(rawAmps.length);
    if (this.noiseProfile?.calibrated && this.noiseProfile.amps) {
      for (let b = 0; b < rawAmps.length; b++) {
        cleanAmps[b] = Math.max(0, rawAmps[b] - this.noiseProfile.amps[b] * this.config.oversubtraction);
      }
    } else {
      cleanAmps.set(rawAmps);
    }
    return cleanAmps;
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
    if (rms < 0.007) return { freq: -1, confidence: 0, rms };

    const minPeriod = Math.floor(sampleRate / 850); // ~51 samples (G5)
    const maxPeriod = Math.floor(sampleRate / 68);  // ~648 samples (Drop D ~73 Hz)
    const windowLen = 1024;
    if (windowLen + maxPeriod > bufLen) return { freq: -1, confidence: 0, rms };

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

      if (!pastZeroDip && r < 0.20) pastZeroDip = true;
      if (pastZeroDip && r > maxCorr) {
        maxCorr = r;
        bestPeriod = lag;
      }
    }

    if (maxCorr < 0.45 || bestPeriod <= 0) {
      return { freq: -1, confidence: maxCorr > 0 ? maxCorr : 0, rms };
    }

    // First-peak selection to eliminate subharmonic octave doubling (preventing 2*T trap)
    let chosenPeriod = bestPeriod;
    for (let lag = minPeriod + 1; lag < bestPeriod - 2; lag++) {
      if (correlations[lag] > correlations[lag - 1] &&
          correlations[lag] > correlations[lag + 1] &&
          correlations[lag] >= maxCorr * 0.82) {
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
      if (val > 0.0016 && val > cleanAmps[b - 1] && val > cleanAmps[b + 1]) {
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
      const freqWeight = Math.min(2.5, Math.max(0.65, pk.freq / 240));
      rawChroma[pk.pitchClass] += pk.amp * freqWeight;
    });
    
    // Normalize
    let maxChroma = 0;
    for (let i = 0; i < 12; i++) {
      if (rawChroma[i] > maxChroma) maxChroma = rawChroma[i];
    }
    if (maxChroma > 0.0001) {
      for (let i = 0; i < 12; i++) rawChroma[i] /= maxChroma;
    }
    
    return rawChroma;
  }

  // ============================================================================
  // Single Note Processing
  // ============================================================================

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
    
    const guitarPos = this.findGuitarPosition(roundMidi, tuning);
    const tunerVerdict: 'in-tune' | 'flat' | 'sharp' = 
      Math.abs(cents) <= 4 ? 'in-tune' : (cents < 0 ? 'flat' : 'sharp');

    const ringingNotes = this.extractRingingNotes(peaks);
    this.noteSustainHoldUntil = Date.now() + 500;
    
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
      statusMessage: `Plucked Note: ${pitch.note}${pitch.octave} (${pitch.freq.toFixed(1)} Hz) • Listening...`,
    };

    this.lastDetectedNoteSnapshot = result;
    return result;
  }

  // ============================================================================
  // Chord Processing (Template Correlation + 7th Disambiguation + Hysteresis)
  // ============================================================================

  processChord(
    smoothedChroma: Float32Array,
    peaks: DetectedPeak[]
  ): DetectionResult {
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
    const isConsensusWinner = (voteCount >= 2) || (best.corr >= 0.32);

    const topCandidates = matches.slice(0, 3).map(m => ({
      symbol: m.short,
      confidence: Math.min(99, Math.max(0, Math.round(m.corr * 100))),
      name: m.name,
    }));

    const MIN_CHORD_CORR = 0.18;
    if (best.corr < MIN_CHORD_CORR || !isConsensusWinner) {
      return {
        mode: 'idle',
        timestamp: Date.now(),
        chord: this.lastDetectedChordSnapshot?.chord,
        chroma: new Float32Array(smoothedChroma),
        peaks,
        ringingNotes: this.extractRingingNotes(peaks),
        spectrum: new Float32Array(0),
        signalLevelDb: 0,
        statusMessage: 'Detecting guitar chord...',
      };
    }

    const confidencePct = Math.min(99, Math.round(best.corr * 100)) + '%';
    const activeNotes: NoteName[] = [];
    const rootIdx2 = NOTE_NAMES.indexOf(best.root as NoteName);
    for (let i = 0; i < 12; i++) {
      if (smoothedChroma[i] > 0.32) activeNotes.push(NOTE_NAMES[i]);
    }
    
    const intervalsStr = activeNotes.map(n => {
      const noteIdx = NOTE_NAMES.indexOf(n);
      const diff = (noteIdx - rootIdx2 + 12) % 12;
      return DEGREE_NAMES[diff];
    }).join(' - ');
    
    this.lastLockedChord = best.short;
    this.chordSustainHoldUntil = Date.now() + 300; // reduced from 650ms to 300ms

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

    this.lastDetectedChordSnapshot = result;
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

    // 1. Calculate signal level
    let maxDb = -120;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > maxDb) maxDb = freqData[i];
    }

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

    // 4. Total guitar band energy
    let totalGuitarBandEnergy = 0;
    for (let i = 0; i < cleanAmps.length; i++) {
      totalGuitarBandEnergy += cleanAmps[i];
    }

    // 5. Responsive Attack Detection (32ms energy flux)
    const energyFlux = totalGuitarBandEnergy - this.prevFrameBandEnergy;
    this.prevFrameBandEnergy = totalGuitarBandEnergy;
    const isNewAttack = energyFlux > 0.008; // more sensitive attack detection to avoid sticking
    if (isNewAttack) {
      this.lastLockedChord = null;
      this.candidateVoteHistory = [];
      this.chordSustainHoldUntil = 0;
      this.noteSustainHoldUntil = 0;
    }

    // 6. Signal presence check (matching V1 thresholds)
    const minEnergyThreshold = this.noiseProfile?.calibrated ? 0.008 : 0.012;
    const minDbThreshold = this.noiseProfile?.calibrated 
      ? (this.noiseProfile.measuredNoiseFloorDb + 2.0) 
      : -74;
    const meterVal = Math.max(0, Math.min(100, (maxDb + 75) * 1.66));
    const gatePercent = Math.max(3, (this.config.noiseGateDb / 50) * 18);

    const isRawSignalPresent = (totalGuitarBandEnergy > minEnergyThreshold) && 
                               (maxDb > minDbThreshold) && 
                               (meterVal >= gatePercent);

    let isSignalPresent = isRawSignalPresent;
    if (!isRawSignalPresent) {
      if (now < this.chordSustainHoldUntil && this.lastDetectedChordSnapshot) {
        isSignalPresent = true;
      } else if (now < this.noteSustainHoldUntil && this.lastDetectedNoteSnapshot) {
        isSignalPresent = true;
      }
    }

    // 7. Handle Silence (Full state reset)
    if (!isSignalPresent) {
      this.consecutiveNoteFrames = 0;
      this.consecutiveChordFrames = 0;
      this.currentDisplayMode = 'idle';
      this.lastDetectedChordSnapshot = null;
      this.lastDetectedNoteSnapshot = null;
      this.lastLockedChord = null;
      this.candidateVoteHistory = [];
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.85;

      return {
        mode: 'idle',
        timestamp: now,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: 'Ready • Continuous listening active... strum any chord or note',
      };
    }

    // 8. Time-domain Autocorrelation for Monophonic Pitch Extraction
    if (!this.timeBuffer || this.timeBuffer.length !== this.analyser.fftSize) {
      this.timeBuffer = new Float32Array(this.analyser.fftSize);
    }
    this.analyser.getFloatTimeDomainData(this.timeBuffer as any);
    const autoCorr = this.fastAutocorrelate(this.timeBuffer, sampleRate);

    // 9. Peak extraction
    const peaks = this.extractPeaks(cleanAmps, sampleRate);
    peaks.sort((a, b) => b.amp - a.amp);

    // 10. Build Chroma
    const rawChroma = this.buildChroma(peaks);

    // 11. Dynamic Smoothing
    if (isNewAttack) {
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] = rawChroma[i];
    } else {
      const alpha = 0.50;
      for (let i = 0; i < 12; i++) {
        this.smoothedChroma[i] = (1 - alpha) * this.smoothedChroma[i] + alpha * rawChroma[i];
      }
    }

    // 12. Single Note vs Chord Discrimination (Time-Domain Autocorrelation, V1 Proven)
    const hasDominantSinglePeak = peaks.length === 1 ||
      (peaks.length >= 2 && peaks[0].amp > 2.5 * peaks[1].amp);
    const isSingleNote = (autoCorr.freq >= 70 && autoCorr.freq <= 850) &&
                         (autoCorr.confidence >= 0.60 || (autoCorr.confidence >= 0.48 && hasDominantSinglePeak));

    if (isSingleNote) {
      this.consecutiveNoteFrames++;
      this.consecutiveChordFrames = 0;
    } else {
      this.consecutiveChordFrames++;
      this.consecutiveNoteFrames = 0;
    }

    const allowModeSwitchToNote = this.consecutiveNoteFrames >= 2;
    const allowModeSwitchToChord = this.consecutiveChordFrames >= 2;

    if ((this.currentDisplayMode === 'note' && !allowModeSwitchToChord) || allowModeSwitchToNote) {
      this.currentDisplayMode = 'note';
      this.noteSustainHoldUntil = now + 500;
      this.lastLockedChord = null;
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.35;

      const f0 = autoCorr.freq > 0 ? autoCorr.freq : (peaks[0]?.freq || 0);
      const dominantPc = peaks[0]?.pitchClass ?? 0;
      return this.processSingleNote(f0, peaks, dominantPc, tuning);
    } else {
      this.currentDisplayMode = 'chord';
      return this.processChord(this.smoothedChroma, peaks);
    }
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
    this.lastDetectedChordSnapshot = null;
    this.lastDetectedNoteSnapshot = null;
    this.chordSustainHoldUntil = 0;
    this.noteSustainHoldUntil = 0;
    this.consecutiveNoteFrames = 0;
    this.consecutiveChordFrames = 0;
    this.currentDisplayMode = 'idle';
  }
}