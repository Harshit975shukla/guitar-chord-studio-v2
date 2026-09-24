/**
 * Detection engine smoke test (READ-ONLY on the engine).
 *
 * Purpose: guard the hard-won live chord/note detection against accidental
 * regressions. It feeds the real DetectionEngine synthetic spectra/time-domain
 * signals and asserts it still (a) detects a chord, (b) detects a single note,
 * and (c) rejects pure noise. It never imports/edits detection internals beyond
 * the public processFrame/setAnalyser API.
 *
 * Run: npm run test:detection   (exits non-zero on failure)
 */
import { DetectionEngine, DEFAULT_DETECTION_CONFIG } from '../src/detection/engine.ts';
import { STANDARD_TUNING } from '../src/types/index.ts';

const SR = 44100, N = 8192, BINS = N / 2, bw = SR / N; // match the app's analyser fftSize

function makeAnalyser() {
  return {
    fftSize: N,
    frequencyBinCount: BINS,
    _time: new Float32Array(N),
    getFloatTimeDomainData(buf) { buf.set(this._time); },
  };
}
function timeSines(freqs, amp) {
  const t = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * n / SR);
    t[n] = amp * s;
  }
  return t;
}
function freqSpec(freqs, peakDb, floor = -110) {
  const d = new Float32Array(BINS).fill(floor);
  for (const f of freqs) {
    const b = Math.round(f / bw);
    if (b > 1 && b < BINS - 1) { d[b] = peakDb; d[b - 1] = peakDb - 22; d[b + 1] = peakDb - 22; }
  }
  return d;
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// Continuous mode is deterministic (no real-time strum-capture window), so the
// smoke test uses it for stable positive assertions. We keep a handle to the
// mock analyser so we can set its time-domain buffer each frame.
function engineWithMock(extra) {
  const eng = new DetectionEngine({ ...DEFAULT_DETECTION_CONFIG, fftSize: N, triggerMode: 'continuous', ...extra });
  const an = makeAnalyser();
  eng.setAnalyser(an);
  eng.__an = an;
  return { eng, an };
}
function run(eng, an, timeBuf, freqBuf, frames) {
  let last = null;
  for (let i = 0; i < frames; i++) { an._time = timeBuf; last = eng.processFrame(freqBuf, SR, STANDARD_TUNING); }
  return last;
}

// 1. Chord detection (C major, loud, continuous)
{
  const { eng, an } = engineWithMock();
  const cmaj = [130.8, 164.8, 196.0, 261.6, 329.6, 392.0, 523.3];
  const r = run(eng, an, timeSines(cmaj, 0.06), freqSpec(cmaj, -20), 10);
  check('detects C major chord', !!(r && r.mode === 'chord' && r.chord && r.chord.root === 'C'),
    r ? `${r.mode}:${r.chord?.symbol ?? '-'}` : 'null');
}

// 2. Single-note detection (E4, loud, notes mode)
{
  const { eng, an } = engineWithMock({ targetMode: 'notes' });
  const e = [329.63, 659.26, 988.9];
  const r = run(eng, an, timeSines(e, 0.06), freqSpec(e, -20), 10);
  check('detects single note E', !!(r && r.mode === 'single-note' && r.note && r.note.pitch.note === 'E'),
    r ? `${r.mode}:${r.note?.pitch?.note ?? '-'}` : 'null');
}

// 3. Noise rejection (must NOT report a chord/note)
{
  const { eng, an } = engineWithMock();
  let chordOrNote = 0, total = 40;
  for (let i = 0; i < total; i++) {
    const t = new Float32Array(N);
    for (let n = 0; n < N; n++) t[n] = (Math.random() - 0.5) * 0.08;
    an._time = t;
    const fd = new Float32Array(BINS);
    for (let b = 0; b < BINS; b++) fd[b] = -70 + (Math.random() - 0.5) * 16;
    const r = eng.processFrame(fd, SR, STANDARD_TUNING);
    if (r && (r.mode === 'chord' || r.mode === 'single-note')) chordOrNote++;
  }
  check('rejects pure noise (stays idle)', chordOrNote === 0, `${chordOrNote}/${total} frames falsely detected`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.error('Detection smoke test FAILED'); process.exit(1); }
console.log('Detection smoke test OK');
