import type { PercussionVoice } from './percussion';

export type GrooveLane = 'crash' | 'ride' | 'hatOpen' | 'hat' | 'hatFoot' | 'tom1' | 'tom2' | 'floorTom' | 'snare' | 'rim' | 'clap' | 'kick'
  | 'tambourine' | 'shaker' | 'cowbell' | 'claves' | 'woodblock' | 'agogoHigh' | 'agogoLow'
  | 'congaSlap' | 'congaOpen' | 'congaLow' | 'bongoHigh' | 'bongoLow' | 'cajonSnare' | 'cajonBass';
export type MixGroup = 'kick' | 'snare' | 'cymbals' | 'toms' | 'percussion';
export type GrooveSection = 'verse' | 'chorus';
/** Velocities per step; 0 is a rest. */
export type GrooveLanes = Partial<Record<GrooveLane, readonly number[]>>;

export const GROOVE_LANES: Readonly<Record<GrooveLane, { label: string; voice: PercussionVoice; group: MixGroup }>> = {
  crash: { label: 'Crash', voice: 'crash', group: 'cymbals' },
  ride: { label: 'Ride', voice: 'ride', group: 'cymbals' },
  hatOpen: { label: 'Open hat', voice: 'hihat_open', group: 'cymbals' },
  hat: { label: 'Hi-hat', voice: 'hihat', group: 'cymbals' },
  hatFoot: { label: 'Foot hat', voice: 'hihat_foot', group: 'cymbals' },
  tambourine: { label: 'Tambourine', voice: 'tambourine', group: 'percussion' },
  shaker: { label: 'Shaker', voice: 'shaker', group: 'percussion' },
  cowbell: { label: 'Cowbell', voice: 'cowbell', group: 'percussion' },
  agogoHigh: { label: 'Agogô hi', voice: 'agogo_high', group: 'percussion' },
  agogoLow: { label: 'Agogô lo', voice: 'agogo_low', group: 'percussion' },
  claves: { label: 'Claves', voice: 'claves', group: 'percussion' },
  woodblock: { label: 'Woodblock', voice: 'woodblock', group: 'percussion' },
  bongoHigh: { label: 'Bongo hi', voice: 'bongo_high', group: 'percussion' },
  bongoLow: { label: 'Bongo lo', voice: 'bongo_low', group: 'percussion' },
  congaSlap: { label: 'Conga slap', voice: 'conga_slap', group: 'percussion' },
  congaOpen: { label: 'Conga', voice: 'conga_open', group: 'percussion' },
  congaLow: { label: 'Tumba', voice: 'conga_low', group: 'percussion' },
  tom1: { label: 'High tom', voice: 'tom1', group: 'toms' },
  tom2: { label: 'Low tom', voice: 'tom2', group: 'toms' },
  floorTom: { label: 'Floor tom', voice: 'floor_tom', group: 'toms' },
  clap: { label: 'Claps', voice: 'clap', group: 'snare' },
  rim: { label: 'Cross-stick', voice: 'rim', group: 'snare' },
  snare: { label: 'Snare', voice: 'snare', group: 'snare' },
  cajonSnare: { label: 'Cajón slap', voice: 'cajon_snare', group: 'snare' },
  cajonBass: { label: 'Cajón bass', voice: 'cajon_bass', group: 'kick' },
  kick: { label: 'Kick', voice: 'kick', group: 'kick' },
};
/** Top-to-bottom display order: cymbals, percussion, toms, snare family, low drums. */
export const LANE_ORDER = Object.keys(GROOVE_LANES) as GrooveLane[];
export const MIX_GROUPS: Readonly<Record<MixGroup, string>> = {
  kick: 'Kick & bass', snare: 'Snare & claps', cymbals: 'Hi-hat & cymbals', toms: 'Toms', percussion: 'Hand percussion',
};
/** X accent · x normal · v soft · g ghost · . rest. Spaces and | only aid reading. */
export const STROKE_LEVELS: Readonly<Record<string, number>> = { X: 1, x: .8, v: .55, g: .3, '.': 0 };
export const COUNT_IN_VOICE: PercussionVoice = 'claves';

