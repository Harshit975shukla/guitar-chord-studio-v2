import { JamLoopTransport, MAX_JAM_SECONDS, makeLoopBuffer } from '../audio/jamLoop';
import './jamLoop.css';

interface JamOptions {
  audio: () => Promise<AudioContext>;
  record: () => void;
  listening: () => boolean;
  calibrating: () => boolean;
  target: (mode: 'notes' | 'chords') => void;
}
export class JamLoop {
  private buffer: AudioBuffer | null = null;
  private peaks = new Float32Array(512);
  private transport: JamLoopTransport | null = null;
  private context: AudioContext | null = null;
  private active = true;
  private playing = false;
  private loading = false;
  private generation = 0;
  private raf: number | null = null;
  private abort = new AbortController();
  private observer: ResizeObserver;
  private el<T extends HTMLElement = HTMLElement>(name: string): T { return this.host.querySelector<T>(`[data-jam="${name}"]`)!; }

  constructor(private host: HTMLElement, private options: JamOptions) {
    host.classList.add('jam-workspace');
    host.innerHTML = `<details data-jam="panel"><summary>Record &amp; jam <span>Your guitar, your backing track</span></summary>
      <div class="jam-content">
        <p>Record chords and play a melody over them, or record a melody and practise its accompaniment. One backing clip, up to two minutes; no overdubbing or automatic transcription.</p>
        <div class="jam-actions"><button class="btn btn-primary" data-jam="record">Record a backing take</button><button class="btn btn-secondary" data-jam="clear" disabled>Clear backing</button></div>
        <h3 data-jam="title">No backing take selected</h3>
        <canvas data-jam="wave" height="100" aria-label="Backing recording waveform; adjust its range with the labeled start and end controls"></canvas>
        <div class="jam-controls">
          <label>Loop start (seconds)<input data-jam="start" type="number" min="0" step=".01" value="0" disabled></label>
          <label>Loop end (seconds)<input data-jam="end" type="number" min=".05" step=".01" value="1" disabled></label>
          <label>I will play<select data-jam="target"><option value="notes">Melody / notes over chords</option><option value="chords">Chords under a melody</option></select></label>
          <label>Backing volume <output data-jam="volume-text">65%</output><input data-jam="volume" type="range" min="0" max="1" step=".01" value=".65"></label>
        </div>
        <label class="jam-headphones"><input type="checkbox" data-jam="headphones"> I am using headphones when microphone listening is on.</label>
        <p class="jam-hint">For live note/chord feedback, start listening above and finish the room check before playing the loop. The app does not score an improvised part or separate speaker playback from your guitar.</p>
        <div class="jam-actions"><button class="btn btn-primary" data-jam="play" disabled>Start backing loop</button><output data-jam="position">0.00 s</output></div>
        <p data-jam="status" role="status">Choose “Use as backing loop” beside a current or saved recording.</p>
      </div></details>`;
    const events = { signal: this.abort.signal };
    this.el('record').addEventListener('click', () => { this.stop(); this.options.record(); }, events);
    this.el('clear').addEventListener('click', () => this.clear(), events);
    this.el('play').addEventListener('click', () => { if (this.playing || this.loading) this.stop(); else void this.start(); }, events);
    for (const key of ['start', 'end']) this.el(key).addEventListener('change', () => {
      this.stop('Loop range changed. Start the loop to hear it.');
      try { this.range(); this.draw(); } catch (error) { this.error(error); }
    }, events);
    this.el('volume').addEventListener('input', () => {
      const volume = Number(this.el<HTMLInputElement>('volume').value);
      this.transport?.setVolume(volume); this.el<HTMLOutputElement>('volume-text').value = `${Math.round(volume * 100)}%`;
    }, events);
    this.el('target').addEventListener('change', () => this.stop('Part changed. Start again to apply it to live feedback.'), events);
    this.el('headphones').addEventListener('change', () => { if (!this.el<HTMLInputElement>('headphones').checked && this.options.listening()) this.stop('Use headphones before combining a backing loop with microphone listening.'); }, events);
    this.el<HTMLDetailsElement>('panel').addEventListener('toggle', () => {
      if (!this.el<HTMLDetailsElement>('panel').open) this.stop(); else this.draw();
    }, events);
    host.addEventListener('keydown', event => { if (event.key === 'Escape') this.stop(); }, events);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop('Backing loop stopped while the page was hidden.'); }, events);
    window.addEventListener('pagehide', () => this.stop(), events);
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(this.el('wave'));
  }
  private status(message: string): void { this.el('status').textContent = message; }
  private error(error: unknown): void {
    console.error('Backing loop unavailable:', error);
    this.status(error instanceof Error ? error.message : String(error));
  }
  private sync(): void {
    this.el<HTMLButtonElement>('play').disabled = !this.buffer && !this.loading;
    this.el('play').textContent = this.loading ? 'Cancel loading' : this.playing ? 'Stop backing loop' : 'Start backing loop';
    for (const key of ['start', 'end', 'clear']) (this.el(key) as HTMLInputElement | HTMLButtonElement).disabled = !this.buffer || this.loading;
    this.host.dataset.state = this.loading ? 'loading' : this.playing ? 'playing' : 'idle';
  }
  async load(blob: Blob, title: string, durationMs: number): Promise<void> {
    this.stop();
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_JAM_SECONDS * 1000 || blob.size > 8 * 1024 * 1024) {
      const error = new Error('Choose a backing take up to two minutes and 8 MB. Longer takes remain available in the Recorder.');
      this.el<HTMLDetailsElement>('panel').open = true; this.error(error); throw error;
    }
    const generation = this.generation;
    this.el<HTMLDetailsElement>('panel').open = true; this.loading = true; this.sync(); this.status('Loading your recorded backing…');
    try {
      const context = await this.options.audio();
      if (generation !== this.generation) return;
      const decoder = context.sampleRate > 48000 ? new OfflineAudioContext(2, 1, 48000) : context;
      const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
      if (generation !== this.generation) return;
      if (buffer.duration < .05) throw new Error('Record a backing phrase at least 0.05 seconds long.');
      if (buffer.duration > MAX_JAM_SECONDS + .5 || buffer.length * buffer.numberOfChannels * 4 > 48 * 1024 * 1024) throw new Error('This decoded take is too large for a backing loop. Record a shorter phrase.');
      if (this.context !== context) {
        this.transport?.dispose(); this.transport = new JamLoopTransport(context); this.context = context;
        context.addEventListener('statechange', () => { if (this.context === context && context.state !== 'running') this.stop('Audio was interrupted. Start the backing loop again when ready.'); }, { signal: this.abort.signal });
      }
      this.buffer = buffer;
      this.el('title').textContent = title;
      this.el<HTMLInputElement>('start').value = '0'; this.el<HTMLInputElement>('end').value = (Math.floor(buffer.duration * 1000) / 1000).toFixed(3);
      this.el<HTMLInputElement>('end').max = String(buffer.duration);
      this.peaks.fill(0);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const bin = Math.min(this.peaks.length - 1, Math.floor(i * this.peaks.length / data.length));
        this.peaks[bin] = Math.max(this.peaks[bin], Math.abs(data[i]));
      }
      this.status('Backing ready. Trim any count-in or silence, then start the loop.');
    } catch (error) { if (generation === this.generation) this.error(error); throw error; }
    finally { if (generation === this.generation) { this.loading = false; this.sync(); this.draw(); } }
  }
  private range(): { start: number; end: number } {
    if (!this.buffer) throw new Error('Choose a recorded backing take first.');
    const start = Number(this.el<HTMLInputElement>('start').value);
    const end = Number(this.el<HTMLInputElement>('end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > this.buffer.duration || end - start < .05) throw new Error('Choose valid loop start/end points at least 0.05 seconds apart.');
    return { start, end };
  }
  private async start(): Promise<void> {
    if (!this.active || !this.buffer) return;
    const generation = ++this.generation;
    this.loading = true; this.sync();
    try {
      if (this.options.calibrating()) throw new Error('Finish the quiet room check before starting the backing loop.');
      if (this.options.listening() && !this.el<HTMLInputElement>('headphones').checked) throw new Error('Confirm headphones before playing a backing loop into an active microphone session.');
      const context = await this.options.audio();
      if (generation !== this.generation || !this.active || document.hidden) return;
      const { start, end } = this.range();
      if (this.options.calibrating()) throw new Error('Finish the room check before starting the loop.');
      if (this.options.listening()) {
        if (!this.el<HTMLInputElement>('headphones').checked) throw new Error('Use headphones with microphone listening.');
        this.options.target(this.el<HTMLSelectElement>('target').value === 'chords' ? 'chords' : 'notes');
      }
      const buffer = makeLoopBuffer(context, this.buffer, start, end);
      this.transport!.setVolume(Number(this.el<HTMLInputElement>('volume').value));
      this.transport!.start(buffer); this.playing = true;
      this.status(this.options.listening() ? 'Backing loop playing. Live feedback follows your selected part; use headphones.' : 'Backing loop playing. Play along on your guitar; microphone checking is off.');
      this.animate();
    } catch (error) { if (generation === this.generation) { this.playing = false; this.error(error); } }
    finally { if (generation === this.generation) { this.loading = false; this.sync(); } }
  }
  private animate(): void {
    this.draw();
    if (this.playing) this.raf = requestAnimationFrame(() => this.animate());
  }
  private draw(): void {
    const canvas = this.el<HTMLCanvasElement>('wave'), rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(2, devicePixelRatio || 1), width = Math.round(rect.width * ratio), height = 100 * ratio;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#dfb77d'; ctx.lineWidth = ratio;
    ctx.beginPath();
    this.peaks.forEach((peak, i) => {
      const x = i / this.peaks.length * width, y = Math.min(.95, peak) * height * .45;
      ctx.moveTo(x, height / 2 - y); ctx.lineTo(x, height / 2 + y);
    }); ctx.stroke();
    if (this.buffer) {
      const start = Number(this.el<HTMLInputElement>('start').value), end = Number(this.el<HTMLInputElement>('end').value);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, start / this.buffer.duration * width, height);
      ctx.fillRect(end / this.buffer.duration * width, 0, width, height);
      if (this.playing && this.transport) {
        const position = start + this.transport.position();
        this.el<HTMLOutputElement>('position').value = `${position.toFixed(2)} s`;
        ctx.fillStyle = '#eaf1da'; ctx.fillRect(position / this.buffer.duration * width, 0, ratio * 2, height);
      }
    }
  }
  stop(message = 'Backing loop stopped.'): void {
    this.generation++; this.playing = false; this.loading = false;
    this.transport?.stop(); if (this.raf !== null) cancelAnimationFrame(this.raf); this.raf = null;
    this.sync(); this.status(message); this.draw();
  }
  clear(): void {
    this.stop(); this.buffer = null; this.peaks.fill(0); this.el('title').textContent = 'No backing take selected'; this.sync(); this.draw();
  }
  setActive(active: boolean): void { this.active = active; if (!active) this.stop(); }
  dispose(): void { this.stop(); this.abort.abort(); this.observer.disconnect(); this.transport?.dispose(); this.buffer = null; }
}
