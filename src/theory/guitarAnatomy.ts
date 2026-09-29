export type GuitarKind = 'steel' | 'classical' | 'electric';
export type GuitarPartId = 'back' | 'sides' | 'bracing' | 'soundboard' | 'soundhole' | 'binding' | 'pickguard' | 'strapPins'
  | 'body' | 'neckPlate' | 'neck' | 'fretboard' | 'frets' | 'nut' | 'headstock' | 'tuners'
  | 'bridge' | 'saddle' | 'pins' | 'neckPickup' | 'bridgePickup' | 'controls' | 'selector' | 'jack' | 'strings';
export type GuitarAssemblyId = 'body' | 'back' | 'bracing' | 'soundboard' | 'pickguard' | 'neckPlate' | 'neck' | 'fretboard'
  | 'nut' | 'tuners' | 'bridge' | 'electronics' | 'strings';
export type GuitarPartGroup = 'Body' | 'Neck' | 'Headstock' | 'Electronics' | 'Bridge' | 'Strings';

/** One component: `spec` is its material or specification line; `info` explains what it does and why it matters. */
export interface GuitarPart {
  id: GuitarPartId;
  name: string;
  assembly: GuitarAssemblyId;
  group: GuitarPartGroup;
  spec: string;
  info: string;
}
/** A group of parts that moves together. `order` is the build sequence; 0 is the fixed anchor. */
export interface GuitarAssembly {
  id: GuitarAssemblyId;
  name: string;
  order: number;
  offset: readonly [number, number, number];
}
export interface GuitarModel {
  id: GuitarKind;
  name: string;
  description: string;
  construction: string;
  parts: readonly GuitarPart[];
  assemblies: readonly GuitarAssembly[];
  /** Representative specification, as label/value pairs. */
  specs: readonly (readonly [string, string])[];
  nutY: number;
  scaleLength: number;
  nutWidth: number;
  bodyDepth: number;
  frets: number;
  topColor: string;
}

export const GUITAR_LAB_CAVEAT = 'Virtual learning model, not a maintenance or disassembly guide. '
  + 'Soundboards, braces, bridges and many neck joints are glued: separating them here is an educational cutaway. '
  + 'Real construction varies by maker and model; do not take an instrument apart using this view.';
export const GUITAR_PART_GROUPS: readonly GuitarPartGroup[] = ['Body', 'Neck', 'Headstock', 'Electronics', 'Bridge', 'Strings'];

const part = (id: GuitarPartId, name: string, assembly: GuitarAssemblyId, group: GuitarPartGroup, spec: string, info: string): GuitarPart =>
  ({ id, name, assembly, group, spec, info });
const FRET_MATH = 'Metal wires pressed into slots across the board. Their spacing follows the twelfth root of two, so each fret raises the pitch by exactly one semitone and the 12th fret halves the string: one octave.';
const BINDING = 'Binding caps the exposed end grain where the top and back meet the sides, protecting the most vulnerable edges and sealing the joints. The thin purfling lines beside it are mostly decorative.';

