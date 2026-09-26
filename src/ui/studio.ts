import type { NeckState } from './fretboard3d';
import { PaneNeck3D } from './paneNeck3d';
import { NOTE_NAMES } from '../types';
import './studio.css';

const paths: Record<string, string> = {
  neck: 'M4 4h16v16H4z M8 4v16 M12 4v16 M16 4v16 M4 9h16 M4 15h16',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',
  play: 'm9 5 11 7-11 7z',
  book: 'M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-2-10 1z M12 5v15',
  music: 'M9 18V5l11-2v13 M9 9l11-2 M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3 M20 16a3 3 0 1 1-3-3c2 0 3 1 3 3',
  tools: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  reset: 'M4 10a8 8 0 1 1 1 8 M4 4v6h6',
};
export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.neck}"/></svg>`;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function disclosure(title: string, children: HTMLElement[]): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'studio-disclosure';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary, ...children);
  return details;
}

/** Recompose existing controls instead of duplicating their state or event bindings. */
export function prepareStudio(): void {
  document.body.classList.add('studio-redesign');
  document.querySelector('.brand-icon')!.innerHTML = icon('neck');
  document.querySelector('.brand-text h1')!.textContent = 'Guitar / Studio';
  document.querySelector('.brand-text p')!.textContent = 'A little practice. A better player.';
  element('top-user-avatar').innerHTML = icon('music');

  const labels: Record<string, [string, string]> = {
    detector: ['Live studio', 'mic'], songs: ['Play along', 'music'],
    chords: ['Chord library', 'book'], scales: ['Scales', 'neck'],
    drill: ['Chord changes', 'play'], trainer: ['Ear training', 'music'],
    analysis: ['Analyze audio', 'mic'], tuner: ['Tuner', 'tools'],
    metronome: ['Metronome', 'tools'], rhythm: ['Percussion', 'music'],
    recorder: ['Audio recorder', 'mic'],
  };
  const nav = document.querySelector('.studio-nav-bar')!;
  nav.removeAttribute('role');
  const more = document.createElement('details');
  more.className = 'tools-menu';
  more.innerHTML = `<summary>${icon('tools')} More tools <span aria-hidden="true">⌄</span></summary><div class="tools-menu-content"><p>Practice & recording</p></div>`;
  const menu = more.querySelector('div')!;
  document.querySelectorAll<HTMLButtonElement>('.studio-tab-btn[data-tab]').forEach(button => {
    const tab = button.dataset.tab!;
    button.id = `tab-${tab}`;
    button.removeAttribute('role');
    button.removeAttribute('aria-selected');
    button.setAttribute('aria-current', tab === 'detector' ? 'page' : 'false');
    const pane = element(`pane-${tab}`);
    pane.setAttribute('role', 'region');
    if (!labels[tab]) {
      button.hidden = true;
      button.disabled = true;
      pane.innerHTML = '<div class="card unavailable-feature"><h2>Still in the workshop</h2><p>This tool is not available yet. Use Audio recorder for recording and looping takes.</p></div>';
      return;
    }
    button.innerHTML = `${icon(labels[tab][1])}${labels[tab][0]}`;
    if (!['detector', 'songs', 'chords', 'scales'].includes(tab)) menu.append(button);
    button.addEventListener('click', () => {
      more.open = false;
      element('studio-tool-label').textContent = ['detector', 'songs', 'chords', 'scales'].includes(tab) ? '' : labels[tab][0];
    });
  });
  nav.append(more);
  menu.append(element('btn-open-midi-modal'));
  element('btn-open-midi-modal').addEventListener('click', () => { more.open = false; });
  const toolLabel = document.createElement('span');
  toolLabel.id = 'studio-tool-label';
  nav.append(toolLabel);
  document.addEventListener('click', e => { if (!more.contains(e.target as Node)) more.open = false; });
  more.addEventListener('keydown', e => {
    if (e.key === 'Escape') { more.open = false; more.querySelector('summary')!.focus(); }
  });

  const primary = document.querySelector<HTMLElement>('#main-container .primary-col')!;
  const hero = document.querySelector<HTMLElement>('.chord-hero-box')!;
  const visuals = element<HTMLCanvasElement>('canvas-spectrum').closest<HTMLElement>('section')!;
  const neck = element('fretboard-board').closest<HTMLElement>('section')!;
  neck.classList.add('neck-card');
  const title = document.createElement('div');
  title.className = 'studio-intro';
  title.innerHTML = `<div><p class="eyebrow">YOUR DAILY SESSION</p><h2>Find your next <em>good chord.</em></h2><p>Hear it. See it. Make it yours.</p></div><div class="listening-actions"></div>`;
  element('main-container').prepend(title);
  const actions = title.querySelector('.listening-actions')!;
  actions.append(element('btn-toggle-mic'), element('btn-test-speaker'));
  element('btn-toggle-mic').innerHTML = `${icon('mic')}<span id="mic-btn-text">Start listening</span>`;
  element('btn-test-speaker').innerHTML = `${icon('play')}Try the sound`;
  const privacy = document.createElement('span');
  privacy.className = 'privacy-note';
  privacy.textContent = 'Microphone audio stays on this device.';
  actions.append(privacy);

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'LIVE RECOGNITION';
  hero.prepend(eyebrow);
  hero.setAttribute('aria-live', 'off');
  element('display-chord-name').setAttribute('aria-live', 'polite');
  element('status-text').textContent = 'Your microphone is off';
  element('live-detector-substatus').textContent = 'Start listening, allow the mic, then strum. Or explore a chord without a microphone.';
  element('display-chord-name').textContent = 'Let’s play';
  const target = element('btn-target-chords').closest<HTMLElement>('.slider-item')!;
  target.classList.add('listening-target');
  hero.append(target);
  element('btn-target-chords').textContent = 'Chords';
  element('btn-target-notes').textContent = 'Notes';
  element('btn-target-auto').textContent = 'Auto';
  element('target-mode-explainer').textContent = 'Choose what you want to hear.';

  const neckHeader = neck.querySelector('.card-header')!;
  neckHeader.innerHTML = `<div><p class="eyebrow">THE INTERACTIVE NECK</p><h3>Every note, a new perspective.</h3></div><div class="neck-view-switch" role="group" aria-label="Fretboard view"><button id="neck-view-3d" aria-pressed="false">3D</button><button id="neck-view-2d" aria-pressed="true">2D</button></div>`;
  const stage = document.createElement('div');
  stage.className = 'neck-stage';
  stage.innerHTML = `<div class="neck-stage-top"><span id="neck-caption">Explore the fretboard</span><span id="neck-tuning">E A D G B E</span></div><div id="neck-3d" hidden></div><div class="neck-camera" role="group" aria-label="3D camera"><button id="neck-zoom-in" aria-label="Zoom in">+</button><button id="neck-zoom-out" aria-label="Zoom out">−</button><button id="neck-reset" aria-label="Reset camera">${icon('reset')}</button></div><p id="neck-help">Drag to rotate · Click to play · + / − to zoom · R to reset</p>`;
  const flat = neck.querySelector<HTMLElement>('.fretboard-container')!;
  flat.id = 'neck-2d';
  stage.insertBefore(flat, stage.querySelector('.neck-camera'));
  neck.append(stage);
  const neckFooter = document.createElement('div');
  neckFooter.className = 'neck-footer';
  neckFooter.innerHTML = `<div class="neck-legend"><span><i class="root-dot"></i>Root</span><span><i></i>Chord tone</span><span><i class="live-dot"></i>Live pitch</span></div><p id="neck-summary" aria-live="polite">Choose a chord below or click a fret to begin.</p><p class="neck-caveat">Suggested chord voicings, not measured finger positions. Live pitch shows possible locations.</p><div class="neck-presets" aria-label="Explore a chord"><span>TRY A CHORD</span>${['Am', 'C', 'G', 'D', 'Em', 'F'].map(chord => `<button data-neck-chord="${chord}" aria-pressed="false">${chord}</button>`).join('')}</div>`;
  neck.append(neckFooter);
  const playControls = document.createElement('div');
  playControls.className = 'neck-play-controls';
  playControls.append(element('btn-strum-down'), element('btn-strum-up'), element('btn-strum-arpeggio'), element('btn-clear-fretboard'));
  neckFooter.append(playControls);
  const advanced = disclosure('Sound & detection settings', [
    element('btn-calibrate-noise'), element('btn-strum-roll'),
    visuals.querySelector<HTMLElement>('.controls-grid')!,
    element('noise-reduction-badge'), element('trigger-mode-badge'),
  ]);
  const charts = disclosure('Signal insights · spectrum & chromagram', [visuals]);
  const explainer = document.querySelector<HTMLElement>('.diag-box')!;
  explainer.innerHTML = '<strong>Make room for a clean take.</strong><p>Start listening and stay quiet while room noise is calibrated. Strum one chord and let it ring. If recognition struggles, try Notes mode or adjust the noise gate in settings. Results depend on your guitar, room and microphone.</p>';
  primary.replaceChildren(hero, neck, advanced, charts, explainer);

  const sidebar = document.querySelector<HTMLElement>('#main-container .sidebar')!;
  const quick = element('preset-chips-standard').closest<HTMLElement>('.card')!;
  sidebar.prepend(quick);
  const sound = element('btn-sound-nylon').closest<HTMLElement>('.card')!;
  advanced.append(sound);
  const comparison = element('btn-preset-am').closest<HTMLElement>('.card')!;
  charts.append(comparison);
  const theory = element('theory-table').closest<HTMLElement>('.card')!;
  theory.querySelector('.card-title')!.textContent = 'Reading your chord';
  ['theory-emotion', 'theory-context'].forEach(id => element(id).closest('tr')!.hidden = true);
  element('theory-degrees').previousElementSibling!.textContent = 'Chord tones';
  theory.querySelectorAll('td').forEach(td => { td.textContent = '—'; });
  element('rhythm-dock').classList.add('studio-rhythm-controls');
  element('pane-rhythm').append(element('rhythm-dock'));
  document.querySelectorAll<HTMLElement>('.card-title > span:first-child, .btn > span:first-child').forEach(span => {
    if (/^\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D\s]*$/u.test(span.textContent || '')) span.innerHTML = icon('music');
  });
}

