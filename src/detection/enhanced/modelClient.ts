import type { DetectionTargetMode } from '../../types';
import { ML_ASSET_VERSION, type ModelReply, type ModelPrediction, type ModelRequest } from './types';

export class EnhancedModel {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending: { id: number; cancel: (error: Error) => void } | null = null;
  private request(kind: 'load' | 'live', targetMode: DetectionTargetMode, pcm?: Float32Array<ArrayBuffer>): Promise<ModelPrediction | null> {
    if (this.pending) return Promise.reject(new Error('Enhanced detection is busy.'));
    try { this.worker ??= new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' }); }
    catch (error) { return Promise.reject(error); }
    const worker = this.worker, id = ++this.requestId;
    const assets = new URL(`${import.meta.env.BASE_URL}ml/${ML_ASSET_VERSION}/`, location.href).href;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Enhanced detection timed out. Standard detection remains available.')), 30000);
      const finish = (error: Error | null, result: ModelPrediction | null = null) => {
        if (this.pending?.id !== id) return;
        clearTimeout(timer); this.pending = null;
        if (error) { worker.terminate(); this.worker = null; reject(error); } else resolve(result);
      };
      this.pending = { id, cancel: error => finish(error) };
      worker.onmessage = ({ data }: MessageEvent<ModelReply>) => {
        if (data.id !== id) return;
        if ('error' in data) finish(new Error(data.error));
        else if ('result' in data) finish(null, data.result);
        else finish(null);
      };
      worker.onerror = event => finish(new Error(event.message || 'Enhanced detection worker failed.'));
      worker.onmessageerror = () => finish(new Error('Enhanced result could not be read.'));
      const data: ModelRequest = { id, kind, pcm, targetMode, assets };
      try { worker.postMessage(data, pcm ? [pcm.buffer] : []); }
      catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  async load(): Promise<void> { await this.request('load', 'chords'); }
  async infer(pcm: Float32Array<ArrayBuffer>, target: DetectionTargetMode): Promise<ModelPrediction> {
    const result = await this.request('live', target, pcm);
    if (!result) throw new Error('Enhanced model returned no result.');
    return result;
  }
  dispose(): void {
    this.pending?.cancel(new DOMException('Enhanced detection stopped.', 'AbortError'));
    this.worker?.terminate(); this.worker = null;
  }
}
