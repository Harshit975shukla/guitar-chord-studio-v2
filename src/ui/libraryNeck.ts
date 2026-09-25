import { NOTE_NAMES, type ChordDefinition, type StringTuning, type StrumStyle } from '../types';
import { CHORD_QUALITY_DISPLAY } from '../chords/definitions';
import { PaneNeck3D } from './paneNeck3d';

/** Library selection stays independent of the microphone's suggested voicing. */
export class LibraryNeck {
  private neck: PaneNeck3D;
  private frets: (number | null)[] = [null, null, null, null, null, null];
  private chord: ChordDefinition | null = null;
  private label = 'Choose a chord below';
  private abort = new AbortController();

  constructor(
    private container: HTMLElement,
    private tuning: StringTuning[],
    private play: (frets: (number | null)[], style: StrumStyle) => Promise<void>,
    private pluck: (string: number, fret: number) => Promise<void>,
  ) {
    container.innerHTML = `
      <div class="card-header">
        <h3>Explore a chord</h3>
        <div class="neck-view-switch" role="group" aria-label="Library fretboard view">
          <button id="library-neck-view-3d" aria-pressed="false">3D</button>
          <button id="library-neck-view-2d" aria-pressed="true">2D</button>
        </div>
      </div>
      <div class="neck-stage">
        <div class="neck-stage-top"><span id="library-neck-caption" class="neck-caption"></span><span id="library-neck-tuning" class="neck-tuning"></span></div>
        <div id="library-neck-3d" class="neck-3d" hidden></div>
        <div id="library-neck-2d" class="fretboard-container pane-neck-flat"></div>
        <div id="library-neck-camera" class="neck-camera" role="group" aria-label="Library 3D camera" hidden>
          <button id="library-neck-zoom-in" aria-label="Zoom in">+</button>
          <button id="library-neck-zoom-out" aria-label="Zoom out">−</button>
          <button id="library-neck-reset" aria-label="Reset camera">⟲</button>
        </div>
        <p id="library-neck-help" class="neck-help">Drag to rotate · Click to play · + / − to zoom · R to reset</p>
      </div>
      <div class="neck-footer">
        <div class="neck-legend"><span><i class="root-dot"></i>Root</span><span><i></i>Chord tone</span></div>
        <p id="library-neck-summary" class="neck-summary" aria-live="polite"></p>
        <p class="neck-caveat">Fret numbers are relative to the capo. Shapes use the current tuning.</p>
        <div class="neck-play-controls">
          <label for="library-neck-voicing">Voicing (frets 0–12)</label><select id="library-neck-voicing" disabled></select>
          <button class="btn btn-secondary" data-strum="down">Strum down</button>
          <button class="btn btn-secondary" data-strum="up">Strum up</button>
          <button class="btn btn-secondary" data-strum="arpeggio">Arpeggio</button>
        </div>
      </div>`;
    const get = (id: string) => container.querySelector<HTMLElement>(`#library-neck-${id}`)!;
    this.neck = new PaneNeck3D(get('3d'), {
      toggle3d: get('view-3d'), toggle2d: get('view-2d'), twoD: get('2d'), camera: get('camera'),
      zoomIn: get('zoom-in'), zoomOut: get('zoom-out'), reset: get('reset'), help: get('help'),
    }, (s, f) => this.pick(s, f), {
      defaultMode: '3d', preferenceKey: 'gcs-library-neck-view',
      help2d: 'Scroll the neck · Tab to a fret, then Enter to play · × mutes a string',
    });
    const flat = get('2d');
    flat.innerHTML = `<div class="fret-numbers">${Array.from({ length: 13 }, (_, f) => `<div class="fret-num">${f === 0 ? 'Open' : f}</div>`).join('')}</div>`;
    for (let s = 0; s < 6; s++) {
      const row = document.createElement('div');
      row.className = 'guitar-string-row';
      row.innerHTML = `<div class="string-header"><button data-mute="${s}" aria-label="Mute string ${s + 1}">×</button><span data-string="${s}"></span></div>
        <div class="fret-cells-container"><div class="string-wire str-${s + 1}"></div>${Array.from({ length: 13 }, (_, f) => `<button class="fret-cell" data-string="${s}" data-fret="${f}" aria-pressed="false"></button>`).join('')}</div>`;
      flat.append(row);
    }
    const events = { signal: this.abort.signal };
    flat.addEventListener('click', e => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (target?.dataset.mute !== undefined) {
        this.frets[Number(target.dataset.mute)] = null;
        this.markCustom();
        this.render();
      } else if (target?.dataset.fret !== undefined) this.pick(Number(target.dataset.string), Number(target.dataset.fret));
    }, events);
    get('voicing').addEventListener('change', () => this.chooseVoicing(), events);
    container.querySelectorAll<HTMLButtonElement>('[data-strum]').forEach(button => {
      button.addEventListener('click', () => { void this.strum(button.dataset.strum as StrumStyle); }, events);
    });
    this.render();
  }

  select(chord: ChordDefinition): void {
    this.chord = chord;
    const select = this.container.querySelector<HTMLSelectElement>('#library-neck-voicing')!;
    select.replaceChildren();
    chord.voicings.forEach((voicing, i) => {
      if (voicing.frets.some(f => f !== null && f > 12)) return;
      select.add(new Option(voicing.name, String(i)));
    });
    select.disabled = select.options.length === 0;
    this.chooseVoicing();
  }

  private chooseVoicing(): void {
    const select = this.container.querySelector<HTMLSelectElement>('#library-neck-voicing')!;
    const voicing = select.disabled ? null : this.chord?.voicings[Number(select.value)];
    this.frets = voicing ? voicing.frets.map(f => f === null || f < 0 ? null : f) : [null, null, null, null, null, null];
    this.label = this.chord && voicing
      ? `${this.chord.symbol.root}${CHORD_QUALITY_DISPLAY[this.chord.symbol.quality]} · ${voicing.name} shape`
      : 'No voicing within frets 0–12 for this chord';
    this.render();
  }

  private pick(s: number, f: number): void {
    this.frets[s] = this.frets[s] === f ? null : f;
    this.markCustom();
    this.render();
    if (this.frets[s] !== null) void this.pluck(s, f).catch(error => this.audioError(error));
  }

  private markCustom(): void {
    this.label = 'Custom voicing';
    this.container.querySelector<HTMLSelectElement>('#library-neck-voicing')!.selectedIndex = -1;
  }

  private audioError(error: unknown): void {
    console.error('Library playback failed:', error);
    const help = this.container.querySelector<HTMLElement>('#library-neck-help')!;
    help.textContent = 'Audio could not start. Try playing again or check your browser audio settings.';
    help.setAttribute('role', 'status');
  }

  strum(style: StrumStyle = 'down'): Promise<void> {
    return this.play([...this.frets], style).catch(error => this.audioError(error));
  }

  setTuning(tuning: StringTuning[]): void {
    this.tuning = tuning;
    this.render();
  }

  setActive(active: boolean): void { this.neck.setActive(active); }

  private render(): void {
    this.container.querySelector('#library-neck-caption')!.textContent = this.label;
    this.container.querySelector('#library-neck-tuning')!.textContent = [...this.tuning].reverse().map(s => s.note).join(' · ');
    this.container.querySelector('#library-neck-summary')!.textContent = `Low → high: ${[...this.frets].reverse().map(f => f === null ? '×' : f === 0 ? 'open' : `fret ${f}`).join(' · ')}`;
    this.container.querySelectorAll<HTMLElement>('span[data-string]').forEach(span => { span.textContent = this.tuning[Number(span.dataset.string)].note; });
    this.container.querySelectorAll<HTMLButtonElement>('[data-fret]').forEach(cell => {
      const s = Number(cell.dataset.string), f = Number(cell.dataset.fret);
      const note = NOTE_NAMES[(this.tuning[s].midi + f) % 12];
      const selected = this.frets[s] === f;
      cell.setAttribute('aria-label', `String ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`}, ${note}`);
      cell.setAttribute('aria-pressed', String(selected));
      cell.innerHTML = selected ? `<span class="finger-dot${note === this.chord?.symbol.root ? ' root-note' : ''}">${note}</span>` : '';
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-strum]').forEach(button => { button.disabled = this.frets.every(f => f === null); });
    this.neck.update({ frets: this.frets, tuning: this.tuning, root: this.chord?.symbol.root ?? null, liveMidi: null });
  }

  dispose(): void { this.abort.abort(); this.neck.dispose(); }
}
