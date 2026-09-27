import assert from 'node:assert/strict';
import { DetectionEngine } from '../src/detection/engine.ts';
import { InputHealthMonitor, calibrationWarning, measureInput } from '../src/detection/inputHealth.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';

let checks = 0, clock = 10000;
const now = Date.now; Date.now = () => clock;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function fixture() {
  const analyser = { fftSize: 8192, frequencyBinCount: 4096, context: { sampleRate: 44100 },
    time: new Float32Array(8192), getFloatTimeDomainData(buffer) { buffer.set(this.time); } };
  const engine = new DetectionEngine({ fftSize: 8192 });
  engine.setAnalyser(analyser);
  const quiet = (db = -80) => new Float32Array(4096).fill(db);
  const frame = (data = quiet()) => { clock += 32; return engine.processFrame(data, 44100, STANDARD_TUNING); };
  const calibrate = (db = -80) => {
    engine.startNoiseCalibration();
    let result;
    for (let i = 0; i < 60 && !result?.calibrationComplete; i++) result = frame(quiet(db));
    assert.equal(result.calibrationComplete, true); return result;
  };
  const strum = () => {
    const spectrum = quiet(-110); analyser.time.fill(0);
    for (const freq of [130.8,164.8,196,261.6,329.6,392,523.3]) {
      const bin = Math.round(freq * 8192 / 44100);
      spectrum[bin] = -20; spectrum[bin - 1] = spectrum[bin + 1] = -42;
      for (let i = 0; i < analyser.time.length; i++) analyser.time[i] += .06 * Math.sin(2 * Math.PI * freq * i / 44100);
    }
    let result;
    for (let i = 0; i < 4; i++) result = frame(spectrum);
    return result;
  };
  return { engine, analyser, frame, quiet, calibrate, strum };
}
try {
  check('room check excludes stale FFT frames from a just-muted strum', () => {
    const f = fixture(); f.engine.startNoiseCalibration();
    const warmup = f.engine.calibrationWarmupFrames;
    assert.equal(warmup, 8);
    for (let i = 0; i < warmup; i++) assert.equal(f.frame(f.quiet(-12)).calibrationProgress, 0);
    let result;
    for (let i = 0; i < 45; i++) result = f.frame(f.quiet(-75));
    assert.equal(result.calibrationComplete, true);
    assert.equal(f.engine.getNoiseProfile().measuredNoiseFloorDb, -75);
    assert.equal(result.calibrationWarning, undefined);
  });
  check('sensitivity changes rescale the noise profile and resume without mandatory recalibration', () => {
    const f = fixture(); f.calibrate();
    const original = f.strum(); assert.equal(original.freshness, 'fresh');
    const profile = f.engine.getNoiseProfile(), amplitude = profile.amps[20], db = profile.measuredNoiseFloorDb;
    f.engine.setConfig({ micGainMultiplier: 8 });
    assert.equal(f.engine.getNoiseProfile(), profile); assert.equal(f.engine.needsNoiseCalibration(), false);
    assert.ok(Math.abs(profile.amps[20] - amplitude * 2) < 1e-8);
    assert.ok(Math.abs(profile.measuredNoiseFloorDb - db - 20 * Math.log10(2)) < 1e-8);
    const held = f.strum(); assert.equal(held.freshness, 'held'); assert.equal(held.timestamp, original.timestamp);
    f.analyser.time.fill(0);
    for (let i = 0; i < 10; i++) f.frame();
    assert.equal(f.engine.isInputSettling(), false);
    assert.equal(f.engine.needsNoiseCalibration(), false);
    const result = f.strum(); assert.equal(result.freshness, 'fresh'); assert.equal(result.chord.root, 'C');
  });
  check('changing sensitivity during a room check restarts that measurement automatically', () => {
    const f = fixture(); f.engine.startNoiseCalibration();
    for (let i = 0; i < 20; i++) f.frame();
    f.engine.setConfig({ micGainMultiplier: 6 });
    assert.equal(f.engine.isNoiseCalibrating(), true); assert.equal(f.engine.calibrationFrames, 0);
    let result;
    for (let i = 0; i < 53; i++) result = f.frame();
    assert.equal(result.calibrationComplete, true); assert.equal(f.engine.needsNoiseCalibration(), false);
  });
  check('changing gate margin does not invalidate a correctly measured room profile', () => {
    const f = fixture(); f.calibrate();
    const profile = f.engine.getNoiseProfile(), before = f.engine.getGateThresholdDb();
    f.engine.setConfig({ noiseGateDb: 21 });
    assert.equal(f.engine.getNoiseProfile(), profile); assert.equal(f.engine.needsNoiseCalibration(), false);
    assert.equal(f.engine.getGateThresholdDb(), before + 3);
  });
  check('a different analyser cannot reuse another input or FFT noise profile', () => {
    const f = fixture(); f.calibrate();
    f.engine.setAnalyser({ ...f.analyser, fftSize: 4096, frequencyBinCount: 2048 });
    assert.equal(f.engine.getNoiseProfile(), null);
    f.engine.startNoiseCalibration();
    assert.equal(f.engine.calibrationBuffer.length, 2048);
  });
  check('transient and high-level room checks produce warnings rather than unconditional success claims', () => {
    assert.equal(calibrationWarning(new Array(45).fill(-70), 18), undefined);
    const transient = new Array(45).fill(-70); transient[20] = -20;
    assert.match(calibrationWarning(transient, 18), /sudden sound/);
    assert.match(calibrationWarning(new Array(45).fill(-20), 18), /headroom/);
    const f = fixture(); f.engine.startNoiseCalibration();
    for (let i = 0; i < 8; i++) f.frame();
    let result;
    for (let i = 0; i < 45; i++) result = f.frame(f.quiet(i === 20 ? -20 : -70));
    assert.match(result.calibrationWarning, /sudden sound/);
    assert.equal(f.engine.getNoiseProfile().measuredNoiseFloorDb, -70, 'an isolated transient must not become the steady room reference');
  });
  check('input check distinguishes quiet, weak, sufficient and near-limit input without grading chords', () => {
    const monitor = new InputHealthMonitor();
    const samples = amplitude => Float32Array.from({ length: 2048 }, (_, i) => Math.sin(i * .12) * amplitude);
    const base = { samples: samples(.001), calibrating: true, calibrationComplete: false, calibrated: false, needsCalibration: false,
      signalPresent: false, spectralDb: -70, gateDb: -52 };
    for (let i = 0; i < 44; i++) assert.equal(monitor.update(base).state, 'calibrating');
    monitor.update({ ...base, calibrating: false, calibrationComplete: true, calibrated: true });
    const frame = { ...base, calibrating: false, calibrated: true };
    assert.equal(monitor.update(frame).state, 'waiting');
    assert.equal(monitor.update({ ...frame, samples: samples(.01) }).state, 'weak');
    const strong = monitor.update({ ...frame, samples: samples(.1), signalPresent: true });
    assert.equal(strong.state, 'signal'); assert.match(strong.message, /not whether a chord is correct/);
    const loud = monitor.update({ ...frame, samples: samples(1), signalPresent: true });
    assert.equal(loud.state, 'headroom'); assert.match(loud.message, /device\/interface input gain/);
    assert.equal(monitor.update({ ...frame, warning: 'Recheck the room.' }).state, 'recheck');
    assert.equal(monitor.update({ ...frame, settling: true }).state, 'settling');
    monitor.reset(); assert.equal(monitor.update({ ...frame, calibrated: false, needsCalibration: true }).roomDb, null);
    assert.deepEqual(measureInput(new Float32Array(4)), { rmsDb: -120, peak: 0, nearLimit: 0 });
  });
} finally { Date.now = now; }
console.log(`\n${checks}/${checks} microphone input checks passed`);
