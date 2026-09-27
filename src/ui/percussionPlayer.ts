import { DEFAULT_PERCUSSION_LEVELS, PERCUSSION_KITS, PERCUSSION_VOICES, PercussionBus, percussionHits, type PercussionKit, type PercussionLevels } from '../audio/percussion';
import { RHYTHM_PRESETS, getRhythmPreset } from '../tabs/rhythm';

export class PercussionPlayer {
  private presetId = 'keharwa';
  private kit: PercussionKit = 'original';
  private levels = { ...DEFAULT_PERCUSSION_LEVELS };
  private bpm = 80;
  private step = 0;
  private mode: 'idle' | 'starting' | 'playing' | 'preview' = 'idle';
  private active = false;
  private generation = 0;
  private timer: number | null = null;
  private bus: PercussionBus | null = null;
  private abort = new AbortController();

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }

  constructor(private getAudio: () => Promise<AudioContext>) {
    const events = { signal: this.abort.signal };
    const presets = this.el('rhythm-presets'), select = this.el<HTMLSelectElement>('dock-rhythm-select');
    for (const preset of RHYTHM_PRESETS) {
      select.add(new Option(preset.name, preset.id));
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'percussion-preset'; card.id = `rhy-card-${preset.id}`;
      card.innerHTML = `<strong>${preset.name}</strong><span>${preset.pattern.map(p => p.name).join(' · ')}</span><small>${preset.description}</small>`;
      card.addEventListener('click', () => this.selectPreset(preset.id), events); presets.append(card);
    }
    select.value = this.presetId;
    select.addEventListener('change', () => this.selectPreset(select.value), events);
    const instruments = this.el<HTMLSelectElement>('percussion-instrument');
    for (const [id, name] of Object.entries(PERCUSSION_KITS)) instruments.add(new Option(name, id));
    instruments.addEventListener('change', () => {
      const kit = (Object.keys(PERCUSSION_KITS) as PercussionKit[]).find(key => key === instruments.value);
      if (!kit) throw new Error('Choose a supported percussion instrument.');
      this.kit = kit;
      if (this.mode === 'starting' || this.mode === 'preview') this.stop();
      else this.bus?.stop();
      this.status(`${PERCUSSION_KITS[kit]} selected. ${this.mode === 'playing' ? 'The next pulse uses this sound.' : 'Hear the sound or start the rhythm.'}`);
    }, events);
    this.el('btn-dock-rhythm-toggle').addEventListener('click', () => {
      if (this.mode !== 'idle') this.stop();
      else void this.start(false);
    }, events);
    this.el('percussion-preview').addEventListener('click', () => { void this.start(true); }, events);
    this.el<HTMLInputElement>('dock-tempo-slider').addEventListener('input', event => {
      this.bpm = Number((event.target as HTMLInputElement).value);
      this.el<HTMLOutputElement>('dock-tempo-readout').value = `${this.bpm} BPM`;
    }, events);
    for (const [id, key, output] of [
      ['percussion-volume', 'volume', 'percussion-volume-readout'],
      ['dock-bass-vol', 'bass', 'percussion-bass-readout'],
      ['dock-treble-vol', 'treble', 'percussion-treble-readout'],
    ] as const) {
      const input = this.el<HTMLInputElement>(id); input.value = String(this.levels[key]);
      input.addEventListener('input', () => this.setLevel(key, Number(input.value), output), events);
    }
    this.el('pane-rhythm').addEventListener('keydown', event => { if (event.key === 'Escape') this.stop(); }, events);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop('Percussion stopped while the page was hidden.'); }, events);
    window.addEventListener('pagehide', () => this.stop(), events);
    this.renderPreset(); this.syncButton();
  }

  private preset() {
    const preset = getRhythmPreset(this.presetId);
    if (!preset) throw new Error(`Unknown percussion pattern: ${this.presetId}`);
    return preset;
  }
  private status(message: string): void { this.el('percussion-status').textContent = message; }
  private setLevel(key: keyof PercussionLevels, value: number, output: string): void {
    this.levels = { ...this.levels, [key]: value };
    this.bus?.setLevels(this.levels);
    this.el<HTMLOutputElement>(output).value = `${Math.round(value * 100)}%`;
  }
  private syncButton(): void {
    const button = this.el<HTMLButtonElement>('btn-dock-rhythm-toggle');
    button.textContent = this.mode === 'starting' ? 'Cancel start' : this.mode === 'playing' ? 'Stop rhythm' : this.mode === 'preview' ? 'Stop sound' : 'Start rhythm';
    button.setAttribute('aria-pressed', String(this.mode !== 'idle'));
    this.el('rhythm-dock').dataset.state = this.mode;
  }
  private renderPreset(): void {
    const preset = this.preset();
    this.el<HTMLSelectElement>('dock-rhythm-select').value = preset.id;
    for (const p of RHYTHM_PRESETS) this.el(`rhy-card-${p.id}`).setAttribute('aria-pressed', String(p.id === preset.id));
    const dots = this.el('dock-beat-dots'); dots.replaceChildren();
    preset.pattern.forEach((stroke, i) => {
      const dot = document.createElement('span');
      dot.className = `rhythm-beat-dot${stroke.sam ? ' sam-beat' : ''}`; dot.id = `rhy-dot-${i}`;
      dot.setAttribute('aria-label', `Pulse ${i + 1}: ${stroke.name}`); dots.append(dot);
    });
    this.el('percussion-pulse').textContent = `${preset.name} · ${preset.pattern.length} pulses`;
  }
  private selectPreset(id: string): void {
    if (!getRhythmPreset(id)) throw new Error(`Unknown percussion pattern: ${id}`);
    const resume = this.mode === 'playing';
    this.stop(); this.presetId = id; this.step = 0; this.renderPreset();
    this.status('Pattern selected. Tempo and instrument selection are unchanged.');
    if (resume) void this.start(false);
  }

  private async start(preview: boolean): Promise<void> {
    this.stop();
    if (!this.active || document.hidden) return;
    const generation = this.generation;
    this.mode = 'starting'; this.syncButton(); this.status('Preparing percussion audio…');
    try {
      const context = await this.getAudio();
      if (generation !== this.generation || !this.active || document.hidden) return;
      if (context.state !== 'running') throw new Error('Audio is not running. Try Start again or check browser audio settings.');
      if (this.bus?.context !== context) {
        this.bus?.dispose(); this.bus = new PercussionBus(context, this.levels);
        context.addEventListener('statechange', () => {
          if (this.bus?.context === context && context.state !== 'running') this.stop('Audio was interrupted. Press Start to resume.');
        }, { signal: this.abort.signal });
      }
      this.bus.setLevels(this.levels);
      this.mode = preview ? 'preview' : 'playing'; this.step = 0; this.syncButton();
      if (preview) {
        const stroke = this.preset().pattern[0];
        this.bus.play(stroke.type, this.kit, stroke.vel);
        this.status(`Sound preview: ${percussionHits(stroke.type, this.kit).map(hit => PERCUSSION_VOICES[hit.voice]).join(' + ')}.`);
        this.timer = window.setTimeout(() => this.stop('Sound preview finished. Start the rhythm when ready.'), 750);
      } else {
        this.status('Percussion playing. Adjust its volume independently of the guitar.');
        this.pulse();
      }
    } catch (error) {
      if (generation === this.generation) {
        console.error('Percussion playback failed:', error);
        this.stop(`Percussion could not start: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private pulse(): void {
    if (this.mode !== 'playing' || !this.bus) return;
    try {
      const preset = this.preset(), stroke = preset.pattern[this.step];
      this.bus.play(stroke.type, this.kit, stroke.vel);
      this.el('dock-beat-dots').querySelectorAll<HTMLElement>('span').forEach((dot, i) => {
        dot.classList.toggle('active-beat', i === this.step);
        if (i === this.step) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
      });
      this.el('percussion-pulse').textContent = `${this.step + 1}/${preset.pattern.length} · ${stroke.name} · ${percussionHits(stroke.type, this.kit).map(hit => PERCUSSION_VOICES[hit.voice]).join(' + ')}`;
      this.step = (this.step + 1) % preset.pattern.length;
      this.timer = window.setTimeout(() => this.pulse(), 60000 / this.bpm);
    } catch (error) {
      console.error('Percussion pulse failed:', error);
      this.stop(`Percussion stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  stop(message = 'Percussion stopped.'): void {
    this.generation++; this.mode = 'idle';
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null; this.bus?.stop();
    this.el('dock-beat-dots').querySelectorAll<HTMLElement>('span').forEach(dot => { dot.classList.remove('active-beat'); dot.removeAttribute('aria-current'); });
    this.syncButton(); this.status(message);
  }
  setActive(active: boolean): void { this.active = active; if (!active) this.stop(); }
  dispose(): void { this.stop(); this.active = false; this.abort.abort(); this.bus?.dispose(); }
}