// Explanations adapted from the project owner's Atelier viewer and extended to the three instruments modelled here.
const STEEL_PARTS: GuitarPart[] = [
  part('back', 'Back', 'back', 'Body', 'Two-piece bookmatched rosewood',
    'Two halves cut from one board and opened like a book, joined by a centre strip and braced across the grain. Stiffer and heavier than the top, the back radiates less and reflects more, colouring the tone and projection.'),
  part('sides', 'Sides & rim', 'body', 'Body', 'Solid rosewood, heat-bent',
    'Two thin strips bent with heat and joined at the neck and tail blocks. Their depth sets the air volume inside the body, which tunes its lowest resonance; kerfed linings inside give the top and back a wide glue surface.'),
  part('bracing', 'X-bracing', 'bracing', 'Body', 'Scalloped spruce X-brace',
    'Two main braces glued under the top cross between the soundhole and the bridge. They stop steel-string tension from pulling the top out of shape while leaving it free to vibrate; thinning them (scalloping) trades stiffness for a livelier, bassier voice.'),
  part('soundboard', 'Soundboard', 'soundboard', 'Body', 'Solid Sitka spruce, about 2.8 mm',
    'The loudspeaker of the guitar. String energy arrives through the bridge and this thin plate turns it into moving air. Its grain runs along the strings, where the top needs the most stiffness.'),
  part('soundhole', 'Soundhole & rosette', 'soundboard', 'Body', 'About 100 mm opening, inlaid rings',
    'The opening lets the air inside the body move in and out, tuning the body\u2019s lowest resonance. The rosette rings reinforce the edge of the cut and decorate it. Most of the sound still comes from the vibrating top, not out of the hole.'),
  part('binding', 'Binding & purfling', 'soundboard', 'Body', 'Cream binding, black-and-white purfling', BINDING),
  part('pickguard', 'Pickguard', 'pickguard', 'Body', 'Thin tortoise-pattern sheet',
    'Purely protective. It takes the pick strokes that would otherwise wear through the finish and into the soft spruce beside the soundhole.'),
  part('strapPins', 'End pin & strap button', 'body', 'Body', 'Tail end pin, heel strap button',
    'Anchors for a strap. The end pin sits in the tail block, the strongest point at the bottom of the body; on many electro-acoustics it also houses the output jack.'),
  part('neck', 'Neck', 'neck', 'Neck', 'Mahogany, glued at the 14th fret',
    'Carved with its heel from one piece and glued to the body at the 14th fret. A steel truss rod inside counters the pull of the strings; because the joint is glued, resetting a neck is a workshop job.'),
  part('fretboard', 'Fretboard', 'fretboard', 'Neck', 'Ebony, 20 frets, pearl dots',
    'The dense hardwood playing surface glued to the neck. Pressing a string just behind a fret shortens its vibrating length. Dots mark frets 3, 5, 7, 9, 15, 17 and 19, and a double dot marks the octave at the 12th fret.'),
  part('frets', 'Frets', 'fretboard', 'Neck', '20 nickel-silver wires', FRET_MATH),
  part('nut', 'Nut', 'nut', 'Neck', 'Bone, 44.5 mm wide',
    'Six slots, each filed to its string\u2019s gauge, space the strings and end their open length. How deep the slots are cut is one of the biggest factors in how easy the first frets feel to play.'),
  part('headstock', 'Headstock', 'neck', 'Headstock', 'Rosewood face, angled back',
    'Angled back behind the nut so the strings press firmly down into the nut slots. That downward pressure keeps open strings from buzzing and gives them a clear, solid tone.'),
  part('tuners', 'Tuning machines', 'tuners', 'Headstock', 'Sealed, 18:1, three per side',
    'An 18:1 gear means eighteen turns of the button for one turn of the post. That reduction lets you land exactly on pitch instead of overshooting it, and the worm gear holds the string there.'),
  part('bridge', 'Bridge', 'bridge', 'Bridge', 'Ebony belly bridge, glued to the top',
    'Glued to the soundboard, it anchors the strings and passes their vibration into the top. Its size and mass shape the tone: too heavy and the top responds less.'),
  part('saddle', 'Saddle', 'bridge', 'Bridge', 'Bone, compensated',
    'Sets the far end of every string\u2019s vibrating length. It is slanted so the bass strings are slightly longer, compensating for the way pressing a thicker string stretches it sharp.'),
  part('pins', 'Bridge pins', 'bridge', 'Bridge', 'Six tapered pins',
    'Each pin wedges a string\u2019s ball end against the bridge plate inside the body. The pins only locate the strings; the bridge plate takes the load.'),
  part('strings', 'Strings', 'strings', 'Strings', 'Phosphor bronze, .012\u2013.053',
    'Plain steel trebles and bronze-wound basses. Together they pull roughly 75 kg along the top, and every brace and joint in the guitar exists to resist that load for decades.'),
];

