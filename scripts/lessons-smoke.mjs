import assert from 'node:assert/strict';
import { CHORD_FORMULAS } from '../src/chords/definitions.ts';
import { REGISTER_RANGES } from '../src/chords/positions.ts';
import { WESTERN_SCALES } from '../src/scales/definitions.ts';
import { SCALE_ROOTS, scaleRootPc } from '../src/scales/theory.ts';
import { buildScalePracticeRun } from '../src/scales/practice.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';
import { CHORD_LESSONS, SCALE_LESSONS, theoryLesson, lessonPositions, lessonVoicings } from '../src/theory/lessons.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const pc = note => {
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[note[0]];
  return (natural + [...note.slice(1)].reduce((n, c) => n + (c === '♯' ? 1 : -1), 0) + 24) % 12;
};
check('lessons cover every shared scale and all 27 supported chord qualities', () => {
  assert.deepEqual(Object.keys(SCALE_LESSONS).sort(), Object.keys(WESTERN_SCALES).sort());
  assert.deepEqual(Object.keys(CHORD_LESSONS).sort(), Object.keys(CHORD_FORMULAS).sort());
  assert.equal(Object.keys(CHORD_LESSONS).length, 27);
});
check('all roots, formulas and written tones agree without changing shared definitions', () => {
  for (const root of SCALE_ROOTS) for (const kind of ['scale', 'chord']) {
    const definitions = kind === 'scale' ? WESTERN_SCALES : CHORD_FORMULAS;
    for (const [key, value] of Object.entries(definitions)) {
      const lesson = theoryLesson(kind, root, key), intervals = kind === 'scale' ? value.intervals : value;
      assert.deepEqual(lesson.tones.map(t => t.interval), intervals);
      assert.equal(lesson.tones.length, kind === 'scale' ? value.degrees.length : CHORD_LESSONS[key].degrees.length);
      lesson.tones.forEach(tone => {
        assert.equal(tone.pc, (scaleRootPc(root) + tone.interval) % 12);
        assert.equal(pc(tone.name), tone.pc, `${root} ${key}: ${tone.name}`);
      });
      if (kind === 'scale') assert.equal(lesson.steps.reduce((sum, step) => sum + step), 12);
      assert.ok(lesson.construction && lesson.use && lesson.tryIt);
    }
  }
});
check('minor variants, pentatonic gaps and extended/diminished spellings are explicit', () => {
  const names = (kind, root, key) => theoryLesson(kind, root, key).tones.map(t => t.name);
  assert.deepEqual(names('scale', 'D', 'natural_minor'), ['D', 'E', 'F', 'G', 'A', 'B♭', 'C']);
  assert.deepEqual(names('scale', 'D', 'harmonic_minor'), ['D', 'E', 'F', 'G', 'A', 'B♭', 'C♯']);
  assert.deepEqual(names('scale', 'D', 'melodic_minor'), ['D', 'E', 'F', 'G', 'A', 'B', 'C♯']);
  assert.deepEqual(theoryLesson('scale', 'A', 'pentatonic_minor').steps, [3, 2, 2, 3, 2]);
  assert.deepEqual(names('chord', 'C', 'dim7'), ['C', 'E♭', 'G♭', 'B♭♭']);
  assert.deepEqual(names('chord', 'C', '7#9'), ['C', 'E', 'G', 'B♭', 'D♯']);
  assert.deepEqual(names('chord', 'Eb', 'm6'), ['E♭', 'G♭', 'B♭', 'C']);
  assert.match(CHORD_LESSONS['13'].construction, /omits 11/);
  assert.match(SCALE_LESSONS.melodic_minor.use, /descends as natural minor/);
});
check('lesson scale diagrams follow every tuning/capo and strict displayed register', () => {
  for (const offset of [0, 2, 7]) {
    const tuning = STANDARD_TUNING.map((s, i) => ({ ...s, midi: s.midi + offset - (i === 5 ? 2 : 0) }));
    for (const root of ['C', 'D', 'Bb', 'F#']) for (const key of Object.keys(SCALE_LESSONS)) {
      const lesson = theoryLesson('scale', root, key);
      for (const register of Object.keys(REGISTER_RANGES)) {
        const positions = lessonPositions(lesson, tuning, register, null);
        const [min, max] = REGISTER_RANGES[register];
        assert.ok(positions.length > 0);
        for (const p of positions) {
          assert.equal(p.midi, tuning[p.stringIndex].midi + p.fret);
          assert.ok(p.fret >= min && p.fret <= max);
          assert.equal(p.midi % 12, lesson.tones[p.tone].pc);
        }
      }
    }
  }
});
check('every offered chord position is complete, in range and rooted in the sounding tuning', () => {
  let offered = 0, unavailable = 0;
  for (const root of ['C', 'D', 'Eb', 'F#', 'A', 'Bb']) for (const quality of Object.keys(CHORD_LESSONS)) {
    const lesson = theoryLesson('chord', root, quality);
    for (const offset of [0, 2]) {
      const tuning = STANDARD_TUNING.map(s => ({ ...s, midi: s.midi + offset }));
      for (const { register, frets } of lessonVoicings(root, quality, tuning)) {
        const positions = lessonPositions(lesson, tuning, register, frets);
        if (!frets) { unavailable++; assert.deepEqual(positions, []); continue; }
        offered++;
        assert.equal(positions.length, frets.filter(f => f !== null).length);
        assert.deepEqual([...new Set(positions.map(p => p.midi % 12))].sort(), lesson.tones.map(t => t.pc).sort());
        for (const p of positions) assert.equal(p.fret, frets[p.stringIndex]);
      }
    }
  }
  assert.ok(offered > 100);
  assert.ok(unavailable > 0, 'unavailable full extended chords must not become fake shapes');
});
check('new scales work with the existing exact-octave practice planner', () => {
  for (const key of ['melodic_minor', 'phrygian', 'lydian', 'locrian']) {
    const run = buildScalePracticeRun('D', WESTERN_SCALES[key].intervals, STANDARD_TUNING, 'all');
    assert.equal(run.length, 8);
    assert.equal(run.at(-1).midi - run[0].midi, 12);
    assert.deepEqual(run.slice(0, -1).map(p => p.midi - run[0].midi), WESTERN_SCALES[key].intervals);
  }
});
check('unknown lessons fail explicitly rather than substituting a major scale', () => {
  assert.throws(() => theoryLesson('scale', 'C', 'missing'), /Unknown scale/);
  assert.throws(() => theoryLesson('chord', 'C', 'missing'), /Unknown chord/);
});
console.log(`\n${checks}/${checks} theory lesson checks passed`);
