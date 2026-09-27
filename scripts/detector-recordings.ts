import { DetectionEngine } from '../src/detection/engine';
import { GUITAR_SAMPLES, loadGuitarBank, guitarSamplePlayback, type GuitarSampleBank } from '../src/audio/guitarSamples';
import { chordInRegister } from '../src/chords/positions';
import { CHORD_QUALITY_DISPLAY } from '../src/chords/definitions';
import { STANDARD_TUNING, type ChordQuality, type NoteName } from '../src/types';

let RATE = 44100;
const SIZE = 8192, STEP = .032, STRUM_AT = 2.56, DURATION = 3.584;
declare global { interface Window { benchmarkProgress: string } }
interface Scenario {
  id: string; expected: string | null; frets: (number | null)[] | null;
  level: number; noise: number; gainChange?: boolean; single?: number; inversion?: boolean;
  seed?: number; up?: boolean; spacing?: number; calibrationTransient?: boolean; burst?: 'clap' | 'thump';
}
interface Outcome { first: string | null; correct: boolean; anyCorrect: boolean; wrong: boolean; latency: number | null; predictions: string[]; processingP95Ms: number }
interface Row { bank: GuitarSampleBank; scenario: string; expected: string | null; baseline: Outcome; current: Outcome; inversion: boolean; evidence?: { chroma: number[]; peaks: { freq: number; midi: number; amp: number }[] } }

function scenarios(quick: boolean, holdout: boolean): Scenario[] {
  const result: Scenario[] = [];
  const qualities: ChordQuality[] = quick ? ['Major','Minor'] : ['Major','Minor','7','maj7','m7','sus2','sus4','5','dim','aug'];
  const conditions: Array<{ id: string; level: number; noise: number; gainChange?: boolean; calibrationTransient?: boolean }> = [
    { id: 'clean', level: .04, noise: .0001 },
    { id: 'quiet', level: .003, noise: .00005 },
    { id: 'room-noise', level: .04, noise: .006 },
    { id: 'gain-change', level: .04, noise: .002, gainChange: true },
  ];
  if (holdout) conditions.push({ id: 'calibration-spike', level: .04, noise: .0002, calibrationTransient: true });
  const roots: NoteName[] = holdout ? ['C#','D#','F#','G#','A#','B'] : ['C','D','E','F','G','A'];
  for (const root of roots) for (const quality of qualities) {
    const frets = (['open','middle','upper'] as const).map(register =>
      chordInRegister({ root, quality, bass: root }, STANDARD_TUNING, register)).find(Boolean);
    if (!frets) continue;
    for (const condition of conditions) result.push({ ...condition, id: `${root}${CHORD_QUALITY_DISPLAY[quality]}/${condition.id}`, expected: `${root}${CHORD_QUALITY_DISPLAY[quality]}`, frets });
  }
  const inversions: [NoteName, ChordQuality, NoteName][] = holdout
    ? [['C#','Major','F'], ['D#','Major','G'], ['F#','Major','A#'], ['G#','Minor','B'], ['B','Major','D#']]
    : [['C','Major','E'], ['G','Major','B'], ['A','Minor','C'], ['D','Major','F#'], ['F','Major','A']];
  if (!quick) for (const [root, quality, bass] of inversions) {
    const frets = (['open','middle','upper'] as const).map(register => chordInRegister({ root, quality, bass }, STANDARD_TUNING, register)).find(Boolean);
    if (frets) for (const condition of conditions.slice(0, 3)) result.push({ ...condition, id: `${root}${CHORD_QUALITY_DISPLAY[quality]}/${bass}/${condition.id}`, expected: `${root}${CHORD_QUALITY_DISPLAY[quality]}`, frets, inversion: true });
  }
  for (const noise of [0, .002, .01]) result.push({ id: `no-chord/noise-${noise}`, expected: null, frets: null, level: 0, noise });
  for (const single of holdout ? [43, 61, 69] : [40, 57, 64]) result.push({ id: `no-chord/single-${single}`, expected: null, frets: null, level: .04, noise: .0001, single });
  if (holdout) {
    for (const burst of ['clap','thump'] as const) for (let seed = 1; seed <= 6; seed++) result.push({ id: `no-chord/${burst}-${seed}`, expected: null, frets: null, level: 0, noise: .0002, burst, seed: seed * 11939 });
    result.forEach((scenario, index) => {
      scenario.seed ??= 49111 + index * 37;
      scenario.up = index % 2 === 0;
      scenario.spacing = index % 3 === 0 ? .016 : .032;
    });
  }
  return result;
}

