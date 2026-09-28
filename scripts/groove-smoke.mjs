import assert from 'node:assert/strict';
import {
  AUX_SAMPLES, STUDIO_SAMPLES, percussionSampleSet,
} from '../src/audio/percussionSampleData.ts';
import { GROOVE_ONLY_VOICES, PERCUSSION_VOICES } from '../src/audio/percussion.ts';
import {
  COUNT_IN_VOICE, DRUM_GROOVES, GROOVE_LANES, GROOVE_STYLES, PRACTICE_KEYS, PRACTICE_PROGRESSIONS,
  automaticFill, getDrumGroove, grooveVoices, loopGroove, loopTempo, parseLane, realizeProgression, suggestLoopBars,
} from '../src/audio/drumGrooves.ts';
import { GrooveSequencer, effectiveCountIn, swingOffset, validateGrooveSettings } from '../src/audio/grooveSequencer.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const base = { bpm: 120, countInBars: 1, fillEvery: 0, swing: .5, humanize: false, ramp: null, gap: null, seed: 7 };
const near = (actual, expected, epsilon = 1e-9, label = '') => assert.ok(Math.abs(actual - expected) < epsilon, `${label} ${actual} ≠ ${expected}`);
const groove = id => { const found = getDrumGroove(id); assert.ok(found, id); return found; };
const start = 10;
function play(id, settings = {}, seconds = 20, section = 'verse') {
  const sequencer = new GrooveSequencer(typeof id === 'string' ? groove(id) : id, { ...base, ...settings }, start, section);
  return { sequencer, ...sequencer.advance(start + seconds) };
}
const barStarts = cues => cues.filter(cue => cue.step === 0);
const hitsIn = (hits, from, to) => hits.filter(hit => hit.time >= from - 1e-6 && hit.time < to - 1e-6);

check('groove library covers many styles with valid, playable, sample-backed lanes', () => {
  assert.ok(DRUM_GROOVES.length >= 24, `${DRUM_GROOVES.length} grooves`);
  assert.equal(new Set(DRUM_GROOVES.map(g => g.id)).size, DRUM_GROOVES.length);
  assert.ok(GROOVE_STYLES.length >= 6);
  for (const g of DRUM_GROOVES) {
    assert.ok(g.description.length > 20 && g.tip.length > 10, g.id);
    assert.ok(g.tempo[0] <= g.tempo[1] && g.tempo[1] <= g.tempo[2] && g.tempo[0] >= 30 && g.tempo[2] <= 260, g.id);
    assert.equal(g.stepsPerBar, g.beatsPerBar * g.stepsPerBeat);
    for (const [name, lanes, bars] of [['main', g.main, g.bars], ['chorus', g.chorus, g.bars], ['fill', g.fill, 1]]) {
      assert.ok(Object.keys(lanes).length > 0, `${g.id}.${name} is empty`);
      for (const [lane, steps] of Object.entries(lanes)) {
        assert.ok(Object.hasOwn(GROOVE_LANES, lane), `${g.id}.${name}.${lane}`);
        assert.equal(steps.length, g.stepsPerBar * bars, `${g.id}.${name}.${lane}`);
        assert.ok(steps.every(level => level >= 0 && level <= 1));
      }
      for (let bar = 0; bar < bars; bar++) {
        const count = Object.values(lanes).reduce((sum, steps) => sum + steps.slice(bar * g.stepsPerBar, (bar + 1) * g.stepsPerBar).filter(Boolean).length, 0);
        assert.ok(count >= 3, `${g.id}.${name} bar ${bar + 1} has only ${count} hits`);
      }
    }
    for (const voice of grooveVoices(g)) {
      assert.ok(Object.hasOwn(PERCUSSION_VOICES, voice), voice);
      for (const kit of ['studio', 'drums', 'drums-smooth', 'drums-energetic']) assert.ok(percussionSampleSet(voice, kit)?.length, `${g.id}: ${voice} in ${kit}`);
    }
    if (g.kitGroove) assert.ok(grooveVoices(g).has('crash'));
    assert.ok(grooveVoices(g).has(COUNT_IN_VOICE));
  }
  for (const id of ['keherwa', 'dadra']) assert.match(groove(id).description, /Not a tabla performance/);
  assert.equal(groove('shuffle').swingUnit, null);
  assert.equal(groove('boom-bap').swingUnit, 8);
  assert.throws(() => parseLane('x.x', 4, 'test'), /expected 4 steps/);
  assert.throws(() => parseLane('x.q.', 4, 'test'), /unknown stroke/);
});

