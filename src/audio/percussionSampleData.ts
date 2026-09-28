export const DRUM_BANKS = {
  drums: 'Standard', 'drums-powerful': 'Powerful', 'drums-monumental': 'Monumental',
  'drums-smooth': 'Smooth', 'drums-minimalistic': 'Minimalistic', 'drums-energetic': 'Energetic',
} as const;
export const DRUM_FILES = {
  kick: 'bass', snare: 'snare-drum', rim: 'snare-stick', hihat: 'hihat', hihat_open: 'hihat-open',
  hihat_foot: 'hihat-foot', tom1: 'tom1', tom2: 'tom2', floor_tom: 'floor-tom', ride: 'ride', crash: 'crash',
} as const;
/** maxSeconds marks newer VCSL files stored as trimmed mono 16-bit PCM by the download script. */
export interface PercussionSampleAsset { path: string; url: string; velocity: number; source: 'Musicca' | 'VCSL'; maxSeconds?: number }
export const VCSL_COMMIT = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const vcslUrl = (folder: string, name: string): string =>
  `https://raw.githubusercontent.com/sgossner/VCSL/${VCSL_COMMIT}/${folder.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(name)}.wav`;
function hand(voice: string, folder: string, names: [string, number][]): PercussionSampleAsset[] {
  return names.map(([name, velocity], i) => ({ path: `vcsl/${voice}-${i + 1}.wav`, url: vcslUrl(folder, name), velocity, source: 'VCSL' }));
}
function trimmed(prefix: string, folder: string, names: [string, number][], maxSeconds: number): PercussionSampleAsset[] {
  return names.map(([name, velocity], i) => ({ path: `vcsl/${prefix}-${i + 1}.wav`, url: vcslUrl(folder, name), velocity, source: 'VCSL', maxSeconds }));
}
const congaFolder = 'Membranophones/Struck Membranophones/Conga';
const bongoFolder = 'Membranophones/Struck Membranophones/Bongos';
const cajonFolder = 'Idiophones/Struck Idiophones/Cajon';
const variants = (stem: string, soft: string, hard: string, suffix = ''): [string, number][] =>
  [1, 2].flatMap(rr => [[`${stem}_${soft}_rr${rr}${suffix}`, .4], [`${stem}_${hard}_rr${rr}${suffix}`, .9]] as [string, number][]);
export const HAND_SAMPLES = {
  conga_low: hand('conga-low', congaFolder, variants('Tumba_HitN', 'v1', 'v3', '_Sum')),
  conga_open: hand('conga-open', congaFolder, variants('Conga_HitN', 'v1', 'v3', '_Sum')),
  conga_slap: hand('conga-high', congaFolder, variants('Quinto_HitN', 'v1', 'v3', '_Sum')),
  bongo_low: hand('bongo-low', bongoFolder, variants('BongoL_Hit1', 'v1', 'v3', '_Mid')),
  bongo_high: hand('bongo-high', bongoFolder, variants('BongoH_Hit1', 'v1', 'v3', '_Mid')),
  cajon_bass: hand('cajon-hit1', cajonFolder, variants('Cajon_hit1', 'mp', 'f')),
  cajon_snare: hand('cajon-hit2', cajonFolder, variants('Cajon_hit2', 'mp', 'f')),
  shaker: hand('shaker', 'Idiophones/Struck Idiophones/Shaker, Small', [
    ['Mid_ShakerDouble_Down_rr1', .7], ['Mid_ShakerDouble_Down_rr2', .7],
  ]),
  tambourine: hand('tambourine', 'Idiophones/Struck Idiophones/Tambourine 1', [
    ['Tamb1_Hit_v1_rr1_Mid', .4], ['Tamb1_Hit_v2_rr1_Mid', .9],
  ]),
} as const;

