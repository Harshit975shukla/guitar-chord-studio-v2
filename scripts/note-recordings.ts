import { DetectionEngine } from '../src/detection/engine';
import { loadGuitarBank, guitarSamplePlayback, type GuitarSampleBank } from '../src/audio/guitarSamples';
import { STANDARD_TUNING, type DetectionTargetMode } from '../src/types';

const ATTACK = 2.24, END = 3.104, STEP = .032;
interface Case { id: string; midi: number | null; level: number; noise: number; cents: number; chord?: boolean; mode: DetectionTargetMode }
interface Estimate { midi: number; centsError: number; at: number; confidence: number }
interface Outcome {
  firstMidi: number | null; correctFirst: boolean; usableCorrectFrames: number; freshFrames: number;
  correctFrames: number; wrongFrames: number; octaveErrors: number; latencyMs: number | null; medianCentsError: number | null;
  wrongChordFrames: number;
}
const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
function assess(found: Estimate[], expected: number | null, firstMode: string | null, wrongChordFrames: number): Outcome {
  const correct = found.filter(n => n.midi === expected);
  return {
    firstMidi: found[0]?.midi ?? null, correctFirst: expected === null ? !found.length && !wrongChordFrames : firstMode === 'single-note' && found[0]?.midi === expected,
    usableCorrectFrames: correct.filter(n => n.confidence >= 70).length, freshFrames: found.length,
    correctFrames: correct.length, wrongFrames: found.length - correct.length,
    octaveErrors: expected === null ? 0 : found.filter(n => n.midi !== expected && (n.midi - expected) % 12 === 0).length,
    latencyMs: correct.length ? Math.round((correct[0].at - ATTACK) * 1000) : null,
    medianCentsError: median(correct.map(n => Math.abs(n.centsError))),
    wrongChordFrames,
  };
}
function cases(full: boolean, holdout: boolean): Case[] {
  const notes = full ? [
    holdout ? 37 : 36,
    ...Array.from({ length: 20 }, (_, i) => 38 + i * 2 + (holdout ? 1 : 0)),
    ...(holdout ? [80,83,87] : [81,84,88]),
  ] : holdout ? [37,39,46,51,56,60,65,70,77,83,87] : [36,38,40,45,50,55,59,64,69,76,81,84,88];
  const conditions = [
    { id: 'clean', level: .04, noise: .0001, cents: 0 },
    { id: 'quiet', level: .003, noise: .00005, cents: 0 },
    { id: 'noise', level: .025, noise: .006, cents: 0 },
    { id: 'sharp', level: .04, noise: .0001, cents: 20 },
    { id: 'flat', level: .04, noise: .0001, cents: -20 },
  ];
  const result = notes.flatMap(midi => conditions.map(c => ({ ...c, id: `${midi}/${c.id}`, midi, mode: 'notes' as const })));
  if (full) for (const midi of notes) result.push({ id: `${midi}/auto`, midi, mode: 'auto', level: .04, noise: .0001, cents: 0 });
  for (const noise of [0,.002,.01]) result.push({ id: `negative/noise-${noise}`, midi: null, mode: 'notes', level: 0, noise, cents: 0 });
  result.push({ id: 'negative/chord', midi: null, mode: 'notes', level: .04, noise: .0001, cents: 0, chord: true });
  return result;
}

