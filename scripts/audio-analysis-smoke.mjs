import assert from 'node:assert/strict';
import { ANALYSIS_RATE, analyzePcm, analysisToSong, suggestKeys } from '../src/analysis/audioAnalysis.ts';
import { youtubeVideoId } from '../src/analysis/youtube.ts';
import { renderStringSamples } from '../src/audio/engine.ts';
import { DetectionEngine } from '../src/detection/engine.ts';
import { compileTiming } from '../src/songs/timing.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS  ${name}`); }
function tones(freqs, seconds) {
  const samples = new Float32Array(Math.round(seconds * ANALYSIS_RATE));
  for (let i = 0; i < samples.length; i++) for (const f of freqs) samples[i] += .08 * Math.sin(2 * Math.PI * f * i / ANALYSIS_RATE);
  return samples;
}
check('original string synthesis is deterministic, bounded and click-safe at buffer ends', () => {
  for (const model of ['nylon', 'dreadnought', 'twelve']) {
    const params = { freq: 220, stringIndex: 4, model, velocity: .9, startTime: 0 };
    const samples = renderStringSamples(44100, params);
    assert.deepEqual(samples, renderStringSamples(44100, params));
    assert.equal(Math.abs(samples[0]), 0); assert.equal(Math.abs(samples.at(-1)), 0);
    assert.ok(samples.every(n => Number.isFinite(n) && Math.abs(n) <= .801));
  }
});
check('loop-filter compensation keeps guitar pitches within five cents across models', () => {
  for (const model of ['nylon', 'dreadnought', 'twelve']) for (const freq of [82.4069, 110, 196, 329.63, 440]) {
    const samples = renderStringSamples(44100, { freq, stringIndex: 2, model, velocity: 1, startTime: 0 });
    const found = new DetectionEngine().fastAutocorrelate(samples.subarray(2205, 2205 + 8192), 44100);
    assert.ok(Math.abs(1200 * Math.log2(found.freq / freq)) < 5, `${model} ${freq}: ${found.freq}`);
  }
  assert.throws(() => renderStringSamples(44100, { freq: NaN, stringIndex: 0, velocity: 1, startTime: 0 }));
});
check('offline FFT/chroma recognizes original C triad and provides cautious key candidates', () => {
  const progress = [];
  const result = analyzePcm(tones([130.81, 164.81, 196], 3), p => progress.push(p));
  assert.equal(result.regions[0].chord, 'C');
  assert.equal(result.regions.at(-1).end, 3);
  assert.equal(result.keys[0].root, 'C');
  assert.equal(result.keys[0].mode, 'major');
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.every((n, i) => !i || n >= progress[i - 1]));
});
check('changing chords and silence cover the full recording without fabricated gap timing', () => {
  const c = tones([130.81, 164.81, 196], 2), g = tones([98, 123.47, 146.83, 196, 246.94, 293.66], 2);
  const samples = new Float32Array(ANALYSIS_RATE * 5);
  samples.set(c); samples.set(g, ANALYSIS_RATE * 3);
  const result = analyzePcm(samples);
  assert.ok(result.regions.some(r => r.chord === 'C'));
  assert.ok(result.regions.some(r => r.chord === 'G'));
  assert.ok(result.regions.some(r => r.kind === 'silence' && r.end - r.start >= .8));
  assert.equal(result.regions[0].start, 0); assert.equal(result.regions.at(-1).end, 5);
  result.regions.forEach((region, i) => { assert.ok(region.end > region.start); if (i) assert.equal(region.start, result.regions[i - 1].end); });
});
check('silence, noise and a pure single note do not invent a chord/key', () => {
  const silence = analyzePcm(new Float32Array(ANALYSIS_RATE));
  assert.equal(silence.regions.length, 1); assert.equal(silence.regions[0].kind, 'silence'); assert.deepEqual(silence.keys, []);
  let seed = 99;
  const noise = Float32Array.from({ length: ANALYSIS_RATE }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0x100000000 - .5) * .2;
  });
  for (const result of [analyzePcm(noise), analyzePcm(tones([329.63], 1))]) {
    assert.ok(result.regions.every(region => region.chord === null)); assert.deepEqual(result.keys, []);
  }
});
check('invalid or oversize analysis is rejected explicitly', () => {
  assert.throws(() => analyzePcm(new Float32Array()), /non-empty/);
  assert.throws(() => analyzePcm(new Float32Array([NaN])), /invalid/);
  assert.throws(() => analyzePcm(new Float32Array(ANALYSIS_RATE * 300 + 1)), /5 minutes/);
  assert.deepEqual(suggestKeys(new Array(12).fill(0)), []);
});
check('draft import retains seconds and requires explicit handling of uncertain regions', () => {
  const result = { duration: 2, regions: [
    { start: 0, end: 1, chord: 'C', kind: 'chord', match: 82 },
    { start: 1, end: 1.5, chord: null, kind: 'uncertain', match: null },
    { start: 1.5, end: 2, chord: 'G', kind: 'chord', match: 80 },
  ], keys: [{ root: 'C', mode: 'major', fit: .7 }], keyUncertain: true };
  assert.throws(() => analysisToSong(result, 'Original recording', 'Own audio', 120, false, 'draft'), /uncertain/);
  const song = analysisToSong(result, 'Original recording', 'Own audio', 120, true, 'draft');
  assert.equal(song.key, 'Uncertain');
  assert.deepEqual(song.timing.events.map(e => e.type), ['chord', 'rest', 'chord']);
  const timed = compileTiming(song.timing, 'song');
  assert.deepEqual(timed.map(e => e.duration), [1, .5, .5]);
  assert.match(song.versionLabel, /unverified/);
  assert.throws(() => analysisToSong({ ...result, regions: result.regions.slice(1, 2) }, 'Silence', '', 120, true, 'silent'), /No confident chord/);
});
check('YouTube references accept only supported HTTPS video URLs, never arbitrary embeds', () => {
  const video = 'AbC_deF-123';
  for (const url of [
    `https://www.youtube.com/watch?v=${video}`, `https://youtu.be/${video}`,
    `https://youtube.com/shorts/${video}`, `https://www.youtube.com/live/${video}`,
    `https://www.youtube-nocookie.com/embed/${video}`,
  ]) assert.equal(youtubeVideoId(url), video);
  for (const url of ['javascript:alert(1)', 'http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://evil.test/embed/abcdefghijk', 'https://user@youtube.com/watch?v=abcdefghijk', 'https://youtu.be/a', 'https://youtube.com/playlist?list=x']) assert.equal(youtubeVideoId(url), null);
});
console.log(`\n${checks}/${checks} audio-analysis checks passed`);
