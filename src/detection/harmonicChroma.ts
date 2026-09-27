interface NoteColumn { midi: number; bins: number[]; weights: number[] }
const dictionaries = new Map<string, NoteColumn[]>();
const sinc = (x: number) => Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
function blackmanMagnitude(x: number): number {
  return Math.abs(.42 * sinc(x) + .25 * (sinc(x - 1) + sinc(x + 1)) + .04 * (sinc(x - 2) + sinc(x + 2))) / .42;
}
function dictionary(sampleRate: number, fftSize: number): NoteColumn[] {
  const key = `${sampleRate}:${fftSize}`;
  const cached = dictionaries.get(key);
  if (cached) return cached;
  const columns: NoteColumn[] = [], width = sampleRate / fftSize;
  for (let midi = 36; midi <= 88; midi++) for (const decay of [.55, .82]) {
    const fundamental = 440 * 2 ** ((midi - 69) / 12), entries = new Map<number, number>();
    for (let harmonic = 1; harmonic <= 8; harmonic++) {
      const frequency = fundamental * harmonic;
      if (frequency > Math.min(2200, sampleRate / 2)) break;
      const center = frequency / width;
      for (let bin = Math.max(1, Math.floor(center) - 3); bin <= Math.min(fftSize / 2 - 1, Math.ceil(center) + 3); bin++) {
        const amplitude = decay ** (harmonic - 1) * blackmanMagnitude(bin - center);
        if (amplitude > .0001) entries.set(bin, (entries.get(bin) ?? 0) + amplitude);
      }
    }
    const bins = [...entries.keys()], weights = [...entries.values()];
    const norm = Math.sqrt(weights.reduce((sum, value) => sum + value * value, 0));
    if (norm) columns.push({ midi, bins, weights: weights.map(value => value / norm) });
  }
  if (dictionaries.size >= 4) dictionaries.delete(dictionaries.keys().next().value!);
  dictionaries.set(key, columns);
  return columns;
}

/** Original sparse non-negative harmonic fit; overtones are explained by their note, not counted as extra chord tones. */
export function harmonicChroma(spectrum: Float32Array, sampleRate: number, fftSize: number, peaks: readonly { midi: number }[]) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || !Number.isInteger(fftSize) || fftSize < 256 || (fftSize & (fftSize - 1)) !== 0 || spectrum.length !== fftSize / 2) {
    throw new Error('Invalid harmonic-analysis frame.');
  }
  const columns = dictionary(sampleRate, fftSize), residual = new Float32Array(spectrum);
  const activation = new Float32Array(columns.length);
  const observed = new Set(peaks.filter(peak => Math.abs(peak.midi - Math.round(peak.midi)) <= .35).map(peak => Math.round(peak.midi)));
  let peak = 0;
  const upper = Math.min(spectrum.length - 1, Math.ceil(2200 * fftSize / sampleRate));
  for (let bin = Math.floor(65 * fftSize / sampleRate); bin <= upper; bin++) peak = Math.max(peak, spectrum[bin]);
  const penalty = peak * .025;
  for (let iteration = 0; iteration < 10; iteration++) {
    for (let n = 0; n < columns.length; n++) {
      const { bins, weights } = columns[n];
      if (!observed.has(columns[n].midi)) continue;
      let projection = 0;
      for (let i = 0; i < bins.length; i++) projection += residual[bins[i]] * weights[i];
      const next = Math.max(0, activation[n] + projection - penalty), change = next - activation[n];
      activation[n] = next;
      if (Math.abs(change) < 1e-8) continue;
      for (let i = 0; i < bins.length; i++) residual[bins[i]] -= change * weights[i];
    }
  }
  const notes = new Float32Array(53);
  columns.forEach((column, index) => { notes[column.midi - 36] += activation[index]; });
  let strongest = 0;
  for (const value of notes) strongest = Math.max(strongest, value);
  const chroma = new Float32Array(12);
  for (let n = 0; n < notes.length; n++) {
    if (notes[n] < strongest * .10) continue;
    const midi = n + 36, frequency = 440 * 2 ** ((midi - 69) / 12);
    chroma[midi % 12] += notes[n] * Math.min(1, Math.sqrt(350 / frequency));
  }
  let maximum = 0;
  for (let i = 0; i < 12; i++) { chroma[i] = Math.sqrt(chroma[i]); maximum = Math.max(maximum, chroma[i]); }
  if (maximum > 0) for (let i = 0; i < 12; i++) chroma[i] /= maximum;
  return chroma;
}