export class NeckController {
  private neck: PaneNeck3D;
  private stateKey = '';

  constructor(pick: (string: number, fret: number) => void, loadChord: (chord: string) => void) {
    this.neck = new PaneNeck3D(element('neck-3d'), {
      toggle3d: element('neck-view-3d'), toggle2d: element('neck-view-2d'),
      twoD: element('neck-2d'), camera: document.querySelector<HTMLElement>('.neck-camera'),
      reset: element('neck-reset'), zoomIn: element('neck-zoom-in'), zoomOut: element('neck-zoom-out'),
      help: element('neck-help'),
    }, pick, {
      defaultMode: '3d', preferenceKey: 'gcs-neck-view',
      help2d: 'Scroll the neck · Tab to a fret, then Enter to play · × mutes a string',
    });
    document.querySelectorAll<HTMLButtonElement>('[data-neck-chord]').forEach(button => {
      button.addEventListener('click', () => loadChord(button.dataset.neckChord!));
    });
  }

  setActive(active: boolean): void {
    this.neck.setActive(active);
  }

  update(state: NeckState, caption: string): void {
    element('neck-caption').textContent = caption;
    element('neck-tuning').textContent = [...state.tuning].reverse().map(string => string.note).join(' · ');
    const key = JSON.stringify({ ...state, caption });
    if (key === this.stateKey) return;
    this.stateKey = key;
    const description = state.frets.map((fret, s) => fret === null ? '×' : `${NOTE_NAMES[(state.tuning[s].midi + fret) % 12]} ${fret === 0 ? 'open' : `fret ${fret}`}`);
    element('neck-summary').textContent = state.frets.every(f => f === null)
      ? 'Choose a chord below or click a fret to begin.'
      : `Low → high: ${description.reverse().join(' · ')}`;
    document.querySelectorAll<HTMLButtonElement>('[data-neck-chord]').forEach(button => {
      button.setAttribute('aria-pressed', String(caption === `${button.dataset.neckChord} · selected voicing`));
    });
    this.neck.update(state);
  }
}