const CLASSICAL_PARTS: GuitarPart[] = [
  part('back', 'Back', 'back', 'Body', 'Two-piece bookmatched rosewood',
    'Two bookmatched halves joined at the centre and crossed by a few light braces. The back reflects sound energy forward and adds its own colour to the tone.'),
  part('sides', 'Sides & rim', 'body', 'Body', 'Solid rosewood, heat-bent',
    'Bent with heat and joined at the neck and tail. A classical body is a little shallower than most steel-string bodies, and its air volume tunes the lowest resonance.'),
  part('bracing', 'Fan bracing', 'bracing', 'Body', 'Spruce fan struts',
    'Thin struts fan out below the soundhole, a pattern popularised by Antonio de Torres in the 1800s. Nylon strings pull far less than steel, so the top needs only light bracing and can vibrate freely.'),
  part('soundboard', 'Soundboard', 'soundboard', 'Body', 'Solid cedar, about 2.5 mm',
    'Cedar is lighter and a little less stiff than spruce, so a classical top can be thin and responsive, with a warm, quick voice. The low tension of nylon strings makes such a light build possible.'),
  part('soundhole', 'Soundhole & rosette', 'soundboard', 'Body', 'Mosaic of small wood tiles',
    'Classical rosettes are built from tiny coloured wood strips glued into patterned blocks, sliced into tiles and inlaid around the opening. The opening tunes the body\u2019s air resonance; the vibrating top makes most of the sound.'),
  part('binding', 'Binding & purfling', 'soundboard', 'Body', 'Wood binding with purfling lines', BINDING),
  part('neck', 'Neck', 'neck', 'Neck', 'Mahogany, joined at the 12th fret',
    'Joins the body at the 12th fret. Traditional Spanish construction builds the heel into the body, and many classical necks have no adjustable truss rod because nylon strings pull far less than steel.'),
  part('fretboard', 'Fretboard', 'fretboard', 'Neck', 'Rosewood, flat, 19 frets',
    'Wide and flat to suit finger-style playing across widely spaced strings. Classical fingerboards traditionally have no position dots on their face.'),
  part('frets', 'Frets', 'fretboard', 'Neck', '19 nickel-silver wires', FRET_MATH),
  part('nut', 'Nut', 'nut', 'Neck', 'Bone, 52 mm wide',
    'Wider than a steel-string nut, it spaces the strings further apart so the picking-hand fingers have room. Its slots also set how high the strings sit over the first frets.'),
  part('headstock', 'Slotted headstock', 'neck', 'Headstock', 'Two slots, angled back',
    'The strings pass through the slots and wrap around rollers, then run over the nut at a steep angle. That angle presses them firmly into the nut so the open strings ring clearly.'),
  part('tuners', 'Roller tuners', 'tuners', 'Headstock', 'Three machines on each side plate',
    'Each button turns a worm gear that rotates a roller spanning the slot. Nylon stretches a lot, so new strings need many turns and a day or two before they hold their pitch.'),
  part('bridge', 'Tie-block bridge', 'bridge', 'Bridge', 'Rosewood, glued to the top',
    'Nylon strings have no ball ends: each string passes through a hole in the tie block, loops back and is knotted on itself. The bridge is glued to the top and carries the string load into it.'),
  part('saddle', 'Saddle', 'bridge', 'Bridge', 'Bone, nearly straight',
    'Sets the far end of each string\u2019s vibrating length. Classical saddles are usually close to straight, because nylon strings need less compensation than steel.'),
  part('strings', 'Nylon strings', 'strings', 'Strings', 'Nylon trebles, wound basses',
    'Three plain nylon trebles and three basses of fine metal wire wound over a nylon core. Their total tension is roughly half that of a steel set: never fit steel strings to a classical guitar.'),
];

