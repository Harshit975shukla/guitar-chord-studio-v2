import './guitarLab.css';
import {
  GUITAR_LAB_CAVEAT, GUITAR_LAB_VIEWS, GUITAR_MODELS, GUITAR_PART_GROUPS, createGuitarLabState, easeInOutCubic,
  guitarAssemblyOffset, guitarFretY, guitarOutlinePath, guitarPart, selectGuitarPart, setGuitarExplode,
  type GuitarKind, type GuitarLabState, type GuitarLabView, type GuitarPartId,
} from '../theory/guitarAnatomy';
import type { AcousticBus } from '../audio/engine';
import type { GuitarLab3D } from './guitarLab3d';

const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const explodeText = (percent: number): string => percent <= 0 ? 'Assembled' : percent >= 100 ? 'Fully apart' : `${percent}% apart`;

/**
 * Append once to an empty host in Live Studio. Call setActive with the owning tab's
 * visibility and dispose before removing the host. Audio permission remains with
 * the caller; getAudio may reject while listening. No app tuning or bank is changed.
 */
export class GuitarLab {
  private root: HTMLDetailsElement;
  private state = createGuitarLabState();
  private savedStates = new Map<GuitarKind, GuitarLabState>();
  private active = true;
  private inView = false;
  private disposed = false;
  private mode: '2d' | '3d';
  private scene: GuitarLab3D | null = null;
  private sceneGeneration = 0;
  private sceneLoading = false;
  private audioGeneration = 0;
  private bus: AcousticBus | null = null;
  private audioTimer: ReturnType<typeof setTimeout> | null = null;
  private audioLoading = false;
  private observer: IntersectionObserver;
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private events = new AbortController();

