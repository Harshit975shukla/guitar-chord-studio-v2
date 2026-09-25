import type { TimedEvent } from './timing';

export interface TransportClock {
  now(): number;
  setTimer(callback: () => void, milliseconds: number): number;
  clearTimer(id: number): void;
}
export interface TransportOutput {
  play(entry: TimedEvent, start: number, end: number): () => void;
  target(entry: TimedEvent, serial: number): void;
  finish(): void;
  stalled(): void;
}

/** Scheduling and sounding/displayed targets are deliberately separate cursors. */
export class SongTransport {
  private generation = 0;
  private timer: number | null = null;
  private cancelAudio: Array<{ cancel: () => void; end: number }> = [];
  private pending: Array<{ entry: TimedEvent; at: number; serial: number }> = [];
  private nextIndex = 0;
  private nextAt = 0;
  private serial = 0;
  running = false;

  constructor(private clock: TransportClock, private output: TransportOutput) {}

  stop(): void {
    this.running = false;
    this.generation++;
    if (this.timer !== null) this.clock.clearTimer(this.timer);
    this.timer = null;
    this.cancelAudio.forEach(audio => audio.cancel());
    this.cancelAudio = [];
    this.pending = [];
  }

  start(entries: TimedEvent[], index: number, loop: boolean): void {
    this.stop();
    if (!entries[index]) throw new Error('Choose a playable event before starting.');
    this.running = true;
    const generation = this.generation;
    this.nextIndex = index;
    this.nextAt = this.clock.now() + 0.10;
    const tick = () => {
      if (!this.running || generation !== this.generation) return;
      const now = this.clock.now();
      // Do not burst through unscheduled music after a suspended/busy main thread.
      if (this.nextIndex < entries.length && this.nextAt < now + 0.004) {
        this.cancelAudio.forEach(audio => audio.cancel());
        this.cancelAudio = [];
        this.pending = [];
        this.nextAt = now + 0.05;
        this.output.stalled();
      }
      this.cancelAudio = this.cancelAudio.filter(audio => audio.end > now);
      let scheduled = 0;
      while (this.nextIndex < entries.length && this.nextAt <= now + 0.08) {
        const entry = entries[this.nextIndex];
        const end = this.nextAt + entry.duration;
        this.cancelAudio.push({ cancel: this.output.play(entry, this.nextAt, end), end });
        this.pending.push({ entry, at: this.nextAt, serial: ++this.serial });
        this.nextAt = end;
        this.nextIndex++;
        if (loop && this.nextIndex === entries.length) this.nextIndex = 0;
        if (++scheduled >= 2000) {
          this.stop();
          throw new Error('Events are too dense to schedule safely. Increase their durations.');
        }
      }
      while (this.pending.length && this.pending[0].at <= now + 0.000001) {
        const current = this.pending.shift()!;
        this.output.target(current.entry, current.serial);
        if (generation !== this.generation) return;
      }
      if (this.nextIndex === entries.length && now >= this.nextAt && !this.pending.length) {
        this.stop(); this.output.finish(); return;
      }
      this.timer = this.clock.setTimer(tick, 20);
    };
    tick();
  }
}
