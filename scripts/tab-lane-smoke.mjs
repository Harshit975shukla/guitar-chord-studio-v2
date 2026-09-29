import assert from 'node:assert/strict';
import {
  cursorBeat, defaultSection, followingIndex, formatBeats, itemAtBeat, laneItems, laneLength, nextTarget,
  normalizeSection, pixelsPerBeat, sectionPlayback,
} from '../src/songs/tabLane.ts';
import { compileTiming, ORIGINAL_TIMING } from '../src/songs/timing.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
const resolve = event => event.type === 'rest' ? { label: 'Rest', positions: [], available: true }
  : event.type === 'note' ? { label: `n${event.fret}`, positions: [{ s: event.string - 1, f: event.fret, label: 'x' }], available: true }
    : { label: event.chord, positions: [{ s: 1, f: 1, label: 'C' }, { s: 4, f: 3, label: 'C' }], available: event.chord !== 'Z' };
const timing = { version: 1, bpm: 120, tempos: [], events: [
  { type: 'chord', chord: 'C', beats: 2, line: 0 },
  { type: 'note', string: 1, fret: 3, beats: .5, line: 0 },
  { type: 'rest', beats: .5, line: 0 },
  { type: 'chord', chord: 'G', beats: 1, line: 1 },
  { type: 'rest', beats: 1, line: 1 },
  { type: 'note', string: 2, fret: 0, beats: 1, line: 1 },
] };
const items = laneItems(timing, resolve);

check('tab items keep authored beats, order, lines and resolved positions', () => {
  assert.deepEqual(items.map(i => [i.index, i.beat, i.beats, i.kind, i.line]),
    [[0, 0, 2, 'chord', 0], [1, 2, .5, 'note', 0], [2, 2.5, .5, 'rest', 0], [3, 3, 1, 'chord', 1], [4, 4, 1, 'rest', 1], [5, 5, 1, 'note', 1]]);
  assert.equal(laneLength(items), 6);
  assert.deepEqual(items[1].positions, [{ s: 0, f: 3, label: 'x' }]);
  assert.equal(laneItems({ ...timing, events: [{ type: 'chord', chord: 'Z', beats: 1 }] }, resolve)[0].available, false);
});

check('the playhead follows scheduled audio times, including tempo changes, loops and the lead-in', () => {
  const entries = compileTiming(ORIGINAL_TIMING, 'song');
  let at = 10;
  const spans = entries.map(e => { const span = { index: e.index, beat: e.beat, beats: e.event.beats, start: at, end: at + e.duration }; at += e.duration; return span; });
  assert.deepEqual(cursorBeat(spans, 9.9), { index: 0, beat: 0 });
  near(cursorBeat(spans, 10.75).beat, 1);
  const slow = spans[3], fast = spans[4];
  near(slow.end - slow.start, .75); near(fast.end - fast.start, .25);
  near(cursorBeat(spans, slow.start + .375).beat, 3.5);
  near(cursorBeat(spans, fast.start + .125).beat, 4.25);
  assert.equal(cursorBeat(spans, at + 5).beat, ORIGINAL_TIMING.events.reduce((sum, e) => sum + e.beats, 0));
  const looped = [...spans, { ...spans[0], start: at, end: at + spans[0].end - spans[0].start }];
  near(cursorBeat(looped, at + .01).beat, (.01 / (spans[0].end - spans[0].start)) * 2);
  assert.equal(cursorBeat([], 5), null);
});

check('next target skips rests, counts their beats and respects the end of the chart', () => {
  assert.deepEqual(nextTarget(items, 0, 0, false, null), { index: 1, beatsAway: 2, restBeats: 0 });
  assert.deepEqual(nextTarget(items, 1, 2, false, null), { index: 3, beatsAway: 1, restBeats: .5 });
  assert.deepEqual(nextTarget(items, 3, 3.5, false, null), { index: 5, beatsAway: 1.5, restBeats: 1 });
  assert.equal(nextTarget(items, 5, 5, false, null), null);
  assert.deepEqual(nextTarget(items, 5, 5.25, true, null), { index: 0, beatsAway: .75, restBeats: 0 });
  assert.equal(nextTarget([{ index: 0, beat: 0, beats: 1, kind: 'rest', label: 'Rest', positions: [], available: true }], 0, 0, true, null), null);
});