type LaneText = Partial<Record<GrooveLane, string>>;
interface GrooveSource {
  id: string; name: string; style: string; description: string; tip: string;
  meter: '4/4' | '3/4' | '6/8' | '12/8'; beatsPerBar: number; stepsPerBeat: 3 | 4; bars?: 1 | 2;
  tempo: readonly [min: number, preset: number, max: number];
  swingUnit?: 8 | 16; swing?: number;
  main: LaneText; chorus?: LaneText; fill?: LaneText;
}
export interface DrumGroove {
  readonly id: string; readonly name: string; readonly style: string; readonly description: string; readonly tip: string;
  readonly meter: GrooveSource['meter']; readonly beatsPerBar: number; readonly stepsPerBeat: number; readonly bars: number;
  readonly stepsPerBar: number; readonly tempo: GrooveSource['tempo'];
  /** Straight grids can swing; triplet grids already carry their swing. */
  readonly swingUnit: 8 | 16 | null; readonly swing: number;
  readonly beatUnit: 'quarter' | 'dotted quarter';
  readonly kitGroove: boolean;
  readonly main: GrooveLanes; readonly chorus: GrooveLanes; readonly fill: GrooveLanes;
  readonly loop?: boolean;
}

const SOURCES: readonly GrooveSource[] = [
  { id: 'rock', name: 'Straight eighths', style: 'Rock & pop', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [70, 100, 160],
    description: 'Eighth-note hi-hat with the snare on 2 and 4: the backbone of countless rock and pop songs.',
    tip: 'Strum down on each hi-hat stroke and land chord changes with the kick on beat 1.',
    main: { hat: 'x.v. x.v. x.v. x.v.', snare: '.... X... .... X...', kick: 'X... .... X.x. ....' },
    chorus: { hatOpen: 'v... v... v... v...', hat: '..v. ..v. ..v. ..v.', snare: '.... X... .... X...', kick: 'X.x. .... X.x. ....' },
    fill: { hat: 'x.v. x.v. .... ....', snare: '.... X... Xvxv ....', tom1: '.... .... .... xx..', floorTom: '.... .... .... ..xX', kick: 'X... .... X... ....' } },
  { id: 'halftime', name: 'Half-time', style: 'Rock & pop', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [100, 140, 170],
    description: 'The snare moves to beat 3, so a fast tempo feels big and slow.',
    tip: 'Count the fast pulse but let chords ring for the whole half-time bar.',
    main: { hat: 'x.v. x.v. x.v. x.v.', snare: '.... .... X... ....', kick: 'X... ..x. .... ..x.' },
    chorus: { ride: 'x.v. x.v. x.v. x.v.', snare: '.... .... X... ....', kick: 'X... ..x. ..x. ....' } },
  { id: 'pop', name: 'Sixteenth hats', style: 'Rock & pop', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [70, 104, 140],
    description: 'Busy sixteenth-note hi-hat over a syncopated kick; bright modern pop.',
    tip: 'Keep your strumming hand moving in sixteenths; only touch the strings on the accents.',
    main: { hat: 'xgvg xgvg xgvg xgvg', snare: '.... X... .... X...', kick: 'X... ..x. X... ..x.' },
    chorus: { hat: 'xgvg xgvg xgvg xg..', hatOpen: '.... .... .... ..v.', snare: '.... X... .... X...', clap: '.... x... .... x...', kick: 'X... ..x. X.x. ..x.' },
    fill: { hat: 'xgvg xgvg .... ....', snare: '.... X... .... xvxX', tom1: '.... .... xx.. ....', tom2: '.... .... ..xx ....', kick: 'X... ..x. X... ....' } },
  { id: 'punk', name: 'Fast eighths', style: 'Rock & pop', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [140, 176, 210],
    description: 'Driving eighth notes for punk and fast rock.',
    tip: 'Use relaxed down-strokes or palm-muted power chords; stay behind the snare, not ahead of it.',
    main: { hat: 'x.x. x.x. x.x. x.x.', kick: 'X... ..x. X.x. ....', snare: '.... X... .... X...' } },
  { id: 'metal', name: 'Double kick', style: 'Rock & pop', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [110, 150, 190],
    description: 'Continuous sixteenth-note kick under a ride-bell pulse.',
    tip: 'Lock palm-muted riffs to the kick drum; start slower than you think.',
    main: { ride: 'X... X... X... X...', snare: '.... X... .... X...', kick: 'Xxxx Xxxx Xxxx Xxxx' },
    chorus: { crash: 'X... x... X... x...', snare: '.... X... .... X...', kick: 'Xxxx Xxxx Xxxx Xxxx' },
    fill: { snare: '.... X... xxxx ....', tom1: '.... .... .... xx..', floorTom: '.... .... .... ..xX', kick: 'Xxxx Xxxx Xxxx Xxxx' } },
  { id: 'ballad', name: 'Cross-stick ballad', style: 'Ballads', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [56, 72, 90],
    description: 'A soft cross-stick backbeat that leaves room for fingerpicking or open chords.',
    tip: 'Let each chord ring; change on the kick and keep the pick light.',
    main: { hat: 'x.v. x.v. x.v. x.v.', rim: '.... X... .... X...', kick: 'X... .... X.x. ....' },
    chorus: { ride: 'x.v. x.v. x.v. x.v.', snare: '.... X... .... X...', kick: 'X... ..x. X.x. ....' } },
  { id: 'ballad-68', name: '6/8 ballad', style: 'Ballads', meter: '6/8', beatsPerBar: 2, stepsPerBeat: 3, tempo: [40, 56, 76],
    description: 'Two lilting groups of three: the classic slow-song 6/8.',
    tip: 'Count “1-2-3 4-5-6”; a down-up-down pattern fits each group of three.',
    main: { hat: 'xvv xvv', kick: 'X.. ...', snare: '... X..' },
    chorus: { ride: 'xvv xvv', kick: 'X.. ..v', snare: '... X..' } },
  { id: 'waltz', name: 'Waltz', style: 'Ballads', meter: '3/4', beatsPerBar: 3, stepsPerBeat: 4, tempo: [70, 96, 150],
    description: 'Bass on one, lighter strokes on two and three.',
    tip: 'Play a bass note on 1, then strum on 2 and 3.',
    main: { kick: 'X... .... ....', rim: '.... x... x...', hat: 'x.v. x.v. x.v.' },
    chorus: { kick: 'X... .... ..v.', snare: '.... x... x...', ride: 'x.v. x.v. x.v.' } },
  { id: 'funk', name: 'Ghost-note funk', style: 'Funk, soul & dance', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [80, 96, 112], swingUnit: 16,
    description: 'Sixteenth-note hats, ghosted snare notes and a syncopated kick.',
    tip: 'Keep a constant sixteenth motion; mute the strings with your fretting hand between chord stabs.',
    main: { hat: 'xgvg xgvg xgvg xg.g', hatOpen: '.... .... .... ..v.', snare: '.... X..g .g.. X..g', kick: 'X.x. .... ..x. .x..' },
    chorus: { hat: 'xgvg xgvg xgvg xg.g', hatOpen: '.... .... .... ..v.', snare: '.g.. X..g .g.g X..g', clap: '.... x... .... x...', kick: 'X.x. ...x ..x. .x..' },
    fill: { hat: 'xgvg xgvg .... ....', snare: '.... X..g xgxg ....', tom1: '.... .... .... xx..', floorTom: '.... .... .... ..xX', kick: 'X.x. .... ..x. ....' } },
  { id: 'soul', name: 'Four on the snare', style: 'Funk, soul & dance', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [90, 112, 130],
    description: 'Snare and tambourine on every beat with a bouncing kick: a classic soul drive.',
    tip: 'Short, muted chord stabs on every beat sit perfectly with this groove.',
    main: { hat: 'x.v. x.v. x.v. x.v.', tambourine: 'x... X... x... X...', snare: 'v... X... v... X...', kick: 'X... ..x. X... ..x.' } },
  { id: 'dance', name: 'Four on the floor', style: 'Funk, soul & dance', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [100, 120, 132],
    description: 'Kick on every beat, open hi-hats on the off-beats, claps on 2 and 4.',
    tip: 'Try off-beat up-strums that answer the open hi-hat.',
    main: { hat: 'x... x... x... x...', hatOpen: '..X. ..X. ..X. ..X.', clap: '.... x... .... x...', snare: '.... X... .... X...', kick: 'X... X... X... X...' },
    chorus: { hat: 'x... x... x... x...', hatOpen: '..X. ..X. ..X. ..X.', tambourine: 'vgxg vgxg vgxg vgxg', clap: '.... x... .... x...', snare: '.... X... .... X...', kick: 'X... X... X... X...' },
    fill: { hat: 'x... x... .... ....', hatOpen: '..X. ..X. .... ....', clap: '.... x... .... ....', snare: '.... X... xvxv xvxX', kick: 'X... X... X... X...' } },
  { id: 'boom-bap', name: 'Boom bap', style: 'Funk, soul & dance', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [76, 90, 104], swingUnit: 8, swing: .6,
    description: 'A laid-back hip-hop beat with swung hi-hats.',
    tip: 'Sit slightly behind the beat; muted percussive strums work well.',
    main: { hat: 'x.v. x.v. x.v. x.v.', snare: '.... X... .... X...', kick: 'X... ...x ..X. ....' },
    chorus: { hat: 'x.v. x.v. x.v. x...', hatOpen: '.... .... .... ..v.', snare: '.... X... .... X..g', kick: 'X... ...x ..X. .x..' } },
  { id: 'shuffle', name: 'Shuffle', style: 'Blues & jazz', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 3, tempo: [60, 88, 130],
    description: 'Long-short triplet swing for blues, boogie and rock ’n’ roll.',
    tip: 'Play the classic boogie pattern: root-fifth, root-sixth on each long-short pair.',
    main: { hat: 'x.v x.v x.v x.v', snare: '... X.. ... X..', kick: 'X.. ... X.. ..v' },
    chorus: { ride: 'x.v x.v x.v x.v', snare: '... X.. ... X..', kick: 'X.v ... X.v ...' },
    fill: { hat: 'x.v x.v ... ...', snare: '... X.. xvx ...', tom1: '... ... ... xx.', floorTom: '... ... ... ..X', kick: 'X.. ... X.. ...' } },
  { id: 'slow-blues', name: 'Slow blues', style: 'Blues & jazz', meter: '12/8', beatsPerBar: 4, stepsPerBeat: 3, tempo: [44, 58, 76],
    description: 'A slow 12/8 with every triplet on the hi-hat.',
    tip: 'Leave space: bend and let notes sustain across the triplets.',
    main: { hat: 'xvv xvv xvv xvv', snare: '... X.. ... X..', kick: 'X.. ... X.v ...' },
    chorus: { ride: 'xvv xvv xvv xvv', snare: '... X.. ... X..', kick: 'X.. ..v X.v ...' } },
  { id: 'jazz', name: 'Swing ride', style: 'Blues & jazz', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 3, tempo: [80, 132, 220],
    description: 'Spang-a-lang ride, foot hi-hat on 2 and 4 and a feathered kick.',
    tip: 'Comp short chords on 2 and 4 with the foot hi-hat.',
    main: { ride: 'X.. x.v X.. x.v', hatFoot: '... x.. ... x..', snare: '... ... ..g ...', kick: 'g.. g.. g.. g..' },
    chorus: { ride: 'X.. x.v X.. x.v', hatFoot: '... x.. ... x..', snare: '..g ..v ... .g.', kick: 'g.. g.. g.. g..' } },
  { id: 'train', name: 'Train beat', style: 'Country & folk', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [90, 112, 150],
    description: 'Rolling sixteenth-note snare accented on 2 and 4, like a locomotive.',
    tip: 'Alternate bass notes on 1 and 3 with strums on 2 and 4.',
    main: { snare: 'gvgv Xvgv gvgv Xvgv', hatFoot: '.... x... .... x...', kick: 'X... .... X... ....' },
    chorus: { snare: 'gvgv Xvgv gvgv XvXv', hatFoot: '.... x... .... x...', kick: 'X... ..x. X... ..x.' } },
  { id: 'two-step', name: 'Two-step', style: 'Country & folk', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [90, 120, 160],
    description: 'Boom-chick country: kick on 1 and 3, cross-stick on 2 and 4.',
    tip: 'Bass note on the kick, strum on the cross-stick.',
    main: { hat: 'x.v. x.v. x.v. x.v.', rim: '.... X... .... X...', kick: 'X... .... X... ....' },
    chorus: { ride: 'x.v. x.v. x.v. x.v.', snare: '.... X... .... X...', kick: 'X... .... X... ....' } },
  { id: 'stomp', name: 'Stomp & clap', style: 'Country & folk', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [80, 100, 130],
    description: 'Foot stomp, hand claps and tambourine: an unplugged folk band.',
    tip: 'Big open-chord strums; let the claps be your backbeat.',
    main: { tambourine: 'x.v. x.v. x.v. x.v.', clap: '.... X... .... X...', kick: 'X... .... X... ....' },
    chorus: { tambourine: 'xgvg xgvg xgvg xgvg', clap: '.... X... .... X...', kick: 'X... ..x. X... ..x.' },
    fill: { tambourine: 'x.v. x.v. x.v. x.v.', clap: '.... X... ..x. x.X.', kick: 'X... .... X.x. X...' } },
  { id: 'reggae', name: 'One drop', style: 'Latin & Caribbean', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 3, tempo: [60, 76, 92],
    description: 'Beat 1 is empty; kick and cross-stick drop together on 3.',
    tip: 'Short, choppy up-strums on the off-beats (the “skank”).',
    main: { hat: 'x.v x.v x.v x.v', rim: '... ... X.. ...', kick: '... ... X.. ...' },
    chorus: { hat: 'x.v x.v x.v x.v', rim: '... ... X.. ...', kick: 'X.. X.. X.. X..' } },
  { id: 'bossa', name: 'Bossa nova', style: 'Latin & Caribbean', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, bars: 2, tempo: [110, 132, 160],
    description: 'Gentle two-bar cross-stick clave over a steady bass-drum heartbeat.',
    tip: 'Thumb plays bass on the kick; fingers answer the cross-stick.',
    main: { hat: 'x.v. x.v. x.v. x.v. | x.v. x.v. x.v. x.v.', rim: 'X... ..x. .... x... | .... x... ..x. ....', kick: 'X... ..x. X... ..x. | X... ..x. X... ..x.' } },
  { id: 'son', name: 'Son clave & tumbao', style: 'Latin & Caribbean', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, bars: 2, tempo: [80, 96, 120],
    description: 'A 2-3 son clave with bell and conga tumbao: a small Latin percussion section.',
    tip: 'Feel the clave first; accent the chords that fall with it.',
    main: { cowbell: 'X... x... X... x... | X... x... X... x...', claves: '.... X... X... .... | X... ..X. .... X...',
      congaSlap: '.... x... .... .... | .... x... .... ....', congaOpen: '.... .... .... x.x. | .... .... .... x.x.' },
    chorus: { cowbell: 'X... x... X... x... | X... x... X... x...', claves: '.... X... X... .... | X... ..X. .... X...',
      bongoHigh: 'X.v. v.v. X.v. v.v. | X.v. v.v. X.v. v.v.', congaSlap: '.... x... .... .... | .... x... .... ....', congaOpen: '.... .... .... x.x. | .... .... .... x.x.' } },
  { id: 'afro-68', name: '6/8 bell', style: 'Latin & Caribbean', meter: '12/8', beatsPerBar: 4, stepsPerBeat: 3, tempo: [76, 100, 126],
    description: 'The Afro-Cuban 12/8 bell pattern with shaker and conga.',
    tip: 'Count four big beats; let the bell pattern float across them.',
    main: { cowbell: 'X.x .xx .x. x.x', shaker: 'xvv xvv xvv xvv', congaSlap: '... x.. ... x..', kick: 'X.. ... X.. ...' },
    chorus: { cowbell: 'X.x .xx .x. x.x', shaker: 'xvv xvv xvv xvv', congaOpen: '..x ... ..x ...', congaSlap: '... x.. ... x..', kick: 'X.. ..v X.. ..v' } },
  { id: 'dembow', name: 'Dembow', style: 'Latin & Caribbean', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [86, 96, 104],
    description: 'Four-on-the-floor kick with the 3-3-2 snare of reggaeton and Latin pop.',
    tip: 'Accent your strums with the snare, not the kick.',
    main: { hat: 'v.v. v.v. v.v. v.v.', snare: '...x ..x. ...x ..x.', kick: 'X... X... X... X...' },
    chorus: { hat: 'v.v. v.v. v.v. v.v.', clap: '...x ..x. ...x ..x.', snare: '...x ..x. ...x ..x.', kick: 'X... X... X... X...' } },
  { id: 'cajon', name: 'Cajón groove', style: 'Acoustic & fusion', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [70, 92, 120],
    description: 'Cajón bass and slap with a shaker: an unplugged practice partner.',
    tip: 'Pairs naturally with acoustic strumming: down on the bass, accent the slap.',
    main: { shaker: 'xgvg xgvg xgvg xgvg', cajonSnare: '.... X... .... X..g', cajonBass: 'X... ..x. X... ....' },
    chorus: { tambourine: '..v. ..v. ..v. ..v.', shaker: 'xgvg xgvg xgvg xgvg', cajonSnare: '.... X..g .... X..g', cajonBass: 'X... ..x. X.x. ....' } },
  { id: 'keherwa', name: 'Keherwa on kit', style: 'Acoustic & fusion', meter: '4/4', beatsPerBar: 4, stepsPerBeat: 4, tempo: [70, 96, 130],
    description: 'An original drum-kit interpretation of the eight-pulse Keherwa cycle (Dha Ge Na Ti Na Ka Dhi Na). Not a tabla performance.',
    tip: 'Each pulse is an eighth note; strum on Dha and Dhi.',
    main: { hat: '.... ..x. .... ....', shaker: 'vgxg vgxg vgxg vgxg', rim: 'x... x... x... x.x.', snare: '.... .... ..g. ....', kick: 'X.v. .... .... x...' } },
  { id: 'dadra', name: 'Dadra on kit', style: 'Acoustic & fusion', meter: '3/4', beatsPerBar: 3, stepsPerBeat: 4, tempo: [70, 90, 130],
    description: 'An original drum-kit interpretation of the six-pulse Dadra cycle (Dha Dhi Na Dha Ti Na). Not a tabla performance.',
    tip: 'Feel two groups of three pulses; change chords on each Dha.',
    main: { hat: '.... .... x...', shaker: 'vgxg vgxg vgxg', rim: '..x. x... ..x.', kick: 'X... ..x. ....' } },
];

