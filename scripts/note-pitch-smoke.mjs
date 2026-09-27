import assert from 'node:assert/strict';
import { estimateNotePitch } from '../src/detection/notePitch.ts';
import { DetectionEngine } from '../src/detection/engine.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const tone = (rate, frequency, offset = 0) => Float32Array.from({ length: 8192 }, (_, i) =>
  offset + .04 * Math.sin(2 * Math.PI * frequency * i / rate) + .01 * Math.sin(4 * Math.PI * frequency * i / rate));
check('recent-window pitch tracks guitar range, sample rates and detuning', () => {
  for (const rate of [16000,32000,36000,44100,48000,96000]) for (const midi of [36,38,40,45,50,59,64,69,81,88]) for (const cents of [-20,0,20]) {
    const freq = 440 * 2 ** ((midi - 69 + cents / 100) / 12), result = estimateNotePitch(tone(rate, freq, .05), rate);
    assert.ok(result, `${rate}/${midi}/${cents}`);
    assert.ok(Math.abs(1200 * Math.log2(result.freq / freq)) < 8, `${rate}/${midi}/${cents}: ${result.freq}`);
  }
});
check('recent input replaces stale audio at the beginning of the analyser window', () => {
  const samples = tone(44100, 110), next = tone(44100, 440);
  samples.set(next.subarray(next.length - 3000), samples.length - 3000);
  assert.ok(Math.abs(estimateNotePitch(samples, 44100).freq - 440) < 1);
});
check('silence and unpitched noise do not fabricate a confident note', () => {
  assert.equal(estimateNotePitch(new Float32Array(8192), 44100), null);
  let seed = 771;
  const noise = Float32Array.from({ length: 8192 }, () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return (seed/2147483648-1)*.1; });
  assert.equal(estimateNotePitch(noise,44100),null);
  assert.equal(estimateNotePitch(new Float32Array(16),44100),null);
});
check('note confirmation needs consecutive support and preserves held evidence on uncertainty', () => {
  const original = Date.now; let clock = 10000;
  Date.now = () => clock;
  try {
    const analyser = { fftSize:8192, frequencyBinCount:4096, getFloatTimeDomainData(buffer) { buffer.set(tone(44100,329.63)); } };
    const engine = new DetectionEngine({fftSize:8192,targetMode:'notes'});engine.setAnalyser(analyser);
    const spectrum = new Float32Array(4096).fill(-100);
    for (const freq of [329.63,659.26,988.89]) spectrum[Math.round(freq*8192/44100)] = -20;
    assert.equal(engine.processFrame(spectrum,44100,STANDARD_TUNING).freshness,'none');
    clock+=32;const first=engine.processFrame(spectrum,44100,STANDARD_TUNING);
    assert.equal(Math.round(first.note.pitch.midi),64);assert.equal(first.freshness,'fresh');
    analyser.getFloatTimeDomainData = buffer => buffer.fill(0);
    clock+=32;const held=engine.processFrame(new Float32Array(4096).fill(-120),44100,STANDARD_TUNING);
    assert.equal(held.freshness,'held');assert.equal(held.timestamp,first.timestamp);
  } finally { Date.now=original; }
});
console.log(`\n${checks}/${checks} note-pitch checks passed`);