function waveform(scenario: Scenario, bank: GuitarSampleBank, decoder: BaseAudioContext): Float32Array {
  const length = Math.ceil(RATE * DURATION), signal = new Float32Array(length), background = new Float32Array(length);
  let seed = scenario.seed ?? 73417, smooth = 0, noisePower = 0;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    smooth = .94 * smooth + .06 * white;
    background[i] = .55 * white + 2 * smooth + .25 * Math.sin(2 * Math.PI * 60 * i / RATE);
    noisePower += background[i] ** 2;
  }
  const noiseGain = scenario.noise / Math.max(1e-12, Math.sqrt(noisePower / length));
  const voices = scenario.single !== undefined ? [{ midi: scenario.single, s: 2 }]
    : (scenario.frets ?? []).flatMap((fret, s) => fret === null ? [] : [{ midi: STANDARD_TUNING[s].midi + fret, s }]).reverse();
  if (scenario.up) voices.reverse();
  voices.forEach(({ midi, s }, index) => {
    const recording = guitarSamplePlayback(decoder, bank, 440 * 2 ** ((midi - 69) / 12), s);
    const offset = Math.round((STRUM_AT + index * (scenario.spacing ?? .024)) * RATE);
    const buffer = recording.buffer;
    for (let i = offset; i < length; i++) {
      const position = Math.floor((i - offset) * recording.rate + recording.offset * RATE);
      if (position >= buffer.length) break;
      let value = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) value += buffer.getChannelData(channel)[position] / buffer.numberOfChannels;
      signal[i] += value * (.8 + s * .035);
    }
  });
  let power = 0;
  const start = Math.floor(STRUM_AT * RATE), end = Math.floor((STRUM_AT + .5) * RATE);
  for (let i = start; i < end; i++) power += signal[i] ** 2;
  const gain = scenario.level / Math.max(1e-12, Math.sqrt(power / (end - start)));
  for (let i = 0; i < length; i++) signal[i] = signal[i] * gain + background[i] * noiseGain;
  if (scenario.calibrationTransient || scenario.burst) {
    const at = scenario.calibrationTransient ? 1.024 : STRUM_AT;
    for (let i = Math.floor(at * RATE); i < length; i++) {
      const time = i / RATE - at;
      const burst = scenario.burst === 'thump'
        ? .16 * Math.sin(2 * Math.PI * 98 * time) * Math.exp(-time / .09)
        : background[i] * .3 * Math.exp(-time / .03);
      signal[i] += burst;
    }
  }
  return signal;
}

function outcome(predictions: Array<{ symbol: string; at: number }>, expected: string | null, timings: number[]): Outcome {
  const first = predictions[0] ?? null;
  return {
    first: first?.symbol ?? null,
    correct: expected === null ? !first : first?.symbol === expected,
    anyCorrect: expected !== null && predictions.some(p => p.symbol === expected),
    wrong: predictions.some(p => p.symbol !== expected),
    latency: first ? Math.round((first.at - STRUM_AT) * 1000) : null,
    predictions: [...new Set(predictions.map(p => p.symbol))],
    processingP95Ms: timings.sort((a, b) => a - b)[Math.floor(timings.length * .95)] ?? 0,
  };
}