const KIT_LANES: readonly GrooveLane[] = ['snare', 'rim', 'hat', 'ride'];

export function parseLane(text: string, steps: number, where: string): number[] {
  const compact = text.replace(/[\s|]/g, '');
  if (compact.length !== steps) throw new Error(`${where}: expected ${steps} steps, found ${compact.length}.`);
  return [...compact].map(char => {
    const level = STROKE_LEVELS[char];
    if (level === undefined) throw new Error(`${where}: unknown stroke “${char}”.`);
    return level;
  });
}
function parseLanes(lanes: LaneText, steps: number, where: string): GrooveLanes {
  const parsed: Partial<Record<GrooveLane, number[]>> = {};
  for (const [lane, text] of Object.entries(lanes) as [GrooveLane, string][]) {
    if (!Object.hasOwn(GROOVE_LANES, lane)) throw new Error(`${where}: unknown lane ${lane}.`);
    parsed[lane] = parseLane(text, steps, `${where}.${lane}`);
  }
  return parsed;
}
const hits = (lanes: GrooveLanes): number => Object.values(lanes).reduce((sum, steps) => sum + steps!.filter(Boolean).length, 0);

/** A fill for the last one or two beats of the first bar, descending through toms or hand drums. */
export function automaticFill(main: GrooveLanes, beatsPerBar: number, stepsPerBeat: number, presetTempo: number): GrooveLanes {
  const stepsPerBar = beatsPerBar * stepsPerBeat;
  const beats = beatsPerBar >= 4 ? 2 : 1;
  const start = stepsPerBar - beats * stepsPerBeat, density = presetTempo > 140 && stepsPerBeat === 4 ? 2 : 1;
  const fill: Partial<Record<GrooveLane, number[]>> = {};
  for (const [lane, steps] of Object.entries(main) as [GrooveLane, readonly number[]][]) {
    const bar = steps.slice(0, stepsPerBar).map((level, i) => i < start ? level : 0);
    if (bar.some(Boolean)) fill[lane] = bar;
  }
  const has = (lane: GrooveLane) => Object.hasOwn(main, lane);
  const kit = KIT_LANES.some(has);
  const voices: GrooveLane[] = kit ? ['snare', 'tom1', 'tom2', 'floorTom']
    : has('congaOpen') || has('congaSlap') ? ['congaSlap', 'congaOpen', 'congaLow']
      : has('cajonSnare') ? ['cajonSnare', 'cajonSnare', 'cajonBass'] : has('bongoHigh') ? ['bongoHigh', 'bongoLow'] : ['snare'];
  const count = stepsPerBar - start;
  for (let i = 0; i < count; i += density) {
    const lane = voices[Math.min(voices.length - 1, Math.floor(i * voices.length / count))];
    (fill[lane] ??= new Array(stepsPerBar).fill(0))[start + i] = i + density >= count ? 1 : .55 + .35 * i / count;
  }
  if (kit) (fill.kick ??= new Array(stepsPerBar).fill(0))[start] = .8;
  return fill;
}

