export type GuitarKind = 'steel' | 'classical' | 'electric';
export type GuitarPartId = 'body' | 'soundboard' | 'soundhole' | 'neck' | 'fretboard' | 'frets'
  | 'headstock' | 'tuners' | 'nut' | 'bridge' | 'saddle' | 'strings' | 'pickups' | 'controls';
export type GuitarAssemblyId = 'body' | 'soundboard' | 'neck' | 'fretboard' | 'tuners'
  | 'nut' | 'bridge' | 'strings' | 'electronics';

export interface GuitarPart {
  id: GuitarPartId;
  name: string;
  assembly: GuitarAssemblyId;
  function: string;
  detail: string;
}
export interface GuitarAssembly {
  id: GuitarAssemblyId;
  name: string;
  requires: readonly GuitarAssemblyId[];
  offset: readonly [number, number, number];
}
export interface GuitarModel {
  id: GuitarKind;
  name: string;
  description: string;
  construction: string;
  parts: readonly GuitarPart[];
  assemblies: readonly GuitarAssembly[];
  nutY: number;
  scaleLength: number;
  nutWidth: number;
  bodyDepth: number;
  frets: number;
  topColor: string;
}

export const GUITAR_LAB_CAVEAT = 'Virtual learning model, not a maintenance or disassembly guide. '
  + 'Acoustic soundboards, bridges and many neck joints are glued assemblies: their separation here is an educational cutaway. '
  + 'Real construction varies by maker and model; do not take an instrument apart using this view.';

const commonParts: GuitarPart[] = [
  { id: 'neck', name: 'Neck', assembly: 'neck', function: 'Supports the fretboard and the playing length of the strings.',
    detail: 'The neck meets the body at a joint. Glued, bolt-on and other joints exist; this model does not prescribe how to remove one.' },
  { id: 'fretboard', name: 'Fretboard', assembly: 'fretboard', function: 'The playing surface beneath the strings.',
    detail: 'Pressing a string just behind a fret changes its vibrating length. Many fretboards are a separate piece bonded to the neck; some electric necks use a one-piece construction.' },
  { id: 'frets', name: 'Frets', assembly: 'fretboard', function: 'Metal crowns establish repeatable semitone steps.',
    detail: 'Fret spacing gets closer toward the body. The 12th fret halves the open string’s vibrating length, raising the pitch by one octave.' },
  { id: 'nut', name: 'Nut', assembly: 'nut', function: 'Spaces the strings at the headstock end and sets their open-string starting point.',
    detail: 'Its slots support the strings at the correct height. A fretted note starts at the fret instead; a nut is not the same part as a bridge saddle.' },
];

function assemblies(acoustic: boolean): GuitarAssembly[] {
  return [
    { id: 'body', name: acoustic ? 'Back & sides' : 'Solid body', requires: [], offset: [0, 0, 0] },
    ...(acoustic ? [{ id: 'soundboard' as const, name: 'Soundboard & rosette', requires: ['body' as const], offset: [-2.1, -.25, 1.45] as const }] : []),
    { id: 'neck', name: 'Neck & headstock', requires: ['body'], offset: [0, 1.2, -.6] },
    { id: 'fretboard', name: 'Fretboard & frets', requires: ['neck'], offset: [1.4, .75, .95] },
    { id: 'tuners', name: 'Tuning machines', requires: ['neck'], offset: [-1.6, 1.0, .8] },
    { id: 'nut', name: 'Nut', requires: ['fretboard'], offset: [1.7, 1.2, 1.6] },
    { id: 'bridge', name: acoustic ? 'Bridge & saddle' : 'Bridge & saddles', requires: [acoustic ? 'soundboard' : 'body'], offset: [-1.65, -.6, 1.5] },
    ...(acoustic ? [] : [{ id: 'electronics' as const, name: 'Pickups & controls', requires: ['body' as const], offset: [-2.1, .25, 1.2] as const }]),
    { id: 'strings', name: 'Six strings', requires: ['tuners', 'nut', 'bridge'], offset: [2.65, .1, 2] },
  ];
}

