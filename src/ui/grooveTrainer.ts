import './grooveTrainer.css';
import {
  DRUM_GROOVES, GROOVE_LANES, GROOVE_STYLES, LANE_ORDER, MIX_GROUPS, PRACTICE_KEYS, PRACTICE_PROGRESSIONS,
  getDrumGroove, grooveVoices, loopGroove, loopTempo, realizeProgression, suggestLoopBars,
  type DrumGroove, type GrooveLanes, type GrooveSection, type MixGroup, type PracticeKey,
} from '../audio/drumGrooves';
import { FILL_CHOICES, GrooveSequencer, MAX_BPM, MIN_BPM, type GrooveCue, type GrooveSettings } from '../audio/grooveSequencer';
import { PercussionBus, type SampleKit } from '../audio/percussion';

export const GROOVE_KITS: Readonly<Record<string, string>> = {
  studio: 'Studio · dynamic snare & hi-hats', drums: 'Standard', 'drums-powerful': 'Powerful', 'drums-monumental': 'Monumental',
  'drums-smooth': 'Smooth', 'drums-minimalistic': 'Minimal', 'drums-energetic': 'Energetic',
};
const GAPS: Readonly<Record<string, { label: string; value: GrooveSettings['gap'] }>> = {
  off: { label: 'Off', value: null },
  '3-1': { label: 'Play 3, silent 1', value: { play: 3, mute: 1 } },
  '2-2': { label: 'Play 2, silent 2', value: { play: 2, mute: 2 } },
  '1-1': { label: 'Play 1, silent 1', value: { play: 1, mute: 1 } },
  '4-4': { label: 'Play 4, silent 4', value: { play: 4, mute: 4 } },
};
const LOOKAHEAD = .14, TICK_MS = 25, STORAGE_KEY = 'guitar-studio-grooves-v1';
const MAX_LOOP_BYTES = 30 * 1024 * 1024, MAX_LOOP_SECONDS = 60;
const LOOP_METERS = { '4/4': 4, '3/4': 3, '6/8': 2 } as const;
type LoopMeter = keyof typeof LOOP_METERS;
interface LoopClip { buffer: AudioBuffer; name: string; bars: number; meter: LoopMeter }
export interface GrooveTrainerHooks { onStart?: () => void }
const levelClass = (level: number): number => level >= 1 ? 4 : level >= .8 ? 3 : level >= .55 ? 2 : level > 0 ? 1 : 0;
const clampBpm = (value: number): number => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, value)));
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * Drum-groove practice on the Percussion page: recorded kits sequenced ahead of the audio
 * clock, plus an optional loop the player imports from their own device. Owns its audio bus;
 * call setActive with the Percussion tab's visibility and stopIfActive before other audio needs quiet.
 */
export class GrooveTrainer {
  private root: HTMLElement;
  private mode: 'idle' | 'starting' | 'playing' = 'idle';
  private source: 'grooves' | 'loop' = 'grooves';
  private grooveId = 'rock';
  /** The selection shown in the UI; playingKit is the one currently being scheduled. */
  private kit: SampleKit = 'studio';
  private playingKit: SampleKit = 'studio';
  private kitRequest = 0;
  private bpm = 100;
  private countIn = 1;
  private fillEvery = 8;
  private section: GrooveSection = 'verse';
  private swing = .5;
  private humanize = true;
  private ramp = { enabled: false, step: 2, everyBars: 4, target: 130 };
  private gap = 'off';
  private chords: { id: string; key: PracticeKey; barsPerChord: number } = { id: 'off', key: 'G', barsPerChord: 1 };
  private volume = 1;
  private mix: Record<MixGroup, number> = { kick: 1, snare: 1, cymbals: .85, toms: 1, percussion: .9 };
  private loop: LoopClip | null = null;
  private loopGeneration = 0;
  private loopSource: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  private active = false;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private bus: PercussionBus | null = null;
  private sequencer: GrooveSequencer | null = null;
  private cues: GrooveCue[] = [];
  private shownKey = '';
  private shownBar = '';
  private shownStep = -1;
  private columns: HTMLElement[][] = [];
  private taps: number[] = [];
  private events = new AbortController();

  constructor(host: HTMLElement, private getAudio: () => Promise<AudioContext>, private hooks: GrooveTrainerHooks = {}) {
    this.restore();
    this.root = document.createElement('section');
    this.root.className = 'groove';
    this.root.setAttribute('aria-labelledby', 'groove-heading');
    this.root.innerHTML = this.template();
    host.append(this.root);
    const signal = this.events.signal;
    this.root.addEventListener('click', this.onClick, { signal });
    this.root.addEventListener('change', this.onChange, { signal });
    this.root.addEventListener('input', this.onInput, { signal });
    this.root.addEventListener('keydown', event => { if (event.key === 'Escape') this.stopIfActive('Drums stopped.'); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stopIfActive('Drums stopped while the page was hidden.'); }, { signal });
    window.addEventListener('pagehide', () => this.stopIfActive('Drums stopped.'), { signal });
    this.syncControls();
    this.showIdle();
  }

