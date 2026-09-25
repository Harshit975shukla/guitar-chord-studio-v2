import assert from 'node:assert/strict';
import { validateTiming, compileTiming, ORIGINAL_TIMING, resolveSongNote, transposeSongChord } from '../src/songs/timing.ts';
import { PerformanceGate, matchesTarget } from '../src/songs/performance.ts';
import { SongTransport } from '../src/songs/transport.ts';
import { buildSongCatalog, normalizeSong, searchSongs, findSong, importSong, parseChordSheet, songTimeline, ORIGINAL_EXERCISE } from '../src/songs/catalog.ts';
import { mergeCustomSongs, saveCustomSong, loadCustomSongs } from '../src/storage/index.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';

let count = 0;
function check(name, fn) { fn(); console.log(`PASS  ${name}`); count++; }
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const metadata = { title: 'Copper Steps', artist: 'Original Duo', key: 'C', bpm: 90, strum: 'down' };
const song = (id, title, artist = 'Original Duo') => ({ ...ORIGINAL_EXERCISE, id, title, artist });
function result(symbol = 'C', id = 1, at = 200, options = {}) {
  return {
    mode: 'chord', freshness: 'fresh', timestamp: at,
    chord: { symbol, confidence: 85 }, performance: { id, attackAt: at, frameAt: at, signalPresent: true }, ...options,
  };
}
function quiet(gate, start, id = 0) {
  gate.consume(result('C', id, start, { freshness: 'held', performance: { id, attackAt: 0, frameAt: start, signalPresent: false } }));
  gate.consume(result('C', id, start + 120, { freshness: 'held', performance: { id, attackAt: 0, frameAt: start + 120, signalPresent: false } }));
}