check('studio kit and auxiliary recordings are layered, trimmed CC0 assets distinct from the pulse player', () => {
  for (const set of [...Object.values(STUDIO_SAMPLES), ...Object.values(AUX_SAMPLES)]) for (const asset of set) {
    assert.equal(asset.source, 'VCSL'); assert.ok(asset.maxSeconds > 0 && asset.maxSeconds <= 2.4);
    assert.match(asset.url, /^https:\/\/raw\.githubusercontent\.com\/sgossner\/VCSL\/c1ea7bcc/);
  }
  assert.deepEqual([...new Set(STUDIO_SAMPLES.snare.map(a => a.velocity))], [.3, .55, .78, 1]);
  assert.deepEqual([...new Set(STUDIO_SAMPLES.hihat.map(a => a.velocity))], [.3, .55, .78, 1]);
  assert.equal(percussionSampleSet('snare', 'studio'), STUDIO_SAMPLES.snare);
  assert.equal(percussionSampleSet('snare', 'drums')[0].source, 'Musicca');
  assert.equal(percussionSampleSet('kick', 'studio')[0].path, 'musicca/standard/bass.mp3');
  assert.equal(percussionSampleSet('clap', 'drums-smooth'), AUX_SAMPLES.clap);
  for (const voice of GROOVE_ONLY_VOICES) assert.ok(PERCUSSION_VOICES[voice]);
});

check('count-in, grid and backbeat land on exact audio-clock times at the default count-in', () => {
  const { hits, cues, sequencer } = play('rock', {}, 4);
  const clicks = hits.filter(hit => hit.lane === 'count');
  assert.deepEqual(clicks.map(hit => hit.time), [10, 10.5, 11, 11.5]);
  assert.deepEqual(clicks.map(hit => hit.velocity), [1, .62, .62, .62]);
  assert.equal(sequencer.musicStart, 12);
  const first = cues.find(cue => cue.bar === 0 && cue.step === 0);
  assert.equal(first.time, 12); assert.equal(first.kind, 'groove');
  const bar0 = hitsIn(hits, 12, 14);
  assert.deepEqual(bar0.filter(h => h.lane === 'kick').map(h => h.time), [12, 13, 13.25]);
  assert.deepEqual(bar0.filter(h => h.lane === 'snare').map(h => h.time), [12.5, 13.5]);
  assert.equal(bar0.filter(h => h.lane === 'hat').length, 8);
  for (let i = 1; i < cues.length; i++) near(cues[i].time - cues[i - 1].time, .125, 1e-9, 'step');
  assert.equal(effectiveCountIn(groove('rock'), 0), 0);
  assert.equal(play('rock', { countInBars: 0 }, 1).cues[0].kind, 'groove');
});

check('short and compound meters count in with at least three clicks at the counted beat', () => {
  const ballad = play('ballad-68', { bpm: 60 }, 5);
  const clicks = ballad.hits.filter(h => h.lane === 'count');
  [10, 11, 12, 13].forEach((time, i) => near(clicks[i].time, time, 1e-9, 'dotted-quarter click'));
  assert.equal(clicks.length, 4);
  assert.deepEqual(clicks.map(h => h.velocity), [1, .62, 1, .62]);
  near(ballad.cues[1].time - ballad.cues[0].time, 1 / 3, 1e-9, 'eighth in 6/8');
  const waltz = play('waltz', { bpm: 90 }, 2.5);
  assert.equal(waltz.hits.filter(h => h.lane === 'count').length, 3);
});

check('swing delays only straight off-beats: sixteenth, eighth and triplet grids', () => {
  const funk = groove('funk'), boom = groove('boom-bap'), shuffle = groove('shuffle');
  near(swingOffset(funk, 1, .6, .5), .025); near(swingOffset(funk, 2, .6, .5), 0); near(swingOffset(funk, 3, .6, .5), .025);
  near(swingOffset(boom, 2, .6, .5), .05); near(swingOffset(boom, 1, .6, .5), .025); near(swingOffset(boom, 0, .6, .5), 0);
  assert.equal(swingOffset(shuffle, 1, .7, .5), 0);
  const swung = play('boom-bap', { countInBars: 0, swing: .6 }, 2).hits.filter(h => h.lane === 'hat').map(h => h.time);
  near(swung[1], 10.25 + .05, 1e-9, 'swung eighth hat');
  const straight = play('boom-bap', { countInBars: 0, swing: .5 }, 2).hits.filter(h => h.lane === 'hat').map(h => h.time);
  near(straight[1], 10.25);
});