function parts(kind: GuitarKind): GuitarPart[] {
  const acoustic = kind !== 'electric', classical = kind === 'classical';
  return [
    { id: 'body', name: acoustic ? 'Back & sides' : 'Solid body', assembly: 'body',
      function: acoustic ? 'Enclose the air cavity and support the soundboard.' : 'Supports the neck, bridge and electronics.',
      detail: acoustic ? 'The top, back, sides and enclosed air interact to radiate sound. The body stays as an anchor in this virtual assembly.'
        : 'A solid-body guitar does not rely on a large resonating air cavity. Its outline, wood and neck joint vary widely.' },
    ...(acoustic ? [
      { id: 'soundboard' as const, name: 'Soundboard', assembly: 'soundboard' as const,
        function: 'The thin top vibrates when string energy arrives through the bridge.',
        detail: classical ? 'Nylon strings drive a lightly built top. Fan bracing is common, but lattice and other patterns also exist; the braces here are illustrative.'
          : 'Steel-string tension is carried by the bridge, top and its internal bracing. X-bracing is common, not universal; this is a simplified cutaway.' },
      { id: 'soundhole' as const, name: 'Soundhole & rosette', assembly: 'soundboard' as const,
        function: 'The opening couples the body’s air resonance to the surrounding air.',
        detail: 'The top also radiates sound: it does not all “come out of the hole.” The rosette decorates and can reinforce the opening. An opening is not a detachable object; it moves with the top here.' },
    ] : []),
    ...commonParts,
    { id: 'headstock', name: classical ? 'Slotted headstock' : 'Headstock', assembly: 'neck',
      function: 'Carries the tuners beyond the nut.',
      detail: classical ? 'This representative classical guitar has two open slots with three rollers on each side. Not all nylon-string instruments have slotted headstocks.'
        : kind === 'steel' ? 'This example uses three tuners per side. Steel-string guitars may also use slotted or other headstock layouts.'
          : 'This example uses six tuners in a row. Three-per-side, headless and other electric designs also exist.' },
    { id: 'tuners', name: classical ? 'Roller tuners' : 'Tuning machines', assembly: 'tuners',
      function: 'Wind the strings to adjust tension and pitch.',
      detail: classical ? 'The strings wrap around rollers crossing the headstock slots. Side-mounted gears turn the rollers.'
        : 'Geared mechanisms rotate the string posts. Tuner arrangement and locking features differ by instrument.' },
    { id: 'bridge', name: classical ? 'Tie-block bridge' : kind === 'steel' ? 'Pin bridge' : 'Fixed bridge', assembly: 'bridge',
      function: acoustic ? 'Anchors the strings and transfers their vibration into the top.' : 'Anchors the strings and carries the individual saddles.',
      detail: classical ? 'Nylon strings are typically tied at the tie block behind the saddle. This is not a steel-string pin bridge; some designs use other anchoring methods.'
        : kind === 'steel' ? 'In this pin-bridge example, ball ends bear against the bridge plate inside the body. Pins locate the strings; pinless steel-string bridges also exist.'
          : 'This model uses a fixed bridge. Tremolo systems, separate tailpieces and through-body stringing are other common arrangements.' },
    { id: 'saddle', name: acoustic ? 'Saddle' : 'Individual saddles', assembly: 'bridge',
      function: 'Defines the bridge end of each string’s vibrating length.',
      detail: acoustic ? 'The pale strip seated in the bridge supports the strings and helps set action and intonation. It is a different part from the wooden bridge.'
        : 'Separate saddles allow string-length and height adjustment on this design. Adjustment methods differ between bridge types.' },
    { id: 'strings', name: classical ? 'Nylon-family strings' : 'Steel strings', assembly: 'strings',
      function: 'Vibrate to produce musical pitches when plucked or strummed.',
      detail: classical ? 'Classical sets typically use nylon or fluorocarbon trebles and metal-wound synthetic-core basses. Never substitute a steel-string set unless the maker explicitly allows it.'
        : kind === 'steel' ? 'A typical set has plain steel trebles and metal-wound steel-core basses. The strings shown are schematic; gauges and alloys vary.'
          : 'Magnetic pickups sense suitable ferromagnetic string material. Plain steel trebles and nickel or steel-wound basses are common.' },
    ...(!acoustic ? [
      { id: 'pickups' as const, name: 'Magnetic pickups', assembly: 'electronics' as const,
        function: 'Convert changes in a vibrating string’s magnetic field into an electrical signal.',
        detail: 'These two representative single-coil-style units feed an amplifier through the controls. Humbuckers, piezo systems and other arrangements also exist.' },
      { id: 'controls' as const, name: 'Controls & output', assembly: 'electronics' as const,
        function: 'Select or shape the pickup signal and send it to an amplifier.',
        detail: 'This example has a selector, volume, tone and an output jack. Passive tone controls filter the signal; these virtual controls identify parts rather than alter the audio preview.' },
    ] : []),
  ];
}

