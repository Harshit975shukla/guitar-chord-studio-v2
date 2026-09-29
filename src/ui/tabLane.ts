import './tabLane.css';
import { itemAtBeat, pixelsPerBeat, type LaneItem, type LaneSection, type NextTarget } from '../songs/tabLane';

export interface TabLaneView {
  items: readonly LaneItem[];
  /** String names from string 1 (top line) to string 6. */
  strings: readonly string[];
  current: number;
  next: NextTarget | null;
  section: LaneSection | null;
  /** Spoken description of the current position for assistive technology. */
  summary: string;
}

const TOP = 34, GAP = 20, HEIGHT = 158, GUTTER = 30;
const COLORS = {
  line: '#4d534a', beat: '#272c28', phrase: '#4a5046', label: '#a9afa9', playhead: '#eabb7f',
  current: '#eabb7f', currentText: '#252119', next: '#9dbfcd', nextFill: '#1d2a2e', nextText: '#dcebf1',
  upcoming: '#2b302b', upcomingEdge: '#4a5046', upcomingText: '#f2eee6', past: '#232723', pastText: '#737a70',
  unavailable: '#e8a099', chord: '#d8d2c4', loop: 'rgba(234, 187, 127, .08)', loopEdge: 'rgba(234, 187, 127, .5)',
};

/**
 * Scrolling six-line tab with a fixed playhead. It animates only while following live playback,
 * is visible and motion is allowed; otherwise it redraws on changes. Owns only its canvas.
 */
export class TabLane {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private view: TabLaneView | null = null;
  private cursor = 0;
  private source: (() => number | null) | null = null;
  private frame = 0;
  private width = 0;
  private active = true;
  private inView = true;
  private pointer: { x: number; y: number } | null = null;
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private resizeObserver: ResizeObserver;
  private intersection: IntersectionObserver;
  private events = new AbortController();

