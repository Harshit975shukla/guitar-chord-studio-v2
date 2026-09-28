import assert from 'node:assert/strict';
import { STANDARD_TUNING, NOTE_NAMES } from '../src/types/index.ts';
import { TUNING_PRESETS } from '../src/chords/tunings.ts';
import { CHORD_FORMULAS } from '../src/chords/definitions.ts';
import { CHORD_TEMPLATES } from '../src/detection/engine.ts';
import { WESTERN_SCALES } from '../src/scales/definitions.ts';
import { scaleRootPc } from '../src/scales/theory.ts';
import { chooseGuitarSample } from '../src/audio/guitarSamples.ts';
import {
  EAR_ROOTS, EAR_CHORD_QUALITIES, NOTE_INTERVALS, availableTargets, buildEarExercise,
  buildEarReference, chordKeyMaterial, chordSymbol, chordTarget, exercisePresentation,
  isCompleteVoicing, noteTarget, scaleTarget, answerIsCorrect,
} from '../src/training/exercises.ts';
import { EarTrainingPerformance } from '../src/training/practice.ts';

let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS  ${name}`); }
const base = { type: 'chords', root: 'C', minorKey: false, difficulty: 'beginner', quality: 'Major', interval: 4, scale: 'major' };
const fixed = () => .37;
const tune = (strings, capo) => strings.map(string => ({ ...string, midi: string.midi + capo, freq: 440 * 2 ** ((string.midi + capo - 69) / 12) }));
const tunings = [STANDARD_TUNING, tune(STANDARD_TUNING, 2), tune(STANDARD_TUNING, 5), ...TUNING_PRESETS.slice(1, 4).map(preset => preset.strings)];
const silence = frameAt => ({ freshness: 'none', mode: 'idle', performance: { id: 0, frameAt, attackAt: 0, signalPresent: false } });
const note = (id, midi, attackAt, frameAt = attackAt, freshness = 'fresh') => ({
  mode: 'single-note', freshness, note: { pitch: { midi }, confidence: 90 },
  performance: { id, attackAt, frameAt, signalPresent: true },
});
const chord = (id, symbol, attackAt, freshness = 'fresh', confidence = 90) => ({
  mode: 'chord', freshness, chord: { symbol, confidence },
  performance: { id, attackAt, frameAt: attackAt, signalPresent: true },
});
const release = (attempt, at = 0) => { attempt.consume(silence(at)); attempt.consume(silence(at + 120)); };

check('exactly all 12 tonic pitches and 12 existing scale/mode definitions are available', () => {
  assert.deepEqual(EAR_ROOTS, NOTE_NAMES);
  assert.equal(new Set(EAR_ROOTS.map(scaleRootPc)).size, 12);
  assert.equal(Object.keys(WESTERN_SCALES).length, 12);
  for (const root of EAR_ROOTS) {
    const targets = availableTargets({ ...base, root, type: 'scales' }, STANDARD_TUNING);
    assert.deepEqual(targets.map(target => target.id).sort(), Object.keys(WESTERN_SCALES).sort());
  }
});

check('all roots, activities and exercise families build valid targets and distinct scored choices', () => {
  for (const root of EAR_ROOTS) for (const type of ['chords', 'notes', 'scales']) {
    for (const activity of ['hear', 'identify', 'play-back']) {
      const exercise = buildEarExercise({ ...base, root, type }, activity, STANDARD_TUNING, fixed);
      assert.ok(exercise, `${root} ${type} ${activity}`);
      assert.equal(exercise.type, type);
      assert.equal(exercise.tonic, root);
      assert.equal(exercise.choices.length, 4);
      assert.equal(new Set(exercise.choices.map(choice => choice.id)).size, 4);
      assert.equal(exercise.choices.filter(choice => answerIsCorrect(exercise, choice.id)).length, 1);
      assert.equal(answerIsCorrect(exercise, 'not-a-choice'), false);
      if (type !== 'chords') assert.equal(exercise.reference.midi % 12, scaleRootPc(root));
    }
  }
});

check('all 24 chord key contexts preserve cadence function and broaden difficulty pools', () => {
  assert.deepEqual(chordKeyMaterial('C', false, 'beginner').cadence, ['C', 'Am', 'F', 'G']);
  assert.deepEqual(chordKeyMaterial('G', false, 'beginner').cadence, ['G', 'Em', 'C', 'D']);
  assert.deepEqual(chordKeyMaterial('D', false, 'beginner').cadence, ['D', 'Bm', 'G', 'A']);
  assert.deepEqual(chordKeyMaterial('A', true, 'beginner').cadence, ['Am', 'Dm', 'F', 'E7']);
  for (const root of EAR_ROOTS) for (const minor of [false, true]) {
    let previous = [];
    for (const difficulty of ['beginner', 'intermediate', 'master']) {
      const material = chordKeyMaterial(root, minor, difficulty);
      assert.equal(material.cadence.length, 4);
      assert.ok(previous.every(symbol => material.pool.includes(symbol)));
      for (const symbol of [...material.cadence, ...material.pool]) {
        const target = chordTarget(symbol, STANDARD_TUNING);
        assert.ok(target, symbol);
        assert.ok(isCompleteVoicing(symbol, target.frets, STANDARD_TUNING), symbol);
      }
      previous = material.pool;
    }
  }
});

check('all selectable chord qualities are detector-supported complete voicings, never template guesses', () => {
  const suffixes = new Set(CHORD_TEMPLATES.map(template => template.short));
  for (const quality of EAR_CHORD_QUALITIES) {
    assert.ok(suffixes.has(chordSymbol('C', quality).slice(1)));
    for (const root of EAR_ROOTS) for (const tuning of tunings) {
      const symbol = chordSymbol(root, quality);
      const target = chordTarget(symbol, tuning);
      assert.ok(target, `${symbol} ${tuning.map(string => string.midi)}`);
      assert.ok(isCompleteVoicing(symbol, target.frets, tuning));
      const wanted = CHORD_FORMULAS[quality].map(interval => (scaleRootPc(root) + interval) % 12).sort();
      const actual = [...new Set(target.notes.map(note => note.midi % 12))].sort();
      assert.deepEqual(actual, wanted);
      assert.deepEqual(target.practice, [{ type: 'chord', chord: symbol }]);
    }
  }
  assert.equal(chordTarget('C13', STANDARD_TUNING), null);
  assert.equal(chordTarget('C/E', STANDARD_TUNING), null);
  assert.equal(chordTarget('garbage', STANDARD_TUNING), null);
  assert.equal(isCompleteVoicing('Cnonsense', [0, 0, 0, 0, 0, 0], STANDARD_TUNING), false);
  assert.equal(isCompleteVoicing('C', [null, null, null, null, 3, null], STANDARD_TUNING), false);
  assert.equal(isCompleteVoicing('C', [0, 0, 0, 0, 0, 0], STANDARD_TUNING), false);
});

check('all note intervals have exact octave-sensitive pitches and one common tonic reference', () => {
  for (const root of EAR_ROOTS) for (const tuning of tunings) {
    const tonic = noteTarget(root, 0, tuning).notes[0].midi;
    for (let interval = 0; interval < NOTE_INTERVALS.length; interval++) {
      const target = noteTarget(root, interval, tuning);
      assert.ok(target);
      assert.equal(target.notes[0].midi, tonic + interval);
      const position = target.notes[0];
      assert.equal(tuning[position.stringIndex].midi + position.fret, position.midi);
      assert.deepEqual(target.practice, [{ type: 'note', midi: tonic + interval }]);
      const exercise = buildEarExercise({ ...base, type: 'notes', root, interval }, 'hear', tuning, fixed);
      assert.equal(exercise.reference.midi, tonic);
      assert.equal(exercise.target.id, String(interval));
      const reference = buildEarReference(exercise, { ...base, type: 'notes', root, interval }, tuning, true);
      assert.deepEqual(reference.map(step => step.notes[0].midi), [tonic, tonic + interval]);
      assert.deepEqual(reference.map(step => step.role), ['tonic', 'target']);
    }
  }
  assert.equal(noteTarget('C', -1, STANDARD_TUNING), null);
  assert.equal(noteTarget('C', 13, STANDARD_TUNING), null);
});

check('all 144 scales preserve every interval and final tonic in effective tuning/capo', () => {
  for (const root of EAR_ROOTS) for (const [key, scale] of Object.entries(WESTERN_SCALES)) for (const tuning of tunings) {
    const target = scaleTarget(root, key, tuning);
    assert.ok(target, `${root} ${key}`);
    const first = target.notes[0].midi;
    assert.equal(first % 12, scaleRootPc(root));
    assert.deepEqual(target.notes.map(note => note.midi - first), [...scale.intervals, 12]);
    assert.equal(target.notes.at(-1).midi, first + 12);
    assert.equal(target.practice.length, scale.intervals.length + 1);
    for (const [index, position] of target.notes.entries()) {
      assert.ok(position.fret >= 0 && position.fret <= 12);
      assert.equal(tuning[position.stringIndex].midi + position.fret, position.midi);
      assert.deepEqual(target.practice[index], { type: 'note', midi: position.midi });
      const sample = chooseGuitarSample(position.midi, position.stringIndex);
      assert.ok(sample && Number.isFinite(2 ** ((position.midi - sample.midi) / 12)));
    }
    const settings = { ...base, root, scale: key, type: 'scales' };
    const exercise = buildEarExercise(settings, 'play-back', tuning, fixed);
    const reference = buildEarReference(exercise, settings, tuning, false);
    assert.equal(reference[0].role, 'tonic');
    assert.deepEqual(reference.slice(1).map(step => step.notes[0].midi), target.notes.map(note => note.midi));
    assert.ok(reference.slice(1).every((step, i) => step.offset >= reference[i].offset + reference[i].duration));
  }
  assert.equal(scaleTarget('C', 'not-a-scale', STANDARD_TUNING), null);
});

check('Identify randomizes independently of target selectors, avoids repeats and reveals only after answering', () => {
  for (const type of ['chords', 'notes', 'scales']) {
    const settings = { ...base, type, difficulty: 'master' };
    const first = buildEarExercise(settings, 'identify', STANDARD_TUNING, fixed);
    const next = buildEarExercise(settings, 'identify', STANDARD_TUNING, fixed, first.target.id);
    assert.notEqual(first.target.id, next.target.id);
    const changed = buildEarExercise({ ...settings, interval: 11, scale: 'locrian', quality: 'aug' }, 'identify', STANDARD_TUNING, fixed);
    assert.equal(first.target.id, changed.target.id);
    const hidden = exercisePresentation(first, 'identify', false);
    assert.match(hidden.title, /^Mystery /);
    assert.deepEqual(hidden.notes, []);
    assert.equal(hidden.frets, undefined);
    const revealed = exercisePresentation(first, 'identify', true);
    assert.equal(revealed.title, first.target.label);
    assert.deepEqual(revealed.notes, first.target.notes);
    assert.equal(exercisePresentation(first, 'hear', false).title, first.target.label);
    assert.equal(exercisePresentation(first, 'play-back', false).title, first.target.label);
  }
});

check('invalid or genuinely unavailable tuning never fabricates a playable exercise', () => {
  const invalid = [[], STANDARD_TUNING.slice(0, 5), STANDARD_TUNING.map(string => ({ ...string, midi: NaN }))];
  for (const tuning of invalid) for (const type of ['chords', 'notes', 'scales']) for (const activity of ['hear', 'identify', 'play-back']) {
    assert.equal(buildEarExercise({ ...base, type }, activity, tuning, fixed), null);
  }
  const unison = STANDARD_TUNING.map(string => ({ ...string, midi: 60 }));
  assert.equal(scaleTarget('C#', 'major', unison), null);
  assert.equal(noteTarget('C#', 3, unison), null);
});

check('cadence audio uses complete chord voicings and target audio uses exactly the selected pitches', () => {
  for (const root of EAR_ROOTS) for (const minorKey of [false, true]) for (const activity of ['hear', 'identify', 'play-back']) {
    const settings = { ...base, root, minorKey };
    const exercise = buildEarExercise(settings, activity, STANDARD_TUNING, fixed);
    const reference = buildEarReference(exercise, settings, STANDARD_TUNING, true);
    assert.equal(reference.length, 5);
    const cadence = chordKeyMaterial(root, minorKey, 'beginner').cadence;
    reference.slice(0, 4).forEach((step, index) => {
      assert.equal(step.role, 'cadence');
      assert.deepEqual(step.notes, chordTarget(cadence[index], STANDARD_TUNING).notes);
    });
    assert.deepEqual(reference.at(-1).notes, exercise.target.notes);
    assert.deepEqual(buildEarReference(exercise, settings, STANDARD_TUNING, false).map(step => step.notes), [exercise.target.notes]);
  }
});

check('note grading rejects ringing, held/raw/wrong-octave/low-confidence evidence and duplicate frames', () => {
  const attempt = new EarTrainingPerformance();
  attempt.start([{ type: 'note', midi: 60 }], 0);
  assert.equal(attempt.consume(note(1, 60, 10)), 'waiting');
  assert.equal(attempt.needsRelease, true);
  release(attempt, 20);
  assert.equal(attempt.needsRelease, false);
  assert.equal(attempt.consume({ mode: 'single-note', freshness: 'fresh', note: { pitch: { midi: 60 }, confidence: 90 } }), 'waiting');
  for (const invalid of [note(2, 60, 170, 170, 'held'), note(3, 72, 190), { ...note(4, 60, 220), note: { pitch: { midi: 60 }, confidence: 30 } }]) {
    assert.equal(attempt.consume(invalid), 'waiting');
    assert.equal(attempt.consume(invalid), 'waiting');
  }
  assert.equal(attempt.consume(note(5, 60, 300)), 'waiting');
  assert.equal(attempt.consume(note(5, 60, 300, 332)), 'complete');
  assert.equal(attempt.progress, 1);
  assert.equal(attempt.consume(note(6, 60, 360)), 'waiting');
});

check('chord grading uses exact supported identity, not prefixes, sevenths, raw labels or weak evidence', () => {
  const attempt = new EarTrainingPerformance();
  attempt.start([{ type: 'chord', chord: 'C' }], 0);
  release(attempt);
  assert.equal(attempt.consume(chord(1, 'Cm', 150)), 'waiting');
  assert.equal(attempt.consume(chord(2, 'Cmaj7', 180)), 'waiting');
  assert.equal(attempt.consume(chord(3, 'C', 210, 'held')), 'waiting');
  assert.equal(attempt.consume(chord(4, 'C', 240, 'fresh', 40)), 'waiting');
  assert.equal(attempt.consume({ mode: 'chord', freshness: 'fresh', chord: { symbol: 'C', confidence: 95 } }), 'waiting');
  assert.equal(attempt.consume(chord(5, 'C', 300)), 'complete');
  assert.equal(attempt.consume(chord(5, 'C', 330)), 'waiting');
});

check('all scale runs require every exact pitch in order, each with a distinct fresh onset', () => {
  for (const root of EAR_ROOTS) for (const key of Object.keys(WESTERN_SCALES)) {
    const target = scaleTarget(root, key, STANDARD_TUNING);
    const attempt = new EarTrainingPerformance();
    attempt.start(target.practice, 0);
    release(attempt);
    let at = 200;
    for (const [index, position] of target.notes.entries()) {
      if (index) {
        assert.equal(attempt.consume(note(index, position.midi, at)), 'waiting', 'previous onset cannot advance');
        assert.equal(attempt.consume(note(index, position.midi, at, at + 32)), 'waiting');
      }
      assert.equal(attempt.consume(note(index + 1, position.midi, at)), 'waiting');
      assert.equal(attempt.consume(note(index + 1, position.midi, at, at + 32)), index === target.notes.length - 1 ? 'complete' : 'step');
      assert.equal(attempt.progress, index + 1);
      at += 100;
    }
    assert.equal(attempt.checking, false);
  }
});

check('auditions and calibration cannot grade; restarting requires new silence and post-target attacks', () => {
  const attempt = new EarTrainingPerformance();
  attempt.start([{ type: 'note', midi: 60 }], 1000);
  release(attempt, 1000);
  assert.equal(attempt.consume(note(1, 60, 900, 1200)), 'waiting');
  assert.equal(attempt.consume({ ...note(2, 60, 1300), isCalibrating: true }), 'waiting');
  assert.equal(attempt.needsRelease, true);
  attempt.stop();
  assert.equal(attempt.consume(note(3, 60, 1400)), 'waiting');
  assert.equal(attempt.checking, false);
  attempt.start([{ type: 'note', midi: 60 }], 2000);
  assert.equal(attempt.consume(note(4, 60, 2100)), 'waiting');
  release(attempt, 2200);
  assert.equal(attempt.consume(note(5, 60, 2400)), 'waiting');
  assert.equal(attempt.consume(note(5, 60, 2400, 2432)), 'complete');
});

console.log(`\n${checks} ear-training checks passed.`);