  private template(): string {
    const groups = GROOVE_STYLES.map(style => `<optgroup label="${style}">${DRUM_GROOVES.filter(g => g.style === style)
      .map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</optgroup>`).join('');
    const options = (entries: [string, string][]) => entries.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `
      <!-- THESIS: A drummer on the music stand: the next beat and the next chord are always legible from arm's length.
      OWN-WORLD: Incumbent charcoal, warm gold, quiet borders; the grid is the only lit surface. -->
      <header class="groove-head">
        <div class="groove-title">
          <h3 id="groove-heading">Drum grooves</h3>
          <p>Play along with a recorded drum kit. Choose a style, set the tempo, and keep time with the band.</p>
        </div>
        <div class="groove-seg" role="group" aria-label="Rhythm source">
          <button type="button" data-groove-source="grooves">Built-in grooves</button>
          <button type="button" data-groove-source="loop">Your own loop</button>
        </div>
      </header>
      <div class="groove-picker" data-groove-panel="grooves">
        <label class="groove-field groove-grow">Groove<select data-groove-select>${groups}</select></label>
        <label class="groove-field">Kit<select data-groove-kit>${options(Object.entries(GROOVE_KITS))}</select></label>
        <div class="groove-about">
          <p><strong data-groove-name></strong><span data-groove-meta></span></p>
          <p data-groove-desc></p>
          <p class="groove-tip" data-groove-tip></p>
        </div>
      </div>
      <div class="groove-picker" data-groove-panel="loop" hidden>
        <label class="groove-field groove-grow groove-file">Audio file<input type="file" data-groove-file accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.aac,.flac"></label>
        <label class="groove-field">Bars in the loop<select data-groove-loop-bars>${options([['1', '1'], ['2', '2'], ['4', '4'], ['8', '8']])}</select></label>
        <label class="groove-field">Time signature<select data-groove-loop-meter>${options([['4/4', '4/4'], ['3/4', '3/4'], ['6/8', '6/8']])}</select></label>
        <div class="groove-about">
          <p data-groove-loop-info>No loop chosen yet. A loop should start on beat one and repeat cleanly.</p>
          <p>Use recordings you have the right to use, such as loops downloaded with your own sound-library subscription. The file stays in this browser tab: it is not uploaded, saved or shared.</p>
        </div>
      </div>
      <div class="groove-transport">
        <button type="button" class="btn btn-primary groove-play" data-groove-play aria-pressed="false">Start drums</button>
        <button type="button" class="btn btn-secondary" data-groove-fill disabled>Fill</button>
        <div class="groove-seg" role="group" aria-label="Song section" data-groove-sections>
          <button type="button" data-groove-section="verse">Verse</button>
          <button type="button" data-groove-section="chorus">Chorus</button>
        </div>
        <div class="groove-tempo" role="group" aria-label="Tempo">
          <button type="button" data-groove-nudge="-1" aria-label="Slower by 1 BPM">−</button>
          <label><span class="groove-hidden">Tempo in beats per minute</span><input type="number" inputmode="numeric" data-groove-bpm min="${MIN_BPM}" max="${MAX_BPM}" step="1"></label>
          <span class="groove-unit" data-groove-unit>BPM</span>
          <button type="button" data-groove-nudge="1" aria-label="Faster by 1 BPM">+</button>
          <button type="button" data-groove-tap>Tap</button>
        </div>
        <label class="groove-field groove-inline">Count-in<select data-groove-countin>${options([['0', 'None'], ['1', '1 bar'], ['2', '2 bars']])}</select></label>
      </div>
      <div class="groove-sliders">
        <label class="groove-slider">Tempo <output data-groove-bpm-out></output><input type="range" data-groove-bpm-range min="40" max="220" step="1"></label>
        <label class="groove-slider groove-master">Drum volume <output data-groove-volume-out></output><input type="range" data-groove-volume min="0" max="1.5" step="0.05"></label>
      </div>
      <div class="groove-stage" data-groove-stage data-kind="idle">
        <div class="groove-now">
          <div class="groove-position"><strong data-groove-bar>Ready</strong><span data-groove-phase></span></div>
          <ol class="groove-beats" data-groove-beats aria-hidden="true"></ol>
          <div class="groove-chord" data-groove-chords hidden>
            <span class="groove-chord-now"><small>Play</small><strong data-groove-chord-now></strong></span>
            <span class="groove-chord-next"><small>Next</small><b data-groove-chord-next></b></span>
          </div>
        </div>
        <div class="groove-grid" data-groove-grid role="img"></div>
      </div>
      <details class="groove-details">
        <summary>Practice tools <span>fills, speed trainer, silent bars, chord prompts, feel</span></summary>
        <div class="groove-tools">
          <label class="groove-field" data-groove-only>Automatic fill<select data-groove-fill-every>${options([['0', 'Only when I press Fill'], ['2', 'Every 2 bars'], ['4', 'Every 4 bars'], ['8', 'Every 8 bars']])}</select></label>
          <label class="groove-field">Silent bars<select data-groove-gap>${options(Object.entries(GAPS).map(([id, gap]) => [id, gap.label]))}</select></label>
          <fieldset class="groove-set" data-groove-only>
            <legend><label class="groove-check"><input type="checkbox" data-groove-ramp> Speed trainer</label></legend>
            <label>Add <input type="number" data-groove-ramp-step min="1" max="20" step="1"> BPM</label>
            <label>every <select data-groove-ramp-every>${options([['1', '1'], ['2', '2'], ['4', '4'], ['8', '8']])}</select> bars</label>
            <label>up to <input type="number" data-groove-ramp-target min="${MIN_BPM}" max="${MAX_BPM}" step="1"> BPM</label>
          </fieldset>
          <fieldset class="groove-set">
            <legend>Chord prompts</legend>
            <label class="groove-field">Progression<select data-groove-progression>${options([['off', 'Off'], ...Object.entries(PRACTICE_PROGRESSIONS).map(([id, p]) => [id, p.label] as [string, string])])}</select></label>
            <label class="groove-field">Key<select data-groove-key>${options(PRACTICE_KEYS.map(key => [key, key]))}</select></label>
            <label class="groove-field">Bars per chord<select data-groove-chord-bars>${options([['1', '1'], ['2', '2'], ['4', '4']])}</select></label>
          </fieldset>
          <div class="groove-set groove-feel" data-groove-only>
            <label class="groove-slider">Swing <output data-groove-swing-out></output><input type="range" data-groove-swing min="50" max="75" step="1"></label>
            <label class="groove-check"><input type="checkbox" data-groove-humanize> Human feel: slight timing and dynamics variation</label>
          </div>
        </div>
      </details>
      <details class="groove-details" data-groove-only>
        <summary>Mix <span>balance the kit</span></summary>
        <div class="groove-mix">${(Object.entries(MIX_GROUPS) as [MixGroup, string][]).map(([group, label]) =>
          `<label class="groove-slider">${label} <output data-groove-mix-out="${group}"></output><input type="range" data-groove-mix="${group}" min="0" max="1" step="0.05"></label>`).join('')}</div>
      </details>
      <p class="groove-status" data-groove-status role="status" aria-live="polite">Choose a groove, then press Start drums.</p>
      <p class="groove-credit">The studio kit uses multi-velocity snare, hi-hat, cross-stick and tom recordings from <a href="https://github.com/sgossner/VCSL" target="_blank" rel="noopener noreferrer">VCSL (CC0)</a> with Musicca kick and cymbals; the other kits are Musicca recordings used with the project owner's permission. Hand percussion, claps, cowbell, claves, woodblock and agogô are VCSL (CC0). Grooves are original practice patterns. Stop, Escape, leaving Percussion or hiding the page ends playback. Use headphones if the microphone is listening.</p>`;
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private all<T extends HTMLElement = HTMLElement>(selector: string): T[] { return [...this.root.querySelectorAll<T>(selector)]; }
  private status(text: string): void { this.find('[data-groove-status]').textContent = text; }
  private get canRun(): boolean { return this.active && !document.hidden; }
  private get groove(): DrumGroove { return getDrumGroove(this.grooveId) ?? DRUM_GROOVES[0]; }
  private get loopMode(): boolean { return this.source === 'loop'; }
  private currentGroove(): DrumGroove { return this.loopMode && this.loop ? loopGroove(this.loop.meter, this.loop.bars) : this.groove; }
  private loopBpm(): number | null {
    return this.loop ? loopTempo(this.loop.buffer.duration, LOOP_METERS[this.loop.meter], this.loop.bars) : null;
  }
  get playing(): boolean { return this.mode === 'playing'; }

  private restore(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<string, unknown> | null;
      if (!saved || typeof saved !== 'object') return;
      if (typeof saved.groove === 'string' && getDrumGroove(saved.groove)) this.grooveId = saved.groove;
      if (typeof saved.kit === 'string' && Object.hasOwn(GROOVE_KITS, saved.kit)) this.kit = saved.kit as SampleKit;
      this.bpm = typeof saved.bpm === 'number' && Number.isFinite(saved.bpm) ? clampBpm(saved.bpm) : this.groove.tempo[1];
      if (typeof saved.countIn === 'number' && [0, 1, 2].includes(saved.countIn)) this.countIn = saved.countIn;
      if (typeof saved.fillEvery === 'number' && (FILL_CHOICES as readonly number[]).includes(saved.fillEvery)) this.fillEvery = saved.fillEvery;
      if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1.5) this.volume = saved.volume;
      if (typeof saved.humanize === 'boolean') this.humanize = saved.humanize;
    } catch { /* Ignore unreadable preferences and keep defaults. */ }
    this.swing = this.groove.swing;
  }
  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groove: this.grooveId, kit: this.kit, bpm: this.bpm, countIn: this.countIn,
        fillEvery: this.fillEvery, volume: this.volume, humanize: this.humanize }));
    } catch { /* Storage can be unavailable in private modes; the session still works. */ }
  }

  private settings(groove: DrumGroove, bpm: number): GrooveSettings {
    const loop = !!groove.loop;
    return {
      bpm, countInBars: this.countIn, fillEvery: loop ? 0 : this.fillEvery, swing: loop || !groove.swingUnit ? .5 : this.swing,
      humanize: !loop && this.humanize, gap: GAPS[this.gap]?.value ?? null,
      ramp: !loop && this.ramp.enabled && this.ramp.target > bpm ? { step: this.ramp.step, everyBars: this.ramp.everyBars, target: this.ramp.target } : null,
      seed: 0x5eed + DRUM_GROOVES.indexOf(groove),
    };
  }

  private syncControls(): void {
    const groove = this.groove, loopBpm = this.loopBpm();
    for (const button of this.all<HTMLButtonElement>('[data-groove-source]')) button.setAttribute('aria-pressed', String(button.dataset.grooveSource === this.source));
    this.find('[data-groove-panel="grooves"]').hidden = this.loopMode;
    this.find('[data-groove-panel="loop"]').hidden = !this.loopMode;
    for (const element of this.all('[data-groove-only]')) element.hidden = this.loopMode;
    this.find('[data-groove-sections]').hidden = this.loopMode;
    this.find('[data-groove-fill]').hidden = this.loopMode;
    this.find<HTMLSelectElement>('[data-groove-select]').value = groove.id;
    this.find<HTMLSelectElement>('[data-groove-kit]').value = this.kit;
    this.find('[data-groove-name]').textContent = `${groove.style} · ${groove.name}`;
    this.find('[data-groove-meta]').textContent = ` ${groove.meter} · suggested ${groove.tempo[0]}–${groove.tempo[2]} BPM`
      + `${groove.beatUnit === 'dotted quarter' ? ' (dotted-quarter beats)' : ''}${groove.bars === 2 ? ' · two-bar pattern' : ''}`;
    this.find('[data-groove-desc]').textContent = groove.description;
    this.find('[data-groove-tip]').textContent = `Guitar: ${groove.tip}`;
    const bpm = this.loopMode ? loopBpm : this.bpm;
    const number = this.find<HTMLInputElement>('[data-groove-bpm]'), range = this.find<HTMLInputElement>('[data-groove-bpm-range]');
    number.value = bpm === null ? '' : this.loopMode ? bpm.toFixed(1) : String(bpm);
    number.disabled = this.loopMode;
    range.value = String(Math.round(bpm ?? this.bpm)); range.disabled = this.loopMode;
    this.find<HTMLOutputElement>('[data-groove-bpm-out]').value = bpm === null ? '–' : `${this.loopMode ? bpm.toFixed(1) : bpm} BPM`;
    this.find('[data-groove-unit]').textContent = (this.loopMode ? this.loop?.meter === '6/8' : groove.beatUnit === 'dotted quarter') ? 'BPM ♩.' : 'BPM';
    for (const selector of ['[data-groove-nudge="-1"]', '[data-groove-nudge="1"]', '[data-groove-tap]']) this.find<HTMLButtonElement>(selector).hidden = this.loopMode;
    this.find<HTMLSelectElement>('[data-groove-countin]').value = String(this.countIn);
    this.find<HTMLInputElement>('[data-groove-volume]').value = String(this.volume);
    this.find<HTMLOutputElement>('[data-groove-volume-out]').value = `${Math.round(this.volume * 100)}%`;
    this.find<HTMLSelectElement>('[data-groove-fill-every]').value = String(this.fillEvery);
    this.find<HTMLSelectElement>('[data-groove-gap]').value = this.gap;
    this.find<HTMLInputElement>('[data-groove-ramp]').checked = this.ramp.enabled;
    this.find<HTMLInputElement>('[data-groove-ramp-step]').value = String(this.ramp.step);
    this.find<HTMLSelectElement>('[data-groove-ramp-every]').value = String(this.ramp.everyBars);
    this.find<HTMLInputElement>('[data-groove-ramp-target]').value = String(this.ramp.target);
    this.find<HTMLSelectElement>('[data-groove-progression]').value = this.chords.id;
    this.find<HTMLSelectElement>('[data-groove-key]').value = this.chords.key;
    this.find<HTMLSelectElement>('[data-groove-chord-bars]').value = String(this.chords.barsPerChord);
    for (const element of [this.find<HTMLSelectElement>('[data-groove-key]'), this.find<HTMLSelectElement>('[data-groove-chord-bars]')]) element.disabled = this.chords.id === 'off';
    const swing = this.find<HTMLInputElement>('[data-groove-swing]');
    swing.value = String(Math.round(this.swing * 100)); swing.disabled = !groove.swingUnit;
    this.find<HTMLOutputElement>('[data-groove-swing-out]').value = groove.swingUnit ? `${Math.round(this.swing * 100)}%` : 'built into this triplet groove';
    this.find<HTMLInputElement>('[data-groove-humanize]').checked = this.humanize;
    for (const [group, level] of Object.entries(this.mix)) {
      this.find<HTMLInputElement>(`[data-groove-mix="${group}"]`).value = String(level);
      this.find<HTMLOutputElement>(`[data-groove-mix-out="${group}"]`).value = `${Math.round(level * 100)}%`;
    }
    if (this.loop) {
      this.find<HTMLSelectElement>('[data-groove-loop-bars]').value = String(this.loop.bars);
      this.find<HTMLSelectElement>('[data-groove-loop-meter]').value = this.loop.meter;
      const outside = loopBpm! < MIN_BPM || loopBpm! > MAX_BPM;
      this.find('[data-groove-loop-info]').textContent = `${this.loop.name} · ${this.loop.buffer.duration.toFixed(2)} s · `
        + `${loopBpm!.toFixed(1)} BPM as ${this.loop.bars} ${this.loop.bars === 1 ? 'bar' : 'bars'} of ${this.loop.meter}`
        + (outside ? ` · outside ${MIN_BPM}–${MAX_BPM} BPM, so choose another bar count or time signature.` : '');
    }
    this.syncTransport();
  }

  private loopRangeMessage(bpm: number): string {
    const loop = this.loop!;
    return `As ${loop.bars} ${loop.bars === 1 ? 'bar' : 'bars'} of ${loop.meter}, this loop would be ${bpm.toFixed(1)} BPM. `
      + `Choose a bar count or time signature that gives ${MIN_BPM}–${MAX_BPM} BPM.`;
  }

  private syncTransport(): void {
    const play = this.find<HTMLButtonElement>('[data-groove-play]');
    play.textContent = this.mode === 'starting' ? 'Cancel start' : this.mode === 'playing' ? 'Stop drums' : 'Start drums';
    play.setAttribute('aria-pressed', String(this.mode !== 'idle'));
    this.find<HTMLButtonElement>('[data-groove-fill]').disabled = this.mode !== 'playing' || this.loopMode;
    const target = this.sequencer?.pendingSection ?? this.sequencer?.section ?? this.section;
    for (const button of this.all<HTMLButtonElement>('[data-groove-section]')) button.setAttribute('aria-pressed', String(button.dataset.grooveSection === target));
    this.root.dataset.state = this.mode;
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLElement>('button');
    if (!target || !this.root.contains(target)) return;
    if (target.dataset.grooveSource) {
      const source = target.dataset.grooveSource === 'loop' ? 'loop' : 'grooves';
      if (source === this.source) return;
      this.stopIfActive('Drums stopped to switch the rhythm source.');
      this.source = source; this.syncControls(); this.showIdle();
      this.status(source === 'loop' ? 'Choose an audio loop from your device.' : 'Choose a groove, then press Start drums.');
    } else if (target.hasAttribute('data-groove-play')) {
      if (this.mode === 'idle') void this.start(); else this.stop();
    } else if (target.hasAttribute('data-groove-fill')) {
      if (this.sequencer?.queueFill()) this.status('Fill on the next bar.');
    } else if (target.dataset.grooveSection) {
      const section: GrooveSection = target.dataset.grooveSection === 'chorus' ? 'chorus' : 'verse';
      this.section = section;
      if (this.sequencer) {
        this.sequencer.setSection(section);
        this.status(this.sequencer.pendingSection ? `${section === 'chorus' ? 'Chorus' : 'Verse'} after a transition fill.` : `Staying in the ${section}.`);
      } else this.showIdle();
      this.syncTransport();
    } else if (target.dataset.grooveNudge) {
      this.setTempo(this.bpm + Number(target.dataset.grooveNudge) * (event.shiftKey ? 5 : 1));
    } else if (target.hasAttribute('data-groove-tap')) {
      this.tap();
    }
  };

  private onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.matches('[data-groove-bpm-range]')) this.setTempo(Number(input.value));
    else if (input.matches('[data-groove-volume]')) {
      this.volume = Number(input.value);
      this.bus?.setLevels({ volume: this.volume, bass: .85, treble: .8 });
      this.find<HTMLOutputElement>('[data-groove-volume-out]').value = `${Math.round(this.volume * 100)}%`;
      this.save();
    } else if (input.matches('[data-groove-swing]')) {
      this.swing = Number(input.value) / 100;
      this.find<HTMLOutputElement>('[data-groove-swing-out]').value = `${input.value}%`;
      this.applySettings();
    } else if (input.dataset.grooveMix) {
      const group = input.dataset.grooveMix as MixGroup;
      if (!Object.hasOwn(this.mix, group)) return;
      this.mix[group] = Number(input.value);
      this.find<HTMLOutputElement>(`[data-groove-mix-out="${group}"]`).value = `${Math.round(this.mix[group] * 100)}%`;
    }
  };

  private onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement & HTMLSelectElement;
    if (input.matches('[data-groove-select]')) {
      const groove = getDrumGroove(input.value);
      if (!groove) return;
      const restart = this.mode !== 'idle';
      this.stop(); this.grooveId = groove.id; this.bpm = groove.tempo[1]; this.swing = groove.swing;
      if (this.ramp.target <= this.bpm) this.ramp.target = Math.min(MAX_BPM, this.bpm + 20);
      this.save(); this.syncControls(); this.showIdle();
      this.status(`${groove.name} at ${this.bpm} BPM. ${restart ? 'Restarting with a count-in.' : 'Press Start drums when ready.'}`);
      if (restart) void this.start();
    } else if (input.matches('[data-groove-kit]')) {
      if (!Object.hasOwn(GROOVE_KITS, input.value)) return;
      void this.changeKit(input.value as SampleKit);
    } else if (input.matches('[data-groove-bpm]')) {
      if (input.value !== '' && Number.isFinite(Number(input.value))) this.setTempo(Number(input.value)); else this.syncControls();
    } else if (input.matches('[data-groove-countin]')) {
      this.countIn = Number(input.value); this.save();
      this.status(this.mode === 'idle' ? 'Count-in updated.' : 'The new count-in applies the next time you start.');
    } else if (input.matches('[data-groove-fill-every]')) {
      this.fillEvery = Number(input.value); this.save(); this.applySettings();
    } else if (input.matches('[data-groove-gap]')) {
      if (Object.hasOwn(GAPS, input.value)) this.gap = input.value;
      this.applySettings();
    } else if (input.matches('[data-groove-ramp], [data-groove-ramp-step], [data-groove-ramp-every], [data-groove-ramp-target]')) {
      const step = Math.round(Number(this.find<HTMLInputElement>('[data-groove-ramp-step]').value));
      const target = Math.round(Number(this.find<HTMLInputElement>('[data-groove-ramp-target]').value));
      this.ramp = { enabled: this.find<HTMLInputElement>('[data-groove-ramp]').checked,
        step: Number.isFinite(step) ? Math.min(20, Math.max(1, step)) : 2,
        everyBars: Number(this.find<HTMLSelectElement>('[data-groove-ramp-every]').value),
        target: Number.isFinite(target) ? clampBpm(target) : Math.min(MAX_BPM, this.bpm + 20) };
      this.syncControls(); this.applySettings();
      if (this.ramp.enabled) this.status(this.ramp.target > this.bpm
        ? `Speed trainer: +${this.ramp.step} BPM every ${this.ramp.everyBars} ${this.ramp.everyBars === 1 ? 'bar' : 'bars'} up to ${this.ramp.target} BPM.`
        : 'Set a target tempo above the current tempo to use the speed trainer.');
    } else if (input.matches('[data-groove-progression], [data-groove-key], [data-groove-chord-bars]')) {
      const key = this.find<HTMLSelectElement>('[data-groove-key]').value as PracticeKey;
      this.chords = { id: this.find<HTMLSelectElement>('[data-groove-progression]').value,
        key: PRACTICE_KEYS.includes(key) ? key : 'G', barsPerChord: Number(this.find<HTMLSelectElement>('[data-groove-chord-bars]').value) };
      this.syncControls();
      if (this.mode === 'idle') this.showIdle();
    } else if (input.matches('[data-groove-humanize]')) {
      this.humanize = input.checked; this.save(); this.applySettings();
    } else if (input.matches('[data-groove-file]')) {
      const file = input.files?.[0];
      if (file) void this.chooseLoop(file);
    } else if (input.matches('[data-groove-loop-bars], [data-groove-loop-meter]')) {
      if (!this.loop) return;
      const wasPlaying = this.mode !== 'idle';
      this.stopIfActive('Loop stopped to change its length.');
      const meter = this.find<HTMLSelectElement>('[data-groove-loop-meter]').value as LoopMeter;
      this.loop = { ...this.loop, bars: Number(this.find<HTMLSelectElement>('[data-groove-loop-bars]').value),
        meter: Object.hasOwn(LOOP_METERS, meter) ? meter : '4/4' };
      this.syncControls(); this.showIdle();
      const bpm = this.loopBpm()!;
      this.status(bpm < MIN_BPM || bpm > MAX_BPM ? this.loopRangeMessage(bpm)
        : `${wasPlaying ? 'Loop stopped to change its length. ' : ''}Loop tempo is now ${bpm.toFixed(1)} BPM.`);
    }
  };

  private applySettings(): void {
    // Loops receive loop-safe values from settings(), so silent bars still apply live.
    if (!this.sequencer) return;
    const { swing, fillEvery, humanize, gap, ramp } = this.settings(this.sequencer.groove, this.sequencer.bpm);
    try { this.sequencer.update({ swing, fillEvery, humanize, gap, ramp }); }
    catch (error) { this.status(message(error)); }
  }

  private setTempo(value: number): void {
    if (this.loopMode || !Number.isFinite(value)) return;
    this.bpm = clampBpm(value);
    this.sequencer?.setBpm(this.bpm);
    if (this.ramp.enabled && this.ramp.target <= this.bpm) this.status('The tempo has reached the speed-trainer target.');
    this.save(); this.syncControls(); this.applySettings();
  }

  private tap(): void {
    const now = performance.now();
    if (this.taps.length && now - this.taps.at(-1)! > 2000) this.taps = [];
    this.taps = [...this.taps, now].slice(-5);
    if (this.taps.length < 2) { this.status('Keep tapping on the beat…'); return; }
    const intervals = this.taps.slice(1).map((time, i) => time - this.taps[i]);
    this.setTempo(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
    this.status(`Tapped tempo: ${this.bpm} BPM.`);
  }

  private ensureBus(context: AudioContext): PercussionBus {
    if (this.bus?.context === context) return this.bus;
    this.bus?.dispose();
    this.bus = new PercussionBus(context, { volume: this.volume, bass: .85, treble: .8 });
    context.addEventListener('statechange', () => {
      if (this.bus?.context === context && context.state !== 'running') this.stopIfActive('Audio was interrupted. Press Start drums to resume.');
    }, { signal: this.events.signal });
    return this.bus;
  }

  private async changeKit(kit: SampleKit): Promise<void> {
    const request = ++this.kitRequest;
    this.kit = kit; this.save();
    if (this.mode === 'starting') { this.stop('Loading the new kit…'); void this.start(); return; }
    if (this.mode !== 'playing' || !this.bus) { this.status(`${GROOVE_KITS[kit]} kit selected.`); return; }
    const generation = this.generation;
    this.status(`Loading the ${GROOVE_KITS[kit]} kit…`);
    try {
      await this.bus.prepareVoices(grooveVoices(this.sequencer?.groove ?? this.currentGroove()), kit);
      // Only the latest request may switch the kit that is playing.
      if (request !== this.kitRequest || generation !== this.generation || this.mode !== 'playing') return;
      this.playingKit = kit; this.bus.holdKit(kit);
      this.status(`${GROOVE_KITS[kit]} kit playing.`);
    } catch (error) {
      if (request !== this.kitRequest || generation !== this.generation) return;
      this.kit = this.playingKit; this.save();
      this.find<HTMLSelectElement>('[data-groove-kit]').value = this.kit;
      this.status(`That kit could not load, so ${GROOVE_KITS[this.kit]} keeps playing. ${message(error)}`);
    }
  }

  private async chooseLoop(file: File): Promise<void> {
    const generation = ++this.loopGeneration;
    this.stopIfActive('Loop stopped to load a new file.');
    if (file.size > MAX_LOOP_BYTES) { this.status('That file is larger than 30 MB. Choose a shorter loop.'); return; }
    this.status(`Reading ${file.name}…`);
    try {
      const context = await this.getAudio();
      const buffer = await context.decodeAudioData(await file.arrayBuffer()).catch(() => {
        throw new Error('This file could not be decoded. Try a WAV or MP3 loop.');
      });
      if (generation !== this.loopGeneration) return;
      if (buffer.duration < .25 || buffer.duration > MAX_LOOP_SECONDS) throw new Error(`Choose a loop between 0.25 and ${MAX_LOOP_SECONDS} seconds long.`);
      const meter = (this.loop?.meter ?? this.find<HTMLSelectElement>('[data-groove-loop-meter]').value) as LoopMeter;
      const safeMeter = Object.hasOwn(LOOP_METERS, meter) ? meter : '4/4';
      this.loop = { buffer, name: file.name, meter: safeMeter, bars: suggestLoopBars(buffer.duration, LOOP_METERS[safeMeter]) };
      this.syncControls(); this.showIdle();
      const bpm = this.loopBpm()!;
      this.status(bpm < MIN_BPM || bpm > MAX_BPM ? this.loopRangeMessage(bpm) : 'Loop ready. Check the bar count so the tempo is right, then press Start drums.');
    } catch (error) {
      if (generation === this.loopGeneration) this.status(message(error));
    }
  }

  private async start(): Promise<void> {
    if (this.mode !== 'idle' || !this.canRun) return;
    if (this.loopMode && !this.loop) { this.status('Choose an audio loop from your device first.'); return; }
    const loopBpm = this.loopMode ? this.loopBpm()! : null;
    if (loopBpm !== null && (loopBpm < MIN_BPM || loopBpm > MAX_BPM)) { this.status(this.loopRangeMessage(loopBpm)); return; }
    this.hooks.onStart?.();
    const generation = ++this.generation;
    const stale = (): boolean => {
      if (generation !== this.generation) return true;
      if (!this.canRun) { this.stop('Drums stopped.'); return true; }
      return false;
    };
    this.mode = 'starting'; this.syncTransport();
    this.status(this.loopMode ? 'Preparing your loop…' : 'Loading the drum kit…');
    try {
      const context = await this.getAudio();
      if (stale()) return;
      if (context.state !== 'running') throw new Error('Audio is not running. Press Start drums again or check browser audio settings.');
      const bus = this.ensureBus(context), groove = this.currentGroove(), kit = this.kit;
      bus.setLevels({ volume: this.volume, bass: .85, treble: .8 });
      await bus.prepareVoices(grooveVoices(groove), kit);
      if (stale()) return;
      this.playingKit = kit; bus.holdKit(kit);
      const bpm = loopBpm ?? this.bpm;
      this.sequencer = new GrooveSequencer(groove, this.settings(groove, bpm), context.currentTime + .12, this.section);
      if (groove.loop) {
        this.loopGain = context.createGain(); this.loopGain.gain.value = 0;
        bus.route(this.loopGain);
      }
      this.cues = []; this.shownKey = ''; this.shownBar = ''; this.mode = 'playing'; this.syncTransport();
      this.status(groove.loop ? `Loop playing${this.countIn ? ' after the count-in' : ''}.` : `${groove.name} playing${this.countIn ? ' after the count-in' : ''}. Press Fill for a drum fill.`);
      this.tick();
      this.timer = setInterval(this.tick, TICK_MS);
      this.frame = requestAnimationFrame(this.draw);
    } catch (error) {
      if (generation === this.generation) {
        console.error('Drum groove failed to start:', error);
        this.stop(`Drums could not start: ${message(error)}`);
      }
    }
  }

  private tick = (): void => {
    const sequencer = this.sequencer, bus = this.bus;
    if (this.mode !== 'playing' || !sequencer || !bus) return;
    try {
      const context = bus.context, now = context.currentTime;
      const { hits, cues } = sequencer.advance(now + LOOKAHEAD);
      for (const hit of hits) {
        const level = hit.group === 'count' ? .9 : this.mix[hit.group];
        if (level > 0) bus.playVoice(hit.voice, this.playingKit, hit.velocity, Math.max(hit.time, now + .002), undefined, level);
      }
      if (sequencer.groove.loop && this.loop && this.loopGain) for (const cue of cues) {
        if (cue.step !== 0 || cue.bar < 0) continue;
        if (cue.bar === 0) this.startLoopSource(context as AudioContext, cue.time);
        const silent = cue.kind === 'gap';
        this.loopGain.gain.setTargetAtTime(silent ? 0 : 1, cue.time, silent ? .006 : .002);
      }
      this.cues.push(...cues);
      if (this.cues.length > 768) this.cues.splice(0, this.cues.length - 768);
    } catch (error) {
      console.error('Drum groove scheduling failed:', error);
      this.stop(`Drums stopped: ${message(error)}`);
    }
  };

  private startLoopSource(context: AudioContext, at: number): void {
    if (!this.loop || !this.loopGain || this.loopSource) return;
    const source = context.createBufferSource();
    source.buffer = this.loop.buffer; source.loop = true;
    source.connect(this.loopGain);
    source.start(Math.max(at, context.currentTime + .002));
    this.loopSource = source;
  }

  private stopLoopSource(): void {
    const source = this.loopSource, gain = this.loopGain;
    this.loopSource = null; this.loopGain = null;
    if (!gain) return;
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value, now); gain.gain.linearRampToValueAtTime(0, now + .015);
    if (source) {
      source.addEventListener('ended', () => { source.disconnect(); gain.disconnect(); }, { once: true });
      source.stop(now + .02);
    } else gain.disconnect();
  }

  private draw = (): void => {
    this.frame = 0;
    const bus = this.bus;
    if (this.mode !== 'playing' || !bus) return;
    const context = bus.context as AudioContext;
    const heard = context.currentTime - (context.outputLatency || context.baseLatency || 0);
    let cue: GrooveCue | undefined;
    while (this.cues.length && this.cues[0].time <= heard) cue = this.cues.shift();
    if (cue) this.showCue(cue);
    this.frame = requestAnimationFrame(this.draw);
  };

  private chordAt(bar: number, beat: number, beatsPerBar: number): { now: string; next: string; changeSoon: boolean } | null {
    if (this.chords.id === 'off') return null;
    const chords = realizeProgression(this.chords.id, this.chords.key), per = this.chords.barsPerChord;
    const index = bar < 0 ? 0 : Math.floor(bar / per) % chords.length, next = chords[(index + 1) % chords.length];
    // Light the next chord on the last beat before a change.
    return { now: chords[index], next, changeSoon: bar >= 0 && next !== chords[index] && bar % per === per - 1 && beat === beatsPerBar - 1 };
  }

  private renderGrid(lanes: GrooveLanes, crash: boolean, groove: DrumGroove, label: string): void {
    const grid = this.find('[data-groove-grid]');
    const used = groove.loop ? [] : LANE_ORDER.filter(lane => lanes[lane]?.some(Boolean) || (lane === 'crash' && crash));
    grid.style.setProperty('--groove-steps', String(groove.stepsPerBar));
    this.columns = Array.from({ length: groove.stepsPerBar }, () => []);
    const row = (name: string, level: (step: number) => number): HTMLElement => {
      const element = document.createElement('div');
      element.className = 'groove-row';
      const title = document.createElement('span');
      title.className = 'groove-lane'; title.textContent = name;
      element.append(title);
      for (let step = 0; step < groove.stepsPerBar; step++) {
        const cell = document.createElement('span');
        cell.className = 'groove-cell'; cell.dataset.level = String(levelClass(level(step)));
        if (step % groove.stepsPerBeat === 0) cell.dataset.beat = step === 0 ? 'bar' : 'beat';
        element.append(cell); this.columns[step].push(cell);
      }
      return element;
    };
    grid.replaceChildren(...(groove.loop
      ? [row('Your loop', step => step % groove.stepsPerBeat === 0 ? .8 : 0)]
      : used.map(lane => row(GROOVE_LANES[lane].label, step => lane === 'crash' && crash && step === 0 ? 1 : lanes[lane]?.[step] ?? 0))));
    grid.setAttribute('aria-label', groove.loop ? `${label}: beat grid for your loop.` : `${label}: ${used.map(lane => GROOVE_LANES[lane].label).join(', ')}.`);
    this.shownStep = -1;
  }

  private renderBeats(groove: DrumGroove): void {
    const beats = this.find('[data-groove-beats]');
    if (beats.childElementCount === groove.beatsPerBar) return;
    beats.replaceChildren(...Array.from({ length: groove.beatsPerBar }, (_, i) => {
      const item = document.createElement('li');
      item.textContent = String(i + 1);
      return item;
    }));
  }

  private showChord(bar: number, beat = 0, beatsPerBar = 4): void {
    const chord = this.chordAt(bar, beat, beatsPerBar), panel = this.find('[data-groove-chords]');
    panel.hidden = !chord;
    if (!chord) return;
    this.find('[data-groove-chord-now]').textContent = chord.now;
    this.find('[data-groove-chord-next]').textContent = chord.next;
    panel.dataset.soon = String(chord.changeSoon);
  }

  private showIdle(): void {
    const groove = this.currentGroove(), stage = this.find('[data-groove-stage]');
    stage.dataset.kind = 'idle';
    const lanes = groove.loop ? {} : (this.section === 'chorus' ? groove.chorus : groove.main);
    const firstBar = Object.fromEntries(Object.entries(lanes).map(([lane, steps]) => [lane, steps!.slice(0, groove.stepsPerBar)])) as GrooveLanes;
    this.renderGrid(firstBar, false, groove, `${groove.name}, ${this.section}`);
    this.renderBeats(groove);
    this.all('[data-groove-beats] li').forEach(item => item.removeAttribute('data-now'));
    this.find('[data-groove-bar]').textContent = this.loopMode && !this.loop ? 'No loop yet' : 'Ready';
    this.find('[data-groove-phase]').textContent = this.loopMode
      ? this.loop ? `${this.loop.bars}-bar loop · ${this.loop.meter}` : 'Choose an audio file above.'
      : `${this.section === 'chorus' ? 'Chorus' : 'Verse'} pattern · ${groove.meter}`;
    this.showChord(-1);
    this.shownKey = ''; this.shownBar = '';
  }

  private showCue(cue: GrooveCue): void {
    const groove = this.sequencer?.groove;
    if (!groove) return;
    const gridKey = `${cue.kind}:${cue.section}:${cue.patternBar}:${cue.crash}`;
    if (gridKey !== this.shownKey) {
      this.renderGrid(cue.lanes, cue.crash, groove, cue.kind === 'fill' ? 'Fill' : cue.kind === 'count-in' ? 'Count-in' : `${cue.section} groove`);
      this.renderBeats(groove);
      this.find('[data-groove-stage]').dataset.kind = cue.kind;
      this.shownKey = gridKey;
    }
    const barKey = `${cue.bar}:${cue.pending}:${cue.bpm}`;
    if (barKey !== this.shownBar) {
      this.shownBar = barKey;
      this.find('[data-groove-bar]').textContent = cue.bar < 0 ? 'Count-in' : `Bar ${cue.bar + 1}`;
      const pending = cue.pending ? ` · ${cue.pending} next` : '', tempo = this.ramp.enabled && !groove.loop ? ` · ${cue.bpm} BPM` : '';
      this.find('[data-groove-phase]').textContent = cue.kind === 'count-in' ? `Get ready · ${Math.round(cue.bpm * 10) / 10} BPM`
        : cue.kind === 'gap' ? 'Silent bar · keep the beat going'
          : cue.kind === 'fill' ? `Fill${pending}`
            : groove.loop ? `Loop bar ${cue.patternBar + 1} of ${groove.bars}`
              : `${cue.section === 'chorus' ? 'Chorus' : 'Verse'}${pending}${tempo}`;
      if (!groove.loop && cue.bpm !== this.bpm) { this.bpm = cue.bpm; this.syncControls(); }
      this.syncTransport();
    }
    if (cue.step !== this.shownStep) {
      this.columns[this.shownStep]?.forEach(cell => cell.removeAttribute('data-now'));
      this.columns[cue.step]?.forEach(cell => cell.setAttribute('data-now', ''));
      this.shownStep = cue.step;
      if (cue.step % groove.stepsPerBeat === 0) {
        this.all('[data-groove-beats] li').forEach((item, i) => {
          if (i === cue.beat) item.setAttribute('data-now', cue.beat === 0 ? 'bar' : 'beat'); else item.removeAttribute('data-now');
        });
        this.showChord(cue.bar, cue.beat, groove.beatsPerBar);
      }
    }
  }

  stop(text = 'Drums stopped.'): void {
    this.generation++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.bus?.stop();
    this.stopLoopSource();
    this.sequencer = null; this.cues = [];
    this.mode = 'idle';
    this.syncTransport(); this.showIdle(); this.status(text);
  }
  stopIfActive(text: string): void { if (this.mode !== 'idle') this.stop(text); }
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.stopIfActive('Drums stopped when you left Percussion.');
  }
  dispose(): void {
    this.stop(); this.active = false; this.events.abort();
    this.bus?.dispose(); this.bus = null; this.root.remove();
  }
}
