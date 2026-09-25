import assert from 'node:assert/strict';
import { DetectionEngine, DEFAULT_DETECTION_CONFIG } from '../src/detection/engine.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';

const SR = 44100, N = 8192;
const C = [130.8, 164.8, 196, 261.6, 329.6, 392, 523.3];
const G = [98, 123.47, 146.83, 196, 246.94, 293.66, 392];
const E = [329.63, 659.26, 988.9];
const originalNow = Date.now;
let clock = 10000;
Date.now = () => clock;

function fixture(config = {}) {
  const analyser = {
    fftSize: N, frequencyBinCount: N / 2, time: new Float32Array(N),
    getFloatTimeDomainData(buffer) { buffer.set(this.time); },
  };
  const engine = new DetectionEngine({ fftSize: N, ...config });
  engine.setAnalyser(analyser);
  const base = clock += 10000;
  function frame(ms, frequencies = C, db = -20, noise = false) {
    clock = base + ms;
    const spectrum = new Float32Array(N / 2).fill(noise ? db : -110);
    analyser.time.fill(0);
    if (frequencies) {
      for (const freq of frequencies) {
        const bin = Math.round(freq * N / SR);
        if (!noise) {
          spectrum[bin] = db;
          spectrum[bin - 1] = spectrum[bin + 1] = db - 22;
        }
        for (let i = 0; i < N; i++) analyser.time[i] += 0.06 * Math.sin(2 * Math.PI * freq * i / SR);
      }
    }
    return engine.processFrame(spectrum, SR, STANDARD_TUNING);
  }
  return { engine, frame, base };
}

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`PASS  ${name}`);
}
function freshChord(result, root) {
  assert.equal(result.mode, 'chord');
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.chord.root, root);
}
function held(result, original) {
  assert.equal(result.freshness, 'held');
  assert.equal(result.timestamp, original.timestamp);
  assert.deepEqual(result.chord ?? result.note, original.chord ?? original.note);
  assert.deepEqual(result.ringingNotes, []);
  assert.match(result.statusMessage, /held/i);
}
function capture(frame, start = 0, frequencies = C) {
  frame(start, frequencies);
  frame(start + 32, frequencies);
  frame(start + 64, frequencies);
  return frame(start + 96, frequencies);
}

