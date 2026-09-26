export type StrumStroke = 'D' | 'U' | '-';
export interface StrummingPattern {
  id: string;
  name: string;
  steps: readonly StrumStroke[];
}
export const STRUM_COUNTS = ['1', '&', '2', '&', '3', '&', '4', '&'] as const;
export const STRUMMING_PATTERNS: readonly StrummingPattern[] = [
  { id: 'quarter-down', name: 'Steady downstrokes', steps: ['D', '-', 'D', '-', 'D', '-', 'D', '-'] },
  { id: 'eighth-alternating', name: 'Alternating eighths', steps: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'] },
  { id: 'offbeat-lift', name: 'Offbeat lift', steps: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'] },
  { id: 'eighth-finish', name: 'Eighth-note finish', steps: ['D', '-', 'D', '-', 'D', 'U', 'D', 'U'] },
];
export function getStrummingPattern(id: string): StrummingPattern {
  const pattern = STRUMMING_PATTERNS.find(p => p.id === id);
  if (!pattern) throw new Error('Unknown strumming pattern. Choose one of the listed patterns.');
  return pattern;
}
export function patternNotation(pattern: StrummingPattern): string {
  return pattern.steps.map(step => step === 'D' ? '↓' : step === 'U' ? '↑' : '—').join(' ');
}

export interface StrummingCandidate { patternId: string; bpm: number; fit: number }
export interface StrummingAnalysis {
  candidates: StrummingCandidate[];
  attacks: number;
  message: string;
}

/** Estimate repeating attack timing, not stroke direction or a verified meter. */
export function suggestStrumming(samples: Float32Array, sampleRate: number): StrummingAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Invalid rhythm analysis sample rate.');
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const rms = new Float64Array(Math.ceil(samples.length / hop));
  let peakRms = 0;
  for (let frame = 0; frame < rms.length; frame++) {
    let energy = 0;
    const end = Math.min(samples.length, (frame + 1) * hop);
    for (let i = frame * hop; i < end; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('Invalid rhythm analysis samples.');
      energy += samples[i] * samples[i];
    }
    rms[frame] = Math.sqrt(energy / (end - frame * hop));
    peakRms = Math.max(peakRms, rms[frame]);
  }
  const flux = new Float64Array(rms.length);
  let baseline = 0, peakFlux = 0;
  for (let i = 0; i < rms.length; i++) {
    flux[i] = Math.max(0, rms[i] - baseline);
    baseline = Math.max(rms[i], baseline * 0.80);
    peakFlux = Math.max(peakFlux, flux[i]);
  }
  const threshold = Math.max(0.002, peakRms * 0.10, peakFlux * 0.22);
  const onsets: Array<{ time: number; strength: number }> = [];
  for (let i = 0; i < flux.length; i++) {
    if (flux[i] < threshold || flux[i] < (flux[i - 1] || 0) || flux[i] <= (flux[i + 1] || 0)) continue;
    const time = i * hop / sampleRate;
    const previous = onsets.at(-1);
    if (previous && time - previous.time < 0.12) {
      if (flux[i] > previous.strength) onsets[onsets.length - 1] = { time, strength: flux[i] };
    } else onsets.push({ time, strength: flux[i] });
  }
  const empty = (message: string): StrummingAnalysis => ({ candidates: [], attacks: onsets.length, message });
  if (samples.length / sampleRate < 6 || onsets.length < 8 || onsets.at(-1)!.time - onsets[0].time < 4) {
    return empty('Not enough repeated attacks. Try a clean 10–20 second guitar rhythm; you can still choose a practice pattern manually.');
  }
  const best = new Map<string, StrummingCandidate>();
  for (let bpm = 50; bpm <= 160; bpm++) {
    const step = 30 / bpm;
    const counts = new Array<number>(8).fill(0);
    let aligned = 0, error = 0, lastSlot = 0;
    for (const onset of onsets) {
      const position = (onset.time - onsets[0].time) / step;
      const slot = Math.round(position);
      const residual = Math.abs(position - slot) * step;
      if (residual <= Math.min(0.055, step * 0.18)) {
        aligned++; error += residual / step; counts[slot % 8]++; lastSlot = Math.max(lastSlot, slot);
      }
    }
    const alignment = aligned / onsets.length;
    if (alignment < 0.85) continue;
    const cycles = Math.floor(lastSlot / 8) + 1;
    if (cycles < 2) continue;
    for (const pattern of STRUMMING_PATTERNS) {
      const hitsPerCycle = pattern.steps.filter(s => s !== '-').length;
      for (let rotation = 0; rotation < 8; rotation++) {
        let matched = 0;
        for (let slot = 0; slot < 8; slot++) if (pattern.steps[(slot + rotation) % 8] !== '-') matched += counts[slot];
        const precision = matched / onsets.length;
        const recall = Math.min(1, matched / (cycles * hitsPerCycle));
        const fit = 2 * precision * recall / (precision + recall || 1) * (1 - error / aligned) * alignment;
        if (fit < 0.78) continue;
        const candidate = { patternId: pattern.id, bpm, fit };
        const previous = best.get(pattern.id);
        if (!previous || fit > previous.fit + 1e-9 || Math.abs(fit - previous.fit) < 1e-9 && Math.abs(bpm - 100) < Math.abs(previous.bpm - 100)) best.set(pattern.id, candidate);
      }
    }
  }
  const candidates = [...best.values()].sort((a, b) => b.fit - a.fit || Math.abs(a.bpm - 100) - Math.abs(b.bpm - 100)).slice(0, 3);
  if (!candidates.length) return empty('No stable supported rhythm found. Irregular timing, percussion or changing patterns may obscure the guitar.');
  return { candidates, attacks: onsets.length,
    message: 'Practice suggestions from repeated attacks, assuming 4/4 eighth-note timing. Down/up motions and the first beat are suggested, not detected. Half/double tempo and percussion can be ambiguous.' };
}
