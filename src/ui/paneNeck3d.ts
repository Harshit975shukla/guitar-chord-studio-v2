import type { NeckState } from './fretboard3d';

/**
 * Mounts an optional 3D neck (Three.js) next to an existing 2D fretboard in a
 * tab pane (Songs, Scales). Defaults to 2D — the 3D view is opt-in via a toggle
 * and lazily creates/disposes the WebGL scene, so it never affects the existing
 * 2D experience or competes for GPU when hidden. Falls back to 2D if WebGL is
 * unavailable. Three.js is dynamically imported only when 3D is first shown.
 */
export class PaneNeck3D {
  private scene: any = null; // Fretboard3D instance (dynamically imported)
  private mode: '2d' | '3d' = '2d';
  private state: NeckState | null = null;
  private disposed = false;
  private loading = false;

  constructor(
    private host: HTMLElement,
    private toggle3d: HTMLElement | null,
    private toggle2d: HTMLElement | null,
    private twoD: HTMLElement | null,
    private onPick: (stringIdx: number, fret: number) => void = () => {},
  ) {
    this.toggle3d?.addEventListener('click', () => this.setMode('3d'));
    this.toggle2d?.addEventListener('click', () => this.setMode('2d'));
    this.applyMode();
  }

  setMode(mode: '2d' | '3d'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    const is3d = this.mode === '3d';
    this.toggle3d?.setAttribute('aria-pressed', String(is3d));
    this.toggle2d?.setAttribute('aria-pressed', String(!is3d));
    this.host.hidden = !is3d;
    if (this.twoD) this.twoD.style.display = is3d ? 'none' : '';

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
    if (this.twoD) this.twoD.style.display = '';
    this.toggle3d?.setAttribute('aria-pressed', 'false');
    this.toggle2d?.setAttribute('aria-pressed', 'true');
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