  constructor(host: HTMLElement, private getAudio?: () => Promise<AudioContext>) {
    this.mode = this.motion.matches ? '2d' : '3d';
    this.root = document.createElement('details');
    this.root.className = 'guitar-lab';
    this.root.dataset.guitarLab = '';
    this.root.innerHTML = `
      <!-- THESIS: A luthier's bench beside the practice screen: take the guitar apart and read why each part exists.
      OWN-WORLD: Incumbent charcoal, warm gold, quiet borders; the instrument is the only lit surface.
      STORY: Choose an instrument, drag it apart, isolate a part, read what it does, put it back together.
      FIRST VIEWPORT: One closed optional entry; expansion reveals the guitar beside the component notes.
      FORM: Local workbench extension with an always-available accessible component list. -->
      <summary class="gl-summary">
        <span class="gl-summary-copy"><strong>Guitar Lab</strong><span>Take a guitar apart and learn what every part does.</span></span>
        <span class="gl-disclosure"><span data-lab-disclosure>Explore parts</span><span aria-hidden="true" class="gl-chevron">⌄</span></span>
      </summary>
      <div class="gl-content">
        <div class="gl-toolbar">
          <label class="gl-model-label">Instrument
            <select data-lab-model aria-label="Guitar Lab instrument">
              ${Object.values(GUITAR_MODELS).map(model => `<option value="${model.id}">${model.name}</option>`).join('')}
            </select>
          </label>
          <div class="gl-view" role="group" aria-label="Guitar Lab view">
            <button type="button" data-lab-view="3d">3D model</button>
            <button type="button" data-lab-view="2d">2D diagram</button>
          </div>
        </div>
        <p class="gl-model-description" data-lab-description></p>
        <div class="gl-workbench">
          <div class="gl-visual">
            <div class="gl-stage">
              <div class="gl-diagram" data-lab-diagram></div>
              <div class="gl-render" data-lab-render hidden></div>
              <span class="gl-stage-label" data-lab-stage-label>Assembled</span>
              <p class="gl-loading" data-lab-loading hidden role="status">Preparing the full guitar…</p>
            </div>
            <div class="gl-dock" role="group" aria-label="Assemble and disassemble">
              <button type="button" data-lab-explode-to="0">Assemble</button>
              <label class="gl-scrub"><span>Disassembly</span>
                <input type="range" min="0" max="100" step="1" value="0" data-lab-explode aria-valuetext="Assembled">
                <output data-lab-explode-out>0%</output>
              </label>
              <button type="button" data-lab-explode-to="100">Disassemble</button>
            </div>
            <div class="gl-camera" role="group" aria-label="Guitar Lab camera" hidden>
              <label class="gl-camera-view">View<select data-lab-camera-view aria-label="Camera view">
                ${Object.entries(GUITAR_LAB_VIEWS).map(([view, label]) => `<option value="${view}">${label}</option>`).join('')}
              </select></label>
              <button type="button" data-lab-camera="left" aria-label="Rotate guitar left">↶</button>
              <button type="button" data-lab-camera="right" aria-label="Rotate guitar right">↷</button>
              <button type="button" data-lab-camera="in" aria-label="Zoom guitar in">+</button>
              <button type="button" data-lab-camera="out" aria-label="Zoom guitar out">−</button>
              <button type="button" data-lab-turntable aria-pressed="false">Turntable</button>
              <button type="button" data-lab-camera="reset">Reset view</button>
            </div>
            <p class="gl-view-help" data-lab-view-help></p>
          </div>
          <aside class="gl-side">
            <section class="gl-detail" aria-label="Selected guitar part">
              <p class="gl-detail-empty" data-lab-detail-empty>Choose a component to isolate it and read what it does.</p>
              <div data-lab-detail-body hidden>
                <div class="gl-detail-head"><h3 data-lab-part-name></h3><button type="button" data-lab-clear>Show all parts</button></div>
                <p class="gl-spec" data-lab-part-spec></p>
                <p class="gl-info" data-lab-part-info></p>
              </div>
            </section>
            <nav class="gl-parts" aria-label="Guitar parts">
              <div class="gl-parts-head"><h3>Components</h3><span data-lab-part-count></span></div>
              <div class="gl-part-list" data-lab-parts></div>
            </nav>
          </aside>
        </div>
        <section class="gl-specs-block" aria-label="Representative specification">
          <h3>Specification <span>representative instrument</span></h3>
          <dl class="gl-specs" data-lab-specs></dl>
        </section>
        <p class="gl-status" data-lab-status role="status" aria-live="polite">Choose a component, or drag Disassembly to take the guitar apart.</p>
        ${getAudio ? `<div class="gl-audio">
          <div class="gl-actions"><button type="button" data-lab-audio="hear">Hear instrument</button><button type="button" data-lab-audio="stop" disabled>Stop preview</button></div>
          <p data-lab-audio-status role="status">Optional recorded preview: six standard-tuning open strings. Studio tuning and sound stay unchanged.</p>
        </div>` : ''}
        <p class="gl-caveat">${GUITAR_LAB_CAVEAT}</p>
        <p class="gl-construction" data-lab-construction></p>
      </div>`;
    host.append(this.root);
    const signal = this.events.signal;
    this.root.addEventListener('toggle', () => {
      this.find('[data-lab-disclosure]').textContent = this.root.open ? 'Close lab' : 'Explore parts';
      if (!this.root.open) { this.releaseScene(); this.stopAudio(); }
      this.syncView();
    }, { signal });
    this.root.addEventListener('click', this.onClick, { signal });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.state.selected) { event.preventDefault(); this.select(null); }
    }, { signal });
    this.find<HTMLInputElement>('[data-lab-explode]').addEventListener('input', event => {
      this.setExplode(Number((event.target as HTMLInputElement).value) / 100, false);
    }, { signal });
    this.find<HTMLSelectElement>('[data-lab-model]').addEventListener('change', event => {
      const kind = (event.target as HTMLSelectElement).value as GuitarKind;
      if (!Object.hasOwn(GUITAR_MODELS, kind) || kind === this.state.kind) return;
      this.savedStates.set(this.state.kind, this.state);
      this.state = this.savedStates.get(kind) ?? createGuitarLabState(kind);
      this.stopAudio();
      this.scene?.update(this.state, false);
      this.renderModel();
      this.announce(`${GUITAR_MODELS[kind].name}: ${GUITAR_MODELS[kind].parts.length} components.`);
      this.syncView();
    }, { signal });
    this.find<HTMLSelectElement>('[data-lab-camera-view]').addEventListener('change', event => {
      const view = (event.target as HTMLSelectElement).value as GuitarLabView;
      if (!Object.hasOwn(GUITAR_LAB_VIEWS, view) || !this.scene) return;
      this.scene.view(view);
      this.renderCamera();
      this.announce(`${GUITAR_LAB_VIEWS[view]} view.`);
    }, { signal });
    const parts = this.find('[data-lab-parts]');
    const preview = (event: Event) => this.scene?.hover(((event.target as Element).closest<HTMLElement>('[data-lab-part]')?.dataset.labPart as GuitarPartId | undefined) ?? null);
    parts.addEventListener('pointerover', preview, { signal });
    parts.addEventListener('focusin', preview, { signal });
    parts.addEventListener('pointerleave', () => this.scene?.hover(null), { signal });
    parts.addEventListener('focusout', () => this.scene?.hover(null), { signal });
    this.motion.addEventListener('change', this.onMotionChange, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.releaseScene(); this.stopAudio(); }
      this.syncView();
    }, { signal });
    this.observer = new IntersectionObserver(entries => {
      this.inView = entries.some(entry => entry.isIntersecting);
      if (!this.inView) this.stopAudio();
      this.syncView();
    }, { threshold: 0 });
    this.observer.observe(this.find('.gl-stage'));
    this.renderModel();
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  private get canRun(): boolean {
    return !this.disposed && this.active && this.root.open && !document.hidden;
  }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    if (!active) { this.releaseScene(); this.stopAudio(); }
    this.syncView();
  }

  private onMotionChange = (): void => {
    this.scene?.setReducedMotion(this.motion.matches);
    if (this.motion.matches) { this.mode = '2d'; this.releaseScene(); }
    this.syncView();
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    const part = target.closest<HTMLElement>('[data-lab-part], [data-lab-pick]');
    if (part) {
      const id = (part.dataset.labPart ?? part.dataset.labPick) as GuitarPartId;
      this.select(this.state.selected === id ? null : id);
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button)) return;
    const data = button.dataset;
    if (data.labView) {
      this.mode = data.labView === '2d' ? '2d' : '3d';
      this.releaseScene();
      this.syncView();
    } else if (data.labCamera && this.scene) {
      if (data.labCamera === 'left' || data.labCamera === 'right') this.scene.orbit(data.labCamera === 'left' ? -1 : 1);
      if (data.labCamera === 'in' || data.labCamera === 'out') this.scene.zoom(data.labCamera === 'in' ? .83 : 1 / .83);
      if (data.labCamera === 'reset') this.scene.resetView();
      this.renderCamera();
    } else if (button.hasAttribute('data-lab-turntable') && this.scene) {
      this.scene.setTurntable(!this.scene.turntable);
      this.renderCamera();
    } else if (data.labExplodeTo) {
      this.setExplode(Number(data.labExplodeTo) / 100, true);
    } else if (button.hasAttribute('data-lab-clear')) {
      this.select(null);
    } else if (data.labAudio === 'hear') void this.hear();
    else if (data.labAudio === 'stop') this.stopAudio();
  };

  private select(id: GuitarPartId | null): void {
    this.state = selectGuitarPart(this.state, id);
    this.scene?.update(this.state);
    this.renderSelection();
    const part = guitarPart(this.state.kind, this.state.selected);
    this.announce(part ? `${part.name} isolated. ${part.spec}.` : 'All components shown.');
  }

  /** value is 0 (assembled) to 1 (fully apart). */
  private setExplode(value: number, announce: boolean): void {
    this.state = setGuitarExplode(this.state, value);
    this.scene?.update(this.state);
    this.renderExplode();
    this.renderDiagram();
    this.renderCamera();
    if (announce) this.announce(this.state.explode === 0 ? 'Assembled.'
      : 'Taken apart in reverse build order: each group moves out along the direction it is fitted.');
  }

  private announce(message: string): void { this.find('[data-lab-status]').textContent = message; }

  private renderModel(): void {
    const model = GUITAR_MODELS[this.state.kind];
    this.find<HTMLSelectElement>('[data-lab-model]').value = model.id;
    this.find('[data-lab-description]').textContent = model.description;
    this.find('[data-lab-construction]').textContent = model.construction;
    this.find('[data-lab-part-count]').textContent = `${model.parts.length} parts`;
    this.find('[data-lab-parts]').innerHTML = GUITAR_PART_GROUPS.map(group => {
      const parts = model.parts.filter(part => part.group === group);
      return parts.length ? `<div class="gl-part-group"><h4>${group}</h4>${parts.map(part =>
        `<button type="button" data-lab-part="${part.id}" aria-pressed="false"><span data-part-dot aria-hidden="true"></span>${escape(part.name)}</button>`).join('')}</div>` : '';
    }).join('');
    this.find('[data-lab-specs]').innerHTML = model.specs.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
    this.renderExplode();
    this.renderSelection();
  }

  private renderExplode(): void {
    const percent = Math.round(this.state.explode * 100), input = this.find<HTMLInputElement>('[data-lab-explode]');
    input.value = String(percent);
    input.setAttribute('aria-valuetext', explodeText(percent));
    input.style.setProperty('--pct', `${percent}%`);
    this.find('[data-lab-explode-out]').textContent = `${percent}%`;
    this.find<HTMLButtonElement>('[data-lab-explode-to="0"]').disabled = percent === 0;
    this.find<HTMLButtonElement>('[data-lab-explode-to="100"]').disabled = percent === 100;
    this.renderStageLabel();
  }

  private renderStageLabel(): void {
    const part = guitarPart(this.state.kind, this.state.selected);
    this.find('[data-lab-stage-label]').textContent = explodeText(Math.round(this.state.explode * 100)) + (part ? ` · ${part.name} isolated` : '');
  }

  private renderSelection(): void {
    const part = guitarPart(this.state.kind, this.state.selected);
    this.find('[data-lab-detail-empty]').hidden = !!part;
    this.find('[data-lab-detail-body]').hidden = !part;
    if (part) {
      this.find('[data-lab-part-name]').textContent = part.name;
      this.find('[data-lab-part-spec]').textContent = part.spec;
      this.find('[data-lab-part-info]').textContent = part.info;
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-lab-part]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.labPart === part?.id)));
    this.renderStageLabel();
    this.renderDiagram();
  }

  private renderCamera(): void {
    const scene = this.scene;
    if (!scene) return;
    this.find<HTMLSelectElement>('[data-lab-camera-view]').value = scene.cameraView;
    const turntable = this.find<HTMLButtonElement>('[data-lab-turntable]');
    turntable.disabled = this.motion.matches;
    turntable.setAttribute('aria-pressed', String(scene.turntable));
    turntable.textContent = this.motion.matches ? 'Turntable (reduced motion)' : 'Turntable';
  }

  private syncView(): void {
    if (this.disposed) return;
    this.root.querySelectorAll<HTMLButtonElement>('[data-lab-view]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.labView === this.mode)));
    const showScene = this.mode === '3d' && !!this.scene && this.canRun;
    this.find('[data-lab-render]').hidden = !showScene;
    this.find('[data-lab-diagram]').hidden = showScene;
    this.find('.gl-camera').hidden = !showScene;
    this.find('[data-lab-loading]').hidden = !this.sceneLoading || !this.canRun;
    this.find('[data-lab-view-help]').textContent = this.mode === '2d'
      ? 'Tap a part or use the component list. Disassembly works in both views.'
      : 'Drag to orbit; scroll or pinch to zoom; click a part to isolate it. The component list and camera buttons also work with a keyboard.';
    this.scene?.setActive(this.canRun && this.inView && this.mode === '3d');
    if (showScene) this.renderCamera();
    if (this.canRun && this.inView && this.mode === '3d' && !this.scene && !this.sceneLoading) void this.loadScene();
  }

  private async loadScene(): Promise<void> {
    const generation = ++this.sceneGeneration;
    this.sceneLoading = true;
    this.find('[data-lab-loading]').hidden = false;
    try {
      const { GuitarLab3D } = await import('./guitarLab3d');
      if (this.disposed || generation !== this.sceneGeneration || !this.canRun || !this.inView || this.mode !== '3d') return;
      const host = this.find('[data-lab-render]');
      host.hidden = false;
      this.scene = new GuitarLab3D(host, this.state, {
        reducedMotion: this.motion.matches,
        onPick: part => {
          if (part === null) { if (this.state.selected) this.select(null); }
          else this.select(this.state.selected === part ? null : part);
        },
        onHover: part => this.root.querySelectorAll<HTMLElement>('[data-lab-part]').forEach(row => {
          if (row.dataset.labPart === part) row.dataset.hover = ''; else row.removeAttribute('data-hover');
        }),
        onUnavailable: () => this.fallback(),
      });
    } catch {
      if (generation === this.sceneGeneration && !this.disposed) this.fallback();
    } finally {
      if (generation === this.sceneGeneration && !this.disposed) { this.sceneLoading = false; this.syncView(); }
    }
  }

  private fallback(): void {
    this.releaseScene();
    this.mode = '2d';
    this.syncView();
    this.announce('3D is unavailable on this device. The 2D diagram, disassembly, component notes and specification still work. You can retry with 3D model.');
  }

  private releaseScene(): void {
    this.sceneGeneration++;
    this.sceneLoading = false;
    this.scene?.dispose(); this.scene = null;
    this.find('[data-lab-render]').replaceChildren();
  }

  /** Front-view schematic that follows the same disassembly and isolation as the 3D model. */
  private renderDiagram(): void {
    const state = this.state, model = GUITAR_MODELS[state.kind], acoustic = state.kind !== 'electric', classical = state.kind === 'classical';
    const group = (part: GuitarPartId, shape: string): string => {
      const item = guitarPart(state.kind, part);
      if (!item) return '';
      const [x, y] = guitarAssemblyOffset(state.kind, item.assembly, state.explode);
      const selected = state.selected === part, faded = state.selected !== null && !selected;
      return `<g data-lab-pick="${part}" data-selected="${selected}" data-faded="${faded}" transform="translate(${x.toFixed(3)} ${y.toFixed(3)})"><title>${escape(item.name)}</title>${shape}</g>`;
    };
    const rect = (x: number, y: number, w: number, h: number, fill: string, r = .02) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
    const circle = (x: number, y: number, r: number, fill: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    const path = guitarOutlinePath(state.kind), nut = model.nutY, saddle = nut - model.scaleLength;
    const layers: string[] = [];
    if (acoustic) {
      layers.push(group('back', `<path d="${path}" fill="#5a3a27" stroke="#8c6d52" stroke-width=".04"/>`));
      layers.push(group('sides', `<path d="${path}" fill="#704d35" stroke="#b5ac88" stroke-width=".045"/>`));
      layers.push(group('bracing', classical
        ? [-2, -1, 0, 1, 2].map(i => `<line x1="${i * .13}" y1="-.9" x2="${i * .63}" y2="-3.4" stroke="#c29a62" stroke-width=".08" stroke-linecap="round"/>`).join('')
        : [-1, 1].map(s => `<line x1="${s * 1.24}" y1=".52" x2="${-s * 1.6}" y2="-3.3" stroke="#c29a62" stroke-width=".11" stroke-linecap="round"/>`).join('')));
      layers.push(group('soundboard', `<path d="${path} M .61 -.1 a .61 .61 0 1 0 -1.22 0 a .61 .61 0 1 0 1.22 0" fill="${model.topColor}" fill-rule="evenodd"/>`));
      layers.push(group('binding', `<path d="${path}" fill="none" stroke="#efe3bd" stroke-width=".06"/>`));
      layers.push(group('soundhole', `<circle cx="0" cy="-.1" r=".67" fill="none" stroke="#67432e" stroke-width=".085"/>`));
      if (!classical) {
        layers.push(group('pickguard', `<path d="M .59 .24 C 1.06 .26 1.5 -.44 1.37 -1.32 C 1.31 -1.66 .74 -1.62 .46 -1.47 C .87 -1 .96 -.27 .59 .24 Z" fill="#3a2418"/>`));
        layers.push(group('strapPins', circle(0, -4.22, .07, '#b8c1c0')));
      }
    } else {
      layers.push(group('neckPlate', rect(-.36, .3, .72, .92, '#b9c3c3', .05)));
      layers.push(group('body', `<path d="${path}" fill="${model.topColor}" stroke="#b5ac88" stroke-width=".045"/>`));
      layers.push(group('strapPins', circle(0, -4.2, .07, '#b8c1c0') + circle(-1.41, 2.3, .07, '#b8c1c0')));
      layers.push(group('pickguard', `<path d="M -.5 1.1 C -1.1 1.1 -1.3 -.1 -1.05 -.8 C -.9 -1.3 -.6 -1.65 .7 -1.7 L .92 -.1 L .52 1.1 Z" fill="#e8e2cc" stroke="#1d1c1a" stroke-width=".03"/>`));
    }
    layers.push(group('neck', `<path d="M -.43 1.2 L .43 1.2 L ${model.nutWidth / 2} ${nut} L ${-model.nutWidth / 2} ${nut} Z" fill="#b88759"/>`));
    let headShape = state.kind === 'electric'
      ? `<path d="M -.32 ${nut} Q -.68 ${nut + 2} -.17 ${nut + 1.9} Q .84 ${nut + 1.8} .35 ${nut + .9} L .32 ${nut} Z" fill="#c9a36f"/>`
      : `<path d="M -.32 ${nut} L -.5 ${nut + 1.7} Q 0 ${nut + 1.92} .5 ${nut + 1.7} L .32 ${nut} Z" fill="#6b4431"/>`;
    if (classical) headShape += [-.335, .135].map(x => rect(x, nut + .38, .2, 1.04, '#191e1c', .1)).join('');
    layers.push(group('headstock', headShape));
    const boardEnd = guitarFretY(state.kind, model.frets) - .12;
    layers.push(group('fretboard', `<path d="M -.45 ${boardEnd} L .45 ${boardEnd} L ${model.nutWidth / 2} ${nut} L ${-model.nutWidth / 2} ${nut} Z" fill="#35291f"/>`));
    layers.push(group('frets', Array.from({ length: model.frets }, (_, i) => {
      const y = guitarFretY(state.kind, i + 1), width = model.nutWidth + (.9 - model.nutWidth) * (nut - y) / (nut - boardEnd);
      return rect(-width / 2, y, width, .025, '#c8c3af');
    }).join('')));
    layers.push(group('tuners', Array.from({ length: 6 }, (_, i) => {
      const x = state.kind === 'electric' || i < 3 ? -.57 : .57, row = i < 3 ? i : 5 - i;
      const y = nut + .37 + (state.kind === 'electric' ? i * .24 : row * .5);
      return rect(x < 0 ? x : x - .27, y - .025, .27, .05, '#bbbcae') + circle(x, y, .08, classical ? '#eadaba' : '#c8cabe');
    }).join('')));
    layers.push(group('nut', rect(-model.nutWidth / 2 - .02, nut, model.nutWidth + .04, .07, '#eee2c5')));
    layers.push(group('bridge', rect(acoustic ? -.94 : -.68, saddle - .31, acoustic ? 1.88 : 1.36, .51, acoustic ? '#4b3224' : '#b7bdb5', .09)
      + (classical ? rect(-.56, saddle - .28, 1.12, .12, '#966540') : '')));
    layers.push(group('saddle', acoustic ? rect(-.56, saddle, 1.12, .055, '#f3e6c6')
      : Array.from({ length: 6 }, (_, i) => rect((i - 2.5) * .18 - .07, saddle - .14, .14, .29, '#e2e0ca')).join('')));
    if (state.kind === 'steel') layers.push(group('pins', Array.from({ length: 6 }, (_, i) => circle((i - 2.5) * .18, saddle - .2, .035, '#eee0c0')).join('')));
    if (!acoustic) {
      for (const [id, y] of [['neckPickup', -.48], ['bridgePickup', -1.12]] as const) {
        layers.push(group(id, rect(-.64, y - .13, 1.28, .26, '#ede6d0', .1) + Array.from({ length: 6 }, (_, i) => circle((i - 2.5) * .18, y, .04, '#8d9391')).join('')));
      }
      layers.push(group('controls', circle(1.13, -1.74, .16, '#e3d6b8') + circle(1.35, -2.37, .16, '#e3d6b8')));
      layers.push(group('selector', `<line x1=".94" y1="-.98" x2="1.07" y2="-.81" stroke="#e6e2d3" stroke-width=".06" stroke-linecap="round"/>` + circle(1.08, -.8, .05, '#e6e2d3')));
      layers.push(group('jack', circle(.75, -3.14, .16, '#c7cdca') + circle(.75, -3.14, .065, '#121212')));
    }
    layers.push(group('strings', Array.from({ length: 6 }, (_, i) => {
      const x = (i - 2.5) * .18, endX = (i - 2.5) * ((model.nutWidth - .1) / 5);
      return `<path d="M ${x} ${saddle - .22} L ${x} ${saddle} L ${endX} ${nut} L ${endX} ${nut + 1.3}" stroke="${classical ? '#fff0d2' : '#d9cdad'}" stroke-width="${.016 - i * .0015}" fill="none"/>`;
    }).join('')));
    // The frame widens smoothly as the parts separate.
    const e = easeInOutCubic(state.explode), box = [-3.3 - 2.1 * e, -8.3 - 1.9 * e, 6.6 + 4.4 * e, 13 + 2 * e].map(v => v.toFixed(3)).join(' ');
    this.find('[data-lab-diagram]').innerHTML = `<svg viewBox="${box}" role="img" aria-label="${escape(model.name)} part diagram. Use the component list to choose a part.">
      <g transform="scale(1 -1)">${layers.join('')}</g></svg>`;
  }

  private async hear(): Promise<void> {
    if (!this.getAudio || !this.canRun || this.audioLoading) return;
    this.stopAudio(false);
    const generation = this.audioGeneration, kind = this.state.kind;
    const current = () => generation === this.audioGeneration && this.canRun && this.state.kind === kind;
    this.audioLoading = true;
    this.audioStatus('Loading the recorded instrument…');
    this.updateAudioButtons();
    try {
      const [engine, samples] = await Promise.all([import('../audio/engine'), import('../audio/guitarSamples')]);
      if (!current()) return;
      const context = await this.getAudio();
      if (!current()) return;
      await samples.loadGuitarBank(context, kind);
      if (!current()) return;
      // Recheck the caller's listening guard after a potentially slow bank download.
      const permittedContext = await this.getAudio();
      if (!current()) return;
      if (context !== permittedContext) throw new Error('Audio changed while loading. Try Hear instrument again.');
      if (context.state === 'suspended') await context.resume();
      if (!current()) return;
      if (context.state !== 'running') throw new Error('Audio is not ready. Try Hear instrument again.');
      this.bus = engine.createAcousticBus(context, { bank: kind, masterVolume: .65, strumStyle: 'down', sampleRate: context.sampleRate });
      const start = context.currentTime + .04;
      [40, 45, 50, 55, 59, 64].forEach((midi, i) => engine.playAcousticString(context, this.bus!, {
        freq: 440 * 2 ** ((midi - 69) / 12), stringIndex: 5 - i, velocity: .7,
        startTime: start + i * .13, endTime: start + 2.2,
      }));
      this.audioStatus(`Playing ${GUITAR_MODELS[kind].name.toLowerCase()}: E, A, D, G, B, E. This recording is representative, not a simulation of the model.`);
      this.audioTimer = setTimeout(() => {
        if (current()) { this.stopAudio(false); this.audioStatus('Preview finished. Hear it again whenever you like.'); }
      }, 2350);
    } catch (error) {
      if (current()) {
        this.stopAudio(false);
        this.audioStatus(error instanceof Error ? `${error.message} Use Hear instrument to retry.` : 'The preview is unavailable. Use Hear instrument to retry.');
      }
    } finally {
      if (generation === this.audioGeneration) { this.audioLoading = false; this.updateAudioButtons(); }
    }
  }

  private audioStatus(message: string): void {
    const status = this.root.querySelector('[data-lab-audio-status]');
    if (status) status.textContent = message;
  }

  private updateAudioButtons(): void {
    const hear = this.root.querySelector<HTMLButtonElement>('[data-lab-audio="hear"]');
    const stop = this.root.querySelector<HTMLButtonElement>('[data-lab-audio="stop"]');
    if (hear) { hear.disabled = this.audioLoading; hear.textContent = this.audioLoading ? 'Loading instrument…' : 'Hear instrument'; }
    if (stop) stop.disabled = !this.audioLoading && !this.bus;
  }

  stopAudio(announce = true): void {
    this.audioGeneration++;
    const hadAudio = this.audioLoading || !!this.bus;
    this.audioLoading = false;
    if (this.audioTimer) { clearTimeout(this.audioTimer); this.audioTimer = null; }
    if (this.bus) {
      for (const [source, gain] of this.bus.sources) {
        try { source.stop(); } catch { /* Already-ended scheduled sources need no further stop. */ }
        source.disconnect(); gain.disconnect();
      }
      this.bus.sources.clear();
      this.bus.input.disconnect(); this.bus.limiter.disconnect(); this.bus.masterOut.disconnect();
      this.bus = null;
    }
    if (announce && hadAudio) this.audioStatus('Preview stopped. Studio sound and tuning are unchanged.');
    this.updateAudioButtons();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAudio(false);
    this.releaseScene();
    this.events.abort();
    this.observer.disconnect();
    this.savedStates.clear();
    this.root.remove();
  }
}
