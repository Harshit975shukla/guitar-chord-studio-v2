import assert from 'node:assert/strict';
import { DetectionEngine } from '../src/detection/engine.ts';
import { harmonicChroma } from '../src/detection/harmonicChroma.ts';
import { NOTE_NAMES, STANDARD_TUNING } from '../src/types/index.ts';

let checks = 0, clock = 10000;
const originalNow = Date.now; Date.now = () => clock;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const pitch = midi => 440 * 2 ** ((midi - 69) / 12);
function peak(midi, amp = 1) { return { midi, freq: pitch(midi), amp, pitchClass: midi % 12, note: NOTE_NAMES[midi % 12], bin: pitch(midi) * 8192 / 44100 }; }
function fixture() {
  const analyser = { fftSize: 8192, frequencyBinCount: 4096, context: { sampleRate: 44100 }, time: new Float32Array(8192),
    getFloatTimeDomainData(buffer) { buffer.set(this.time); } };
  const engine = new DetectionEngine({ fftSize: 8192, targetMode: 'chords' }); engine.setAnalyser(analyser);
  const frame = spectrum => { clock += 32; return engine.processFrame(spectrum, 44100, STANDARD_TUNING); };
  engine.startNoiseCalibration();
  for (let i = 0; i < 53; i++) frame(new Float32Array(4096).fill(-100));
  return { engine, analyser, frame };
}
function signal(f, voices) {
  const spectrum = new Float32Array(4096).fill(-100); f.analyser.time.fill(0);
  for (const { freq, amplitude } of voices) {
    const center = freq * 8192 / 44100;
    for (let bin = Math.floor(center) - 2; bin <= Math.ceil(center) + 2; bin++) {
      const amp = amplitude * Math.exp(-((bin - center) ** 2) / 1.2);
      spectrum[bin] = Math.max(spectrum[bin], 20 * Math.log10(amp));
    }
    for (let i = 0; i < 8192; i++) f.analyser.time[i] += amplitude * Math.sin(2 * Math.PI * freq * i / 44100);
  }
  return spectrum;
}
try {
  check('calibrated quiet chord evidence is not rejected by the old fixed amplitude floor', () => {
    const f = fixture();
    const spectrum = signal(f, [48,52,55].map(midi => ({ freq: pitch(midi), amplitude: .003 })));
    let result;
    for (let i = 0; i < 4; i++) result = f.frame(spectrum);
    assert.equal(result.freshness, 'fresh'); assert.equal(result.chord.symbol, 'C');
  });
  check('single-note harmonics plus weak low body resonances do not become a chord', () => {
    for (const fundamental of [220,329.63]) {
      const f = fixture();
      const spectrum = signal(f, [
        { freq: fundamental, amplitude: .02 }, { freq: fundamental * 2, amplitude: .004 },
        { freq: fundamental * 3, amplitude: .03 }, { freq: 98, amplitude: .004 }, { freq: 171, amplitude: .003 },
      ]);
      for (let i = 0; i < 16; i++) assert.notEqual(f.frame(spectrum).mode, 'chord');
    }
  });
  check('diminished chords are validated against their own tones instead of a major third or fifth', () => {
    const engine = new DetectionEngine(), chroma = new Float32Array(12);
    chroma[0] = 1; chroma[3] = .9; chroma[6] = .9;
    const result = engine.processChord(chroma, [peak(48),peak(51,.9),peak(54,.9)]);
    assert.equal(result.chord.symbol, 'Cdim');
  });
  check('equivalent suspended pitch sets use observed bass and keep the first candidate consistent', () => {
    const engine = new DetectionEngine(), chroma = new Float32Array(12);
    chroma[0] = .8; chroma[2] = 1; chroma[7] = 1;
    const result = engine.processChord(chroma, [peak(55),peak(50),peak(48,.8)]);
    assert.equal(result.chord.symbol, 'Csus2'); assert.equal(result.chord.candidates[0].symbol, 'Csus2');
  });
  check('a genuine two-tone power chord is accepted but an incomplete major triad is not invented', () => {
    const power = new Float32Array(12); power[0] = 1; power[7] = .9;
    assert.equal(new DetectionEngine().processChord(power, [peak(48),peak(55,.9)]).chord.symbol, 'C5');
    const incomplete = new Float32Array(12); incomplete[0] = 1; incomplete[4] = .9;
    assert.equal(new DetectionEngine().processChord(incomplete, [peak(48),peak(52,.9)]).mode, 'idle');
  });
  check('harmonic analysis is deterministic, finite and rejects invalid frame layouts', () => {
    const f = fixture(), spectrum = signal(f, [48,51,55].map(midi => ({ freq: pitch(midi), amplitude: .04 })));
    const amps = Float32Array.from(spectrum, db => 10 ** (db / 20)), peaks = f.engine.extractPeaks(amps, 44100);
    const a = harmonicChroma(amps, 44100, 8192, peaks), b = harmonicChroma(amps, 44100, 8192, peaks);
    assert.deepEqual(a, b); assert.ok(a.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.ok(a[3] > a[4], 'a minor third should exceed the root note’s phantom major-third overtone');
    assert.throws(() => harmonicChroma(new Float32Array(10), 44100, 8192, []), /Invalid/);
  });
} finally { Date.now = originalNow; }
console.log(`\n${checks}/${checks} harmonic detection checks passed`);
