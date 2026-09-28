import { DetectionEngine, type DetectionConfig } from './engine';
import { NOTE_NAMES, type DetectionResult, type StringTuning } from '../types';
import { estimateNotePitch } from './notePitch';

/** Isolated preview only. Its results must never enter practice, MIDI or confirmed detection state. */
export class FastDetectionPreview {
  private engine = new DetectionEngine({ fftSize: 4096, triggerMode: 'continuous' });
  private analyser: AnalyserNode | null = null;
  private noteAnalyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;
  private spectrum = new Float32Array(2048);
  private noteSpectrum = new Float32Array(1024);
  private time = new Float32Array(4096);
  private lastTick = 0;
  private enabled = false;
  private visible = true;
  private config: Partial<DetectionConfig> = {};
  private hintMidi: number | null = null;
  private hintFrames = 0;
  constructor(private display: (result: DetectionResult | null) => void) {}
  setEnabled(enabled: boolean, source?: AudioNode | null): void {
    this.enabled = enabled; this.disconnect();
    if (enabled && source) this.connect(source);
    this.display(null);
  }
  connect(source: AudioNode): void {
    this.disconnect();
    if (!this.enabled) return;
    this.source = source; this.analyser = source.context.createAnalyser();
    this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = .05;
    source.connect(this.analyser);
    this.noteAnalyser = source.context.createAnalyser();
    this.noteAnalyser.fftSize = 2048; this.noteAnalyser.smoothingTimeConstant = 0;
    source.connect(this.noteAnalyser);
    this.engine = new DetectionEngine({ ...this.config, fftSize: 4096, triggerMode: 'continuous' });
    this.engine.setAnalyser(this.analyser); this.lastTick = 0;
  }
  configure(config: Partial<DetectionConfig>): void {
    const changedTarget = config.targetMode !== undefined && config.targetMode !== this.config.targetMode;
    this.config = { ...this.config, ...config };
    this.engine.setConfig({ ...config, fftSize: 4096, triggerMode: 'continuous' });
    if (changedTarget) this.reset();
  }
  reset(): void { this.engine.reset(); this.hintMidi = null; this.hintFrames = 0; this.display(null); }
  calibrate(): void { if (this.analyser) this.engine.startNoiseCalibration(); }
  setVisible(visible: boolean): void { this.visible = visible; if (!visible) this.display(null); }
  tick(now: number, tuning: StringTuning[]): void {
    if (!this.enabled || !this.analyser || (!this.visible && !this.engine.isNoiseCalibrating())) return;
    const period = this.engine.isNoiseCalibrating() ? 32 : 16;
    if (now - this.lastTick < period - .0001) return;
    this.lastTick = now; this.analyser.getFloatFrequencyData(this.spectrum);
    const result = this.engine.processFrame(this.spectrum, this.analyser.context.sampleRate, tuning);
    let note = !this.engine.isNoiseCalibrating() && !this.engine.isInputSettling() && this.config.targetMode !== 'chords' ? this.noteHint() : null;
    if (note?.note) {
      const midi = Math.round(note.note.pitch.midi);
      this.hintFrames = midi === this.hintMidi ? this.hintFrames + 1 : 1; this.hintMidi = midi;
      if (this.hintFrames < 2) note = null;
    } else { this.hintMidi = null; this.hintFrames = 0; }
    if (this.visible) this.display(note ?? (this.config.targetMode === 'notes' && !result?.isCalibrating ? null : result));
  }
  private noteHint(): DetectionResult | null {
    if (!this.analyser || !this.noteAnalyser) return null;
    this.analyser.getFloatTimeDomainData(this.time);
    const sampleRate = this.analyser.context.sampleRate, estimate = estimateNotePitch(this.time, sampleRate);
    if (!estimate || estimate.confidence < .85 || estimate.rms < Math.max(.0015, (this.engine.getNoiseProfile()?.rms ?? .0072) * 2.5)) return null;
    this.noteAnalyser.getFloatFrequencyData(this.noteSpectrum);
    const width = sampleRate / 2048, peaks: Array<{ freq: number; amp: number }> = [];
    const amplitude = (bin: number) => 10 ** (this.noteSpectrum[bin] / 20);
    for (let bin = Math.max(1, Math.floor(60 / width)); bin < Math.min(this.noteSpectrum.length - 1, Math.ceil(1400 / width)); bin++) {
      const a = amplitude(bin - 1), b = amplitude(bin), c = amplitude(bin + 1);
      if (b < .0005 || b <= a || b <= c) continue;
      const shift = Math.max(-.5, Math.min(.5, .5 * (a - c) / (a - 2 * b + c || 1)));
      peaks.push({ freq: (bin + shift) * width, amp: b });
    }
    const peak = Math.max(0, ...peaks.map(value => value.amp));
    if (!peaks.some(value => value.amp >= peak * .5 && Math.abs(value.freq - estimate.freq) < Math.max(width * .3, estimate.freq * .025))) return null;
    let total = 0, supported = 0;
    for (const value of peaks) {
      total += value.amp * value.amp;
      const harmonic = Math.round(value.freq / estimate.freq);
      if (harmonic >= 1 && Math.abs(value.freq - harmonic * estimate.freq) <= Math.max(width * .5, value.freq * .015)) supported += value.amp * value.amp;
    }
    if (!total || supported < total * .85) return null;
    const midi = 69 + 12 * Math.log2(estimate.freq / 440), rounded = Math.round(midi), pc = ((rounded % 12) + 12) % 12;
    const cents = Math.round((midi - rounded) * 100), chroma = new Float32Array(12); chroma[pc] = 1;
    return {
      mode: 'single-note', freshness: 'fresh', timestamp: Date.now(),
      note: { pitch: { midi, freq: estimate.freq, note: NOTE_NAMES[pc], octave: Math.floor(rounded / 12) - 1, cents },
        confidence: Math.min(99, Math.round(estimate.confidence * 100)), tunerVerdict: Math.abs(cents) <= 4 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp' },
      chroma, peaks: [], ringingNotes: [], spectrum: this.noteSpectrum, signalLevelDb: 20 * Math.log10(estimate.rms),
    };
  }
  disconnect(): void {
    if (this.source && this.analyser) this.source.disconnect(this.analyser);
    if (this.source && this.noteAnalyser) this.source.disconnect(this.noteAnalyser);
    this.analyser?.disconnect(); this.noteAnalyser?.disconnect(); this.source = null; this.analyser = null; this.noteAnalyser = null;
    this.engine.reset();
    this.hintMidi = null; this.hintFrames = 0;
  }
  dispose(): void { this.enabled = false; this.disconnect(); this.display(null); }
}