check('unequal beats, rests, tempo changes, speed and fixed tempo preserve exact rhythm', () => {
  const timing = validateTiming(ORIGINAL_TIMING);
  const entries = compileTiming(timing, 'song');
  assert.deepEqual(entries.map(e => e.event.type), ['chord', 'chord', 'rest', 'note', 'note', 'rest', 'chord']);
  const durations = [1.5, .375, .375, .75, .25, .25, 1];
  entries.forEach((e, i) => approx(e.duration, durations[i]));
  entries.slice(1).forEach((e, i) => approx(e.start, entries[i].start + entries[i].duration));
  compileTiming(timing, 'song', 80, .5).forEach((e, i) => approx(e.duration, durations[i] * 2));
  compileTiming(timing, 'fixed', 120, .5).forEach(e => approx(e.duration, e.event.beats * .5));
});
check('tempo change inside an event integrates both segments without a duration floor', () => {
  const t = validateTiming({ version: 1, bpm: 60, tempos: [{ beat: 1, bpm: 120 }], events: [{ type: 'rest', beats: 2 }, { type: 'note', string: 1, fret: 0, beats: .125 }] });
  const e = compileTiming(t, 'song');
  approx(e[0].duration, 1.5); approx(e[1].duration, .0625); approx(e[1].start, 1.5);
});
check('invalid timing reports errors rather than coercing/clamping authored data', () => {
  for (const patch of [
    { version: 2 }, { bpm: '80' }, { bpm: 0 }, { events: [] },
    { events: [{ type: 'note', string: 0, fret: 2, beats: 1 }] },
    { events: [{ type: 'note', string: 1, fret: 13, beats: 1 }] },
    { events: [{ type: 'rest', beats: 0 }] },
    { events: [{ type: 'rest', beats: .00001 }] },
    { events: [{ type: 'chord', chord: 'Cunknown', beats: 1 }] },
    { tempos: [{ beat: 2, bpm: 80 }, { beat: 1, bpm: 90 }] },
    { tempos: [{ beat: 1, bpm: 80 }, { beat: 1, bpm: 90 }] },
  ]) assert.throws(() => validateTiming({ ...ORIGINAL_TIMING, ...patch }));
});
check('transpose preserves pitch across strings and capo rather than octave-wrapping', () => {
  assert.equal(transposeSongChord('Dbm7/Ab', 2), 'D#m7/A#');
  const tuned = STANDARD_TUNING.map(s => ({ ...s, midi: s.midi + 2 }));
  assert.equal(resolveSongNote({ type: 'note', string: 1, fret: 0, beats: 1 }, tuned, 3).midi, 69);
  assert.equal(resolveSongNote({ type: 'note', string: 1, fret: 12, beats: 1 }, tuned, 11), null);
});
check('matching is exact in root, quality and note octave; enharmonic chords agree', () => {
  assert.equal(matchesTarget({ type: 'chord', chord: 'C' }, result('Cm')), false);
  assert.equal(matchesTarget({ type: 'chord', chord: 'C' }, result('Cmaj7')), false);
  assert.equal(matchesTarget({ type: 'chord', chord: 'Dbm' }, result('C#m')), true);
  assert.equal(matchesTarget({ type: 'chord', chord: 'C/E' }, result('C')), false);
  assert.equal(matchesTarget({ type: 'note', midi: 64 }, result('', 1, 200, { mode: 'single-note', note: { pitch: { midi: 52 }, confidence: 90 } })), false);
});
check('Wait rejects held, wrong, pre-target and ambiguous evidence, accepts a new confirmed attack once', () => {
  const g = new PerformanceGate();
  g.setTarget({ type: 'chord', chord: 'C' }, 100);
  quiet(g, 100);
  assert.equal(g.consume(result('C', 1, 90)), false);
  assert.equal(g.consume(result('Cm', 2, 230)), false);
  assert.equal(g.consume(result('C', 2, 230, { freshness: 'held' })), false);
  assert.equal(g.consume(result('C', 2, 230, { mode: 'idle', chord: undefined })), false);
  assert.equal(g.consume(result('C', 3, 260)), true);
  assert.equal(g.consume(result('C', 3, 300)), false);
});
check('consecutive identical and changed targets require new post-target performances', () => {
  const g = new PerformanceGate();
  g.setTarget({ type: 'chord', chord: 'C' }, 0); quiet(g, 0);
  assert.equal(g.consume(result('C', 1, 200)), true);
  g.setTarget({ type: 'chord', chord: 'C' }, 220);
  assert.equal(g.consume(result('C', 1, 300)), false);
  assert.equal(g.consume(result('C', 2, 320)), true);
  g.setTarget({ type: 'chord', chord: 'G' }, 330);
  assert.equal(g.consume(result('G', 2, 350)), false);
  assert.equal(g.consume(result('G', 3, 360)), true);
});
check('notes need two supported fresh frames; auditions require release before rearming', () => {
  const g = new PerformanceGate(); g.setTarget({ type: 'note', midi: 64 }, 0); quiet(g, 0);
  const note = (id, at) => result('', id, at, { mode: 'single-note', note: { pitch: { midi: 64 }, confidence: 90 } });
  assert.equal(g.consume(note(1, 200)), false);
  assert.equal(g.consume(note(1, 232)), true);
  g.setTarget({ type: 'note', midi: 64 }, 240); g.requireRelease();
  assert.equal(g.consume(note(2, 300)), false);
  quiet(g, 320, 2);
  assert.equal(g.consume(note(3, 460)), false);
  assert.equal(g.consume(note(3, 492)), true);
});