export const GUITAR_MODELS: Readonly<Record<GuitarKind, GuitarModel>> = {
  steel: { id: 'steel', name: 'Steel-string acoustic', description: 'A broad-shouldered, hollow-body guitar with a pin bridge and steel strings.',
    construction: 'Representative flat-top acoustic · 14-fret neck joint · three tuners per side',
    parts: parts('steel'), assemblies: assemblies(true), nutY: 5.75, scaleLength: 7.6, nutWidth: .53, bodyDepth: 1.38, frets: 20, topColor: '#d8b883' },
  classical: { id: 'classical', name: 'Classical', description: 'A rounded acoustic body, wider neck, slotted headstock and nylon-family strings.',
    construction: 'Representative classical guitar · 12-fret neck joint · tie-block bridge',
    parts: parts('classical'), assemblies: assemblies(true), nutY: 5.25, scaleLength: 7.1, nutWidth: .59, bodyDepth: 1.05, frets: 19, topColor: '#bd8b4e' },
  electric: { id: 'electric', name: 'Solid-body electric', description: 'A sculpted double-cutaway body with magnetic pickups and a fixed bridge.',
    construction: 'Representative electric guitar · six-in-line tuners · two pickups',
    parts: parts('electric'), assemblies: assemblies(false), nutY: 5.75, scaleLength: 7.6, nutWidth: .51, bodyDepth: .52, frets: 22, topColor: '#1f6c70' },
};

// Shared original Bézier outlines, in model units, keep the SVG and sculpted model consistent.
export type GuitarCurve = readonly [number, number, number, number, number, number];
export const GUITAR_OUTLINES: Readonly<Record<GuitarKind, readonly GuitarCurve[]>> = {
  steel: [
    [.75, 1.5, 1.82, 1.53, 1.88, .65], [1.93, .15, 1.61, -.45, 1.57, -.92],
    [1.55, -1.49, 2.19, -1.92, 2.22, -2.79], [2.26, -3.8, 1.1, -4.15, 0, -4.15],
    [-1.1, -4.15, -2.26, -3.8, -2.22, -2.79], [-2.19, -1.92, -1.55, -1.49, -1.57, -.92],
    [-1.61, -.45, -1.93, .15, -1.88, .65], [-1.82, 1.53, -.75, 1.5, 0, 1.5],
  ],
  classical: [
    [.68, 1.5, 1.7, 1.38, 1.74, .48], [1.78, -.04, 1.17, -.56, 1.19, -1.02],
    [1.2, -1.6, 2.1, -1.95, 2.13, -2.82], [2.16, -3.76, 1.12, -4.05, 0, -4.05],
    [-1.12, -4.05, -2.16, -3.76, -2.13, -2.82], [-2.1, -1.95, -1.2, -1.6, -1.19, -1.02],
    [-1.17, -.56, -1.78, -.04, -1.74, .48], [-1.7, 1.38, -.68, 1.5, 0, 1.5],
  ],
  electric: [
    [.45, 1.5, .53, .72, .92, .75], [1.38, .82, 1.06, 2.02, 1.6, 1.72],
    [2.15, 1.4, 1.3, -.1, 1.48, -.9], [1.64, -1.5, 2.15, -2.15, 1.95, -3.05],
    [1.72, -3.95, .8, -4.08, 0, -4.05], [-1.3, -4.15, -2.1, -3.5, -2.0, -2.5],
    [-1.95, -1.25, -1.25, -.65, -1.6, .3], [-1.9, 1.25, -1.65, 2.6, -1.15, 2.05],
    [-.8, 1.68, -.85, .62, -.45, .76], [-.18, .87, -.35, 1.5, 0, 1.5],
  ],
};