  constructor(private host: HTMLElement, private onSeek: (index: number) => void) {
    this.ctx = this.canvas.getContext('2d')!;
    const canvas = this.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-orientation', 'horizontal');
    canvas.setAttribute('aria-label', 'Song position in the tab');
    host.append(canvas);
    const signal = this.events.signal;
    canvas.addEventListener('pointerdown', event => { this.pointer = { x: event.clientX, y: event.clientY }; }, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointercancel', () => { this.pointer = null; }, { signal });
    canvas.addEventListener('keydown', this.onKey, { signal });
    document.addEventListener('visibilitychange', () => this.schedule(), { signal });
    this.motion.addEventListener('change', () => { this.snap(); this.schedule(); this.draw(); }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.intersection = new IntersectionObserver(entries => {
      this.inView = entries.some(entry => entry.isIntersecting);
      this.schedule();
    });
    this.intersection.observe(host);
    this.resize();
  }

  get following(): boolean { return !!this.source; }
  get beat(): number { return this.cursor; }
  private get animating(): boolean { return !!this.source && this.active && this.inView && !document.hidden && !this.motion.matches; }

  setView(view: TabLaneView): void {
    this.view = view;
    if (!this.animating) this.snap();
    const count = view.items.length;
    this.canvas.setAttribute('aria-valuemin', count ? '1' : '0');
    this.canvas.setAttribute('aria-valuemax', String(count));
    this.canvas.setAttribute('aria-valuenow', String(count ? view.current + 1 : 0));
    this.canvas.setAttribute('aria-valuetext', view.summary);
    this.draw();
  }

  /** Pass a function returning the live beat to scroll smoothly; pass null to stop following. */
  follow(source: (() => number | null) | null): void {
    this.source = source;
    if (!source) this.snap();
    this.schedule();
    this.draw();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.schedule();
    if (active) this.resize();
  }

  private snap(): void {
    const item = this.view?.items[this.view.current];
    this.cursor = item ? item.beat : 0;
  }

  private schedule(): void {
    if (this.animating) {
      if (!this.frame) this.frame = requestAnimationFrame(this.tick);
    } else if (this.frame) {
      cancelAnimationFrame(this.frame); this.frame = 0;
      if (this.source) { this.snap(); this.draw(); }
    }
  }

  private tick = (): void => {
    this.frame = 0;
    if (!this.animating) return;
    const beat = this.source?.();
    if (beat !== null && beat !== undefined && Number.isFinite(beat)) this.cursor = beat;
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    const width = Math.round(this.host.clientWidth);
    if (width < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(HEIGHT * ratio);
    this.canvas.style.height = `${HEIGHT}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  private scale(): number {
    const view = this.view;
    return view ? pixelsPerBeat(view.items) * Math.min(1, Math.max(.62, this.width / 760)) : 72;
  }
  /** Narrow screens keep the playhead further left so more of what is coming stays visible. */
  private playheadX(): number { return GUTTER + (this.width - GUTTER) * (this.width < 480 ? .16 : .26); }

  private onPointerUp = (event: PointerEvent): void => {
    const start = this.pointer;
    this.pointer = null;
    const view = this.view;
    if (!view || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const x = event.clientX - this.canvas.getBoundingClientRect().left;
    if (x < GUTTER) return;
    const index = itemAtBeat(view.items, this.cursor + (x - this.playheadX()) / this.scale());
    if (index !== null) this.onSeek(index);
  };

  private onKey = (event: KeyboardEvent): void => {
    const view = this.view;
    if (!view?.items.length) return;
    const last = view.items.length - 1;
    const target = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? view.current + 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? view.current - 1
        : event.key === 'PageDown' ? view.current + 4 : event.key === 'PageUp' ? view.current - 4
          : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (target === null) return;
    event.preventDefault();
    this.onSeek(Math.min(last, Math.max(0, target)));
  };

  private chip(x: number, y: number, text: string, fill: string, stroke: string | null, color: string, dashed = false): number {
    const ctx = this.ctx;
    ctx.font = '600 11px system-ui, sans-serif';
    const width = Math.max(18, ctx.measureText(text).width + 10), height = 16;
    ctx.beginPath(); ctx.roundRect(x, y - height / 2, width, height, 5);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) {
      ctx.setLineDash(dashed ? [3, 2] : []); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + .5);
    return width;
  }

  private draw(): void {
    const ctx = this.ctx, width = this.width;
    if (!width) return;
    ctx.clearRect(0, 0, width, HEIGHT);
    ctx.fillStyle = '#1b1e1c'; ctx.fillRect(0, 0, width, HEIGHT);
    const view = this.view;
    const bottom = TOP + GAP * 5, playhead = this.playheadX(), scale = this.scale();
    const toX = (beat: number) => playhead + (beat - this.cursor) * scale;
    if (view?.items.length) {
      const first = Math.floor(this.cursor - (playhead - GUTTER) / scale) - 1, last = Math.ceil(this.cursor + (width - playhead) / scale) + 1;
      ctx.lineWidth = 1;
      for (let beat = Math.max(0, first); beat <= last; beat++) {
        const x = Math.round(toX(beat)) + .5;
        ctx.strokeStyle = COLORS.beat; ctx.beginPath(); ctx.moveTo(x, TOP - 6); ctx.lineTo(x, bottom + 6); ctx.stroke();
      }
      const section = view.section;
      if (section) {
        const startX = toX(view.items[section.start].beat), end = view.items[section.end];
        const endX = toX(end.beat + end.beats);
        ctx.fillStyle = COLORS.loop; ctx.fillRect(startX, TOP - 12, endX - startX, bottom - TOP + 24);
        ctx.strokeStyle = COLORS.loopEdge;
        for (const x of [startX, endX]) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, TOP - 12); ctx.lineTo(Math.round(x) + .5, bottom + 12); ctx.stroke(); }
        ctx.fillStyle = COLORS.current; ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('LOOP', startX + 4, HEIGHT - 8);
      }
      ctx.strokeStyle = COLORS.line;
      for (let s = 0; s < 6; s++) { const y = TOP + s * GAP + .5; ctx.beginPath(); ctx.moveTo(GUTTER, y); ctx.lineTo(width, y); ctx.stroke(); }
      const firstItem = Math.max(0, (itemAtBeat(view.items, Math.max(0, first)) ?? 0) - 1);
      for (let i = firstItem; i < view.items.length; i++) {
        const item = view.items[i], x = toX(item.beat), endX = toX(item.beat + item.beats);
        if (x > width + 40) break;
        if (endX < GUTTER - 40) continue;
        const previous = view.items[i - 1];
        if (previous && item.line !== undefined && previous.line !== item.line) {
          ctx.setLineDash([4, 4]); ctx.strokeStyle = COLORS.phrase;
          ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, TOP - 14); ctx.lineTo(Math.round(x) + .5, bottom + 14); ctx.stroke(); ctx.setLineDash([]);
        }
        const outside = !!section && (i < section.start || i > section.end);
        const state = i === view.current ? 'current' : i === view.next?.index ? 'next' : endX <= playhead + .5 ? 'past' : 'upcoming';
        ctx.globalAlpha = outside && state !== 'current' ? .45 : 1;
        const [fill, stroke, text] = state === 'current' ? [COLORS.current, null, COLORS.currentText]
          : state === 'next' ? [COLORS.nextFill, COLORS.next, COLORS.nextText]
            : state === 'past' ? [COLORS.past, null, COLORS.pastText] : [COLORS.upcoming, COLORS.upcomingEdge, COLORS.upcomingText];
        const left = x + 3;
        if (item.kind === 'rest') {
          ctx.fillStyle = state === 'current' ? COLORS.current : state === 'past' ? COLORS.pastText : '#8b9186';
          ctx.font = `${state === 'current' ? '600 ' : ''}italic 11px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('rest', left + 2, TOP + GAP * 2.5);
        } else if (!item.available) {
          this.chip(left, TOP + GAP * 2.5, '?', COLORS.past, COLORS.unavailable, COLORS.unavailable, true);
        } else {
          for (const position of item.positions) {
            const y = TOP + position.s * GAP;
            const chipWidth = this.chip(left, y, String(position.f), fill, stroke, text);
            if (endX - 4 > left + chipWidth + 4) {
              ctx.strokeStyle = state === 'current' ? 'rgba(234, 187, 127, .55)' : state === 'next' ? 'rgba(157, 191, 205, .45)' : 'rgba(169, 175, 169, .22)';
              ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left + chipWidth + 2, y); ctx.lineTo(endX - 4, y); ctx.stroke(); ctx.lineWidth = 1;
            }
          }
        }
        if (item.kind === 'chord') {
          ctx.fillStyle = state === 'current' ? COLORS.current : state === 'next' ? COLORS.next : state === 'past' ? COLORS.pastText : COLORS.chord;
          ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(item.label, left, TOP - 16);
        }
        if (state === 'next') {
          const away = view.next!.restBeats + Math.max(0, (view.items[view.current]?.beat ?? 0) + (view.items[view.current]?.beats ?? 0) - this.cursor);
          const label = this.source ? `next · ${away < .05 ? 'now' : `in ${Math.round(away * 4) / 4}`}` : 'next';
          ctx.fillStyle = COLORS.next; ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(label.toUpperCase(), left, item.kind === 'chord' ? TOP - 28 : TOP - 16);
        }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = COLORS.playhead; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(playhead, 8); ctx.lineTo(playhead, HEIGHT - 6); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = COLORS.playhead;
      ctx.beginPath(); ctx.moveTo(playhead - 5, 4); ctx.lineTo(playhead + 5, 4); ctx.lineTo(playhead, 10); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = COLORS.label; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('No playable events in this chart.', GUTTER + 8, HEIGHT / 2);
    }
    ctx.fillStyle = '#1b1e1c'; ctx.fillRect(0, 0, GUTTER, HEIGHT);
    ctx.fillStyle = COLORS.label; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    (view?.strings ?? ['e', 'B', 'G', 'D', 'A', 'E']).forEach((name, s) => ctx.fillText(name, GUTTER / 2, TOP + s * GAP));
  }

  dispose(): void {
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.events.abort();
    this.resizeObserver.disconnect(); this.intersection.disconnect();
    this.canvas.remove();
  }
}