check('loop sections wrap inside themselves and take precedence over the chart loop', () => {
  const section = { start: 1, end: 3 };
  assert.equal(followingIndex(1, 6, false, section), 2);
  assert.equal(followingIndex(3, 6, false, section), 1);
  assert.equal(followingIndex(3, 6, true, section), 1);
  assert.equal(followingIndex(0, 6, false, section), 1);
  assert.equal(followingIndex(5, 6, false, null), null);
  assert.equal(followingIndex(5, 6, true, null), 0);
  assert.deepEqual(nextTarget(items, 3, 3, false, section), { index: 1, beatsAway: 1, restBeats: 0 });
  assert.deepEqual(normalizeSection({ start: 4, end: 2 }, 6), { start: 2, end: 4 });
  assert.deepEqual(normalizeSection({ start: 2, end: 99 }, 6), { start: 2, end: 5 });
  assert.equal(normalizeSection({ start: 1, end: 2 }, 0), null);
  assert.equal(normalizeSection({ start: 1.5, end: 2 }, 6), null);
});

check('section playback hands the transport only the loop, starting at the current event when inside it', () => {
  const entries = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(sectionPlayback(entries, null, 2), { entries, start: 2, loopAll: false });
  assert.deepEqual(sectionPlayback(entries, { start: 1, end: 3 }, 2), { entries: ['b', 'c', 'd'], start: 1, loopAll: true });
  assert.deepEqual(sectionPlayback(entries, { start: 1, end: 3 }, 4), { entries: ['b', 'c', 'd'], start: 0, loopAll: true });
});

check('default sections follow lyric lines when authored, otherwise four events', () => {
  assert.deepEqual(defaultSection(items, 1, 'start'), { start: 1, end: 2 });
  assert.deepEqual(defaultSection(items, 4, 'end'), { start: 3, end: 4 });
  const plain = laneItems({ ...timing, events: timing.events.map(({ line, ...event }) => event) }, resolve);
  assert.deepEqual(defaultSection(plain, 1, 'start'), { start: 1, end: 4 });
  assert.deepEqual(defaultSection(plain, 1, 'end'), { start: 0, end: 1 });
});

check('hit testing maps a beat to its event and the scale keeps short notes readable', () => {
  assert.equal(itemAtBeat(items, 0), 0);
  assert.equal(itemAtBeat(items, 2.49), 1);
  assert.equal(itemAtBeat(items, 2.5), 2);
  assert.equal(itemAtBeat(items, 5.99), 5);
  assert.equal(itemAtBeat(items, 6), null);
  assert.equal(itemAtBeat(items, -1), null);
  assert.equal(pixelsPerBeat(items), 72);
  assert.equal(pixelsPerBeat(laneItems({ ...timing, events: [{ type: 'note', string: 1, fret: 0, beats: .25 }] }, resolve)), 136);
  assert.equal(pixelsPerBeat(laneItems({ ...timing, events: [{ type: 'note', string: 1, fret: 0, beats: 1 / 64 }] }, resolve)), 160);
  assert.equal(pixelsPerBeat(laneItems({ ...timing, events: [{ type: 'rest', beats: 1 }] }, resolve)), 72);
});

check('beat counts read naturally', () => {
  assert.equal(formatBeats(1), '1 beat');
  assert.equal(formatBeats(2), '2 beats');
  assert.equal(formatBeats(.5), '½ beats');
  assert.equal(formatBeats(1.75), '1¾ beats');
  assert.equal(formatBeats(.26), '¼ beats');
  assert.equal(formatBeats(0), '0 beats');
});

console.log(`\n${checks}/${checks} tab lane checks passed`);
