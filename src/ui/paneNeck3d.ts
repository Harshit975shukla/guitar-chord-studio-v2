import type { NeckState } from './fretboard3d';

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

/**
 * Mounts an optional 3D neck (Three.js) next to an existing 2D fretboard in a
 * tab pane (Songs, Scales), with the same camera controls as the detector's
 * studio neck. Defaults to 2D — the 3D view is opt-in via a toggle and lazily
 * creates/disposes the WebGL scene, so it never affects the 2D experience or
 * competes for GPU when hidden. Falls back to 2D if WebGL is unavailable.
 */
export class PaneNeck3D {
  private scene: any = null; // Fretboard3D instance (dynamically imported)
  private mode: '2d' | '3d' = '2d';
  private state: NeckState | null = null;
  private disposed = false;
  private loading = false;

  constructor(
    private host: HTMLElement,
    private c: PaneNeck3DControls,
    private onPick: (stringIdx: number, fret: number) => void = () => {},
  ) {
    this.c.toggle3d?.addEventListener('click', () => this.setMode('3d'));
    this.c.toggle2d?.addEventListener('click', () => this.setMode('2d'));
    this.c.zoomIn?.addEventListener('click', () => this.scene?.zoom(0.85));
    this.c.zoomOut?.addEventListener('click', () => this.scene?.zoom(1.15));
    this.c.reset?.addEventListener('click', () => this.scene?.reset());
    this.applyMode();
  }

  setMode(mode: '2d' | '3d'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    const is3d = this.mode === '3d';
    this.c.toggle3d?.setAttribute('aria-pressed', String(is3d));
    this.c.toggle2d?.setAttribute('aria-pressed', String(!is3d));
    this.host.hidden = !is3d;
    if (this.c.twoD) this.c.twoD.style.display = is3d ? 'none' : '';
    if (this.c.camera) this.c.camera.hidden = !is3d;
    if (this.c.help) this.c.help.hidden = !is3d;

    if (is3d) {
      void this.ensureScene();
    } else if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
  }

  private async ensureScene(): Promise<void> {
    if (this.scene || this.loading || this.disposed) return;
    this.loading = true;
    try {
      const { Fretboard3D } = await import('./fretboard3d');
      if (this.disposed || this.mode !== '3d') return;
      this.scene = new Fretboard3D(this.host, this.onPick, () => this.fallbackTo2D());
      this.scene.setVisible?.(true);
      if (this.state) this.scene.update(this.state);
    } catch {
      this.fallbackTo2D();
    } finally {
      this.loading = false;
    }
  }

  private fallbackTo2D(): void {
    if (this.scene) {
      try { this.scene.dispose(); } catch { /* ignore */ }
      this.scene = null;
    }
    this.mode = '2d';
    this.host.hidden = true;
    if (this.c.twoD) this.c.twoD.style.display = '';
    if (this.c.camera) this.c.camera.hidden = true;
    if (this.c.help) this.c.help.hidden = true;
    this.c.toggle3d?.setAttribute('aria-pressed', 'false');
    this.c.toggle2d?.setAttribute('aria-pressed', 'true');
  }

  update(state: NeckState): void {
    this.state = state;
    if (this.mode === '3d' && this.scene) this.scene.update(state);
  }

  dispose(): void {
    this.disposed = true;
    if (this.scene) { this.scene.dispose(); this.scene = null; }
  }
}