const ELECTRIC_PARTS: GuitarPart[] = [
  part('body', 'Body', 'body', 'Body', 'Two-piece alder, 44 mm',
    'A solid slab does very little acoustically, and that is the point: with no top to move, the strings sustain longer and the pickups hear them rather than the room.'),
  part('neckPlate', 'Neck plate', 'neckPlate', 'Body', 'Chrome, four screws',
    'Four screws through a steel plate pull the neck tight into its pocket. Unglamorous and very serviceable: a bolt-on neck can be removed, adjusted or replaced in minutes.'),
  part('pickguard', 'Pickguard', 'pickguard', 'Body', 'Three-ply, screw-mounted',
    'Covers the routed cavities for the pickups and wiring and protects the finish. On many electrics the pickups are mounted to it, so the electronics lift out as one assembly.'),
  part('strapPins', 'Strap buttons', 'body', 'Body', 'Two steel buttons',
    'Two screws carry the whole weight of the instrument on a strap. Where they sit decides whether the guitar hangs level or tips toward the headstock.'),
  part('neck', 'Neck', 'neck', 'Neck', 'Maple, bolt-on',
    'Maple is hard and stable. The neck sits in a pocket routed into the body and is bolted rather than glued, one of the most serviceable joints on any guitar; a truss rod inside counters the strings\u2019 pull.'),
  part('fretboard', 'Fretboard', 'fretboard', 'Neck', 'Rosewood, 22 frets, dot inlays',
    'A separate rosewood board glued to the maple neck. Dots mark frets 3, 5, 7, 9, 15, 17, 19 and 21, with a double dot at the 12th-fret octave.'),
  part('frets', 'Frets', 'fretboard', 'Neck', '22 nickel-silver wires', FRET_MATH),
  part('nut', 'Nut', 'nut', 'Neck', 'Bone, 42 mm wide',
    'The open strings end here. Cut a slot a hair too deep and the string buzzes on the first fret; too shallow and the first frets play sharp and feel stiff.'),
  part('headstock', 'Headstock', 'neck', 'Headstock', 'Flat, six in line',
    'Six tuners in a line let every string run straight from its nut slot to its post. Because the headstock is flat rather than angled back, many guitars add string trees to hold the thinner strings down in the nut.'),
  part('tuners', 'Tuning machines', 'tuners', 'Headstock', 'Six in line, geared',
    'Each button turns a small worm gear, so many turns of the button make one turn of the post. The gearing gives fine control and holds the string at pitch.'),
  part('neckPickup', 'Neck pickup', 'electronics', 'Electronics', 'Single coil',
    'Thousands of turns of fine copper wire around six magnetic pole pieces. A steel string vibrating above it disturbs the magnetic field and induces a small voltage. Near the neck the strings swing widest, so this position sounds warm and round.'),
  part('bridgePickup', 'Bridge pickup', 'electronics', 'Electronics', 'Single coil',
    'Close to the bridge the strings move less, and the pickup hears more of their upper harmonics, so it sounds brighter and tighter. It is the usual choice for cutting lead lines.'),
  part('controls', 'Volume & tone', 'electronics', 'Electronics', 'Two knobs',
    'The volume knob turns down the pickup signal; the tone knob rolls off treble through a capacitor, which is why turning it only ever darkens the sound.'),
  part('selector', 'Pickup selector', 'electronics', 'Electronics', 'Three-way switch',
    'Chooses the neck pickup, the bridge pickup, or both together. With both on, the two signals combine into a fuller, in-between sound.'),
  part('jack', 'Output jack', 'electronics', 'Electronics', '\u00bc-inch mono socket',
    'Everything the pickups produce leaves the guitar through this one socket and a cable to the amplifier. The quarter-inch plug has been standard for decades.'),
  part('bridge', 'Fixed bridge', 'bridge', 'Bridge', 'Steel plate, no vibrato arm',
    'Screwed flat to the body with no vibrato arm, so the tuning stays stable. The strings anchor at its back edge and pass forward over the saddles.'),
  part('saddle', 'Saddles', 'bridge', 'Bridge', 'Six, individually adjustable',
    'Each string has its own saddle. Moving it forward or back sets intonation, and raising or lowering it sets the string height (action).'),
  part('strings', 'Strings', 'strings', 'Strings', 'Nickel-plated steel, .010\u2013.046',
    'They must be steel: a magnetic pickup only senses strings it can magnetise. A nylon string moving past a pickup produces no signal at all.'),
];

