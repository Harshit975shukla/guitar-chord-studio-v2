/**
 * Real-time Audio Detection Engine
 * Spectral subtraction, onset detection, chroma analysis, chord template matching
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
  // Additional thresholds for continuous mode
  minEnergyThreshold?: number; // linear amplitude sum threshold
  minDbThreshold?: number; // dB threshold for maxDb
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  fftSize: 4096,
  smoothingTimeConstant: 0.12,
  minFreq: 65,
  maxFreq: 1400,
  noiseGateDb: 14,
  micGainMultiplier: 4.0,
  seventhStrictness: 0.55,
  triggerMode: 'continuous',
  oversubtraction: 1.30,
  // Continuous mode thresholds
  minEnergyThreshold: 0.012, // sensitive linear amplitude sum
  minDbThreshold: -74 // dB threshold for maxDb
};

// ============================================================================
// Autocorrelation Pitch Extraction (v1 Sub-Hertz Engine)
// ============================================================================

export interface AutocorrResult {
  freq: number;
  confidence: number;
  rms: number;
}

export function fastAutocorrelate(timeBuf: Float32Array, sampleRate: number): AutocorrResult {
  const bufLen = timeBuf.length;
  let sumSquares = 0;
  for (let i = 0; i < bufLen; i++) {
    const val = timeBuf[i];
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / bufLen);
  if (rms < 0.007) return { freq: -1, confidence: 0, rms: rms };

  const minPeriod = Math.floor(sampleRate / 850); // ~51 samples (G5 / fret 15 high E)
  const maxPeriod = Math.floor(sampleRate / 68);  // ~648 samples (Drop D ~73 Hz, low E 82 Hz)
  const windowLen = 1024;
  if (windowLen + maxPeriod > bufLen) return { freq: -1, confidence: 0, rms: rms };

  let energy0 = 0;
  for (let i = 0; i < windowLen; i++) {
    energy0 += timeBuf[i] * timeBuf[i];
  }
  if (energy0 < 1e-5) return { freq: -1, confidence: 0, rms: rms };

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
    return { freq: -1, confidence: maxCorr > 0 ? maxCorr : 0, rms: rms };
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
  const denom = (alpha - 2 * beta + gamma);
  const delta = denom !== 0 ? 0.5 * (alpha - gamma) / denom : 0;
  const refinedPeriod = chosenPeriod + delta;
  const freq = sampleRate / refinedPeriod;

  return { freq, confidence: beta, rms };
}

// ============================================================================
// Chord Templates for Template Correlation (10 Core Templates)
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
  
  // State
  private smoothedChroma = new Float32Array(12);
  private prevFrameBandEnergy = 0;
  private timeBuffer = new Float32Array(4096);
  
  // Anti-fluctuation hysteresis & continuous detection state
  private candidateVoteHistory: string[] = [];
  private lastLockedChord: string | null = null;
  private lastLockedTime = 0;
  private consecutiveNoteFrames = 0;
  private consecutiveChordFrames = 0;
  private currentDisplayMode: 'idle' | 'note' | 'chord' = 'idle';
  
  // Sustain hold & snapshot memory (prevents UI wipe during natural finger transitions)
  private lastDetectedChordSnapshot: DetectionResult | null = null;
  private lastDetectedNoteSnapshot: DetectionResult | null = null;
  private chordSustainHoldUntil = 0;
  private noteSustainHoldUntil = 0;
  private confirmedChordCount = 0;
  
  // Cooldown
  private lockCooldownTimer: number | null = null;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config };
  }

  setConfig(config: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setAnalyser(analyser: AnalyserNode): void {
    this.analyser = analyser;
  }

  // ============================================================================
  // Noise Calibration (GuitarTuna-style)
  // ============================================================================

  startNoiseCalibration(): void {
    if (!this.analyser) return;
    
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    const bufferLength = this.analyser.frequencyBinCount;
    this.calibrationBuffer = new Float32Array(bufferLength).fill(0);
  }

  processCalibrationFrame(freqData: Float32Array): { complete: boolean; noiseFloorDb: number } | null {
    if (!this.isCalibrating || !this.calibrationBuffer) return null;

    this.calibrationFrames++;
    
    // Accumulate linear amplitudes
    for (let b = 0; b < freqData.length; b++) {
      const linAmp = Math.pow(10, freqData[b] / 20);
      this.calibrationBuffer[b] += linAmp;
    }

    if (this.calibrationFrames >= 80) { // ~2 seconds at 60fps
      // Average
      for (let b = 0; b < this.calibrationBuffer.length; b++) {
        this.calibrationBuffer[b] /= this.calibrationFrames;
      }
      
      // Calculate noise floor
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
      
      return { complete: true, noiseFloorDb: maxDb };
    }
    
    return { complete: false, noiseFloorDb: -120 };
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
  // Peak Extraction with Sub-bin Interpolation
  // ============================================================================

  extractPeaks(cleanAmps: Float32Array, sampleRate: number): DetectedPeak[] {
    const binWidth = sampleRate / this.config.fftSize;
    const minBin = Math.floor(65 / binWidth);
    const maxBin = Math.min(cleanAmps.length - 2, Math.ceil(1400 / binWidth));

    const peaks: DetectedPeak[] = [];

    for (let b = minBin; b <= maxBin; b++) {
      const val = cleanAmps[b];
      if (val > 0.0016 && val > cleanAmps[b - 1] && val > cleanAmps[b + 1]) {
        // Sub-bin parabolic peak interpolation
        const alpha = cleanAmps[b - 1];
        const beta = cleanAmps[b];
        const gamma = cleanAmps[b + 1];
        const denom = (alpha - 2 * beta + gamma);
        const delta = denom !== 0 ? 0.5 * (alpha - gamma) / denom : 0;
        const interpBin = b + delta;
        const peakFreq = interpBin * binWidth;
        
        const midi = 69 + 12 * Math.log2(peakFreq / 440);
        const nearestPitch = Math.round(midi);
        const pitchClass = ((nearestPitch % 12) + 12) % 12;
        
        peaks.push({
          freq: peakFreq,
          midi,
          note: NOTE_NAMES[pitchClass],
          amp: val, // Pure linear amplitude, unsquared
          pitchClass,
          bin: interpBin,
        });
      }
    }
    
    if (peaks.length > 0) {
      peaks.sort((a, b) => b.amp - a.amp);
    }
    
    return peaks;
  }

  // ============================================================================
  // Extract Real-time Ringing Notes from Peaks
  // ============================================================================

  extractRingingNotes(peaks: DetectedPeak[]): Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> {
    if (!peaks || peaks.length === 0) return [];
    const sorted = [...peaks].sort((a, b) => b.amp - a.amp);
    const seenPcs = new Set<number>();
    const ringing: Array<{ note: NoteName; freq: number; octave: number; amp: number; cents: number }> = [];
    for (const pk of sorted) {
      if (!seenPcs.has(pk.pitchClass) && ringing.length < 6) {
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
  // Harmonic Overtone Whitening
  // ============================================================================

  whitenHarmonics(chroma: Float32Array, peaks: DetectedPeak[]): void {
    if (peaks.length === 0) return;
    
    peaks.forEach(pk => {
      // Suppress 2nd and 3rd harmonics of low fundamentals
      if (pk.freq < 380 && pk.amp > 0.035) {
        // 3rd harmonic
        const thirdMidi = Math.round(69 + 12 * Math.log2((pk.freq * 3) / 440));
        const thirdPc = ((thirdMidi % 12) + 12) % 12;
        chroma[thirdPc] = Math.max(0, chroma[thirdPc] - pk.amp * 0.35);
        
        // 2nd harmonic
        const secondMidi = Math.round(69 + 12 * Math.log2((pk.freq * 2) / 440));
        const secondPc = ((secondMidi % 12) + 12) % 12;
        chroma[secondPc] = Math.max(0, chroma[secondPc] - pk.amp * 0.20);
      }
    });
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
  // Single Note vs Chord Discrimination
  // ============================================================================

  discriminateMode(
    smoothedChroma: Float32Array, 
    peaks: DetectedPeak[]
  ): { isSingleNote: boolean; dominantPc: number; maxChromaEnergy: number; sumEnergy: number; activePitchClasses: number } {
    let activePitchClasses = 0;
    let dominantPc = -1;
    let maxChromaEnergy = 0;
    let sumEnergy = 0;
    
    for (let i = 0; i < 12; i++) {
      sumEnergy += smoothedChroma[i];
      if (smoothedChroma[i] > maxChromaEnergy) {
        maxChromaEnergy = smoothedChroma[i];
        dominantPc = i;
      }
      if (smoothedChroma[i] > 0.28) {
        activePitchClasses++;
      }
    }
    
    // Find lowest plausible fundamental
    const strongestPeak = peaks[0];
    const lowCandidates = peaks.filter(p => 
      p.freq >= 75 && p.freq <= 450 && 
      p.amp >= (strongestPeak ? strongestPeak.amp * 0.25 : 0)
    );
    lowCandidates.sort((a, b) => a.freq - b.freq);
    const fundamentalFreq = (lowCandidates.length > 0) ? lowCandidates[0].freq : (strongestPeak ? strongestPeak.freq : 0);
    
    // Check harmonic multiples
    let harmonicMatchCount = 0;
    peaks.forEach(p => {
      const ratio = p.freq / (fundamentalFreq || 1);
      const near = Math.round(ratio);
      if (near >= 1 && near <= 7 && Math.abs(ratio - near) < 0.09) {
        harmonicMatchCount++;
      }
    });
    
    const isSingleNote = (activePitchClasses <= 1) || 
                         (maxChromaEnergy / (sumEnergy + 1e-6) >= 0.56) ||
                         (peaks.length > 0 && harmonicMatchCount >= peaks.length * 0.70 && activePitchClasses <= 2);
    
    return { isSingleNote, dominantPc, maxChromaEnergy, sumEnergy, activePitchClasses };
  }

  // ============================================================================
  // Single Note Processing
  // ============================================================================

  processSingleNote(
    f0: number, 
    peaks: DetectedPeak[], 
    _dominantPc: number,
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult {
    const midi = 69 + 12 * Math.log2(f0 / 440);
    const roundMidi = Math.round(midi);
    const pitch = midiToPitch(roundMidi);
    pitch.freq = f0;
    pitch.cents = Math.round((midi - roundMidi) * 100);
    
    // Guitar position
    const guitarPos = this.findGuitarPosition(roundMidi, tuning);
    
    const tunerVerdict: 'in-tune' | 'flat' | 'sharp' = 
      Math.abs(pitch.cents) <= 4 ? 'in-tune' : (pitch.cents < 0 ? 'flat' : 'sharp');
    
    // Update smoothed chroma for UI
    for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.25;
    const pc = ((roundMidi % 12) + 12) % 12;
    this.smoothedChroma[pc] = 1;

    const ringingNotes = this.extractRingingNotes(peaks);
    this.noteSustainHoldUntil = Date.now() + 1600;
    
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
      spectrum: new Float32Array(0), // filled by caller
      signalLevelDb: 0, // filled by caller
      statusMessage: `Plucked Note: ${pitch.note}${pitch.octave} (${f0.toFixed(1)} Hz) • Listening...`,
    };

    this.lastDetectedNoteSnapshot = result;
    return result;
  }

  // ============================================================================
  // Chord Processing (Template Correlation + Hysteresis)
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

    // Template correlation for all roots and qualities
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

    // Incumbent hysteresis bonus (+0.05) to eliminate transient noise without sticking/freezing
    const isIncumbentValid = this.lastLockedChord && (Date.now() - this.lastLockedTime < 700);
    if (isIncumbentValid) {
      matches.forEach(m => {
        if (this.lastLockedChord === m.short) {
          m.corr += 0.05;
        }
      });
    }

    matches.sort((a, b) => b.corr - a.corr);
    let best = matches[0];

    // Consensus voting buffer (3 frames)
    this.candidateVoteHistory.push(best.short);
    if (this.candidateVoteHistory.length > 3) this.candidateVoteHistory.shift();
    
    const voteCount = this.candidateVoteHistory.filter(c => c === best.short).length;
    const isConsensusWinner = (voteCount >= 2) || (this.lastLockedChord === best.short) || (best.corr >= 0.32);

    // Reject non-tonal input (noise, room hum, string transitions)
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
        statusMessage: this.lastDetectedChordSnapshot?.chord
          ? `Confirmed: ${this.lastDetectedChordSnapshot.chord.symbol} • Listening for next change...`
          : 'Detecting guitar chord...',
      };
    }

    let confidencePct = '0%';
    let activeNotes: NoteName[] = [];
    let intervalsStr = best.formula;

    if (best && best.corr > 0.18 && isConsensusWinner) {
      confidencePct = Math.min(99, Math.max(0, Math.round(best.corr * 100))) + '%';
      
      const rootIdx2 = NOTE_NAMES.indexOf(best.root as NoteName);
      for (let i = 0; i < 12; i++) {
        if (smoothedChroma[i] > 0.28) activeNotes.push(NOTE_NAMES[i]);
      }
      
      // Western degree intervals relative to root (1 - b3 - 5)
      intervalsStr = activeNotes.length > 0 
        ? activeNotes.map(n => {
            const noteIdx = NOTE_NAMES.indexOf(n);
            const diff = (noteIdx - rootIdx2 + 12) % 12;
            return DEGREE_NAMES[diff];
          }).join(' - ')
        : best.formula;
      
      this.lastLockedChord = best.short;
      this.lastLockedTime = Date.now();
      this.chordSustainHoldUntil = Date.now() + 650;
      this.confirmedChordCount++;
    }

    const ringingNotes = this.extractRingingNotes(peaks);
    const topCandidates = matches.slice(0, 3).map(m => ({
      symbol: m.short,
      confidence: Math.min(99, Math.max(0, Math.round(m.corr * 100))),
      name: m.name,
    }));

    const result: DetectionResult = {
      mode: 'chord',
      timestamp: Date.now(),
      chord: {
        symbol: best.short,
        root: best.root as NoteName,
        quality: best.quality as ChordQuality,
        confidence: parseInt(confidencePct),
        activeNotes: activeNotes,
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
      statusMessage: parseInt(confidencePct) >= 20 
        ? `Confirmed Chord: ${best.short} (${confidencePct}) • Listening for next change...` 
        : 'Detecting guitar chord...',
    };

    if (parseInt(confidencePct) >= 20) {
      this.lastDetectedChordSnapshot = result;
    }

    return result;
  }

  // ============================================================================
  // Main Processing Loop
  // ============================================================================

  processFrame(
    freqData: Float32Array, 
    sampleRate: number,
    tuning: StringTuning[] = STANDARD_TUNING,
    timeData?: Float32Array
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
      this.processCalibrationFrame(freqData);
      return null;
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

    // 5. Responsive Attack Detection
    const energyFlux = totalGuitarBandEnergy - this.prevFrameBandEnergy;
    this.prevFrameBandEnergy = totalGuitarBandEnergy;
    const isNewAttack = energyFlux > 0.015;
    if (isNewAttack) {
      // Release previous chord lock instantly on new strum attack!
      this.lastLockedChord = null;
      this.candidateVoteHistory = [];
      this.chordSustainHoldUntil = 0;
      this.noteSustainHoldUntil = 0;
    }

    const minEnergyThreshold = this.noiseProfile?.calibrated ? 0.008 : 0.012;
    const minDbThreshold = this.noiseProfile?.calibrated ? (this.noiseProfile.measuredNoiseFloorDb + 2.0) : -74;
    const meterVal = Math.max(0, Math.min(100, (maxDb + 75) * 1.66));
    const gatePercent = Math.max(3, (this.config.noiseGateDb / 50) * 18);
    const isRawSignalPresent = (totalGuitarBandEnergy > minEnergyThreshold) && (maxDb > minDbThreshold) && (meterVal >= gatePercent);

    // Sustain hold check during inter-strum finger transition
    let isSignalPresent = isRawSignalPresent;
    if (!isRawSignalPresent) {
      if (now < this.chordSustainHoldUntil && this.lastDetectedChordSnapshot) {
        return {
          ...this.lastDetectedChordSnapshot,
          timestamp: now,
          isSustained: true,
          signalLevelDb: maxDb,
          statusMessage: `Sustaining ${this.lastDetectedChordSnapshot.chord?.symbol || ''} • Listening for next change...`,
        };
      } else if (now < this.noteSustainHoldUntil && this.lastDetectedNoteSnapshot) {
        return {
          ...this.lastDetectedNoteSnapshot,
          timestamp: now,
          isSustained: true,
          signalLevelDb: maxDb,
          statusMessage: `Sustaining note • Listening for next change...`,
        };
      }
    }

    if (!isSignalPresent) {
      // True silence past sustain hold
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.82;
      
      this.consecutiveNoteFrames = 0;
      this.consecutiveChordFrames = 0;
      this.currentDisplayMode = 'idle';
      this.lastLockedChord = null;
      this.candidateVoteHistory = [];
      // Keep snapshots intact so the UI retains the confirmed chord
      
      return {
        mode: 'idle',
        timestamp: now,
        chord: this.lastDetectedChordSnapshot?.chord,
        note: this.lastDetectedNoteSnapshot?.note,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: this.lastDetectedChordSnapshot?.chord
          ? `Confirmed: ${this.lastDetectedChordSnapshot.chord.symbol} • Continuous listening active... strum next chord or pluck note`
          : 'Ready • Continuous listening active... strum any chord or note',
      };
    }

    // 6. Time-domain autocorrelation for rock-solid monophonic pitch extraction
    if (this.timeBuffer.length !== this.analyser.fftSize) {
      this.timeBuffer = new Float32Array(this.analyser.fftSize);
    }
    if (timeData) {
      this.timeBuffer.set(timeData);
    } else {
      this.analyser.getFloatTimeDomainData(this.timeBuffer);
    }
    const autoCorr = fastAutocorrelate(this.timeBuffer, sampleRate);

    // 7. Peak extraction
    const peaks = this.extractPeaks(cleanAmps, sampleRate);
    if (peaks.length === 0) {
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] *= 0.82;
      return {
        mode: 'idle',
        timestamp: now,
        chord: this.lastDetectedChordSnapshot?.chord,
        note: this.lastDetectedNoteSnapshot?.note,
        chroma: new Float32Array(this.smoothedChroma),
        peaks: [],
        ringingNotes: [],
        spectrum: freqData,
        signalLevelDb: maxDb,
        statusMessage: this.lastDetectedChordSnapshot?.chord
          ? `Confirmed: ${this.lastDetectedChordSnapshot.chord.symbol} • Listening for next chord or note...`
          : 'Listening...',
      };
    }

    // 8. Build chroma
    const rawChroma = this.buildChroma(peaks);

    // 9. Dynamic smoothing: on attack, immediately reset chroma so new chord isn't contaminated by old one
    if (isNewAttack) {
      for (let i = 0; i < 12; i++) this.smoothedChroma[i] = rawChroma[i];
    } else {
      const alpha = 0.50;
      for (let i = 0; i < 12; i++) {
        this.smoothedChroma[i] = (1 - alpha) * this.smoothedChroma[i] + alpha * rawChroma[i];
      }
    }

    // 10. Single note vs chord discrimination (v1 proven autocorrelation logic)
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
      let f0 = autoCorr.freq;
      if (f0 <= 0 && this.lastDetectedNoteSnapshot?.note?.pitch?.freq) {
        f0 = this.lastDetectedNoteSnapshot.note.pitch.freq;
      }
      if (f0 <= 0 && peaks.length > 0) {
        f0 = peaks[0].freq;
      }
      const roundMidi = Math.round(69 + 12 * Math.log2((f0 || 440) / 440));
      const dominantPc = ((roundMidi % 12) + 12) % 12;
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
  // Polyphonic Tuner (6-string)
  // ============================================================================

  processPolyphonicTuner(
    peaks: DetectedPeak[],
    tuning: StringTuning[] = STANDARD_TUNING
  ): DetectionResult {
    const strings = tuning.map((str, stringIndex) => {
      const targetFreq = str.freq;
      const targetMidi = str.midi;
      
      // Find closest peak to this string's fundamental
      let bestPeak: DetectedPeak | null = null;
      let bestDiff = Infinity;
      
      for (const pk of peaks) {
        const diff = Math.abs(pk.freq - targetFreq);
        if (diff < bestDiff && diff < targetFreq * 0.15) { // within ~15%
          bestDiff = diff;
          bestPeak = pk;
        }
      }
      
      if (bestPeak) {
        const detectedMidi = 69 + 12 * Math.log2(bestPeak.freq / 440);
        const cents = Math.round((detectedMidi - targetMidi) * 100);
        return {
          stringIndex,
          targetFreq,
          detectedFreq: bestPeak.freq,
          cents,
          inTune: Math.abs(cents) <= 4,
        };
      }
      
      return {
        stringIndex,
        targetFreq,
        detectedFreq: null,
        cents: null,
        inTune: false,
      };
    });

    return {
      mode: 'polyphonic-tuner',
      timestamp: Date.now(),
      polyphonicTuner: { strings },
      chroma: new Float32Array(this.smoothedChroma),
      peaks,
      spectrum: new Float32Array(0),
      signalLevelDb: 0,
    };
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
    this.lastLockedTime = 0;
    this.lastDetectedChordSnapshot = null;
    this.lastDetectedNoteSnapshot = null;
    this.chordSustainHoldUntil = 0;
    this.noteSustainHoldUntil = 0;
    this.confirmedChordCount = 0;
    this.consecutiveNoteFrames = 0;
    this.consecutiveChordFrames = 0;
    this.currentDisplayMode = 'idle';
    if (this.lockCooldownTimer) {
      clearTimeout(this.lockCooldownTimer);
      this.lockCooldownTimer = null;
    }
  }
}