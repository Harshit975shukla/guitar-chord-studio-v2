import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import { REGISTER_RANGES, chordInRegister, isPositionReach, positionBounds } from '../src/chords/positions.ts';
import { CHORD_FORMULAS } from '../src/chords/definitions.ts';
import { chordIdentity, fitMelodyOctaves, resolveSongNote, validateTiming } from '../src/songs/timing.ts';
import { normalizeSong, songTimeline } from '../src/songs/catalog.ts';
import { STANDARD_TUNING, NOTE_NAMES } from '../src/types/index.ts';
import { TUNING_PRESETS } from '../src/chords/tunings.ts';
import { buildScalePracticeRun, buildScaleReferenceLoop, assessScaleNote } from '../src/scales/practice.ts';
import { PerformanceGate } from '../src/songs/performance.ts';
import { spellScale, scalePitchName, scaleRootPc, SCALE_ROOTS } from '../src/scales/theory.ts';
import { WESTERN_SCALES } from '../src/tabs/scales.ts';
import { buildTwoOctavePattern, orientShiftPattern } from '../src/scales/shiftPattern.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS  ${name}`); }
const note = { type: 'note', string: 1, fret: 0, beats: 1 };

check('note position selection preserves exact pitch and original/auto behavior', () => {
  const expected = { all: [0, 0], open: [0, 0], middle: [1, 5], upper: [2, 9] };
  for (const [register, [s, f]] of Object.entries(expected)) {
    const position = resolveSongNote(note, STANDARD_TUNING, 0, register);
    assert.deepEqual(position, { s, f, midi: 64 });
    assert.equal(STANDARD_TUNING[s].midi + f, 64);
  }
  assert.equal(resolveSongNote({ ...note, string: 6 }, STANDARD_TUNING, 0, 'middle'), null);
  assert.equal(resolveSongNote({ ...note, string: 6 }, STANDARD_TUNING, 0, 'upper'), null);
});
check('position selection honors tuning/capo and never octave-wraps an unavailable note', () => {
  for (const preset of TUNING_PRESETS.slice(0, 5)) for (const capo of [0, 2, 5]) for (const transpose of [0, 2, 7]) {
    const tuning = preset.strings.map(s => ({ ...s, midi: s.midi + capo }));
    for (const [register, [min, max]] of Object.entries(REGISTER_RANGES)) for (let string = 1; string <= 6; string++) {
      const wanted = tuning[string - 1].midi + transpose;
      const position = resolveSongNote({ ...note, string }, tuning, transpose, register);
      const available = tuning.some(s => wanted - s.midi >= min && wanted - s.midi <= max);
      assert.equal(!!position, available);
      if (position) {
        assert.equal(position.midi, wanted);
        assert.equal(tuning[position.s].midi + position.f, wanted);
        assert.ok(position.f >= min && position.f <= max);
      }
    }
  }
});
check('C/G/Am/Em chords get complete voicings in each position without changing quality', () => {
  for (const symbol of ['C', 'G', 'Am', 'Em']) for (const register of ['open', 'middle', 'upper']) {
    const chord = chordIdentity(symbol);
    const frets = chordInRegister(chord, STANDARD_TUNING, register);
    assert.ok(frets, `${symbol} ${register}`);
    const [min, max] = REGISTER_RANGES[register];
    assert.ok(frets.every(f => f === null || f >= min && f <= max));
    const actual = [...new Set(frets.flatMap((f, s) => f === null ? [] : [(STANDARD_TUNING[s].midi + f) % 12]))].sort();
    const expected = CHORD_FORMULAS[chord.quality].map(i => (NOTE_NAMES.indexOf(chord.root) + i) % 12).sort();
    assert.deepEqual(actual, expected);
  }
});
check('generated voicings respect slash bass and report genuinely unavailable chords', () => {
  const slash = chordIdentity('C/E');
  for (const register of ['open', 'middle', 'upper']) {
    const frets = chordInRegister(slash, STANDARD_TUNING, register);
    if (frets) assert.equal(Math.min(...frets.flatMap((f, s) => f === null ? [] : [STANDARD_TUNING[s].midi + f])) % 12, 4);
  }
  const unison = STANDARD_TUNING.map(s => ({ ...s, midi: 60 }));
  assert.equal(chordInRegister(chordIdentity('C'), unison, 'open'), null);
});
check('guided scale sequence is one full octave, ascending/descending, within the selected register', () => {
  for (const root of NOTE_NAMES) for (const intervals of [[0, 2, 4, 5, 7, 9, 11], [0, 3, 5, 7, 10], [0, 3, 5, 6, 7, 10]]) {
    for (const register of Object.keys(REGISTER_RANGES)) {
      const up = buildScalePracticeRun(root, intervals, STANDARD_TUNING, register);
      const down = buildScalePracticeRun(root, intervals, STANDARD_TUNING, register, true);
      const [min, max] = REGISTER_RANGES[register];
      const available = new Set(STANDARD_TUNING.flatMap(s => Array.from({ length: max - min + 1 }, (_, f) => s.midi + min + f)));
      const complete = [...available].some(midi => midi % 12 === NOTE_NAMES.indexOf(root) && [...intervals, 12].every(i => available.has(midi + i)));
      if (!complete) {
        assert.deepEqual(up, []); assert.deepEqual(down, []); continue;
      }
      assert.equal(up.length, intervals.length + 1, `${root} ${register}`);
      assert.deepEqual(down.map(p => p.midi), up.map(p => p.midi).reverse());
      assert.deepEqual(up.map(p => p.midi - up[0].midi), [...intervals, 12]);
      assert.equal(up[0].midi % 12, NOTE_NAMES.indexOf(root));
      assert.ok(up.every(p => p.fret >= min && p.fret <= max && STANDARD_TUNING[p.stringIndex].midi + p.fret === p.midi));
    }
  }
});
check('guided run stays in sounding tuning/capo and reports no complete octave if impossible', () => {
  const tuning = STANDARD_TUNING.map(s => ({ ...s, midi: s.midi + 2 }));
  const run = buildScalePracticeRun('D', [0, 2, 4, 5, 7, 9, 11], tuning, 'middle');
  assert.equal(run.length, 8);
  assert.ok(run.every(p => tuning[p.stringIndex].midi + p.fret === p.midi));
  const unison = STANDARD_TUNING.map(s => ({ ...s, midi: 60 }));
  assert.deepEqual(buildScalePracticeRun('C', [0, 2, 4, 5, 7, 9, 11], unison, 'open'), []);
});
check('free-play assessment distinguishes membership, octave availability, held and unclear evidence', () => {
  const frame = { mode: 'single-note', freshness: 'fresh', note: { pitch: { midi: 69 }, confidence: 90 } };
  const intervals = [0, 3, 5, 7, 10];
  assert.equal(assessScaleNote(frame, 'A', intervals, STANDARD_TUNING, 'middle').inScale, true);
  assert.equal(assessScaleNote({ ...frame, note: { ...frame.note, pitch: { midi: 70 } } }, 'A', intervals, STANDARD_TUNING, 'middle').inScale, false);
  const bass = assessScaleNote({ ...frame, note: { ...frame.note, pitch: { midi: 40 } } }, 'A', intervals, STANDARD_TUNING, 'upper');
  assert.equal(bass.inScale, true); assert.equal(bass.inRegister, false);
  assert.equal(assessScaleNote({ ...frame, freshness: 'held' }, 'A', intervals, STANDARD_TUNING, 'middle'), null);
  assert.equal(assessScaleNote({ ...frame, note: { ...frame.note, confidence: 30 } }, 'A', intervals, STANDARD_TUNING, 'middle'), null);
});
check('guided scale uses the existing fresh-performance gate, not repeated ringing frames', () => {
  const gate = new PerformanceGate();
  gate.setTarget({ type: 'note', midi: 69 }, 0);
  const silence = at => ({ freshness: 'none', performance: { id: 0, frameAt: at, signalPresent: false } });
  gate.consume(silence(0)); gate.consume(silence(120));
  assert.equal(gate.needsRelease, false);
  const frame = (id, midi, at, freshness = 'fresh') => ({ mode: 'single-note', freshness, note: { pitch: { midi }, confidence: 90 }, performance: { id, attackAt: at, frameAt: at, signalPresent: true } });
  assert.equal(gate.consume(frame(1, 69, 160)), false);
  assert.equal(gate.consume(frame(1, 69, 192)), true);
  gate.setTarget({ type: 'note', midi: 72 }, 200);
  assert.equal(gate.consume(frame(1, 72, 220)), false);
  assert.equal(gate.consume(frame(2, 72, 240, 'held')), false);
  assert.equal(gate.consume(frame(3, 72, 300)), false);
  assert.equal(gate.consume(frame(3, 72, 332)), true);
});
check('Happy Birthday retains all 25 source notes and fits Open uniformly one octave lower', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(join('public', 'song_catalog_data.js'), 'utf8'), context);
  const raw = context.window.SONG_CATALOG.happy_birthday;
  const original = raw.lines.flatMap(line => line.notes);
  const song = normalizeSong(raw);
  const timing = songTimeline(song, 'notes');
  assert.equal(original.length, 25);
  assert.equal(timing.events.length, original.length);
  assert.equal(timing.events.filter(event => event.fret > 12).length, 3);
  assert.match(song.warnings.join(), /3 high source notes retained/);
  const fit = fitMelodyOctaves(timing.events, STANDARD_TUNING, 0, 'open');
  assert.equal(fit, -1);
  timing.events.forEach((event, index) => {
    const position = resolveSongNote(event, STANDARD_TUNING, fit * 12, 'open');
    assert.ok(position);
    assert.ok(position.f >= 0 && position.f <= 4);
    assert.equal(position.midi, STANDARD_TUNING[(original[index].string ?? original[index].str) - 1].midi + original[index].fret - 12);
    assert.equal(event.beats, original[index].beats);
  });
  assert.equal(validateTiming(JSON.parse(JSON.stringify(timing))).events.length, 25);
});
check('octave fit keeps rests and intervals intact and rejects melodies too wide for a position', () => {
  const events = [{ type: 'note', string: 1, fret: 3, beats: 1 }, { type: 'rest', beats: .5 }, { type: 'note', string: 1, fret: 15, beats: 2 }];
  const source = JSON.stringify(events);
  assert.equal(fitMelodyOctaves(events, STANDARD_TUNING, 0, 'open'), -1);
  assert.equal(JSON.stringify(events), source);
  assert.equal(fitMelodyOctaves([{ type: 'note', string: 6, fret: 0, beats: 1 }, { type: 'note', string: 1, fret: 15, beats: 1 }], STANDARD_TUNING, 0, 'open'), null);
  assert.equal(fitMelodyOctaves([{ type: 'chord', chord: 'C', beats: 1 }], STANDARD_TUNING, 0, 'open'), null);
  assert.equal(fitMelodyOctaves([{ type: 'note', string: 1, fret: 0, beats: 1 }], STANDARD_TUNING, 0, 'open'), 0);
});
check('scale spellings follow diatonic letters rather than an all-sharp pitch-class list', () => {
  const expected = [
    ['D', 'major', ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯']],
    ['D', 'natural_minor', ['D', 'E', 'F', 'G', 'A', 'B♭', 'C']],
    ['D', 'harmonic_minor', ['D', 'E', 'F', 'G', 'A', 'B♭', 'C♯']],
    ['D', 'blues', ['D', 'F', 'G', 'A♭', 'A', 'C']],
    ['F', 'major', ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']],
    ['Bb', 'major', ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A']],
    ['F#', 'major', ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']],
    ['Db', 'major', ['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C']],
    ['C', 'natural_minor', ['C', 'D', 'E♭', 'F', 'G', 'A♭', 'B♭']],
  ];
  for (const [root, key, names] of expected) assert.deepEqual(spellScale(root, WESTERN_SCALES[key]), names);
  assert.equal(scalePitchName(58, 'D', WESTERN_SCALES.natural_minor), 'B♭3');
  assert.equal(scalePitchName(60, 'C#', WESTERN_SCALES.major), 'B♯3');
  assert.equal(scalePitchName(59, 'Gb', WESTERN_SCALES.major), 'C♭4');
});
check('all scale/root spellings keep correct pitches and all available runs start/end on the tonic', () => {
  const letters = 'CDEFGAB', natural = [0, 2, 4, 5, 7, 9, 11];
  for (const root of SCALE_ROOTS) for (const scale of Object.values(WESTERN_SCALES)) {
    const names = spellScale(root, scale);
    names.forEach((name, index) => {
      const alteration = [...name.slice(1)].reduce((sum, c) => sum + (c === '♯' ? 1 : -1), 0);
      assert.equal((natural[letters.indexOf(name[0])] + alteration + 24) % 12, (scaleRootPc(root) + scale.intervals[index]) % 12);
      const degree = Number(scale.degrees[index].match(/\d+/)[0]);
      assert.equal(name[0], letters[(letters.indexOf(root[0]) + degree - 1) % 7]);
    });
    for (const register of Object.keys(REGISTER_RANGES)) {
      const run = buildScalePracticeRun(root, scale.intervals, STANDARD_TUNING, register);
      if (!run.length) continue;
      assert.equal(run[0].midi % 12, scaleRootPc(root));
      assert.equal(run.at(-1).midi, run[0].midi + 12);
      assert.equal(run.length, scale.intervals.length + 1);
      assert.equal(new Set(run.map(p => p.midi)).size, run.length);
    }
  }
});
check('Happy Birthday fits every playing area using only an occasional one-fret melody reach', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(join('public', 'song_catalog_data.js'), 'utf8'), context);
  const events = songTimeline(normalizeSong(context.window.SONG_CATALOG.happy_birthday), 'notes').events;
  for (const register of ['open', 'middle', 'upper']) {
    const fit = fitMelodyOctaves(events, STANDARD_TUNING, 0, register, true);
    assert.equal(fit, -1);
    const [min, max] = positionBounds(register, true);
    const positions = events.map(event => resolveSongNote(event, STANDARD_TUNING, fit * 12, register, true));
    assert.ok(positions.every(p => p && p.f >= min && p.f <= max));
    assert.equal(positions.filter(p => p.reach).length, register === 'middle' ? 2 : 0);
    for (const [index, p] of positions.entries()) assert.equal(p.midi, STANDARD_TUNING[events[index].string - 1].midi + events[index].fret - 12);
  }
  assert.deepEqual(resolveSongNote({ ...note, fret: 7 }, STANDARD_TUNING, -12, 'middle', true), { s: 2, f: 4, midi: 59, reach: true });
  assert.deepEqual(positionBounds('upper', true), [8, 12]);
  assert.deepEqual(positionBounds('open', true), [0, 4]);
});
check('free scale loop climbs to the highest reachable tonic and mirrors back to the exact starting point', () => {
  const up = [50, 52, 54, 55, 57, 59, 61, 62, 64, 66, 67, 69, 71, 73, 74];
  const loop = buildScaleReferenceLoop('D', WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'all', true);
  assert.deepEqual(loop.map(p => p.midi), [...up, ...up.slice(0, -1).reverse()]);
  assert.deepEqual(loop[0], loop.at(-1));
  assert.ok(loop.every((p, i) => !i || p.midi !== loop[i - 1].midi));
  assert.notEqual(loop[1].midi, loop.at(-1).midi, 'next cycle skips the already-played starting root');
  for (const register of ['open', 'middle', 'upper']) {
    const run = buildScaleReferenceLoop('D', WESTERN_SCALES.major.intervals, STANDARD_TUNING, register, true);
    const [min, max] = positionBounds(register, true);
    assert.ok(run.length > 1);
    assert.equal(run[0].midi % 12, 2); assert.deepEqual(run[0], run.at(-1));
    assert.ok(run.every(p => p.fret >= min && p.fret <= max));
  }
});
check('guided and free-play scale targets can label needed reaches without inventing pitches', () => {
  const strict = buildScalePracticeRun('D', WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'middle');
  assert.deepEqual(strict, []);
  const flexible = buildScalePracticeRun('D', WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'middle', false, true);
  assert.equal(flexible.length, 8);
  assert.ok(flexible.some(p => p.reach));
  assert.deepEqual(flexible.map(p => p.midi - flexible[0].midi), [0, 2, 4, 5, 7, 9, 11, 12]);
  const assessment = assessScaleNote({ mode: 'single-note', freshness: 'fresh', note: { pitch: { midi: 59 }, confidence: 90 } }, 'D',
    WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'middle', true);
  assert.equal(assessment.inScale, true); assert.equal(assessment.inRegister, true); assert.equal(assessment.needsReach, true);
});
check('D-minor two-octave Middle pattern reaches D5 and returns through B-string fret5', () => {
  const pattern = buildTwoOctavePattern('D', WESTERN_SCALES.natural_minor.intervals, STANDARD_TUNING, 'middle');
  assert.deepEqual(pattern.map(p => p.midi), [50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74]);
  assert.deepEqual(pattern[0], { stringIndex: 4, fret: 5, midi: 50, handPosition: 'middle' });
  assert.deepEqual(pattern.at(-1), { stringIndex: 0, fret: 10, midi: 74, handPosition: 'upper', shift: 'up' });
  const descending = orientShiftPattern(pattern, 'descending');
  assert.deepEqual(descending.map(p => p.midi), pattern.map(p => p.midi).reverse());
  assert.equal(descending[1].shift, 'down');
  assert.deepEqual(descending.find(p => p.midi === 64), { stringIndex: 1, fret: 5, midi: 64, handPosition: 'middle' });
  const loop = orientShiftPattern(pattern, 'loop');
  assert.equal(loop.length, 29); assert.deepEqual(loop[0], loop.at(-1));
  assert.ok(loop.every((p, i) => !i || p.midi !== loop[i - 1].midi));
  assert.equal(loop[14].shift, 'up'); assert.equal(loop[15].shift, 'down');
});
check('two-octave plans respect keys, starting areas and bounded adjacent hand shifts', () => {
  const hands = ['open', 'middle', 'upper'];
  for (const root of SCALE_ROOTS) for (const scale of Object.values(WESTERN_SCALES)) for (const start of ['all', ...hands]) {
    const pattern = buildTwoOctavePattern(root, scale.intervals, STANDARD_TUNING, start);
    if (!pattern.length) continue;
    assert.equal(pattern.length, scale.intervals.length * 2 + 1);
    assert.equal(pattern[0].midi % 12, scaleRootPc(root));
    assert.equal(pattern.at(-1).midi - pattern[0].midi, 24);
    assert.deepEqual(pattern.map(p => p.midi - pattern[0].midi), [...scale.intervals, ...scale.intervals.map(i => i + 12), 24]);
    if (start !== 'all') assert.equal(pattern[0].handPosition, start);
    for (const [i, p] of pattern.entries()) {
      assert.ok(p.fret >= 0 && p.fret <= 12);
      assert.equal(p.midi, STANDARD_TUNING[p.stringIndex].midi + p.fret);
      const [min, max] = positionBounds(p.handPosition, true);
      assert.ok(p.fret >= min && p.fret <= max);
      assert.equal(!!p.reach, isPositionReach(p.fret, p.handPosition));
      if (i) {
        const change = hands.indexOf(p.handPosition) - hands.indexOf(pattern[i - 1].handPosition);
        assert.ok(change === 0 || change === 1);
        assert.equal(p.shift, change ? 'up' : undefined);
      }
    }
  }
});
check('two-octave plans preserve sounding tuning/capo and report an unavailable high start', () => {
  for (const preset of TUNING_PRESETS.slice(0, 4)) for (const capo of [0, 2]) {
    const tuning = preset.strings.map(s => ({ ...s, midi: s.midi + capo }));
    const pattern = buildTwoOctavePattern('D', WESTERN_SCALES.natural_minor.intervals, tuning, 'all');
    assert.ok(pattern.length);
    assert.equal(pattern[0].midi % 12, 2);
    assert.equal(pattern.at(-1).midi, pattern[0].midi + 24);
    assert.ok(pattern.every(p => tuning[p.stringIndex].midi + p.fret === p.midi));
  }
  assert.deepEqual(buildTwoOctavePattern('F', WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'middle'), []);
  assert.ok(buildTwoOctavePattern('F', WESTERN_SCALES.major.intervals, STANDARD_TUNING, 'open').length);
  const unison = STANDARD_TUNING.map(s => ({ ...s, midi: 60 }));
  assert.deepEqual(buildTwoOctavePattern('C', WESTERN_SCALES.major.intervals, unison, 'all'), []);
});
console.log(`\n${checks}/${checks} position and scale-practice checks passed`);