// Offsets are in model units at full disassembly; order is the build sequence (disassembly runs in reverse).
const acousticAssemblies = (classical: boolean): GuitarAssembly[] => [
  { id: 'body', name: 'Rim & sides', order: 0, offset: [0, 0, 0] },
  { id: 'back', name: 'Back', order: 1, offset: [2.05, -.5, -1.9] },
  { id: 'bracing', name: classical ? 'Fan bracing' : 'X-bracing', order: 2, offset: [-1.1, -.15, .85] },
  { id: 'soundboard', name: 'Soundboard & rosette', order: 3, offset: [-2.25, -.25, 1.7] },
  { id: 'neck', name: 'Neck & headstock', order: 4, offset: [0, 1.2, -.6] },
  { id: 'fretboard', name: 'Fretboard & frets', order: 5, offset: [1.4, .75, .95] },
  { id: 'bridge', name: classical ? 'Bridge & saddle' : 'Bridge, saddle & pins', order: 6, offset: [-2.4, -1.45, 2.7] },
  ...(classical ? [] : [{ id: 'pickguard' as const, name: 'Pickguard', order: 7, offset: [1.95, -.95, 1.9] as const }]),
  { id: 'nut', name: 'Nut', order: 8, offset: [1.7, 1.2, 1.6] },
  { id: 'tuners', name: 'Tuning machines', order: 9, offset: [-1.6, 1, .8] },
  { id: 'strings', name: 'Strings', order: 10, offset: [2.65, .1, 2] },
];
const electricAssemblies: GuitarAssembly[] = [
  { id: 'body', name: 'Body', order: 0, offset: [0, 0, 0] },
  { id: 'neck', name: 'Neck & headstock', order: 1, offset: [0, 1.2, -.6] },
  { id: 'neckPlate', name: 'Neck plate', order: 2, offset: [.45, .35, -1.7] },
  { id: 'fretboard', name: 'Fretboard & frets', order: 3, offset: [1.4, .75, .95] },
  { id: 'nut', name: 'Nut', order: 4, offset: [1.7, 1.2, 1.6] },
  { id: 'pickguard', name: 'Pickguard', order: 5, offset: [-1.05, .1, .65] },
  { id: 'electronics', name: 'Pickups & controls', order: 6, offset: [-2.15, .25, 1.3] },
  { id: 'bridge', name: 'Bridge & saddles', order: 7, offset: [-1.65, -.6, 1.5] },
  { id: 'tuners', name: 'Tuning machines', order: 8, offset: [-1.6, 1, .8] },
  { id: 'strings', name: 'Strings', order: 9, offset: [2.65, .1, 2] },
];

