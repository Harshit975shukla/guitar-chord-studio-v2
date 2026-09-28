import { FastDetectionPreview } from '../src/detection/fastPreview';
import { DetectionEngine } from '../src/detection/engine';
import { loadGuitarBank, guitarSamplePlayback } from '../src/audio/guitarSamples';
import { STANDARD_TUNING, type DetectionResult } from '../src/types';

export async function runFastPreviewCase(noteDurationMs = 125) {
  const rate = 48000, start = 2, spacing = noteDurationMs / 1000, sequence = [64,65,67,69,67,64];
  const seconds = start + sequence.length * spacing + .25;
  const context = new OfflineAudioContext(1, rate * seconds, rate);
  await loadGuitarBank(context, 'steel');
  const buffer = context.createBuffer(1, rate * seconds, rate), output = buffer.getChannelData(0);
  sequence.forEach((midi, index) => {
    const recording = guitarSamplePlayback(context, 'steel', 440 * 2 ** ((midi - 69) / 12), 0).buffer;
    const offset = Math.round((start + index * spacing) * rate), count = Math.round(spacing * rate);
    for (let i = 0; i < count; i++) {
      const envelope = Math.min(1, i / 96, (count - i - 1) / 96);
      for (let c = 0; c < recording.numberOfChannels; c++) output[offset + i] += recording.getChannelData(c)[i] * envelope * .12 / recording.numberOfChannels;
    }
  });
  const source = context.createBufferSource(), high = context.createBiquadFilter(), low = context.createBiquadFilter(), gain = context.createGain(), analyser = context.createAnalyser();
  source.buffer = buffer; high.type = 'highpass'; high.frequency.value = 65; high.Q.value = .707;
  low.type = 'lowpass'; low.frequency.value = 2200; low.Q.value = .707; gain.gain.value = 4;
  analyser.fftSize = 8192; analyser.smoothingTimeConstant = .1;
  source.connect(high); high.connect(low); low.connect(gain); gain.connect(analyser); analyser.connect(context.destination);
  const stable = new DetectionEngine({fftSize:8192,targetMode:'notes'}), control = new DetectionEngine({fftSize:8192,targetMode:'notes'});
  stable.setAnalyser(analyser); control.setAnalyser(analyser); stable.startNoiseCalibration(); control.startNoiseCalibration();
  const hits = { stable: new Set<number>(), fast: new Set<number>() }, wrong = { stable: 0, fast: 0 };
  const wrongDetails: Array<{ kind: string; midi: number; expected: number; at: number }> = [];
  const latencies: Record<'stable' | 'fast', number[]> = {stable: [], fast: []};
  const observe = (kind: 'stable' | 'fast', result: DetectionResult | null) => {
    const index = Math.floor((context.currentTime - start) / spacing);
    if (index < 0 || index >= sequence.length || result?.freshness !== 'fresh' || !result.note) return;
    const midi = Math.round(result.note.pitch.midi);
    if (midi === sequence[index]) {
      if (!hits[kind].has(index)) latencies[kind].push(Math.round((context.currentTime - start - index * spacing) * 1000));
      hits[kind].add(index);
    }
    else if (midi !== sequence[index - 1]) { wrong[kind]++; wrongDetails.push({kind,midi,expected:sequence[index],at:context.currentTime}); }
  };
  const fast = new FastDetectionPreview(result => observe('fast', result));
  fast.configure({targetMode:'notes'}); fast.setEnabled(true, gain); fast.calibrate();
  const spectrum = new Float32Array(4096), originalNow = Date.now;
  let clock = 100000, identical = true, failure: unknown;
  Date.now = () => clock;
  try {
    const tasks = [];
    for (let step = 1; step < Math.round(seconds / .016); step++) tasks.push(context.suspend(step * .016).then(async () => {
      try {
        if (failure) return;
        clock = 100000 + context.currentTime * 1000;
        if (step % 2 === 0) {
          analyser.getFloatFrequencyData(spectrum);
          const result = stable.processFrame(spectrum, rate, STANDARD_TUNING), baseline = control.processFrame(spectrum, rate, STANDARD_TUNING);
          identical &&= JSON.stringify(result) === JSON.stringify(baseline);
          observe('stable', result);
        }
        fast.tick(context.currentTime * 1000, STANDARD_TUNING);
      } catch (error) { failure = error; } finally { await context.resume(); }
    }));
    source.start(); await context.startRendering(); await Promise.all(tasks);
    if (failure) throw failure;
    return { noteDurationMs: spacing * 1000, targets: sequence.length, stableHits: hits.stable.size, fastHits: hits.fast.size, wrong, wrongDetails, latencies, stableUnchanged: identical };
  } finally { Date.now = originalNow; fast.dispose(); }
}