/** Chorus lift when a groove has no written chorus: ride instead of a busy hi-hat, or a tambourine. */
export function automaticChorus(main: GrooveLanes, stepsPerBeat: number): GrooveLanes {
  const hat = main.hat;
  if (hat && hat.filter(Boolean).length >= 4 && !main.ride) {
    const { hat: _moved, ...rest } = main;
    return { ...rest, ride: hat };
  }
  if (main.tambourine) return main;
  const steps = Object.values(main)[0]!.length;
  // The “&” of each straight beat, or the last triplet of each triplet beat.
  return { tambourine: Array.from({ length: steps }, (_, i) => i % stepsPerBeat === 2 ? .55 : 0), ...main };
}

function build(source: GrooveSource): DrumGroove {
  const bars = source.bars ?? 1, stepsPerBar = source.beatsPerBar * source.stepsPerBeat, steps = stepsPerBar * bars;
  const [min, preset, max] = source.tempo;
  if (!(min > 0 && min <= preset && preset <= max)) throw new Error(`${source.id}: invalid tempo range.`);
  const main = parseLanes(source.main, steps, `${source.id}.main`);
  if (!hits(main)) throw new Error(`${source.id}: the groove is empty.`);
  const chorus = source.chorus ? parseLanes(source.chorus, steps, `${source.id}.chorus`) : automaticChorus(main, source.stepsPerBeat);
  const fill = source.fill ? parseLanes(source.fill, stepsPerBar, `${source.id}.fill`) : automaticFill(main, source.beatsPerBar, source.stepsPerBeat, preset);
  const swingUnit = source.stepsPerBeat === 4 ? source.swingUnit ?? 16 : null;
  return {
    id: source.id, name: source.name, style: source.style, description: source.description, tip: source.tip,
    meter: source.meter, beatsPerBar: source.beatsPerBar, stepsPerBeat: source.stepsPerBeat, bars, stepsPerBar,
    tempo: source.tempo, swingUnit, swing: swingUnit ? source.swing ?? .5 : .5,
    beatUnit: source.meter === '6/8' || source.meter === '12/8' ? 'dotted quarter' : 'quarter',
    kitGroove: KIT_LANES.some(lane => Object.hasOwn(main, lane)), main, chorus, fill,
  };
}