const snareFolder = 'Membranophones/Struck Membranophones/Snare Drum, Modern 1';
const hatFolder = 'Idiophones/Struck Idiophones/Hi-Hat Cymbal';
/** Multi-velocity VCSL kit pieces for the groove trainer's studio kit; other kit voices use Musicca Standard. */
export const STUDIO_SAMPLES = {
  snare: trimmed('studio-snare', snareFolder, [
    ['Snare2_HitSN_v3_rr1_Mid', .3], ['Snare2_HitSN_v5_rr1_Mid', .55], ['Snare2_HitSN_v5_rr2_Mid', .55],
    ['Snare2_HitSN_v7_rr1_Mid', .78], ['Snare2_HitSN_v9_rr1_Mid', 1], ['Snare2_HitSN_v9_rr2_Mid', 1],
  ], 1.2),
  rim: trimmed('studio-cross-stick', 'Membranophones/Struck Membranophones/Snare Drum, Modern 2', [
    ['Snare3M_Xstick_v2_rr1_Mid', .8], ['Snare3M_Xstick_v2_rr2_Mid', .8],
  ], .8),
  hihat: trimmed('studio-hihat', hatFolder, [
    ['HiHat_HitC_v1_rr1_Mid', .3], ['HiHat_HitC_v2_rr1_Mid', .55], ['HiHat_HitC_v2_rr2_Mid', .55],
    ['HiHat_HitC_v3_rr1_Mid', .78], ['HiHat_HitC_v3_rr2_Mid', .78], ['HiHat_HitC_v4_rr1_Mid', 1],
  ], .9),
  hihat_open: trimmed('studio-hihat-open', hatFolder, [['HiHat_HitLoose_rr1_Mid', .55], ['HiHat_HitO_rr1_Mid', 1]], 2.4),
  hihat_foot: trimmed('studio-hihat-foot', hatFolder, [['HiHat_Close_rr1_Mid', .8], ['HiHat_Close_rr2_Mid', .8]], .7),
  tom1: trimmed('studio-tom-high', 'Membranophones/Struck Membranophones/Tom 1/Stick', [['TomH_HitS_v2_rr1_Mid', .5], ['TomH_HitS_v4_rr1_Mid', .95]], 1.4),
  tom2: trimmed('studio-tom-low', 'Membranophones/Struck Membranophones/Tom 2/Stick', [['TomL_HitS_v2_rr1_Mid', .5], ['TomL_HitS_v4_rr1_Mid', .95]], 1.6),
} as const;
const idiophones = 'Idiophones/Struck Idiophones';
/** Kit-independent auxiliary percussion (VCSL, CC0). */
export const AUX_SAMPLES = {
  clap: trimmed('clap', `${idiophones}/Claps`, [['Clap_rr1', .85], ['Clap_rr2', .85], ['Clap_rr3', .85], ['Clap_rr4', .85]], .8),
  cowbell: trimmed('cowbell', `${idiophones}/Cowbells`, [['Cowbell1_Normal_v2_rr1_Mid', .55], ['Cowbell1_Normal_v3_rr1_Mid', .95]], 1),
  claves: trimmed('claves', `${idiophones}/Claves`, [['Claves1_Hit_v2_rr1_Mid', .55], ['Claves1_Hit_v3_rr1_Mid', .95]], .7),
  woodblock: trimmed('woodblock', `${idiophones}/Woodblock`, [['wood_click_pp_rr1', .35], ['wood_click_mp', .7], ['wood_click_ff', 1]], .6),
  agogo_high: trimmed('agogo-high', `${idiophones}/Agogo Bells`, [['Agogo_High_v2_rr1_Mid', .6], ['Agogo_High_v3_rr1_Mid', .95]], 1),
  agogo_low: trimmed('agogo-low', `${idiophones}/Agogo Bells`, [['Agogo_Low_v1_rr1_Mid', .5], ['Agogo_Low_v2_rr1_Mid', .95]], 1.2),
} as const;

export function drumSample(voice: keyof typeof DRUM_FILES, bank = 'standard'): PercussionSampleAsset {
  const file = `${DRUM_FILES[voice]}.mp3`;
  return { path: `musicca/${bank}/${file}`, url: `https://www.musicca.com/files/audio/tools/drums/${bank}/${file}`, velocity: 1, source: 'Musicca' };
}
/** kit may be a pulse-player kit or the groove trainer's 'studio' kit. */
export function percussionSampleSet(voice: string, kit: string): readonly PercussionSampleAsset[] | null {
  if (kit === 'studio' && Object.hasOwn(STUDIO_SAMPLES, voice)) return STUDIO_SAMPLES[voice as keyof typeof STUDIO_SAMPLES];
  if (Object.hasOwn(DRUM_FILES, voice)) {
    const bank = Object.hasOwn(DRUM_BANKS, kit) ? DRUM_BANKS[kit as keyof typeof DRUM_BANKS].toLowerCase() : 'standard';
    return [drumSample(voice as keyof typeof DRUM_FILES, bank)];
  }
  if (Object.hasOwn(HAND_SAMPLES, voice)) return HAND_SAMPLES[voice as keyof typeof HAND_SAMPLES];
  return Object.hasOwn(AUX_SAMPLES, voice) ? AUX_SAMPLES[voice as keyof typeof AUX_SAMPLES] : null;
}
export const ALL_PERCUSSION_ASSETS = [
  ...Object.values(DRUM_BANKS).flatMap(bank => (Object.keys(DRUM_FILES) as Array<keyof typeof DRUM_FILES>).map(voice => drumSample(voice, bank.toLowerCase()))),
  ...Object.values(HAND_SAMPLES).flat(),
  ...Object.values(STUDIO_SAMPLES).flat(),
  ...Object.values(AUX_SAMPLES).flat(),
];