async function evaluateCase(item: Case, bank: GuitarSampleBank, decoder: OfflineAudioContext, Baseline: typeof DetectionEngine, rate: number) {
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * END), rate), input = ctx.createBufferSource();
  const data = new Float32Array(Math.ceil(rate * END)), background = new Float32Array(data.length);
  const pitches = item.chord ? [48,52,55,60,64] : item.midi === null ? [] : [item.midi + item.cents / 100];
  for (const midi of pitches) {
    const selected = guitarSamplePlayback(decoder, bank, 440 * 2 ** ((midi - 69) / 12), 0);
    for (let i = Math.round(ATTACK * rate); i < data.length; i++) {
      const pos = (i - Math.round(ATTACK * rate)) * selected.rate, index = Math.floor(pos), fraction = pos - index;
      if (index + 1 >= selected.buffer.length) break;
      for (let c = 0; c < selected.buffer.numberOfChannels; c++) {
        const samples = selected.buffer.getChannelData(c);
        data[i] += (samples[index] * (1 - fraction) + samples[index + 1] * fraction) / selected.buffer.numberOfChannels;
      }
    }
  }
  let power = 0, noisePower = 0, seed = 13457 + (item.midi ?? 0);
  for (let i = Math.round(ATTACK * rate); i < Math.round((ATTACK + .4) * rate); i++) power += data[i] ** 2;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    background[i] = seed / 2147483648 - 1 + .25 * Math.sin(2 * Math.PI * 60 * i / rate);
    noisePower += background[i] ** 2;
  }
  const signalGain = item.level / Math.max(1e-9, Math.sqrt(power / (.4 * rate)));
  const noiseGain = item.noise / Math.sqrt(noisePower / data.length);
  for (let i = 0; i < data.length; i++) data[i] = data[i] * signalGain + background[i] * noiseGain;
  input.buffer = ctx.createBuffer(1, data.length, rate); input.buffer.getChannelData(0).set(data);
  const high = ctx.createBiquadFilter(), low = ctx.createBiquadFilter(), gain = ctx.createGain(), analyser = ctx.createAnalyser();
  high.type = 'highpass'; high.frequency.value = 65; high.Q.value = .707;
  low.type = 'lowpass'; low.frequency.value = 2200; low.Q.value = .707; gain.gain.value = 4;
  analyser.fftSize = 8192; analyser.smoothingTimeConstant = .1;
  input.connect(high); high.connect(low); low.connect(gain); gain.connect(analyser); analyser.connect(ctx.destination);
  const engines = [new Baseline({ fftSize: 8192, targetMode: item.mode }), new DetectionEngine({ fftSize: 8192, targetMode: item.mode })];
  engines.forEach(engine => { engine.setAnalyser(analyser); engine.startNoiseCalibration(); });
  const found: Estimate[][] = [[], []], spectrum = new Float32Array(4096), oldNow = Date.now;
  const firstModes: Array<string | null> = [null, null], wrongChords = [0, 0];
  let time = 100000, failure: unknown;
  Date.now = () => time;
  try {
    const tasks = [];
    for (let step = 1; step < Math.round(END / STEP); step++) tasks.push(ctx.suspend(step * STEP).then(async () => {
      try {
        if (failure) return;
        time = 100000 + ctx.currentTime * 1000; analyser.getFloatFrequencyData(spectrum);
        engines.forEach((engine, index) => {
          const result = engine.processFrame(spectrum, rate, STANDARD_TUNING);
          if (ctx.currentTime >= ATTACK && result?.freshness === 'fresh') {
            firstModes[index] ??= result.mode;
            if (result.chord) wrongChords[index]++;
          }
          if (ctx.currentTime >= ATTACK && result?.freshness === 'fresh' && result.note) {
            const pitch = result.note.pitch;
            found[index].push({ midi: Math.round(pitch.midi), at: ctx.currentTime, confidence: result.note.confidence,
              centsError: (69 + 12 * Math.log2(pitch.freq / 440) - (item.midi ?? 0)) * 100 - item.cents });
          }
        });
      } catch (error) { failure = error; } finally { await ctx.resume(); }
    }));
    input.start(); await ctx.startRendering(); await Promise.all(tasks);
    if (failure) throw failure;
  } finally { Date.now = oldNow; }
  return { bank, id: item.id, expected: item.midi, baseline: assess(found[0], item.midi, firstModes[0], wrongChords[0]), current: assess(found[1], item.midi, firstModes[1], wrongChords[1]) };
}
type Row = Awaited<ReturnType<typeof evaluateCase>>;
function summarize(rows: Row[], version: 'baseline' | 'current') {
  const notes = rows.filter(r => r.expected !== null), negative = rows.filter(r => r.expected === null);
  return {
    noteCases: notes.length, correctFirst: notes.filter(r => r[version].correctFirst).length,
    usableNotes: notes.filter(r => r[version].usableCorrectFrames >= 2).length,
    rejected: notes.filter(r => r[version].firstMidi === null).length,
    freshFrames: notes.reduce((n, r) => n + r[version].freshFrames, 0),
    correctFrames: notes.reduce((n, r) => n + r[version].correctFrames, 0),
    octaveErrors: notes.reduce((n, r) => n + r[version].octaveErrors, 0),
    wrongChordFrames: notes.reduce((n, r) => n + r[version].wrongChordFrames, 0),
    medianCorrectLatencyMs: median(notes.flatMap(r => r[version].latencyMs === null ? [] : [r[version].latencyMs!])),
    medianTuningErrorCents: median(notes.flatMap(r => r[version].medianCentsError === null ? [] : [r[version].medianCentsError!])),
    negativeCases: negative.length, falsePositiveCases: negative.filter(r => r[version].freshFrames > 0 || r[version].wrongChordFrames > 0).length,
  };
}
export async function runNoteBenchmark(baselineJs: string, quick = true, _negative = false, holdout = false) {
  const url = URL.createObjectURL(new Blob([baselineJs], { type: 'text/javascript' }));
  const { DetectionEngine: Baseline } = await import(/* @vite-ignore */ url); URL.revokeObjectURL(url);
  const rate = holdout ? 48000 : 44100, decoder = new OfflineAudioContext(2, 1, rate);
  const rows: Row[] = [], inputs = cases(!quick, holdout);
  const banks: GuitarSampleBank[] = ['steel','classical','electric'];
  for (const bank of banks) {
    await loadGuitarBank(decoder, bank);
    for (const input of inputs) {
      rows.push(await evaluateCase(input, bank, decoder, Baseline, rate));
      window.benchmarkProgress = `${rows.length}/${inputs.length * banks.length}: ${bank}/${input.id}`;
    }
  }
  return {
    method: 'Individual guitar recordings through native microphone filters/analyser. Recorded-note references are equal-tempered labels plus optional playback-rate detuning; original recording tuning is retained. Not human/device testing.',
    sampleRate: rate, baseline: summarize(rows, 'baseline'), current: summarize(rows, 'current'),
    conditions: Object.fromEntries(['clean','quiet','noise','sharp','flat','auto'].map(condition => {
      const selected = rows.filter(r => r.id.endsWith(`/${condition}`));
      return [condition, { baseline: summarize(selected, 'baseline'), current: summarize(selected, 'current') }];
    })), rows,
  };
}
