import assert from 'node:assert/strict';
import { getStrummingPattern, STRUMMING_PATTERNS, suggestStrumming, patternNotation } from '../src/rhythm/strumming.ts';
import { buildDrillRhythm } from '../src/rhythm/drillTimeline.ts';
import { analyzePcm, ANALYSIS_RATE } from '../src/analysis/audioAnalysis.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const sr = ANALYSIS_RATE;
function recording(times, duration) {
  const samples = new Float32Array(Math.ceil(duration * sr));
  for (const time of times) {
    const start = Math.round(time * sr), length = Math.round(.22 * sr);
    for (let i = 0; i < length && start + i < samples.length; i++) {
      const t = i / sr, envelope = Math.min(1, t / .003) * Math.exp(-t / .065);
      for (const freq of [130.81, 164.81, 196]) samples[start + i] += .1 * envelope * Math.sin(2 * Math.PI * freq * t);
    }
  }
  return samples;
}
function patternRecording(id, bpm) {
  const pattern = getStrummingPattern(id), step = 30 / bpm, times = [];
  for (let bar = 0; bar < 4; bar++) pattern.steps.forEach((stroke, i) => { if (stroke !== '-') times.push(.2 + (bar * 8 + i) * step); });
  return recording(times, .5 + 32 * step);
}
check('practice patterns have eight 4/4 subdivisions and explicit suggested directions', () => {
  for (const pattern of STRUMMING_PATTERNS) {
    assert.equal(pattern.steps.length, 8);
    assert.ok(pattern.steps.every(step => ['D', 'U', '-'].includes(step)));
    assert.ok(patternNotation(pattern).includes('↓'));
  }
  assert.throws(() => getStrummingPattern('missing'), /Unknown/);
});
check('clean repeated offbeat attacks suggest the expected rhythm and tempo', () => {
  const result = suggestStrumming(patternRecording('offbeat-lift', 100), sr);
  assert.equal(result.candidates[0].patternId, 'offbeat-lift');
  assert.ok(Math.abs(result.candidates[0].bpm - 100) <= 1);
  assert.ok(result.candidates[0].fit > .9);
  assert.match(result.message, /suggested, not detected/);
});
check('multiple practice rhythms are recognized without pretending stroke directions were heard', () => {
  for (const [id, bpm] of [['eighth-finish', 80], ['eighth-alternating', 140], ['quarter-down', 120]]) {
    const result = suggestStrumming(patternRecording(id, bpm), sr);
    assert.ok(result.candidates.some(c => c.patternId === id && Math.abs(c.bpm - bpm) <= 1), `${id}: ${JSON.stringify(result)}`);
  }
});
check('silence, steady tone, random noise and insufficient recordings do not invent suggestions', () => {
  const silence = new Float32Array(sr * 8);
  const tone = Float32Array.from(silence, (_, i) => .1 * Math.sin(2 * Math.PI * 220 * i / sr));
  let seed = 9;
  const noise = Float32Array.from(silence, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 0x100000000 - .5) * .2; });
  for (const samples of [silence, tone, noise, patternRecording('offbeat-lift', 100).slice(0, sr * 3)]) assert.deepEqual(suggestStrumming(samples, sr).candidates, []);
  assert.throws(() => suggestStrumming(new Float32Array([NaN]), sr), /Invalid/);
});
check('irregular attack spacing is reported instead of forced into a pattern', () => {
  const result = suggestStrumming(recording([.1, .37, .93, 1.23, 1.77, 2.04, 2.82, 3.05, 3.52, 4.29, 4.81, 5.06, 5.43, 6.39, 7.3, 7.47, 8.19], 9), sr);
  assert.equal(result.candidates.length, 0);
});
check('the complete local analyzer returns rhythm suggestions alongside chord/key estimates', () => {
  const result = analyzePcm(patternRecording('offbeat-lift', 100));
  assert.equal(result.strumming.candidates[0].patternId, 'offbeat-lift');
  assert.ok(result.regions.some(region => region.chord === 'C'));
});
check('rhythm drill timing preserves count-in, bars, chord order and rest subdivisions', () => {
  const config = { bpm: 100, countInBars: 1, barsPerChord: 2, strummingPatternId: 'offbeat-lift' };
  const { cues, entries } = buildDrillRhythm(config, 2);
  assert.equal(cues.length, 40);
  assert.ok(cues.slice(0, 8).every(cue => cue.countIn && cue.chordIndex === -1));
  assert.equal(cues[8].chordIndex, 0); assert.equal(cues[24].chordIndex, 1);
  assert.deepEqual(cues.slice(8, 16).map(cue => cue.stroke), getStrummingPattern('offbeat-lift').steps);
  assert.ok(Math.abs(entries[8].start - 2.4) < 1e-10); assert.ok(Math.abs(entries[24].start - 7.2) < 1e-10);
  entries.forEach((entry, index) => {
    assert.equal(entry.duration, .3);
    if (index) assert.ok(Math.abs(entry.start - entries[index - 1].start - .3) < 1e-10);
  });
  assert.equal(buildDrillRhythm({ ...config, countInBars: 0 }, 1).cues[0].chordIndex, 0);
});
check('invalid rhythm drill configuration is rejected explicitly', () => {
  const config = { bpm: 100, countInBars: 1, barsPerChord: 2, strummingPatternId: 'quarter-down' };
  for (const patch of [{ bpm: 0 }, { bpm: 200 }, { barsPerChord: 3 }, { countInBars: 10 }, { strummingPatternId: 'unknown' }]) assert.throws(() => buildDrillRhythm({ ...config, ...patch }, 4));
  assert.throws(() => buildDrillRhythm(config, 0));
});
console.log(`\n${checks}/${checks} strumming checks passed`);
