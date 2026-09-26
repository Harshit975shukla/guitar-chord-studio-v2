import assert from 'node:assert/strict';
import { CIRCLE_KEYS, circleKey, circleSignature, circleTheory, circleChordMidis } from '../src/theory/circleOfFifths.ts';
import { scaleRootPc } from '../src/scales/theory.ts';
import { WESTERN_SCALES } from '../src/scales/definitions.ts';
import { WESTERN_SCALES as legacyScaleExport } from '../src/tabs/scales.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const sorted = values => [...values].sort((a, b) => a - b);

check('shared scale definitions preserve the original Scales export', () => {
  assert.equal(WESTERN_SCALES, legacyScaleExport);
  assert.equal(Object.keys(WESTERN_SCALES).length, 8);
  assert.deepEqual(WESTERN_SCALES.natural_minor.intervals, [0, 2, 3, 5, 7, 8, 10]);
});
check('twelve circle positions move by fifths in both key families and wrap to C/A', () => {
  assert.equal(CIRCLE_KEYS.length, 12);
  for (const flat of [false, true]) for (let i = 0; i < 12; i++) {
    const here = circleKey(i, flat), next = circleKey((i + 1) % 12, flat);
    for (const family of ['major', 'minor']) assert.equal((scaleRootPc(next[family]) - scaleRootPc(here[family]) + 12) % 12, 7);
    assert.equal((scaleRootPc(here.minor) - scaleRootPc(here.major) + 12) % 12, 9);
  }
});
check('major and relative minor have identical pitch collections and key signatures', () => {
  for (const flat of [false, true]) for (let index = 0; index < 12; index++) {
    const major = circleTheory(index, 'major', flat), minor = circleTheory(index, 'minor', flat);
    assert.deepEqual(sorted(major.pitches), sorted(minor.pitches));
    assert.deepEqual(major.signature, minor.signature);
    assert.equal(major.signature.notes.length, Math.abs(major.key.fifths));
    assert.ok(major.signature.notes.every(note => major.notes.includes(note)));
  }
});
check('D major, D minor and B-flat major use correct written spellings', () => {
  const d = circleTheory(2, 'major');
  assert.deepEqual(d.notes, ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯']);
  assert.deepEqual(d.signature.notes, ['F♯', 'C♯']);
  const dm = circleTheory(11, 'minor');
  assert.equal(dm.root, 'D'); assert.equal(dm.relative, 'F major'); assert.equal(dm.parallel, 'D major');
  assert.deepEqual(dm.notes, ['D', 'E', 'F', 'G', 'A', 'B♭', 'C']);
  assert.deepEqual(dm.signature.notes, ['B♭']);
  assert.deepEqual(circleTheory(10, 'major').notes, ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A']);
});
check('F-sharp/G-flat crossover changes notation, not sounding pitches', () => {
  const sharp = circleTheory(6, 'major'), flat = circleTheory(6, 'major', true);
  assert.equal(sharp.root, 'F#'); assert.equal(flat.root, 'Gb');
  assert.equal(sharp.signature.label, '6 sharps'); assert.equal(flat.signature.label, '6 flats');
  assert.ok(sharp.notes.includes('E♯')); assert.ok(flat.notes.includes('C♭'));
  assert.deepEqual(sorted(sharp.pitches), sorted(flat.pitches));
  assert.deepEqual(sharp.scaleMidis, flat.scaleMidis);
});
check('diatonic triads and their concert-pitch reference voicings agree in every key', () => {
  for (const flat of [false, true]) for (let index = 0; index < 12; index++) for (const mode of ['major', 'minor']) {
    const theory = circleTheory(index, mode, flat);
    assert.equal(theory.chords.length, 7);
    theory.chords.forEach((chord, degree) => {
      assert.deepEqual(chord.notes, [theory.notes[degree], theory.notes[(degree + 2) % 7], theory.notes[(degree + 4) % 7]]);
      const midis = circleChordMidis(chord);
      assert.deepEqual(midis.map(midi => midi % 12), chord.pitchClasses);
      assert.deepEqual(midis.map(midi => midi - midis[0]), chord.quality === 'Major' ? [0, 4, 7] : chord.quality === 'Minor' ? [0, 3, 7] : [0, 3, 6]);
    });
  }
  assert.deepEqual(circleTheory(0, 'major').chords.map(c => c.label), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
});
check('natural minor v remains minor while the explained harmonic cadence uses a major V', () => {
  const dm = circleTheory(11, 'minor');
  assert.equal(dm.chords[4].label, 'Am');
  const cadence = dm.progressions.find(p => p.id === 'cadence');
  assert.deepEqual(cadence.chords.map(chord => chord.label), ['Dm', 'Gm', 'A', 'Dm']);
  assert.deepEqual(cadence.chords[2].notes, ['A', 'C♯', 'E']);
  assert.match(cadence.explanation, /raised seventh/);
  assert.deepEqual(dm.signature.notes, ['B♭']);
});
check('reference scales begin/end on tonic and invalid key inputs are explicit', () => {
  for (let i = 0; i < 12; i++) for (const mode of ['major', 'minor']) {
    const theory = circleTheory(i, mode);
    assert.equal(theory.scaleMidis.length, 8);
    assert.equal(theory.scaleMidis[0] % 12, scaleRootPc(theory.root));
    assert.equal(theory.scaleMidis.at(-1) - theory.scaleMidis[0], 12);
    assert.equal(theory.scaleLabels.length, 8);
  }
  assert.throws(() => circleKey(-1), /twelve/); assert.throws(() => circleKey(12), /twelve/);
  assert.throws(() => circleTheory(0, 'dorian'), /major or minor/);
  assert.throws(() => circleSignature({ major: 'C', minor: 'A', fifths: 9 }), /seven/);
});
console.log(`\n${checks}/${checks} circle-of-fifths checks passed`);