export function guitarOutlinePath(kind: GuitarKind): string {
  return `M 0 1.5 ${GUITAR_OUTLINES[kind].map(curve => `C ${curve.join(' ')}`).join(' ')} Z`;
}

/** Camera presets for the 3D lab; kept here so the 2D UI can list them without loading Three.js. */
export type GuitarLabView = 'three-quarter' | 'front' | 'back' | 'side' | 'headstock' | 'bridge';
export const GUITAR_LAB_VIEWS: Readonly<Record<GuitarLabView, string>> = {
  'three-quarter': 'Three-quarter', front: 'Front', back: 'Back & sides', side: 'Side profile',
  headstock: 'Headstock close-up', bridge: 'Bridge close-up',
};

export interface GuitarLabState {
  readonly kind: GuitarKind;
  readonly selected: GuitarPartId;
  readonly detached: readonly GuitarAssemblyId[];
  readonly exploded: boolean;
}
export type GuitarLabAction = { type: 'select'; part: GuitarPartId } | { type: 'explode'; value: boolean }
  | { type: 'detach'; assembly: GuitarAssemblyId } | { type: 'attach'; assembly: GuitarAssemblyId }
  | { type: 'detach-all' } | { type: 'reassemble' };

export function createGuitarLabState(kind: GuitarKind = 'steel'): GuitarLabState {
  return { kind, selected: kind === 'electric' ? 'body' : 'soundboard', detached: [], exploded: false };
}

/** Logical teaching relationships, not a physical teardown sequence. The body is a fixed anchor. */
export function transitionGuitarLab(state: GuitarLabState, action: GuitarLabAction): GuitarLabState {
  const model = GUITAR_MODELS[state.kind];
  if (action.type === 'select') return model.parts.some(p => p.id === action.part) ? { ...state, selected: action.part } : state;
  if (action.type === 'explode') return { ...state, exploded: action.value };
  if (action.type === 'reassemble') return { ...state, detached: [], exploded: false };
  if (action.type === 'detach-all') return { ...state, detached: model.assemblies.filter(a => a.id !== 'body').map(a => a.id) };
  if (action.assembly === 'body' || !model.assemblies.some(a => a.id === action.assembly)) return state;
  const detached = new Set(state.detached);
  if (action.type === 'detach') {
    detached.add(action.assembly);
    // Propagate to dependent teaching groups, independent of array ordering.
    let changed = true;
    while (changed) {
      changed = false;
      for (const assembly of model.assemblies) {
        if (!detached.has(assembly.id) && assembly.requires.some(id => detached.has(id))) {
          detached.add(assembly.id); changed = true;
        }
      }
    }
  } else {
    const attach = (id: GuitarAssemblyId) => {
      model.assemblies.find(a => a.id === id)?.requires.forEach(attach);
      detached.delete(id);
    };
    attach(action.assembly);
  }
  return { ...state, detached: model.assemblies.filter(a => detached.has(a.id)).map(a => a.id) };
}

export function guitarAssemblyOffset(state: GuitarLabState, assembly: GuitarAssemblyId): readonly [number, number, number] {
  const base = GUITAR_MODELS[state.kind].assemblies.find(a => a.id === assembly)?.offset ?? [0, 0, 0];
  const amount = state.detached.includes(assembly) ? 1.4 : state.exploded ? 1 : 0;
  return [base[0] * amount, base[1] * amount, base[2] * amount];
}

export function guitarAssemblyProgress(state: GuitarLabState): { attached: number; total: number } {
  const total = GUITAR_MODELS[state.kind].assemblies.length;
  const detached = GUITAR_MODELS[state.kind].assemblies.filter(a => state.detached.includes(a.id)).length;
  return { attached: total - detached, total };
}

export function guitarFretY(kind: GuitarKind, fret: number): number {
  const model = GUITAR_MODELS[kind];
  return model.nutY - model.scaleLength * (1 - 2 ** (-fret / 12));
}