function transportFixture() {
  let now = 0, id = 0;
  const timers = new Map(), played = [], targets = [];
  let finishes = 0, stalls = 0, cancels = 0;
  const clock = { now: () => now, setTimer: (fn, ms) => { timers.set(++id, { fn, at: now + ms / 1000 }); return id; }, clearTimer: id => timers.delete(id) };
  const transport = new SongTransport(clock, {
    play: (entry, at, end) => { played.push({ index: entry.index, type: entry.event.type, at, end }); return () => cancels++; },
    target: e => targets.push({ index: e.index, at: now }),
    finish: () => finishes++, stalled: () => stalls++,
  });
  return {
    transport, played, targets, timers,
    get finishes() { return finishes; }, get stalls() { return stalls; }, get cancels() { return cancels; },
    advance(to) { for (;;) { const next = [...timers].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].fn(); } now = to; },
    stall(to) { now = to; const pending = [...timers.values()]; timers.clear(); pending.forEach(t => t.fn()); },
  };
}
check('audio-clock scheduling is boundary-stable and never displays scheduled-ahead targets early', () => {
  const f = transportFixture(), entries = compileTiming(ORIGINAL_TIMING, 'song');
  f.transport.start(entries, 0, false); f.advance(.08);
  assert.equal(f.played.length, 1); assert.equal(f.targets.length, 0);
  f.advance(5);
  assert.equal(f.played.length, entries.length);
  f.played.forEach((p, i) => { approx(p.at, .1 + entries[i].start); approx(p.end - p.at, entries[i].duration); });
  f.targets.forEach((t, i) => { assert.ok(t.at >= f.played[i].at - 1e-6); assert.ok(t.at - f.played[i].at < .021); });
  assert.equal(f.finishes, 1);
});
check('seek/stop cancel timers/audio and stale callbacks; stalls do not burst through skipped events', () => {
  const f = transportFixture(), e = compileTiming(ORIGINAL_TIMING, 'song');
  f.transport.start(e, 0, false); f.advance(.3);
  const callbacks = [...f.timers.values()].map(t => t.fn);
  f.transport.stop(); callbacks.forEach(fn => fn());
  assert.equal(f.timers.size, 0); assert.ok(f.cancels > 0);
  f.transport.start(e, 3, false); f.advance(.5);
  assert.equal(f.played.at(-1).index, 3);
  const n = f.played.length;
  f.stall(20);
  assert.equal(f.played.length, n + 1);
  assert.equal(f.played.at(-1).index, 4);
  assert.ok(f.played.at(-1).at > 20);
  assert.equal(f.stalls, 1);
});
check('looping uses contiguous event durations, and stop prevents later loop playback', () => {
  const f = transportFixture(), e = compileTiming({ version: 1, bpm: 120, tempos: [], events: [{ type: 'rest', beats: .5 }] }, 'fixed');
  f.transport.start(e, 0, true); f.advance(1);
  assert.ok(f.played.length >= 4);
  f.played.slice(1).forEach((p, i) => approx(p.at, f.played[i].end));
  f.transport.stop(); const n = f.played.length; f.advance(5); assert.equal(f.played.length, n);
});
check('chart import preserves repetitions/order across lines, never uses chord inventory as sequence', () => {
  const source = '[Verse]\n[C]Copper [G]steps\nC C Am G\nOne original line\n[G]Pause [C]here';
  const chart = parseChordSheet(source);
  assert.deepEqual(chart.lines.flatMap(l => l.chords.map(c => c.chord)), ['C', 'G', 'C', 'C', 'Am', 'G', 'G', 'C']);
  const imported = normalizeSong(importSong(source, metadata, 'custom-chart'));
  assert.equal(imported.sourceText, source);
  assert.deepEqual(songTimeline(imported, 'chords').events.map(e => e.chord), ['C', 'G', 'C', 'C', 'Am', 'G', 'G', 'C']);
  assert.equal(songTimeline(normalizeSong({ ...song('inventory', 'Inventory'), timing: undefined, lines: [], chordsUsed: ['C', 'G'] }), 'chords').events.length, 0);
});
check('ASCII tab text is preserved with explicit limitation, not fabricated playable notes', () => {
  const source = 'e|---0h2--3~---|\nB|------------|';
  const imported = normalizeSong(importSong(source, metadata, 'custom-tab-text'));
  assert.equal(imported.sourceText, source);
  assert.equal(imported.availability.tabs, false);
  assert.equal(imported.availability.chords, false);
  assert.match(imported.warnings.join(), /not converted/);
});
check('Finder prioritizes exact title/artist, handles typo and Unicode, and rejects empty punctuation', () => {
  const catalog = buildSongCatalog([song('exact', 'Copper Steps'), song('artist', 'Slow Window', 'Copper Steps'), song('unicode', 'रात की चाल', 'नील'), song('other', 'Copper Steps Again')], {}, []);
  const filter = { field: 'all', content: 'all' };
  assert.equal(searchSongs(catalog, 'Copper Steps', filter)[0].id, 'exact');
  assert.equal(searchSongs(catalog, 'Copper Steps', { ...filter, field: 'artist' })[0].id, 'artist');
  assert.equal(searchSongs(catalog, 'Coper Steps', filter)[0].id, 'exact');
  assert.equal(searchSongs(catalog, 'रात', filter)[0].id, 'unicode');
  for (const query of ['', '...', '###', 'nonexistent title']) assert.deepEqual(searchSongs(catalog, query, filter), []);
});
check('catalog resolves exact IDs, deduplicates built-ins and keeps conflicting custom IDs distinct', () => {
  const imported = { ...song('a', 'Imported A'), isCustom: true };
  const catalog = buildSongCatalog([song('a', 'Base A')], { a: song('a', 'Public A') }, [imported, { ...imported, id: 'imported:a', title: 'Another copy' }]);
  assert.equal(findSong(catalog, 'a').title, 'Public A');
  assert.equal(findSong(catalog, 'imported:a').title, 'Imported A');
  assert.equal(new Set(catalog.map(s => s.id)).size, catalog.length);
  assert.throws(() => findSong(catalog, 'missing'), /not in the local library/);
});
check('canonical + legacy reads are nondestructive and conflict versions survive save/reload', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const a = { ...song('legacy-one', 'Old Copper'), isCustom: true };
  data.set('guitar_custom_songs', JSON.stringify([a]));
  const before = data.get('guitar_custom_songs');
  const b = importSong('[C]Two [G]steps', metadata, 'custom-new');
  saveCustomSong(b);
  assert.equal(data.get('guitar_custom_songs'), before);
  assert.ok(loadCustomSongs().some(s => s.id === a.id));
  assert.ok(loadCustomSongs().some(s => s.id === b.id));
  const merged = mergeCustomSongs([a], [{ ...a, title: 'Different version' }]);
  assert.equal(merged.length, 2); assert.notEqual(merged[0].id, merged[1].id);
  assert.equal(mergeCustomSongs([a], [a]).length, 1);
  data.set('guitar_studio_custom_songs', '{malformed');
  assert.throws(() => saveCustomSong(b), /not been overwritten/);
  assert.equal(data.get('guitar_studio_custom_songs'), '{malformed');
});
check('timing JSON roundtrip retains authored durations, provenance and actual available content', () => {
  const exported = { ...song('author', 'Original Timing'), source: 'My notebook', versionLabel: 'Take 2' };
  const imported = importSong(JSON.stringify(exported), { ...metadata, title: '', artist: '' }, 'roundtrip');
  assert.deepEqual(imported.timing, validateTiming(ORIGINAL_TIMING));
  assert.equal(imported.source, 'My notebook'); assert.equal(imported.versionLabel, 'Take 2');
  localStorage.setItem('guitar_studio_custom_songs', '[]');
  saveCustomSong(imported);
  assert.deepEqual(loadCustomSongs().find(s => s.id === 'roundtrip').timing, imported.timing);
  const catalog = buildSongCatalog([], {}, [imported]);
  assert.equal(searchSongs(catalog, 'Original Timing', { field: 'title', content: 'imported' })[0].id, 'roundtrip');
  assert.equal(findSong(catalog, 'roundtrip').availability.authored, true);
  assert.ok(findSong(catalog, 'roundtrip').availability.labels.every(label => !/^full|^verified/i.test(label)));
});
console.log(`\n${count}/${count} song reliability checks passed`);