export const DRUM_GROOVES: readonly DrumGroove[] = SOURCES.map(build);
export const GROOVE_STYLES = [...new Set(DRUM_GROOVES.map(groove => groove.style))];
export function getDrumGroove(id: string): DrumGroove | undefined { return DRUM_GROOVES.find(groove => groove.id === id); }

/** A silent grid that only counts bars, used to follow an imported audio loop. */
export function loopGroove(meter: '4/4' | '3/4' | '6/8', bars: number): DrumGroove {
  if (![1, 2, 4, 8].includes(bars)) throw new Error('A loop must be 1, 2, 4 or 8 bars long.');
  const beatsPerBar = meter === '4/4' ? 4 : meter === '3/4' ? 3 : 2, stepsPerBeat = meter === '6/8' ? 3 : 4;
  return {
    id: 'loop', name: 'Your loop', style: 'Your loop', description: '', tip: '', meter, beatsPerBar, stepsPerBeat, bars,
    stepsPerBar: beatsPerBar * stepsPerBeat, tempo: [30, 120, 260], swingUnit: null, swing: .5,
    beatUnit: meter === '6/8' ? 'dotted quarter' : 'quarter', kitGroove: false, main: {}, chorus: {}, fill: {}, loop: true,
  };
}
export function loopTempo(durationSeconds: number, beatsPerBar: number, bars: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('The loop has no duration.');
  return beatsPerBar * bars * 60 / durationSeconds;
}
/** Suggests how many bars a loop holds by preferring a common practice tempo. */
export function suggestLoopBars(durationSeconds: number, beatsPerBar: number): number {
  return [1, 2, 4, 8].reduce((best, bars) => {
    const score = (value: number) => Math.abs(Math.log2(loopTempo(durationSeconds, beatsPerBar, value) / 100));
    return score(bars) < score(best) ? bars : best;
  }, 1);
}