export const GUITAR_MODELS: Readonly<Record<GuitarKind, GuitarModel>> = {
  steel: {
    id: 'steel', name: 'Steel-string acoustic', description: 'A broad-shouldered, hollow-body guitar with a pin bridge and steel strings.',
    construction: 'Representative dreadnought-style flat top \u00b7 14-fret neck joint \u00b7 three tuners per side',
    parts: STEEL_PARTS, assemblies: acousticAssemblies(false),
    specs: [['Body', 'Dreadnought-style flat top'], ['Scale length', '645 mm (25.4 in)'], ['Top', 'Solid Sitka spruce, X-braced'],
      ['Back & sides', 'Solid rosewood'], ['Neck', 'Mahogany, glued at the 14th fret'], ['Fingerboard', 'Ebony, 20 frets'],
      ['Nut width', '44.5 mm (1\u00be in)'], ['Strings', 'Phosphor bronze, .012\u2013.053']],
    nutY: 5.75, scaleLength: 7.6, nutWidth: .53, bodyDepth: 1.38, frets: 20, topColor: '#d8b883',
  },
  classical: {
    id: 'classical', name: 'Classical', description: 'A rounded acoustic body, wider neck, slotted headstock and nylon-family strings.',
    construction: 'Representative classical guitar \u00b7 12-fret neck joint \u00b7 tie-block bridge',
    parts: CLASSICAL_PARTS, assemblies: acousticAssemblies(true),
    specs: [['Body', 'Traditional classical'], ['Scale length', '650 mm (25.6 in)'], ['Top', 'Solid cedar, fan-braced'],
      ['Back & sides', 'Solid rosewood'], ['Neck', 'Mahogany, joined at the 12th fret'], ['Fingerboard', 'Rosewood, flat, 19 frets'],
      ['Nut width', '52 mm (2 in)'], ['Strings', 'Nylon trebles, wound basses']],
    nutY: 5.25, scaleLength: 7.1, nutWidth: .59, bodyDepth: 1.05, frets: 19, topColor: '#bd8b4e',
  },
  electric: {
    id: 'electric', name: 'Solid-body electric', description: 'A sculpted double-cutaway body with magnetic pickups and a fixed bridge.',
    construction: 'Representative electric guitar \u00b7 six-in-line tuners \u00b7 two pickups',
    parts: ELECTRIC_PARTS, assemblies: electricAssemblies,
    specs: [['Body', 'Solid alder, double cutaway'], ['Scale length', '648 mm (25.5 in)'], ['Neck', 'Maple, bolt-on'],
      ['Fingerboard', 'Rosewood, 22 frets'], ['Pickups', '2 \u00d7 single coil'], ['Bridge', 'Fixed, six adjustable saddles'],
      ['Nut width', '42 mm'], ['Strings', 'Nickel-plated steel, .010\u2013.046']],
    nutY: 5.75, scaleLength: 7.6, nutWidth: .51, bodyDepth: .52, frets: 22, topColor: '#1f6c70',
  },
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

/** `explode` is 0 (assembled) to 1 (fully apart); `selected` is the isolated part, if any. */
export interface GuitarLabState {
  readonly kind: GuitarKind;
  readonly selected: GuitarPartId | null;
  readonly explode: number;
}

export function createGuitarLabState(kind: GuitarKind = 'steel'): GuitarLabState {
  return { kind, selected: null, explode: 0 };
}

export function selectGuitarPart(state: GuitarLabState, id: GuitarPartId | null): GuitarLabState {
  if (id !== null && !GUITAR_MODELS[state.kind].parts.some(p => p.id === id)) return state;
  return id === state.selected ? state : { ...state, selected: id };
}

export function setGuitarExplode(state: GuitarLabState, value: number): GuitarLabState {
  const explode = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : state.explode;
  return explode === state.explode ? state : { ...state, explode };
}

export function guitarPart(kind: GuitarKind, id: GuitarPartId | null): GuitarPart | undefined {
  return id === null ? undefined : GUITAR_MODELS[kind].parts.find(p => p.id === id);
}

/** Share of the timeline over which neighbouring assemblies move together. */
export const EXPLODE_OVERLAP = .72;
export const easeInOutCubic = (t: number): number => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Disassembly order: the last assembly built comes off first; the fixed anchor never moves. */
export function guitarDisassemblyOrder(kind: GuitarKind): GuitarAssemblyId[] {
  return GUITAR_MODELS[kind].assemblies.filter(a => a.order > 0).sort((a, b) => b.order - a.order).map(a => a.id);
}

/** Eased 0–1 progress of one assembly at timeline position `t`, staggered by disassembly order. */
export function guitarAssemblyProgress(kind: GuitarKind, assembly: GuitarAssemblyId, t: number): number {
  const order = guitarDisassemblyOrder(kind), index = order.indexOf(assembly);
  if (index < 0) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)), count = order.length;
  const span = 1 / (count * (1 - EXPLODE_OVERLAP) + EXPLODE_OVERLAP), start = index * span * (1 - EXPLODE_OVERLAP);
  return easeInOutCubic(Math.min(1, Math.max(0, (clamped - start) / span)));
}

export function guitarAssemblyOffset(kind: GuitarKind, assembly: GuitarAssemblyId, t: number): readonly [number, number, number] {
  const offset = GUITAR_MODELS[kind].assemblies.find(a => a.id === assembly)?.offset ?? [0, 0, 0];
  const amount = guitarAssemblyProgress(kind, assembly, t);
  return [offset[0] * amount, offset[1] * amount, offset[2] * amount];
}

export function guitarFretY(kind: GuitarKind, fret: number): number {
  const model = GUITAR_MODELS[kind];
  return model.nutY - model.scaleLength * (1 - 2 ** (-fret / 12));
}
