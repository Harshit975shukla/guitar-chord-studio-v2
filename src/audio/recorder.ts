/**
 * Audio Recorder & Jam Looper Engine
 * Handles high-fidelity recording, live visualization, count-in, and looping
 */

import { AudioRecorderState, RecorderConfig } from '../types/recorder';
import { profileManager } from '../storage/profiles';

const DEFAULT_CONFIG: RecorderConfig = {
  mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
    ? 'audio/webm;codecs=opus' 
    : 'audio/webm',
  countInBeats: 4,
  countInIntervalMs: 550,
  visualizerFftSize: 256,
};

type VisualizerCallback = (data: Uint8Array) => void;
type StateChangeCallback = (state: Partial<AudioRecorderState>) => void;
type CountInCallback = (beat: number, total: number) => void;
type RecordingCompleteCallback = (blob: Blob, durationMs: number) => void;

export class AudioRecorder {
  private state: AudioRecorderState = {
    isRecording: false,
    isCountInActive: false,
    isJamLoopActive: false,
    recordedBlob: null,
    recordedUrl: null,
    duration: 0,
  };

  private config: RecorderConfig;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private chunks: Blob[] = [];
  private startTime: number = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private countInInterval: ReturnType<typeof setInterval> | null = null;
  private visualizerAnim: number | null = null;
  private visualizerCanvas: HTMLCanvasElement | null = null;

  // Callbacks
  private onStateChange: StateChangeCallback | null = null;
  private onCountIn: CountInCallback | null = null;
  private onComplete: RecordingCompleteCallback | null = null;
  private onVisualizerData: VisualizerCallback | null = null;

  constructor(config: Partial<RecorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Callbacks
  // ============================================================================

  setStateChangeCallback(cb: StateChangeCallback): void {
    this.onStateChange = cb;
  }

  setCountInCallback(cb: CountInCallback): void {
    this.onCountIn = cb;
  }

  setCompleteCallback(cb: RecordingCompleteCallback): void {
    this.onComplete = cb;
  }

  setVisualizerCanvas(canvas: HTMLCanvasElement): void {
    this.visualizerCanvas = canvas;
  }

  setVisualizerCallback(cb: VisualizerCallback): void {
    this.onVisualizerData = cb;
  }

  // ============================================================================
  // State Getters
  // ============================================================================

  getState(): Readonly<AudioRecorderState> {
    return { ...this.state };
  }

  isRecording(): boolean {
    return this.state.isRecording;
  }

  isCountInActive(): boolean {
    return this.state.isCountInActive;
  }

  isJamLoopActive(): boolean {
    return this.state.isJamLoopActive;
  }

  getRecordedBlob(): Blob | null {
    return this.state.recordedBlob;
  }

  getRecordedUrl(): string | null {
    return this.state.recordedUrl;
  }

  getDuration(): number {
    return this.state.duration;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setJamLoop(enabled: boolean): void {
    this.state.isJamLoopActive = enabled;
    this.notifyStateChange({ isJamLoopActive: enabled });
  }

  setCountIn(enabled: boolean): void {
    this.state.isCountInActive = enabled;
    this.notifyStateChange({ isCountInActive: enabled });
  }

  // ============================================================================
  // Recording Flow
  // ============================================================================

  async startRecording(): Promise<boolean> {
    if (this.state.isRecording) return false;

    if (this.state.isCountInActive) {
      this.runCountInThenRecord();
      return true;
    }

    return await this.startAudioRecording();
  }

  async stopRecording(): Promise<void> {
    if (!this.state.isRecording || !this.mediaRecorder) return;

    this.state.isRecording = false;
    this.notifyStateChange({ isRecording: false });

    // Stop timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Stop visualizer
    if (this.visualizerAnim) {
      cancelAnimationFrame(this.visualizerAnim);
      this.visualizerAnim = null;
    }

    // Stop recorder
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Stop audio tracks
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }

    // Cleanup audio context nodes
    this.cleanupAudioNodes();
  }

  private async runCountInThenRecord(): Promise<void> {
    this.state.isCountInActive = true;
    this.notifyStateChange({ isCountInActive: true });

    let count = this.config.countInBeats;
    this.onCountIn?.(count, this.config.countInBeats);
    this.playClick(800);

    this.countInInterval = setInterval(() => {
      count--;
      if (count > 0) {
        this.onCountIn?.(count, this.config.countInBeats);
        this.playClick(800);
      } else if (count === 0) {
        this.onCountIn?.(0, this.config.countInBeats); // "GO!"
        this.playClick(1400, 0.08);
      } else {
        clearInterval(this.countInInterval!);
        this.countInInterval = null;
        this.state.isCountInActive = false;
        this.notifyStateChange({ isCountInActive: false });
        this.startAudioRecording();
      }
    }, this.config.countInIntervalMs);
  }

  private async startAudioRecording(): Promise<boolean> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      try {
        // Fallback
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err2) {
        console.error('Microphone access denied:', err2);
        return false;
      }
    }

