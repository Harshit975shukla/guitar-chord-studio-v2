import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GUITAR_SAMPLES, chooseGuitarSample, loadGuitarBank, guitarBankReady, guitarSamplePlayback } from '../src/audio/guitarSamples.ts';
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

await check('all 132 guitar recordings match their local provenance hashes', () => {
  const root = join('public', 'audio', 'musicca-guitar');
  const source = JSON.parse(readFileSync(join(root, 'SOURCE.json'), 'utf8'));
  assert.equal(source.files.length, 132);
  assert.equal(new Set(source.files.map(f => `${f.bank}/${f.id}`)).size, 132);
  for (const bank of ['steel', 'classical', 'electric']) {
    assert.deepEqual(source.files.filter(f => f.bank === bank).map(f => f.id).sort(), GUITAR_SAMPLES.map(s => s.id).sort());
  }
  for (const file of source.files) {
    const bytes = readFileSync(join(root, file.bank, `${file.id}.mp3`));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal(new URL(file.url).hostname, 'www.musicca.com');
  }
});
await check('recorded note mapping covers E2 through F5 and both open-string takes', () => {
  assert.equal(GUITAR_SAMPLES.length, 44);
  assert.deepEqual([...new Set(GUITAR_SAMPLES.map(s => s.midi))].sort((a, b) => a - b), Array.from({ length: 38 }, (_, i) => i + 40));
  for (const prefix of ['e','a','d','g','h','f']) assert.equal(GUITAR_SAMPLES.find(s => s.id === `${prefix}0`).midi, GUITAR_SAMPLES.find(s => s.id === `${prefix}1`).midi);
  const open = [64, 59, 55, 50, 45, 40].map((midi, s) => chooseGuitarSample(midi, s).id);
  assert.deepEqual(open, ['f1', 'h1', 'g1', 'd1', 'a1', 'e1']);
  assert.equal(chooseGuitarSample(67, 0).id, 'h9', 'Musicca has no f4 recording');
  assert.equal(chooseGuitarSample(77, 0).id, 'f14');
});
await check('nearest-sample selection never octave-wraps pitches or chooses an unrelated string on ties', () => {
  for (let midi = 24; midi <= 96; midi++) for (let s = 0; s < 6; s++) {
    const sample = chooseGuitarSample(midi, s);
    const nearest = Math.min(...GUITAR_SAMPLES.map(p => Math.abs(p.midi - midi)));
    assert.equal(Math.abs(sample.midi - midi), nearest);
    const exactString = GUITAR_SAMPLES.find(p => p.midi === midi && p.stringIndex === s && !p.id.endsWith('0'));
    if (exactString) assert.equal(sample.id, exactString.id);
  }
  assert.throws(() => chooseGuitarSample(NaN, 0), /Invalid/);
  assert.throws(() => chooseGuitarSample(60, 6), /Invalid/);
});
const buffer = () => {
  const data = new Float32Array(4800);
  for (let i = 480; i < data.length; i++) data[i] = Math.sin(i * .1) * .3;
  return { length: data.length, sampleRate: 48000, duration: .1, numberOfChannels: 1, getChannelData: () => data };
};
const context = () => ({ sampleRate: 48000, decodeAudioData: async () => buffer() });
const originalFetch = globalThis.fetch;
try {
  await check('concurrent requests share one bank load and keep codec-padding trim conservative', async () => {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1])); };
    const ctx = context();
    await Promise.all([loadGuitarBank(ctx, 'steel'), loadGuitarBank(ctx, 'steel')]);
    assert.equal(requests, 44); assert.equal(guitarBankReady(ctx, 'steel'), true);
    const note = guitarSamplePlayback(ctx, 'steel', 440, 0);
    assert.ok(note.offset > .006 && note.offset < .008);
    const targetFrequency = 440 * 2 ** ((88 - 69) / 12);
    const high = guitarSamplePlayback(ctx, 'steel', targetFrequency, 0);
    assert.equal(high.sample.midi, 77);
    assert.ok(Math.abs(440 * 2 ** ((high.sample.midi - 69) / 12) * high.rate - targetFrequency) < 1e-9);
  });
  await check('failed bank loads do not cache partial instruments and can be retried', async () => {
    const ctx = context();
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(loadGuitarBank(ctx, 'classical'), /could not load/);
    assert.equal(guitarBankReady(ctx, 'classical'), false);
    assert.throws(() => guitarSamplePlayback(ctx, 'classical', 440, 0), /not ready/);
    globalThis.fetch = async () => new Response(new Uint8Array([1]));
    await loadGuitarBank(ctx, 'classical');
    assert.equal(guitarBankReady(ctx, 'classical'), true);
  });
  await check('decoded cache retains at most two banks and source pitch conversion is exact', async () => {
    const ctx = context();
    globalThis.fetch = async () => new Response(new Uint8Array([1]));
    for (const bank of ['steel', 'classical', 'electric']) await loadGuitarBank(ctx, bank);
    assert.equal(guitarBankReady(ctx, 'steel'), false);
    assert.equal(guitarBankReady(ctx, 'classical'), true);
    assert.equal(guitarBankReady(ctx, 'electric'), true);
    for (const midi of [36, 38, 40, 59, 64, 76, 84, 88]) {
      const frequency = 440 * 2 ** ((midi - 69) / 12), sample = guitarSamplePlayback(ctx, 'electric', frequency, 3);
      assert.ok(Math.abs(440 * 2 ** ((sample.sample.midi - 69) / 12) * sample.rate - frequency) < 1e-9);
    }
  });
} finally { globalThis.fetch = originalFetch; }
console.log(`\n${checks}/${checks} guitar sample checks passed`);