try {
  check('default timing/configuration is unchanged', () => {
    assert.equal(DEFAULT_DETECTION_CONFIG.triggerMode, 'guitartuna');
    assert.equal(DEFAULT_DETECTION_CONFIG.noiseGateDb, 18);
    assert.equal(DEFAULT_DETECTION_CONFIG.seventhStrictness, 0.55);
  });
  check('normal capture needs three samples; no sample before 30ms', () => {
    const { frame } = fixture();
    for (const ms of [0, 29, 30, 60]) assert.equal(frame(ms).freshness, 'none');
    freshChord(frame(90), 'C');
  });
  check('capture includes 320ms but excludes 321ms', () => {
    const a = fixture();
    for (const ms of [0, 30, 60]) a.frame(ms);
    freshChord(a.frame(320), 'C');
    const b = fixture();
    for (const ms of [0, 30, 60, 321, 350, 351]) assert.equal(b.frame(ms).freshness, 'none');
    b.frame(400, null);
    freshChord(capture(b.frame, 500, G), 'G');
  });
  check('zero, one and two usable frames expire and cannot confirm from decay', () => {
    for (const samples of [[], [32], [32, 64]]) {
      const { frame, engine } = fixture();
      frame(0);
      for (const ms of samples) frame(ms);
      assert.equal(frame(351).freshness, 'none');
      assert.equal(engine.strumState, 'idle');
      assert.equal(engine.strumChromaBuffer.length, 0);
      for (const ms of [400, 432, 464]) assert.equal(frame(ms).freshness, 'none');
      frame(500, null);
      freshChord(capture(frame, 600, G), 'G');
    }
  });
  check('expiry also runs through silence, non-tonal noise and single-note gates', () => {
    for (const gate of ['silence', 'noise', 'note']) {
      const { frame, engine } = fixture();
      frame(0); frame(32);
      const r = gate === 'silence' ? frame(351, null)
        : gate === 'noise' ? frame(351, C, -20, true) : frame(351, E);
      assert.equal(r.freshness, 'none');
      assert.equal(engine.strumState, 'idle');
      assert.equal(engine.strumChromaBuffer.length, 0);
      frame(400, null);
      freshChord(capture(frame, 500, G), 'G');
    }
  });
  check('renewed strong attack restarts elapsed time before collecting any frame', () => {
    const { frame } = fixture();
    frame(0); frame(32); frame(64);
    assert.equal(frame(300, G, -12).freshness, 'none');
    assert.equal(frame(329, G, -12).freshness, 'none');
    assert.equal(frame(330, G, -12).freshness, 'none');
    assert.equal(frame(360, G, -12).freshness, 'none');
    freshChord(frame(390, G, -12), 'G');
  });
  check('ambiguous attempt keeps last result held, expires after 350ms and recovers', () => {
    const { frame, engine } = fixture();
    const first = capture(frame);
    freshChord(first, 'C');
    frame(150, null);
    // Controlled diffuse chroma isolates the rejection branch without retuning
    // the spectral front end or relying on random noise.
    const buildChroma = engine.buildChromaCQT;
    engine.buildChromaCQT = () => new Float32Array(12).fill(1);
    for (const ms of [200, 232, 264, 296, 550]) held(frame(ms, G), first);
    assert.equal(engine.strumState, 'attack'); // exactly 350ms is not expired
    held(frame(551, G), first);
    assert.equal(engine.strumState, 'idle');
    assert.equal(engine.candidateVoteHistory.length, 0);
    engine.buildChromaCQT = buildChroma;
    frame(600, null);
    freshChord(capture(frame, 700, G), 'G');
  });
  check('unconfirmed diffuse attempt expires without inventing a chord', () => {
    const { frame, engine } = fixture();
    const buildChroma = engine.buildChromaCQT;
    engine.buildChromaCQT = () => new Float32Array(12).fill(1);
    for (const ms of [0, 32, 64, 96, 320, 350, 351, 400]) {
      const result = frame(ms);
      assert.equal(result.freshness, 'none');
      assert.equal(result.chord, undefined);
    }
    engine.buildChromaCQT = buildChroma;
    frame(450, null);
    freshChord(capture(frame, 500, G), 'G');
  });
  check('an attack arriving after expiry starts a full new capture window', () => {
    const { frame } = fixture();
    frame(0); frame(32);
    assert.equal(frame(351, G, -12).freshness, 'none');
    assert.equal(frame(380, G, -12).freshness, 'none');
    assert.equal(frame(381, G, -12).freshness, 'none');
    assert.equal(frame(413, G, -12).freshness, 'none');
    freshChord(frame(445, G, -12), 'G');
  });
  check('held capture/chord silence/noise preserve evidence time; repeated strums are fresh', () => {
    const { frame } = fixture();
    const first = capture(frame);
    for (const ms of [128, 160]) held(frame(ms), first);
    held(frame(200, null), first);
    held(frame(250, C, -20, true), first);
    frame(300, null);
    held(frame(400), first);
    held(frame(432), first);
    held(frame(464), first);
    const repeated = frame(496);
    freshChord(repeated, 'C');
    assert.ok(repeated.timestamp > first.timestamp);
    assert.equal(frame(5497, null).freshness, 'none');
  });
  check('continuous supported frames remain fresh, rejected frames are held', () => {
    const { frame, engine } = fixture({ triggerMode: 'continuous' });
    let first;
    for (let i = 0; i < 10; i++) first = frame(i * 32);
    freshChord(first, 'C');
    const next = frame(320);
    freshChord(next, 'C');
    assert.ok(next.timestamp > first.timestamp);
    held(frame(352, null), next);
    held(frame(384, C, -20, true), next);
    engine.buildChromaCQT = () => new Float32Array(12).fill(1);
    for (let i = 0; i < 20; i++) frame(416 + i * 32);
    assert.equal(frame(1100).freshness, 'held');
  });
  check('notes are fresh on supported frames; silence, noise and pitch failure are held', () => {
    const { frame, engine } = fixture({ targetMode: 'notes' });
    const first = frame(0, E);
    assert.equal(first.note.pitch.note, 'E');
    assert.equal(first.freshness, 'fresh');
    const next = frame(32, E);
    assert.equal(next.freshness, 'fresh');
    assert.ok(next.timestamp > first.timestamp);
    held(frame(64, null), next);
    held(frame(96, E, -20, true), next);
    engine.detectSingleNote = () => null;
    held(frame(128, E), next);
    assert.equal(frame(5129, null).freshness, 'none');
  });
  check('calibration and trigger-mode changes discard unfinished attempts', () => {
    const { frame, engine } = fixture();
    frame(0); frame(32);
    engine.setConfig({ triggerMode: 'continuous' });
    assert.equal(engine.strumChromaBuffer.length, 0);
    engine.setConfig({ triggerMode: 'guitartuna' });
    frame(64, null); frame(100);
    engine.startNoiseCalibration();
    assert.equal(engine.strumState, 'idle');
    assert.equal(frame(132, null).freshness, 'none');
    engine.reset();
    assert.equal(engine.strumChromaBuffer.length, 0);
  });
  check('performance metadata distinguishes a new attack from held display and quiet frames', () => {
    const { frame, base } = fixture();
    const captured = capture(frame);
    assert.equal(captured.performance.id, 1);
    assert.equal(captured.performance.attackAt, base);
    assert.equal(captured.performance.signalPresent, true);
    const sustained = frame(128);
    held(sustained, captured);
    assert.equal(sustained.performance.id, captured.performance.id);
    assert.equal(sustained.performance.frameAt, base + 128);
    const silence = frame(200, null);
    assert.equal(silence.performance.signalPresent, false);
    assert.equal(silence.timestamp, captured.timestamp);
    const repeated = capture(frame, 400);
    assert.ok(repeated.performance.id > captured.performance.id);
    assert.equal(repeated.performance.attackAt, base + 400);
    freshChord(repeated, 'C');
  });
  console.log(`\n${checks}/${checks} reliability checks passed`);
} finally {
  Date.now = originalNow;
}
