import type { DetectionTargetMode } from '../../types';

export const MODEL_RATE = 22050;
export const MODEL_WINDOW = 43844;
export const WINDOW_SECONDS = MODEL_WINDOW / MODEL_RATE;
export const MAX_AGE = 1.5;
export const ML_ASSET_VERSION = 'basic-pitch-1.0.1-tfjs-3.21.0';
export const DSP_VERSION = '74340ba';
export interface ModelNote { midi: number; name: string }
export interface ModelPrediction {
  chord: string | null;
  notes: ModelNote[];
  evidenceStartOffset: number;
  evidenceEndOffset: number;
  evidenceOffset: number;
  inferenceMs: number;
}
export interface TimedPrediction extends ModelPrediction {
  evidenceStart: number;
  evidenceEnd: number;
  evidenceAt: number;
  receivedAt: number;
}
export interface ModelRequest {
  id: number;
  kind: 'load' | 'live';
  pcm?: Float32Array<ArrayBuffer>;
  assets: string;
  targetMode: DetectionTargetMode;
}
export type ModelReply = { id: number; ready: true } | { id: number; result: ModelPrediction } | { id: number; error: string };
export interface Identity { key: string; label: string }
export interface FastFrame {
  at: number; attackAt: number; attackId: number;
  ready: boolean; signalPresent: boolean; clipped: boolean;
  identity: Identity | null; fresh: boolean;
  verified?: { at: number; identity: Identity | null };
}
export interface Comparison {
  state: 'checking' | 'agree' | 'recent' | 'different' | 'fast-only' | 'quiet' | 'warning';
  label: string | null;
  message: string;
  supported: boolean;
}