async function runScenario(scenario: Scenario, bank: GuitarSampleBank, decoder: BaseAudioContext, Baseline: typeof DetectionEngine): Promise<Row> {
  const ctx = new OfflineAudioContext(1, Math.ceil(RATE * DURATION), RATE);
  const source = ctx.createBufferSource(), high = ctx.createBiquadFilter(), low = ctx.createBiquadFilter(), gain = ctx.createGain(), analyser = ctx.createAnalyser();
  const data = waveform(scenario, bank, decoder);
  source.buffer = ctx.createBuffer(1, data.length, RATE); source.buffer.getChannelData(0).set(data);
  high.type = 'highpass'; high.frequency.value = 65; high.Q.value = .707;
  low.type = 'lowpass'; low.frequency.value = 2200; low.Q.value = .707;
  gain.gain.value = 4;
  if (scenario.gainChange) gain.gain.setValueAtTime(6, 2.048);
  analyser.fftSize = SIZE; analyser.smoothingTimeConstant = .10;
  source.connect(high); high.connect(low); low.connect(gain); gain.connect(analyser); analyser.connect(ctx.destination);
  const baseline = new Baseline({ fftSize: SIZE, triggerMode: 'guitartuna', targetMode: 'chords' });
  const current = new DetectionEngine({ fftSize: SIZE, triggerMode: 'guitartuna', targetMode: 'chords' });
  baseline.setAnalyser(analyser); current.setAnalyser(analyser);
  baseline.startNoiseCalibration(); current.startNoiseCalibration();
  const predictions = [[], []] as Array<Array<{ symbol: string; at: number }>>;
  const timings: number[][] = [[], []];
  const spectrum = new Float32Array(SIZE / 2), originalNow = Date.now;
  let clock = 100000;
  let evidence: Row['evidence'];
  let failure: unknown;
  Date.now = () => clock;
  try {
    const suspensions: Promise<void>[] = [];
    for (let step = 1; step < Math.round(DURATION / STEP); step++) {
      suspensions.push(ctx.suspend(step * STEP).then(async () => {
        try {
        if (failure) return;
        clock = 100000 + ctx.currentTime * 1000;
        if (scenario.gainChange && step === 64) {
          baseline.setConfig({ micGainMultiplier: 6 }); current.setConfig({ micGainMultiplier: 6 });
        }
        analyser.getFloatFrequencyData(spectrum);
        for (const [index, engine] of [baseline, current].entries()) {
          const started = performance.now();
          const result = engine.processFrame(spectrum, RATE, STANDARD_TUNING);
          timings[index].push(performance.now() - started);
          if (ctx.currentTime >= STRUM_AT && result?.freshness === 'fresh' && result.chord) {
            if (index === 1 && !predictions[index].length && result.chord.symbol !== scenario.expected) {
              evidence = { chroma: [...result.chroma], peaks: result.peaks.slice(0, 16).map(({ freq, midi, amp }) => ({ freq, midi, amp })) };
            }
            predictions[index].push({ symbol: result.chord.symbol, at: ctx.currentTime });
          }
        }
        } catch (error) { failure = error; }
        finally { await ctx.resume(); }
      }));
    }
    source.start();
    await ctx.startRendering(); await Promise.all(suspensions);
    if (failure) throw failure;
  } finally { Date.now = originalNow; }
  return { bank, scenario: scenario.id, expected: scenario.expected, baseline: outcome(predictions[0], scenario.expected, timings[0]), current: outcome(predictions[1], scenario.expected, timings[1]), inversion: !!scenario.inversion, evidence };
}

function summarize(rows: Row[], version: 'baseline' | 'current') {
  const chords = rows.filter(row => row.expected), negatives = rows.filter(row => !row.expected);
  const latencies = chords.flatMap(row => row[version].correct && row[version].latency !== null ? [row[version].latency!] : []).sort((a, b) => a - b);
  return {
    chordCases: chords.length,
    correctFirst: chords.filter(row => row[version].correct).length,
    everCorrect: chords.filter(row => row[version].anyCorrect).length,
    wrongFirst: chords.filter(row => row[version].first && !row[version].correct).length,
    rejected: chords.filter(row => !row[version].first).length,
    negativeCases: negatives.length,
    falsePositiveCases: negatives.filter(row => row[version].first).length,
    medianCorrectLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    worstCaseFrameP95Ms: Math.max(0, ...rows.map(row => row[version].processingP95Ms)),
  };
}

export async function runDetectorBenchmark(baselineJs: string, quick = true, onlyNegative = false, holdout = false) {
  RATE = holdout ? 48000 : 44100;
  const url = URL.createObjectURL(new Blob([baselineJs], { type: 'text/javascript' }));
  const { DetectionEngine: Baseline } = await import(/* @vite-ignore */ url);
  URL.revokeObjectURL(url);
  const decoder = new OfflineAudioContext(2, 1, RATE);
  const rows: Row[] = [];
  const banks: GuitarSampleBank[] = quick ? ['steel'] : ['steel','classical','electric'];
  const cases = scenarios(quick, holdout).filter(scenario => !onlyNegative || scenario.expected === null);
  for (const bank of banks) {
    await loadGuitarBank(decoder, bank);
    for (const scenario of cases) {
      rows.push(await runScenario(scenario, bank, decoder, Baseline));
      window.benchmarkProgress = `${rows.length}/${cases.length * banks.length}: ${bank}/${scenario.id}`;
    }
  }
  const conditions = ['clean','quiet','room-noise','gain-change', ...(holdout ? ['calibration-spike'] : [])];
  return {
    method: 'Native OfflineAudioContext microphone filters and analyser; default capture mode. Strums assembled from authorized single-note recordings, not human performances. No competitor accuracy measurement.',
    samples: GUITAR_SAMPLES.length,
    sampleRate: RATE,
    holdout,
    baseline: summarize(rows, 'baseline'), current: summarize(rows, 'current'),
    conditions: Object.fromEntries(conditions.map(condition => {
      const selected = rows.filter(row => row.scenario.endsWith(`/${condition}`));
      return [condition, { baseline: summarize(selected, 'baseline'), current: summarize(selected, 'current') }];
    })),
    rows,
  };
}