    this.chunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType: this.config.mimeType });
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.audioStream);
    }

    this.mediaRecorder.ondataavailable = (evt) => {
      if (evt.data && evt.data.size > 0) {
        this.chunks.push(evt.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.handleRecordingStop();
    };

    // Setup analyser for live visualization
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.visualizerFftSize;
      this.sourceNode.connect(this.analyser);
      this.startVisualizerLoop();
    } catch (e) {
      console.warn('Analyser setup failed:', e);
    }

    this.mediaRecorder.start(100);
    this.state.isRecording = true;
    this.startTime = Date.now();
    this.notifyStateChange({ isRecording: true, recordedBlob: null, recordedUrl: null, duration: 0 });

    // Start timer
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      this.state.duration = elapsed;
      this.notifyStateChange({ duration: elapsed });
    }, 50);

    return true;
  }

  private handleRecordingStop(): void {
    this.state.recordedBlob = new Blob(this.chunks, { type: this.config.mimeType });
    
    if (this.state.recordedUrl) {
      URL.revokeObjectURL(this.state.recordedUrl);
    }
    this.state.recordedUrl = URL.createObjectURL(this.state.recordedBlob);

    const duration = this.state.duration;
    this.notifyStateChange({ 
      recordedBlob: this.state.recordedBlob, 
      recordedUrl: this.state.recordedUrl,
      duration 
    });

    // Auto-save to profile takes
    this.autoSaveTake(duration);

    // Notify completion
    if (this.state.recordedBlob) {
      this.onComplete?.(this.state.recordedBlob, duration);
    }
  }

  private autoSaveTake(durationMs: number): void {
    if (!this.state.recordedBlob) return;

    const takes = profileManager.getTakesForActiveUser();
    const takeNumber = takes.length + 1;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      profileManager.addTake({
        title: `Acoustic Guitar Take #${takeNumber}`,
        duration: this.formatDuration(durationMs),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        dataUrl: base64data,
      });
    };
    reader.readAsDataURL(this.state.recordedBlob);
  }

  private formatDuration(ms: number): string {
    const totalSec = Math.round(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // ============================================================================
  // Visualization
  // ============================================================================

  private startVisualizerLoop(): void {
    if (!this.analyser || !this.visualizerCanvas) return;

    const ctx = this.visualizerCanvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!this.state.isRecording) return;
      this.visualizerAnim = requestAnimationFrame(renderFrame);

      this.analyser!.getByteFrequencyData(dataArray);
      
      const w = this.visualizerCanvas!.width;
      const h = this.visualizerCanvas!.height;
      ctx.clearRect(0, 0, w, h);

      const barWidth = (w / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * h * 0.9;
        const gradient = ctx.createLinearGradient(0, h, 0, 0);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
        gradient.addColorStop(0.6, 'rgba(255, 179, 0, 0.85)');
        gradient.addColorStop(1, '#ef4444');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);
        x += barWidth + 2;
        if (x > w) break;
      }

      this.onVisualizerData?.(dataArray);
    };

    renderFrame();
  }

  drawIdleWaveform(): void {
    if (!this.visualizerCanvas) return;
    const ctx = this.visualizerCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.visualizerCanvas.width;
    const h = this.visualizerCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private playClick(freq: number, dur: number = 0.04): void {
    try {
      const actx = this.audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, actx.currentTime);
      gain.gain.setValueAtTime(0.7, actx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      osc.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  private cleanupAudioNodes(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    // Don't close audioContext - reuse it
  }

  private notifyStateChange(partial: Partial<AudioRecorderState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(partial);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  destroy(): void {
    if (this.state.isRecording) {
      this.stopRecording();
    }
    if (this.countInInterval) {
      clearInterval(this.countInInterval);
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.state.recordedUrl) {
      URL.revokeObjectURL(this.state.recordedUrl);
      this.state.recordedUrl = null;
    }
  }
}

// Singleton instance
export const audioRecorder = new AudioRecorder();