check('automatic and manual fills replace whole bars; crashes mark the downbeat after a fill', () => {
  const { cues, hits } = play('rock', { countInBars: 0, fillEvery: 4 }, 20);
  const kinds = barStarts(cues).map(cue => cue.kind);
  assert.deepEqual(kinds.slice(0, 9), ['groove', 'groove', 'groove', 'fill', 'groove', 'groove', 'groove', 'fill', 'groove']);
  const crashes = hits.filter(h => h.lane === 'crash').map(h => h.time);
  assert.deepEqual(crashes.slice(0, 2), [18, 26]);
  const fillBar = hitsIn(hits, 16, 18);
  assert.ok(fillBar.some(h => h.lane === 'floorTom') && !fillBar.some(h => h.lane === 'crash'));
  const manual = new GrooveSequencer(groove('pop'), { ...base, countInBars: 0 }, start);
  manual.advance(start + 2.05);
  assert.equal(manual.queueFill(), true);
  const next = manual.advance(start + 8);
  assert.deepEqual(barStarts(next.cues).map(cue => [cue.bar, cue.kind]), [[2, 'fill'], [3, 'groove']]);
  assert.ok(next.hits.some(h => h.lane === 'crash' && h.time === start + 6));
  const hand = automaticFill(groove('son').main, 4, 4, 96);
  assert.ok(hand.congaLow && !hand.tom1, 'hand-percussion grooves fill on hand drums');
});

check('section changes wait for a transition fill, then switch lanes with a crash', () => {
  const sequencer = new GrooveSequencer(groove('rock'), { ...base, countInBars: 0 }, start);
  const verse = sequencer.advance(start + 2.1);
  assert.ok(!verse.hits.some(h => h.lane === 'hatOpen'));
  sequencer.setSection('chorus');
  assert.equal(sequencer.pendingSection, 'chorus');
  const rest = sequencer.advance(start + 8);
  const bars = barStarts(rest.cues);
  assert.equal(bars[0].kind, 'fill'); assert.equal(bars[0].pending, 'chorus');
  assert.equal(bars[1].kind, 'groove'); assert.equal(bars[1].section, 'chorus'); assert.equal(bars[1].pending, null);
  assert.ok(rest.hits.some(h => h.lane === 'hatOpen' && h.time >= start + 6));
  assert.ok(rest.hits.some(h => h.lane === 'crash' && h.time === start + 6));
  sequencer.setSection('chorus');
  assert.equal(sequencer.pendingSection, null);
  const idleChorus = play('rock', { countInBars: 0 }, 2, 'chorus');
  assert.ok(idleChorus.hits.some(h => h.lane === 'hatOpen'));
});

check('silent-bar trainer mutes whole bars and never places fills or crashes inside them', () => {
  const { cues, hits } = play('rock', { countInBars: 0, fillEvery: 2, gap: { play: 2, mute: 1 } }, 18);
  const kinds = barStarts(cues).map(cue => cue.kind);
  assert.deepEqual(kinds.slice(0, 9), ['groove', 'fill', 'gap', 'fill', 'groove', 'gap', 'groove', 'fill', 'gap']);
  for (const cue of barStarts(cues).filter(cue => cue.kind === 'gap')) assert.equal(hitsIn(hits, cue.time, cue.time + 2).length, 0);
});

check('speed trainer raises tempo at bar lines up to the target, and live tempo changes stay continuous', () => {
  const { cues } = play('rock', { countInBars: 0, bpm: 100, ramp: { step: 5, everyBars: 2, target: 110 } }, 20);
  const bpms = barStarts(cues).map(cue => cue.bpm);
  assert.deepEqual(bpms.slice(0, 8), [100, 100, 105, 105, 110, 110, 110, 110]);
  const bars = barStarts(cues);
  near(bars[2].time - bars[1].time, 2.4, 1e-9, '100 BPM bar'); near(bars[3].time - bars[2].time, 240 / 105, 1e-9, '105 BPM bar');
  const live = new GrooveSequencer(groove('rock'), { ...base, countInBars: 0 }, start);
  const before = live.advance(start + .3).cues;
  live.setBpm(60);
  const after = live.advance(start + 2).cues;
  near(after[0].time - before.at(-1).time, .125, 1e-9, 'step already scheduled keeps its length');
  near(after[1].time - after[0].time, .25, 1e-9, 'new tempo step');
  const all = [...before, ...after];
  for (let i = 1; i < all.length; i++) assert.ok(all[i].time > all[i - 1].time);
});

