import './guitarLab.css';
import {
  GUITAR_LAB_CAVEAT, GUITAR_LAB_VIEWS, GUITAR_MODELS, createGuitarLabState, guitarAssemblyOffset, guitarAssemblyProgress,
  guitarFretY, guitarOutlinePath, transitionGuitarLab,
  type GuitarKind, type GuitarLabAction, type GuitarLabState, type GuitarLabView, type GuitarPartId,
} from '../theory/guitarAnatomy';
import type { AcousticBus } from '../audio/engine';
import type { GuitarLab3D } from './guitarLab3d';

const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
      <!-- THESIS: Learn a whole guitar by moving meaningful assemblies, not replacing the studio neck.
      OWN-WORLD: Incumbent charcoal, warm gold, quiet borders and native controls.
      STORY: Choose an instrument, identify a part, separate it virtually, put it back.
      FIRST VIEWPORT: One closed optional entry; expansion reveals the guitar beside a part explanation.
      FORM: Local workbench extension with an always-available accessible parts index. -->
      <summary class="gl-summary">
        <span class="gl-summary-copy"><strong>Guitar Lab</strong><span>Explore the instrument, piece by piece.</span></span>
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
              <span class="gl-stage-label" data-lab-stage-label>Assembled view</span>
              <p class="gl-loading" data-lab-loading hidden role="status">Preparing the full guitar…</p>
            </div>
            <div class="gl-camera" role="group" aria-label="Guitar Lab camera" hidden>
              <label class="gl-camera-view">View<select data-lab-camera-view aria-label="Camera view">
                ${Object.entries(GUITAR_LAB_VIEWS).map(([view, label]) => `<option value="${view}">${label}</option>`).join('')}
              </select></label>
              <button type="button" data-lab-camera="left" aria-label="Rotate guitar left">↶</button>
              <button type="button" data-lab-camera="right" aria-label="Rotate guitar right">↷</button>
              <button type="button" data-lab-camera="in" aria-label="Zoom guitar in">+</button>
              <button type="button" data-lab-camera="out" aria-label="Zoom guitar out">−</button>
              <button type="button" data-lab-camera="reset">Reset view</button>
            </div>
            <p class="gl-view-help" data-lab-view-help></p>
          </div>
          <section class="gl-detail" aria-label="Selected guitar part">
            <div class="gl-part-heading"><h3 data-lab-part-name></h3><span class="gl-state" data-lab-part-state></span></div>
            <p class="gl-function" data-lab-function></p>
            <p class="gl-part-detail" data-lab-detail></p>
            <div class="gl-assembly-detail">
              <span>Virtual assembly</span><strong data-lab-assembly></strong>
              <p data-lab-assembly-help></p>
              <button type="button" data-lab-action="part" class="gl-primary">Detach assembly</button>
            </div>
          </section>
          <nav class="gl-parts" aria-label="Guitar parts"><p>Select a part</p><div data-lab-parts></div></nav>
        </div>
        <div class="gl-assembly-bar">
          <div class="gl-progress">
            <label><span data-lab-progress-text></span><progress data-lab-progress aria-label="Attached guitar assemblies"></progress></label>
            <span>The body stays as the anchor.</span>
          </div>
          <div class="gl-actions">
            <button type="button" data-lab-action="explode" aria-pressed="false">Exploded view</button>
            <button type="button" data-lab-action="detach-all">Detach all</button>
            <button type="button" data-lab-action="reassemble">Reassemble all</button>
          </div>
          <label class="gl-animation"><input type="checkbox" data-lab-animate ${this.motion.matches ? 'disabled' : 'checked'}> Animate 3D assembly<span data-lab-motion-note>${this.motion.matches ? ' (reduced motion)' : ''}</span></label>
        </div>
        <p class="gl-status" data-lab-status role="status" aria-live="polite">Select a part on the guitar or use its named button.</p>
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
    this.find<HTMLSelectElement>('[data-lab-model]').addEventListener('change', event => {
      const kind = (event.target as HTMLSelectElement).value as GuitarKind;
      if (!Object.hasOwn(GUITAR_MODELS, kind)) return;
      this.savedStates.set(this.state.kind, this.state);
      this.state = this.savedStates.get(kind) ?? createGuitarLabState(kind);
      this.stopAudio();
      this.releaseScene();
      this.renderParts();
      this.render();
      this.announce(`${GUITAR_MODELS[kind].name}. ${guitarAssemblyProgress(this.state).attached} assemblies attached.`);
      this.syncView();
    }, { signal });
    this.find<HTMLSelectElement>('[data-lab-camera-view]').addEventListener('change', event => {
      const view = (event.target as HTMLSelectElement).value as GuitarLabView;
      if (!Object.hasOwn(GUITAR_LAB_VIEWS, view) || !this.scene) return;
      this.scene.view(view);
      this.announce(`${GUITAR_LAB_VIEWS[view]} view.`);
    }, { signal });
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
    this.renderParts();
    this.render();
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
    const animate = this.find<HTMLInputElement>('[data-lab-animate]');
    animate.disabled = this.motion.matches;
    if (this.motion.matches) {
      animate.checked = false;
      this.mode = '2d';
      this.releaseScene();
    }
    this.find('[data-lab-motion-note]').textContent = this.motion.matches ? ' (reduced motion)' : '';
    this.syncView();
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    const part = target.closest<HTMLElement>('[data-lab-part], [data-lab-pick]');
    if (part) {
      const id = (part.dataset.labPart ?? part.dataset.labPick) as GuitarPartId;
      this.dispatch({ type: 'select', part: id });
      return;
    }
    const view = target.closest<HTMLButtonElement>('[data-lab-view]');
    if (view) {
      this.mode = view.dataset.labView as '2d' | '3d';
      this.releaseScene();
      this.syncView();
      return;
    }
    const camera = target.closest<HTMLButtonElement>('[data-lab-camera]')?.dataset.labCamera;
    if (camera && this.scene) {
      if (camera === 'left' || camera === 'right') this.scene.orbit(camera === 'left' ? -1 : 1);
      if (camera === 'in' || camera === 'out') this.scene.zoom(camera === 'in' ? .83 : 1.2);
      if (camera === 'reset') {
        this.scene.resetView();
        this.find<HTMLSelectElement>('[data-lab-camera-view]').value = 'three-quarter';
      }
      return;
    }
    const action = target.closest<HTMLButtonElement>('[data-lab-action]')?.dataset.labAction;
    if (action === 'explode') this.dispatch({ type: 'explode', value: !this.state.exploded });
    if (action === 'detach-all' || action === 'reassemble') this.dispatch({ type: action });
    if (action === 'part') {
      const assembly = GUITAR_MODELS[this.state.kind].parts.find(p => p.id === this.state.selected)!.assembly;
      this.dispatch({ type: this.state.detached.includes(assembly) ? 'attach' : 'detach', assembly });
    }
    const audio = target.closest<HTMLButtonElement>('[data-lab-audio]')?.dataset.labAudio;
    if (audio === 'hear') void this.hear();
    if (audio === 'stop') this.stopAudio();
  };

  private dispatch(action: GuitarLabAction): void {
    const before = this.state;
    this.state = transitionGuitarLab(this.state, action);
    this.render();
    const model = GUITAR_MODELS[this.state.kind], part = model.parts.find(p => p.id === this.state.selected)!;
    if (action.type === 'select') this.announce(`${part.name}. ${this.state.detached.includes(part.assembly) ? 'Detached' : 'Attached'}. ${part.function}`);
    else if (action.type === 'explode') this.announce(this.state.exploded ? 'Exploded view spaces the groups apart; attachment progress has not changed.' : 'Exploded view off. Detached assemblies remain separate.');
    else {
      const delta = Math.abs(this.state.detached.length - before.detached.length), progress = guitarAssemblyProgress(this.state);
      this.announce(`${action.type === 'detach' || action.type === 'detach-all' ? 'Detached' : 'Attached'} ${delta} ${delta === 1 ? 'assembly' : 'assemblies'}. `
        + `${progress.attached} of ${progress.total} attached. ${action.type === 'detach' ? 'Dependent groups move together.' : action.type === 'attach' ? 'Required supporting groups are attached too.' : ''}`);
    }
  }

  private announce(message: string): void { this.find('[data-lab-status]').textContent = message; }

  private renderParts(): void {
    const model = GUITAR_MODELS[this.state.kind];
    this.find('[data-lab-parts]').innerHTML = model.parts.map(part =>
      `<button type="button" data-lab-part="${part.id}" aria-pressed="false">${escape(part.name)}<span data-part-dot aria-hidden="true"></span></button>`).join('');
    this.find('[data-lab-description]').textContent = model.description;
    this.find('[data-lab-construction]').textContent = model.construction;
  }

  private render(): void {
    const model = GUITAR_MODELS[this.state.kind], part = model.parts.find(p => p.id === this.state.selected)!;
    const assembly = model.assemblies.find(a => a.id === part.assembly)!, detached = this.state.detached.includes(part.assembly);
    const progress = guitarAssemblyProgress(this.state);
    this.find('[data-lab-part-name]').textContent = part.name;
    this.find('[data-lab-part-state]').textContent = part.assembly === 'body' ? 'Fixed anchor' : detached ? 'Detached' : 'Attached';
    this.find('[data-lab-part-state]').dataset.detached = String(detached);
    this.find('[data-lab-function]').textContent = part.function;
    this.find('[data-lab-detail]').textContent = part.detail;
    this.find('[data-lab-assembly]').textContent = assembly.name;
    this.find('[data-lab-assembly-help]').textContent = part.assembly === 'body'
      ? 'The other groups assemble around this fixed reference.'
      : detached ? 'Attach this group with any supports it needs. This is a virtual relationship, not a repair step.'
        : 'Detach this group and any groups it supports. Related parts move together.';
    const action = this.find<HTMLButtonElement>('[data-lab-action="part"]');
    action.disabled = part.assembly === 'body';
    action.textContent = part.assembly === 'body' ? 'Body is the anchor' : detached ? 'Attach assembly' : 'Detach assembly';
    this.find('[data-lab-progress-text]').textContent = `${progress.attached} / ${progress.total} assemblies attached`;
    const bar = this.find<HTMLProgressElement>('[data-lab-progress]');
    bar.max = progress.total; bar.value = progress.attached;
    this.find<HTMLButtonElement>('[data-lab-action="detach-all"]').disabled = progress.attached === 1;
    this.find<HTMLButtonElement>('[data-lab-action="reassemble"]').disabled = progress.attached === progress.total && !this.state.exploded;
    this.find('[data-lab-action="explode"]').setAttribute('aria-pressed', String(this.state.exploded));
    this.find('[data-lab-stage-label]').textContent = this.state.exploded ? 'Educational exploded view' : this.state.detached.length ? 'Virtual assembly' : 'Assembled view';
    this.root.querySelectorAll<HTMLButtonElement>('[data-lab-part]').forEach(button => {
      const part = model.parts.find(p => p.id === button.dataset.labPart)!;
      button.setAttribute('aria-pressed', String(part.id === this.state.selected));
      button.dataset.detached = String(this.state.detached.includes(part.assembly));
      button.title = `${part.name} · ${this.state.detached.includes(part.assembly) ? 'detached' : 'attached'}`;
    });
    this.renderDiagram();
    this.scene?.update(this.state, this.find<HTMLInputElement>('[data-lab-animate]').checked && !this.motion.matches);
    if (this.scene) this.find<HTMLSelectElement>('[data-lab-camera-view]').value = this.scene.cameraView;
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
      ? 'Tap a part or use the named buttons below. The same assembly controls work in both views.'
      : 'Drag to orbit; scroll or pinch to zoom. Part buttons and camera controls also work with a keyboard.';
    this.scene?.setActive(this.canRun && this.inView && this.mode === '3d');
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
        onPick: part => this.dispatch({ type: 'select', part }),
        onUnavailable: () => this.fallback(),
      });
      this.find<HTMLSelectElement>('[data-lab-camera-view]').value = this.scene.cameraView;
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
    this.announce('3D is unavailable on this device. The 2D diagram, part explanations and all assembly controls still work. You can retry with 3D model.');
  }

  private releaseScene(): void {
    this.sceneGeneration++;
    this.sceneLoading = false;
    this.scene?.dispose(); this.scene = null;
    this.find('[data-lab-render]').replaceChildren();
  }

  private renderDiagram(): void {
    const state = this.state, model = GUITAR_MODELS[state.kind], acoustic = state.kind !== 'electric', classical = state.kind === 'classical';
    const group = (part: GuitarPartId, shape: string): string => {
      const item = model.parts.find(p => p.id === part)!;
      const [x, y] = guitarAssemblyOffset(state, item.assembly);
      return `<g data-lab-pick="${part}" data-selected="${state.selected === part}" data-detached="${state.detached.includes(item.assembly)}" transform="translate(${x} ${y})"><title>${escape(item.name)}</title>${shape}</g>`;
    };
    const rect = (x: number, y: number, w: number, h: number, fill: string, r = .02) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
    const circle = (x: number, y: number, r: number, fill: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    const path = guitarOutlinePath(state.kind), nut = model.nutY, saddle = nut - model.scaleLength;
    const body = group('body', `<path d="${path}" fill="${acoustic ? '#704d35' : model.topColor}" stroke="#b5ac88" stroke-width=".045"/>`);
    const top = acoustic ? group('soundboard', `<path d="${path} M .61 -.1 a .61 .61 0 1 0 -1.22 0 a .61 .61 0 1 0 1.22 0" fill="${model.topColor}" fill-rule="evenodd" stroke="#ebd7aa" stroke-width=".035"/>`)
      + group('soundhole', `<circle cx="0" cy="-.1" r=".67" fill="none" stroke="#67432e" stroke-width=".085"/>`) : '';
    const neck = group('neck', `<path d="M -.43 1.2 L .43 1.2 L ${model.nutWidth / 2} ${nut} L ${-model.nutWidth / 2} ${nut} Z" fill="#b88759"/>`);
    let headShape = state.kind === 'electric'
      ? `<path d="M -.32 ${nut} Q -.68 ${nut + 2} -.17 ${nut + 1.9} Q .84 ${nut + 1.8} .35 ${nut + .9} L .32 ${nut} Z" fill="#b88759"/>`
      : `<path d="M -.32 ${nut} L -.5 ${nut + 1.7} Q 0 ${nut + 1.92} .5 ${nut + 1.7} L .32 ${nut} Z" fill="#93603d"/>`;
    if (classical) headShape += [-.3, .16].map(x => rect(x, nut + .38, .14, 1.04, '#191e1c', .07)).join('');
    const head = group('headstock', headShape);
    const boardEnd = guitarFretY(state.kind, model.frets) - .12;
    const board = group('fretboard', `<path d="M -.45 ${boardEnd} L .45 ${boardEnd} L ${model.nutWidth / 2} ${nut} L ${-model.nutWidth / 2} ${nut} Z" fill="#35291f"/>`);
    const frets = group('frets', Array.from({ length: model.frets }, (_, i) => {
      const y = guitarFretY(state.kind, i + 1), width = model.nutWidth + (.9 - model.nutWidth) * (nut - y) / (nut - boardEnd);
      return rect(-width / 2, y, width, .025, '#c8c3af');
    }).join(''));
    const tuners = group('tuners', Array.from({ length: 6 }, (_, i) => {
      const x = state.kind === 'electric' || i < 3 ? -.57 : .57, row = i < 3 ? i : 5 - i;
      const y = nut + .37 + (state.kind === 'electric' ? i * .24 : row * .5);
      return rect(x < 0 ? x : x - .27, y - .025, .27, .05, '#bbbcae') + circle(x, y, .08, classical ? '#eadaba' : '#c8cabe');
    }).join(''));
    const nutShape = group('nut', rect(-model.nutWidth / 2 - .02, nut, model.nutWidth + .04, .07, '#eee2c5'));
    const bridge = group('bridge', rect(acoustic ? -.94 : -.68, saddle - .31, acoustic ? 1.88 : 1.36, .51, acoustic ? '#4b3224' : '#b7bdb5', .09)
      + (classical ? rect(-.56, saddle - .28, 1.12, .12, '#966540') : acoustic ? Array.from({ length: 6 }, (_, i) => circle((i - 2.5) * .18, saddle - .2, .035, '#eee0c0')).join('') : ''));
    const saddles = group('saddle', acoustic ? rect(-.56, saddle, 1.12, .055, '#f3e6c6')
      : Array.from({ length: 6 }, (_, i) => rect((i - 2.5) * .18 - .07, saddle - .14, .14, .29, '#e2e0ca')).join(''));
    const electronics = !acoustic ? group('pickups', [-.5, -1.13].map(y => rect(-.65, y, 1.3, .25, '#272f2b')
      + Array.from({ length: 6 }, (_, i) => circle((i - 2.5) * .18, y + .125, .04, '#d4d1bf')).join('')).join(''))
      + group('controls', circle(1.1, -1.8, .16, '#e3d6b8') + circle(1.3, -2.4, .16, '#e3d6b8') + rect(.9, -.9, .06, .3, '#e3d6b8') + circle(.72, -3.1, .1, '#161d19')) : '';
    const strings = group('strings', Array.from({ length: 6 }, (_, i) => {
      const x = (i - 2.5) * .18, endX = (i - 2.5) * ((model.nutWidth - .1) / 5);
      return `<path d="M ${x} ${saddle - .22} L ${x} ${saddle} L ${endX} ${nut} L ${endX} ${nut + 1.3}" stroke="${classical ? '#fff0d2' : '#d9cdad'}" stroke-width="${.016 - i * .0015}" fill="none"/>`;
    }).join(''));
    this.find('[data-lab-diagram]').innerHTML = `<svg viewBox="${state.exploded || state.detached.length ? '-5.4 -10.2 11 15' : '-3.3 -8.3 6.6 13'}" role="img" aria-label="${escape(model.name)} part diagram. Use the named part buttons below.">
      <g transform="scale(1 -1)">${body}${top}${neck}${head}${board}${frets}${tuners}${nutShape}${bridge}${saddles}${electronics}${strings}</g></svg>`;
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
      this.audioStatus(`Playing ${GUITAR_MODELS[kind].name.toLowerCase()}: E, A, D, G, B, E. This recording is representative, not a simulation of the virtual assembly.`);
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