export function grooveVoices(groove: DrumGroove): Set<PercussionVoice> {
  const voices = new Set<PercussionVoice>([COUNT_IN_VOICE]);
  for (const lanes of [groove.main, groove.chorus, groove.fill]) for (const lane of Object.keys(lanes) as GrooveLane[]) voices.add(GROOVE_LANES[lane].voice);
  if (groove.kitGroove) voices.add('crash');
  return voices;
}

// Chord prompts for practicing changes in time.
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const PRACTICE_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'] as const;
export type PracticeKey = typeof PRACTICE_KEYS[number];
interface ProgressionSource { label: string; mode: 'major' | 'minor'; degrees: readonly number[]; sevenths?: 'blues' | 'jazz' }
export const PRACTICE_PROGRESSIONS: Readonly<Record<string, ProgressionSource>> = {
  pop: { label: 'I – V – vi – IV', mode: 'major', degrees: [0, 4, 5, 3] },
  classic: { label: 'I – IV – V – IV', mode: 'major', degrees: [0, 3, 4, 3] },
  fifties: { label: 'I – vi – IV – V', mode: 'major', degrees: [0, 5, 3, 4] },
  blues: { label: '12-bar blues', mode: 'major', degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], sevenths: 'blues' },
  epic: { label: 'i – VI – III – VII (minor)', mode: 'minor', degrees: [0, 5, 2, 6] },
  andalusian: { label: 'i – VII – VI – V (minor)', mode: 'minor', degrees: [0, 6, 5, 4] },
  jazz: { label: 'ii – V – I – I', mode: 'major', degrees: [1, 4, 0, 0], sevenths: 'jazz' },
};
const MAJOR = { steps: [0, 2, 4, 5, 7, 9, 11], qualities: ['', 'm', 'm', '', '', 'm', 'dim'] };
const MINOR = { steps: [0, 2, 3, 5, 7, 8, 10], qualities: ['m', 'dim', '', 'm', 'm', '', ''] };
export function realizeProgression(id: string, key: PracticeKey): string[] {
  const progression = PRACTICE_PROGRESSIONS[id];
  if (!progression) throw new Error(`Unknown chord progression: ${id}`);
  const root = SHARPS.indexOf(key) >= 0 ? SHARPS.indexOf(key) : FLATS.indexOf(key);
  if (root < 0) throw new Error(`Unknown key: ${key}`);
  const flats = key.includes('b') || key === 'F' || (progression.mode === 'minor' && ['D', 'G', 'C', 'F'].includes(key));
  const names = flats ? FLATS : SHARPS, scale = progression.mode === 'minor' ? MINOR : MAJOR;
  return progression.degrees.map(degree => {
    // The Andalusian cadence uses the harmonic-minor dominant.
    const quality = progression.mode === 'minor' && degree === 4 && id === 'andalusian' ? '' : scale.qualities[degree];
    const name = names[(root + scale.steps[degree]) % 12];
    if (progression.sevenths === 'blues') return `${name}7`;
    if (progression.sevenths === 'jazz') return degree === 4 ? `${name}7` : quality === 'm' ? `${name}m7` : quality === '' ? `${name}maj7` : `${name}${quality}`;
    return `${name}${quality}`;
  });
}
