import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildChordDefinition, getAllChordDefinitions, CHORD_FORMULAS, CHORD_QUALITY_DISPLAY, LIBRARY_CHORD_QUALITIES } from '../src/chords/definitions.ts';
import { STANDARD_TUNING, NOTE_NAMES } from '../src/types/index.ts';
import { scaleRootPc } from '../src/scales/theory.ts';
import { chooseGuitarSample } from '../src/audio/guitarSamples.ts';
import { TUNING_PRESETS } from '../src/chords/tunings.ts';

let checks = 0;
const checkedSamples = new Set();
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
function assertVoicing(definition, tuning, voicing) {
  const name = `${definition.symbol.root}${CHORD_QUALITY_DISPLAY[definition.symbol.quality]} / ${voicing.name}`;
  assert.equal(voicing.frets.length, 6, name);
  assert.ok(voicing.frets.every(f => f === null || Number.isInteger(f) && f >= 0 && f <= 12), name);
  const expected = [...new Set(CHORD_FORMULAS[definition.symbol.quality].map(i => (scaleRootPc(definition.symbol.root) + i) % 12))].sort((a,b)=>a-b);
  const played = voicing.frets.flatMap((f, s) => f === null ? [] : [{midi: tuning[s].midi + f, s}]);
  assert.deepEqual([...new Set(played.map(p => p.midi % 12))].sort((a,b)=>a-b), expected, name);
  for (const {midi,s} of played) {
    const sample = chooseGuitarSample(midi,s), rate = 2 ** ((midi-sample.midi)/12);
    assert.ok(Number.isFinite(rate) && rate > 0, name);
    for (const bank of ['steel','classical','electric']) {
      const path = `public/audio/musicca-guitar/${bank}/${sample.id}.mp3`;
      if (!checkedSamples.has(path)) {
        assert.ok(existsSync(path), `${name}: ${bank}/${sample.id}`);
        checkedSamples.add(path);
      }
    }
  }
  if (voicing.barre) {
    assert.ok(voicing.barre.fret > 0 && voicing.barre.fret <= 12, name);
    assert.ok(voicing.barre.fromString >= 0 && voicing.barre.toString <= 5 && voicing.barre.fromString <= voicing.barre.toString, name);
  }
}
check('all 228 library chords have complete playable voicings and recorded audio mappings', () => {
  const definitions = getAllChordDefinitions();
  assert.equal(definitions.length, NOTE_NAMES.length * LIBRARY_CHORD_QUALITIES.length);
  assert.equal(definitions.length, 228);
  for (const definition of definitions) {
    assert.ok(definition.voicings.length, definition.aliases[0]);
    for (const voicing of definition.voicings) assertVoicing(definition, STANDARD_TUNING, voicing);
  }
});
check('C6 and Cm6 retain their distinct thirds and an intentionally muted low string', () => {
  for (const [quality, expected] of [['6',[0,4,7,9]],['m6',[0,3,7,9]]]) {
    const definition = buildChordDefinition('C',quality);
    assert.deepEqual(definition.intervals,expected);
    assert.equal(definition.voicings[0].frets[5],null);
    assertVoicing(definition,STANDARD_TUNING,definition.voicings[0]);
  }
});
check('familiar valid C, Am and G first shapes are preserved', () => {
  assert.deepEqual(buildChordDefinition('C','Major').voicings[0].frets,[0,1,0,2,3,null]);
  assert.deepEqual(buildChordDefinition('A','Minor').voicings[0].frets,[0,1,2,2,0,null]);
  assert.deepEqual(buildChordDefinition('G','Major').voicings[0].frets,[3,0,0,0,2,3]);
});
check('all 16 tuning presets and tested capos retain complete playable library coverage', () => {
  for (const preset of TUNING_PRESETS) for (const capo of [0,2,5]) {
    const tuning = preset.strings.map(s=>({...s,midi:s.midi+capo}));
    for (const definition of getAllChordDefinitions(tuning)) {
      assert.ok(definition.voicings.length, `${preset.id}, capo ${capo}: ${definition.aliases[0]}`);
      for (const voicing of definition.voicings) assertVoicing(definition,tuning,voicing);
    }
  }
});
check('flat-note tuning presets keep their intended sounding pitches', () => {
  const halfDown = TUNING_PRESETS.find(preset=>preset.id==='half_step_down');
  assert.deepEqual(halfDown.strings.map(string=>string.midi),STANDARD_TUNING.map(string=>string.midi-1));
  for(const preset of TUNING_PRESETS) for(const string of preset.strings) {
    assert.equal(string.midi%12,scaleRootPc(string.note),`${preset.id}: ${string.note}`);
  }
});
check('editing a returned voicing does not corrupt future library or preset selections', () => {
  const original = buildChordDefinition('C','6');
  const wanted = [...original.voicings[0].frets];
  original.voicings[0].frets.fill(null); original.intervals.push(99);
  assert.deepEqual(buildChordDefinition('C','6').voicings[0].frets,wanted);
  assert.deepEqual(CHORD_FORMULAS['6'],[0,4,7,9]);
});
check('enharmonic roots work and unknown qualities fail explicitly', () => {
  for (const [flat, sharp] of [['Db','C#'],['Eb','D#'],['Gb','F#'],['Ab','G#'],['Bb','A#']]) {
    assert.deepEqual(buildChordDefinition(flat,'m6').voicings,buildChordDefinition(sharp,'m6').voicings);
  }
  assert.throws(()=>buildChordDefinition('C','not-a-chord'),/Unsupported chord quality/);
});
console.log(`\n${checks}/${checks} full chord-library checks passed`);
