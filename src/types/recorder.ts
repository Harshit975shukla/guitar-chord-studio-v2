/**
 * Audio Recorder Types
 */

export interface AudioRecorderState {
  isRecording: boolean;
  isCountInActive: boolean;
  isJamLoopActive: boolean;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  duration: number; // milliseconds
}

export interface RecorderConfig {
  mimeType: string;
  countInBeats: number;
  countInIntervalMs: number;
  visualizerFftSize: number;
}