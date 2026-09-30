export {};
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class PrivateInputTap extends AudioWorkletProcessor {
  private samples = new Float32Array(1024);
  private position = 0;
  private active = true;
  constructor() {
    super();
    this.port.onmessage = event => { if (event.data === 'stop') { this.samples.fill(0); this.active = false; } };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.active) return false;
    const channels = inputs[0];
    if (!channels?.length || !channels[0].length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.samples[this.position++] = value;
      if (this.position === this.samples.length) {
        this.port.postMessage({ pcm: this.samples, end: (currentFrame + i + 1) / sampleRate }, [this.samples.buffer]);
        this.samples = new Float32Array(1024); this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('guitar-private-input', PrivateInputTap);
