import type { Fretboard3D, NeckState } from './fretboard3d';

export interface PaneNeck3DControls {
  toggle3d?: HTMLElement | null;
  toggle2d?: HTMLElement | null;
  twoD?: HTMLElement | null;
  camera?: HTMLElement | null;   // camera-button bar (shown only in 3D)
  zoomIn?: HTMLElement | null;
  zoomOut?: HTMLElement | null;
  reset?: HTMLElement | null;
  help?: HTMLElement | null;     // help caption (shown only in 3D)
}

export interface PaneNeck3DOptions {
  defaultMode?: '2d' | '3d';
  preferenceKey?: string;
  help2d?: string;
}

/** Shared, lazy lifecycle for the original studio renderer and a 2D fallback. */
export class PaneNeck3D {
  private scene: Fretboard3D | null = null;
  private mode: '2d' | '3d' = '2d';
  private state: NeckState | null = null;
  private stateKey = '';
  private disposed = false;
  private loading = false;
  private active = true;
  private inView = false;
  private pageHidden = false;
  private generation = 0;
  private abort = new AbortController();
  private observer: IntersectionObserver;
  private help3d: string;

  constructor(
    private host: HTMLElement,
    private c: PaneNeck3DControls,
    private onPick: (stringIdx: number, fret: number) => void = () => {},
    private options: PaneNeck3DOptions = {},
  ) {
    const events = { signal: this.abort.signal };
    this.help3d = c.help?.textContent || 'Drag to rotate · Click to play · + / − to zoom · R to reset';
    this.c.toggle3d?.addEventListener('click', () => this.setMode('3d'), events);
    this.c.toggle2d?.addEventListener('click', () => this.setMode('2d'), events);
    this.c.zoomIn?.addEventListener('click', () => this.scene?.zoom(0.85), events);
    this.c.zoomOut?.addEventListener('click', () => this.scene?.zoom(1.15), events);
    this.c.reset?.addEventListener('click', () => this.scene?.reset(), events);
    this.observer = new IntersectionObserver(entries => {
      this.inView = entries[entries.length - 1].isIntersecting;
      this.syncVisibility();
    }, { rootMargin: '120px' });
    this.observer.observe(host);
    window.addEventListener('pagehide', () => { this.pageHidden = true; this.release(); }, events);
    window.addEventListener('pageshow', () => { this.pageHidden = false; this.syncVisibility(); }, events);
    let preferred: string = matchMedia('(prefers-reduced-motion: reduce)').matches ? '2d' : options.defaultMode || '2d';
    if (options.preferenceKey) {
      try { preferred = localStorage.getItem(options.preferenceKey) || preferred; } catch { /* Optional preference. */ }
    }
    this.mode = preferred === '3d' ? '3d' : '2d';
    this.applyMode();
  }

  setMode(mode: '2d' | '3d', persist = true): void {
    if (this.disposed) return;
    this.mode = mode;
    if (persist && this.options.preferenceKey) {
      try { localStorage.setItem(this.options.preferenceKey, mode); } catch { /* Optional preference. */ }
    }
    this.applyMode();
  }

  private applyMode(): void {
    const is3d = this.mode === '3d';
    this.c.toggle3d?.setAttribute('aria-pressed', String(is3d));
    this.c.toggle2d?.setAttribute('aria-pressed', String(!is3d));
    this.host.hidden = !is3d;
    if (this.c.twoD) this.c.twoD.hidden = is3d;
    if (this.c.camera) this.c.camera.hidden = !is3d;
    if (this.c.help) {
      this.c.help.hidden = !is3d && !this.options.help2d;
      this.c.help.textContent = is3d ? this.help3d : this.options.help2d || '';
    }

    if (!is3d) this.release();
    this.syncVisibility();
  }

  private async ensureScene(): Promise<void> {
    if (this.scene || this.loading || this.disposed || this.pageHidden || !this.active || !this.inView || this.mode !== '3d') return;
    this.loading = true;
    const generation = ++this.generation;
    this.host.setAttribute('aria-busy', 'true');
    try {
      const { Fretboard3D } = await import('./fretboard3d');
      if (generation !== this.generation || this.disposed || this.mode !== '3d' || !this.active || !this.inView || this.pageHidden) return;
      this.scene = new Fretboard3D(this.host, this.onPick, () => this.fallbackTo2D(), this.c.help?.id);
      this.scene.setVisible(true);
      if (this.state) this.scene.update(this.state);
    } catch (error) {
      if (generation === this.generation) {
        console.warn('3D neck unavailable; retaining interactive 2D fretboard.', error);
        this.fallbackTo2D();
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.host.removeAttribute('aria-busy');
      }
    }
  }

  private fallbackTo2D(): void {
    this.setMode('2d', false);
    if (this.c.help) {
      this.c.help.hidden = false;
      this.c.help.textContent = '3D is unavailable on this device. The full interactive 2D neck is ready to use.';
      this.c.help.setAttribute('role', 'status');
    }
  }

  private release(): void {
    this.generation++;
    this.loading = false;
    this.host.removeAttribute('aria-busy');
    this.scene?.dispose();
    this.scene = null;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.release();
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.scene?.setVisible(this.active && this.inView && !this.pageHidden && this.mode === '3d');
    void this.ensureScene();
  }

  update(state: NeckState): void {
    const key = JSON.stringify(state);
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.state = {
      ...state, frets: [...state.frets], tuning: state.tuning.map(s => ({ ...s })),
      scalePositions: state.scalePositions?.map(position => ({ ...position })),
    };
    this.scene?.update(this.state);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.observer.disconnect();
    this.release();
  }
}
