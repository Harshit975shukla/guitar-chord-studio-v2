import assert from 'node:assert/strict';
import { DetectionEngine as BaseEngine } from '../src/detection/engine.ts';
import { NOTE_NAMES } from '../src/types/index.ts';
import { ChordNoteEvidence } from '../src/detection/chordNoteEvidence.ts';
// Keep the research candidate covered without making it the production default.
class DetectionEngine extends BaseEngine {
  constructor(config = {}) { super({ ...config, experimentalNoteEvidence: true }); }
}

function peak(midi, amp = 1) {
  const freq = 440 * 2 ** ((midi - 69) / 12), pitchClass = midi % 12;
  return { freq, midi, amp, pitchClass, note: NOTE_NAMES[pitchClass], bin: freq * 8192 / 44100 };
}
function chroma(root, intervals) {
  const vector = new Float32Array(12);
  for (const [tone, value] of intervals) vector[(root + tone) % 12] = value;
  return vector;
}
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

check('minor, major and dominant sevenths retain their distinct identity in all keys', () => {
  for (let root = 0; root < 12; root++) {
    for (const [third, seventh, suffix] of [[3, 10, 'm7'], [4, 10, '7'], [4, 11, 'maj7']]) {
      const tones = [0, third, 7, seventh];
      const vector = chroma(root, tones.map(tone => [tone, tone === 0 ? 1 : .9]));
      const pitches = tones.map(tone => peak(48 + root + tone, tone === 0 ? 1 : .9));
      assert.equal(new DetectionEngine().processChord(vector, pitches).chord?.symbol, NOTE_NAMES[root] + suffix);
    }
  }
});
check('Cmaj7 remains Cmaj7 with its third in the bass', () => {
  const vector = chroma(0, [[0, .9], [4, 1], [7, .9], [11, .9]]);
  assert.equal(new DetectionEngine().processChord(vector, [peak(52), peak(55, .9), peak(59, .9), peak(60, .9)]).chord?.symbol, 'Cmaj7');
});
check('a real Fmaj7 survives overlapping lower-string harmonics', () => {
  const vector = chroma(5, [[0, .99], [4, .98], [7, .47], [11, .85]]);
  const pitches = [peak(41, .9), peak(45, 1), peak(48, .4), peak(53, .6), peak(57, .3), peak(64, .91), peak(76, .8)];
  assert.equal(new DetectionEngine().processChord(vector, pitches).chord?.symbol, 'Fmaj7');
});
check('Amaj7, Am7 and Cmaj7 stay distinct across consecutive supported frames', () => {
  for (const [root, suffix, tones] of [[9, 'maj7', [0, 4, 7, 11]], [9, 'm7', [0, 3, 7, 10]], [0, 'maj7', [0, 4, 7, 11]]]) {
    const engine = new DetectionEngine();
    const vector = chroma(root, tones.map(tone => [tone, 1]));
    const pitches = tones.map(tone => peak(48 + root + tone));
    for (let i = 0; i < 3; i++) assert.equal(engine.processChord(vector, pitches).chord?.symbol, NOTE_NAMES[root] + suffix);
  }
});
check('an expired G resonance in the attack average does not turn current Am into Am7', () => {
  const average = chroma(9, [[0, 1], [3, .8], [7, .9], [10, .65]]);
  const current = chroma(9, [[0, 1], [3, .8], [7, .9]]);
  const peaks = [peak(45), peak(48, .8), peak(52, .9)];
  assert.equal(new DetectionEngine().processChord(average, peaks).chord?.symbol, 'Am7', 'reproduces the averaged-evidence ambiguity');
  const engine = new DetectionEngine();
  assert.equal(engine.processChord(average, peaks, current).chord?.symbol, 'Am');
  assert.equal(engine.processChord(average, peaks, current).chord?.symbol, 'Am');
});
check('a transient extra A cannot be the weak root of Am7 once only C/E/G remain', () => {
  const average = chroma(0, [[0, .95], [4, .77], [7, .98], [9, .47]]);
  const current = chroma(0, [[0, .95], [4, .77], [7, .98]]);
  const peaks = [peak(48, .8), peak(52, .8), peak(55)];
  assert.equal(new DetectionEngine().processChord(average, peaks).chord?.symbol, 'Am7');
  assert.equal(new DetectionEngine().processChord(average, peaks, current).chord?.symbol, 'C');
});
check('weak but currently supported sevenths are not silently removed', () => {
  const average = chroma(9, [[0, 1], [3, .8], [7, .9], [10, .65]]);
  const current = chroma(9, [[0, 1], [3, .8], [7, .9], [10, .35]]);
  assert.equal(new DetectionEngine().processChord(average, [peak(45), peak(48), peak(52), peak(55, .35)], current).chord?.symbol, 'Am7');
});
check('one fading root frame cannot erase an otherwise well-supported Fmaj7', () => {
  const average = chroma(5, [[0, .64], [4, .58], [7, .94], [11, .96]]);
  const current = chroma(5, [[4, .58], [7, .94], [11, .96]]);
  assert.equal(new DetectionEngine().processChord(average, [peak(57), peak(60), peak(64)], current).chord?.symbol, 'Fmaj7');
});
check('confirmed Cmaj7, Am7, Am and Amaj7 can replace one another without a stuck extension', () => {
  const engine = new DetectionEngine();
  for (const [root, suffix, tones] of [[0, 'maj7', [0, 4, 7, 11]], [9, 'm7', [0, 3, 7, 10]], [9, 'm', [0, 3, 7]], [9, 'maj7', [0, 4, 7, 11]]]) {
    const vector = chroma(root, tones.map(tone => [tone, 1]));
    assert.equal(engine.processChord(vector, tones.map(tone => peak(48 + root + tone)), vector).chord?.symbol, NOTE_NAMES[root] + suffix);
  }
});
check('a partial and its brighter octave are not independent seventh-note evidence', () => {
  const evidence = new ChordNoteEvidence();
  for (const at of [0, 32, 64, 96]) evidence.observe(
    [peak(52, 1), peak(64, .5), peak(71, .45), peak(83, 1.6)], at, 44100 / 8192);
  assert.equal(evidence.isHarmonicOnly(11, [0, 4, 7]), true);
  evidence.observe([peak(52), peak(59, .6), peak(71, .45), peak(83, 1.6)], 128, 44100 / 8192);
  assert.equal(evidence.isHarmonicOnly(11, [0, 4, 7]), false);
});
check('a later independent pluck preserves a seventh that coincides with a lower string partial', () => {
  for (const sampleRate of [44100, 48000]) for (const gain of [.05, 1, 4]) {
    const evidence = new ChordNoteEvidence();
    const lower = () => peak(45, gain);
    evidence.observe([lower(), peak(53, .6 * gain), peak(60, .4 * gain)], 0, sampleRate / 8192);
    evidence.observe([lower(), peak(53, .6 * gain), peak(60, .4 * gain)], 32, sampleRate / 8192);
    evidence.observe([lower(), peak(53, .6 * gain), peak(60, .4 * gain), peak(64, .8 * gain), peak(76, .9 * gain)], 64, sampleRate / 8192);
    assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), false);
  }
});
check('an upstroke preserves a seventh already ringing before the lower string is struck', () => {
  const evidence = new ChordNoteEvidence();
  evidence.observe([peak(64, .8), peak(76, .9), peak(53, .6)], 0, 44100 / 8192);
  evidence.observe([peak(64, .8), peak(76, .9), peak(53, .6)], 32, 44100 / 8192);
  evidence.observe([peak(45), peak(64, .8), peak(76, .9), peak(53, .6)], 64, 44100 / 8192);
  assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), false);
});
check('a root masking its adjacent seventh fundamental is not mistaken for proof of an overtone', () => {
  const evidence = new ChordNoteEvidence();
  for (const at of [0, 32, 64]) evidence.observe(
    [peak(49, .8), peak(53, 1), peak(56, .8), peak(61, 1), peak(72, .5), peak(84, .6)], at, 48000 / 8192);
  assert.equal(evidence.isHarmonicOnly(0, [1, 5, 8]), false);
});
check('old, reset and backwards-clock history cannot corroborate a new independent pluck', () => {
  const evidence = new ChordNoteEvidence();
  evidence.observe([peak(45)], 0, 44100 / 8192);
  for (const at of [500, 532, 564]) evidence.observe([peak(45), peak(64, .5), peak(76, .7)], at, 44100 / 8192);
  assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), true);
  evidence.reset();
  assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), false);
  evidence.observe([peak(45)], 1000, 44100 / 8192);
  for (const at of [100, 132, 164]) evidence.observe([peak(45), peak(64, .5), peak(76, .7)], at, 44100 / 8192);
  assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), true);
  assert.throws(() => evidence.observe([], 1, 0), /Invalid/);
});
check('evidence frames are immutable snapshots and belong to one detector only', () => {
  const evidence = new ChordNoteEvidence(), separate = new ChordNoteEvidence();
  const pitches = [peak(45), peak(64, .5), peak(76, .7)];
  for (const at of [0, 32, 64]) evidence.observe(pitches, at, 44100 / 8192);
  pitches[1].amp = 10;
  assert.equal(evidence.isHarmonicOnly(4, [5, 9, 0]), true);
  assert.equal(separate.isHarmonicOnly(4, [5, 9, 0]), false);
});
check('calibration and mode or sensitivity changes discard harmonic onset history', () => {
  const make = () => {
    const engine = new DetectionEngine({ fftSize: 8192 });
    engine.setAnalyser({ fftSize: 8192, frequencyBinCount: 4096, context: { sampleRate: 44100 } });
    for (const at of [0, 32, 64]) engine.chordNoteEvidence.observe([peak(45), peak(64, .5), peak(76, .7)], at, 44100 / 8192);
    assert.equal(engine.chordNoteEvidence.isHarmonicOnly(4, [5, 9, 0]), true);
    return engine;
  };
  for (const reset of [
    engine => engine.reset(), engine => engine.clearNoiseCalibration(), engine => engine.startNoiseCalibration(),
    engine => engine.setConfig({ targetMode: 'notes' }), engine => engine.setConfig({ triggerMode: 'continuous' }),
    engine => engine.setConfig({ micGainMultiplier: 6 }),
  ]) {
    const engine = make();
    reset(engine);
    assert.equal(engine.chordNoteEvidence.isHarmonicOnly(4, [5, 9, 0]), false);
  }
});
check('a real root supported by octave-related pitches survives one obscured frame', () => {
  const engine = new DetectionEngine();
  for (const at of [0, 32, 64]) engine.chordNoteEvidence.observe([peak(42, .5), peak(54, .3), peak(57)], at, 44100 / 8192);
  engine.chordNoteEvidence.observe([peak(57), peak(61, .5), peak(64, .5)], 96, 44100 / 8192);
  const average = chroma(6, [[0, .3], [3, 1], [7, .47], [10, .43]]);
  const current = chroma(6, [[3, 1], [7, .47], [10, .43]]);
  assert.equal(engine.processChord(average, [peak(57), peak(61, .5), peak(64, .5)], current).chord?.symbol, 'F#m7');
});
console.log(`\n${checks}/${checks} seventh-chord regression checks passed`);