check('human feel is deterministic, small, bounded and leaves the count-in exact', () => {
  const a = play('funk', { humanize: true }, 12), b = play('funk', { humanize: true }, 12), exact = play('funk', {}, 12);
  assert.deepEqual(a.hits, b.hits);
  assert.equal(a.hits.length, exact.hits.length);
  a.hits.forEach((hit, i) => {
    const reference = exact.hits[i], limit = ['kick', 'snare'].includes(hit.lane) ? .003 : .006;
    assert.equal(hit.lane, reference.lane);
    assert.ok(Math.abs(hit.time - reference.time) <= limit + 1e-12, `${hit.lane} ${hit.time - reference.time}`);
    assert.ok(hit.velocity >= .05 && hit.velocity <= 1);
    if (hit.lane === 'count') assert.equal(hit.time, reference.time);
  });
  assert.ok(a.hits.some((hit, i) => hit.time !== exact.hits[i].time));
});

check('imported loops follow their own length: tempo from bars, count-in clicks and silent bars only', () => {
  assert.equal(loopTempo(4, 4, 2), 120);
  assert.equal(suggestLoopBars(4, 4), 2);
  assert.equal(suggestLoopBars(9.6, 4), 4);
  assert.equal(suggestLoopBars(3, 3), 2);
  assert.throws(() => loopGroove('4/4', 3), /1, 2, 4 or 8 bars/);
  const loop = loopGroove('4/4', 2);
  const sequencer = new GrooveSequencer(loop, { ...base, bpm: loopTempo(4, 4, 2), gap: { play: 2, mute: 2 } }, start);
  assert.equal(sequencer.queueFill(), false);
  sequencer.setSection('chorus');
  const { hits, cues } = sequencer.advance(start + 12);
  assert.ok(hits.every(hit => hit.lane === 'count'));
  assert.equal(hits.length, 4);
  assert.deepEqual(barStarts(cues).map(cue => [cue.bar, cue.kind, cue.patternBar]),
    [[-1, 'count-in', 0], [0, 'groove', 0], [1, 'groove', 1], [2, 'gap', 0], [3, 'gap', 1], [4, 'groove', 0]]);
  assert.equal(sequencer.section, 'verse');
});

check('chord prompts realize common progressions with key-appropriate spelling', () => {
  assert.deepEqual(realizeProgression('pop', 'G'), ['G', 'D', 'Em', 'C']);
  assert.deepEqual(realizeProgression('pop', 'F'), ['F', 'C', 'Dm', 'Bb']);
  assert.deepEqual(realizeProgression('blues', 'A'), ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7']);
  assert.deepEqual(realizeProgression('epic', 'A'), ['Am', 'F', 'C', 'G']);
  assert.deepEqual(realizeProgression('epic', 'D'), ['Dm', 'Bb', 'F', 'C']);
  assert.deepEqual(realizeProgression('andalusian', 'A'), ['Am', 'G', 'F', 'E']);
  assert.deepEqual(realizeProgression('jazz', 'C'), ['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
  assert.deepEqual(realizeProgression('classic', 'E'), ['E', 'A', 'B', 'A']);
  for (const id of Object.keys(PRACTICE_PROGRESSIONS)) for (const key of PRACTICE_KEYS) assert.ok(realizeProgression(id, key).every(Boolean));
  assert.throws(() => realizeProgression('missing', 'C'), /Unknown chord progression/);
});

check('invalid groove settings are rejected with explicit messages', () => {
  validateGrooveSettings(base);
  for (const [change, pattern] of [[{ bpm: 10 }, /Tempo/], [{ bpm: NaN }, /Tempo/], [{ countInBars: 9 }, /Count-in/], [{ fillEvery: 3 }, /fill/],
    [{ swing: .9 }, /Swing/], [{ ramp: { step: 0, everyBars: 4, target: 140 } }, /speed trainer/], [{ gap: { play: 0, mute: 1 } }, /Silent bars/]]) {
    assert.throws(() => validateGrooveSettings({ ...base, ...change }), pattern);
  }
  assert.throws(() => new GrooveSequencer(groove('rock'), base, -1), /start time/);
});

console.log(`\n${checks}/${checks} groove checks passed`);
