export interface NotePitch { freq: number; confidence: number; rms: number }
export const NOTE_PITCH_MIN = 60;
export const NOTE_PITCH_MAX = 1400;

/** Normalized periodicity over the recent input, not the stale beginning of the FFT window. */
export function estimateNotePitch(input: Float32Array, sampleRate: number): NotePitch | null {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || input.length < 256) return null;
  const stride = Math.max(1, Math.ceil(sampleRate / 24000)), rate = sampleRate / stride;
  const minLag = Math.floor(rate / NOTE_PITCH_MAX), maxLag = Math.ceil(rate / NOTE_PITCH_MIN);
  const count = Math.min(Math.floor(input.length / stride), 1024 + maxLag + 2);
  const window = count - maxLag - 1;
  if (window < maxLag * 2) return null;
  const samples = new Float32Array(count);
  let mean = 0;
  const start = input.length - count * stride;
  for (let i = 0; i < count; i++) {
    let value = 0;
    for (let j = 0; j < stride; j++) value += input[start + i * stride + j] / stride;
    if (!Number.isFinite(value)) return null;
    samples[i] = value; mean += value;
  }
  mean /= count;
  const energies = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) {
    samples[i] -= mean; energies[i + 1] = energies[i] + samples[i] * samples[i];
  }
  const rms = Math.sqrt(energies[count] / count);
  if (rms < .001) return null;
  const correlations = new Float32Array(maxLag + 2);
  const firstEnergy = energies[window];
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let dot = 0;
    for (let i = 0; i < window; i++) dot += samples[i] * samples[i + lag];
    correlations[lag] = 2 * dot / Math.max(1e-12, firstEnergy + energies[window + lag] - energies[lag]);
  }
  const candidates: number[] = [];
  const refinedPeak = (lag: number) => {
    const a = correlations[lag - 1], b = correlations[lag], c = correlations[lag + 1];
    const shift = Math.max(-.5, Math.min(.5, .5 * (a - c) / (a - 2 * b + c || 1)));
    return { shift, strength: Math.min(1, b - .25 * (a - c) * shift) };
  };
  let negative = false, best = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    if (correlations[lag] < 0) negative = true;
    if (negative && lag >= minLag && correlations[lag] > correlations[lag - 1] && correlations[lag] >= correlations[lag + 1]) {
      candidates.push(lag); best = Math.max(best, refinedPeak(lag).strength);
    }
  }
  if (best < .80) return null;
  const chosen = candidates.find(lag => refinedPeak(lag).strength >= Math.max(.80, best * .97));
  if (chosen === undefined) return null;
  const { shift, strength } = refinedPeak(chosen);
  const freq = rate / (chosen + shift);
  if (freq < NOTE_PITCH_MIN || freq > NOTE_PITCH_MAX) return null;
  return { freq, confidence: strength, rms };
}
