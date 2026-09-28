export const MAX_JAM_SECONDS = 120;

export function loopFrames(start: number, end: number, sampleRate: number, length: number): { first: number; last: number } {
  if (![start, end, sampleRate, length].every(Number.isFinite) || sampleRate <= 0 || start < 0 || end <= start || end - start < .05) {
    throw new Error('Choose a loop at least 0.05 seconds long, with its end after its start.');
  }
  const first = Math.round(start * sampleRate), last = Math.round(end * sampleRate);
  if (first < 0 || last > length || first >= last) throw new Error('The loop range must stay inside this recording.');
  return { first, last };
}

export function makeLoopBuffer(context: BaseAudioContext, recording: AudioBuffer, start: number, end: number): AudioBuffer {
  const { first, last } = loopFrames(start, end, recording.sampleRate, recording.length);
  const result = context.createBuffer(recording.numberOfChannels, last - first, recording.sampleRate);
  const fade = Math.min(Math.round(recording.sampleRate * .005), Math.floor(result.length / 4));
  for (let channel = 0; channel < result.numberOfChannels; channel++) {
    const output = result.getChannelData(channel);
    output.set(recording.getChannelData(channel).subarray(first, last));
    for (let i = 0; i < fade; i++) {
      const gain = i / Math.max(1, fade);
      output[i] *= gain; output[output.length - 1 - i] *= gain;
    }
  }
  return result;
}

export class JamLoopTransport {
  private source: AudioBufferSourceNode | null = null;
  private voiceGain: GainNode | null = null;
  private gain: GainNode;
  private started = 0;
  private duration = 0;
  constructor(private context: AudioContext, volume = .65) {
    this.gain = context.createGain(); this.gain.gain.value = volume; this.gain.connect(context.destination);
  }
  start(buffer: AudioBuffer): void {
    this.stop();
    this.source = this.context.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
    this.voiceGain = this.context.createGain();
    this.source.connect(this.voiceGain); this.voiceGain.connect(this.gain);
    const source = this.source, voice = this.voiceGain;
    source.addEventListener('ended', () => { source.disconnect(); voice.disconnect(); }, { once: true });
    this.started = this.context.currentTime + .025; this.duration = buffer.duration;
    this.source.start(this.started);
  }
  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Loop volume must be between 0 and 100%.');
    this.gain.gain.cancelAndHoldAtTime(this.context.currentTime);
    this.gain.gain.linearRampToValueAtTime(value, this.context.currentTime + .015);
  }
  position(): number { return this.source ? Math.max(0, this.context.currentTime - this.started) % this.duration : 0; }
  stop(): void {
    if (!this.source) return;
    const now = this.context.currentTime;
    this.voiceGain?.gain.cancelAndHoldAtTime(now);
    this.voiceGain?.gain.linearRampToValueAtTime(0, now + .012);
    this.source.stop(now + .013); this.source = null; this.voiceGain = null;
  }
  dispose(): void { this.stop(); this.gain.disconnect(); }
}
