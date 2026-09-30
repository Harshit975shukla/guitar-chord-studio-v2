export interface InputBlock { pcm: Float32Array<ArrayBuffer>; end: number }

/** Borrow the existing raw microphone node. Never request another stream or monitor its sound. */
export class InputTap {
  private node: AudioWorkletNode | null = null;
  private source: AudioNode | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  async connect(source: AudioNode, receive: (block: InputBlock) => void, fail: (error: Error) => void): Promise<void> {
    this.disconnect();
    const generation = this.generation, context = source.context;
    if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('This browser cannot capture enhanced audio. Standard listening still works.');
    await context.audioWorklet.addModule(inputTapUrl);
    if (generation !== this.generation) throw new DOMException('Audio capture cancelled.', 'AbortError');
    const node = new AudioWorkletNode(context, 'guitar-private-input', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.node = node; this.source = source;
    let lastBlock = performance.now();
    const error = (message: string) => { if (generation === this.generation) { this.disconnect(); fail(new Error(message)); } };
    node.onprocessorerror = () => error('Microphone capture stopped. Stop and retry.');
    node.port.onmessage = ({ data }: MessageEvent<InputBlock>) => {
      if (generation !== this.generation) return;
      if (!(data.pcm instanceof Float32Array) || !Number.isFinite(data.end) || !data.pcm.every(Number.isFinite)) {
        error('Invalid microphone samples. Recording was discarded.'); return;
      }
      lastBlock = performance.now();
      try { receive(data); }
      catch (failure) { error(failure instanceof Error ? failure.message : 'Audio processing failed.'); }
    };
    source.connect(node); node.connect(context.destination);
    this.timer = setInterval(() => {
      if (performance.now() - lastBlock > 1500 || context.state !== 'running') error('Audio input was interrupted. Start listening again.');
    }, 500);
  }
  disconnect(): void {
    this.generation++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.node) {
      this.node.onprocessorerror = null; this.node.port.onmessage = null;
      this.node.port.postMessage('stop'); this.node.port.close();
      this.source?.disconnect(this.node); this.node.disconnect();
    }
    this.node = null; this.source = null;
  }
}
import inputTapUrl from './inputTap.worklet.ts?worker&url';
