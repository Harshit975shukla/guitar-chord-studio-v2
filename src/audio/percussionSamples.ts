import { percussionSampleSet, type PercussionSampleAsset } from './percussionSampleData';

interface RecordedHit { buffer: AudioBuffer; offset: number; peak: number; processed: boolean }
interface Bank { hits: Map<string, RecordedHit>; bytes: number }
interface Cache { banks: Map<string, Bank>; pending: Map<string, Promise<void>>; preferred: string; active: Map<object, string> }
export interface PercussionRecording { buffer: AudioBuffer; offset: number; gain: number }
const MEMORY_LIMIT = 48 * 1024 * 1024;
/** Loudest layer of a calibrated (processed) voice peaks near the level of the normalized Musicca kit. */
export const CALIBRATED_PEAK = .9;
/** Quieter recorded layers keep their own timbre but are lifted part-way, like a gentle drum-bus compressor. */
export const LAYER_LIFT = .35;
const caches = new WeakMap<BaseAudioContext, Cache>();
function getCache(context: BaseAudioContext): Cache {
  let cache = caches.get(context);
  if (!cache) { cache = { banks: new Map(), pending: new Map(), preferred: '', active: new Map() }; caches.set(context, cache); }
  return cache;
}
/** Records the kit an output is playing so later loads never evict it; pass null to release it. */
export function markPercussionKitActive(context: BaseAudioContext, owner: object, kit: string | null): void {
  const active = getCache(context).active;
  if (kit === null) active.delete(owner); else active.set(owner, kit);
}
const hitBytes = (hit: RecordedHit): number => hit.buffer.length * hit.buffer.numberOfChannels * 4;

async function decode(context: BaseAudioContext, list: PercussionSampleAsset[]): Promise<Map<string, RecordedHit>> {
  const decoder = context.sampleRate > 48000 ? new OfflineAudioContext(2, 1, 48000) : context;
  const hits = new Map<string, RecordedHit>();
  for (let start = 0; start < list.length; start += 4) await Promise.all(list.slice(start, start + 4).map(async asset => {
    const response = await fetch(`${import.meta.env?.BASE_URL ?? './'}audio/percussion/${asset.path}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Percussion recording could not load (${response.status}). Try Hear sound again.`);
    const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
    if (buffer.duration <= 0 || buffer.duration > 20) throw new Error('Invalid percussion recording duration.');
    let peak = 0, first = buffer.length;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) for (const value of buffer.getChannelData(channel)) {
      if (!Number.isFinite(value)) throw new Error('Invalid percussion recording samples.');
      peak = Math.max(peak, Math.abs(value));
    }
    if (peak < .00001) throw new Error('Percussion recording is silent.');
    // Processed CC0 files keep room noise before the strike; align them on the strike itself.
    const processed = asset.maxSeconds !== undefined, threshold = processed ? peak * .02 : Math.max(.00001, peak * .0005);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < first; i++) if (Math.abs(data[i]) >= threshold) { first = i; break; }
    }
    hits.set(asset.path, { buffer, peak, processed, offset: Math.max(0, first / buffer.sampleRate - (processed ? .002 : .003)) });
  }));
  return hits;
}

/**
 * Loads the recordings for voices in one kit. Requests for a kit that is already loading
 * wait for it and then load anything still missing, so different voice sets never race.
 */
export async function loadPercussionRecordings(context: BaseAudioContext, voices: readonly string[], kit: string): Promise<void> {
  const assets = new Map<string, PercussionSampleAsset>();
  voices.forEach(voice => percussionSampleSet(voice, kit)?.forEach(asset => assets.set(asset.path, asset)));
  const cache = getCache(context);
  cache.preferred = kit;
  for (let attempt = 0; attempt < 4; attempt++) {
    const pending = cache.pending.get(kit);
    if (pending) { await pending; continue; }
    const missing = [...assets.values()].filter(asset => !cache.banks.get(kit)?.hits.has(asset.path));
    if (!missing.length) return;
    const promise = (async () => {
      const decoded = await decode(context, missing);
      const current = cache.banks.get(kit);
      let hits = new Map(current?.hits ?? []);
      let bytes = current?.bytes ?? 0;
      const added = [...decoded.values()].reduce((sum, hit) => sum + hitBytes(hit), 0);
      if (bytes + added > MEMORY_LIMIT) {
        hits = new Map([...hits].filter(([path]) => assets.has(path)));
        bytes = [...hits.values()].reduce((sum, hit) => sum + hitBytes(hit), 0);
      }
      decoded.forEach((hit, path) => hits.set(path, hit));
      bytes += added;
      if (bytes > MEMORY_LIMIT) throw new Error('This percussion kit exceeds the audio memory limit.');
      cache.banks.set(kit, { hits, bytes });
      // Keep two banks, but never evict the newest request, the kit just loaded or a kit that is still playing.
      const keep = new Set([cache.preferred, kit, ...cache.active.values()]);
      for (const key of [...cache.banks.keys()]) if (cache.banks.size > 2 && !keep.has(key)) cache.banks.delete(key);
    })().finally(() => cache.pending.delete(kit));
    cache.pending.set(kit, promise);
    return promise;
  }
  throw new Error('Percussion recordings are still loading. Try again.');
}
export function percussionLayer(voice: string, kit: string, velocity: number): number | null {
  const assets = percussionSampleSet(voice, kit);
  if (!assets) return null;
  return assets.reduce((best, asset) => Math.abs(asset.velocity - velocity) < Math.abs(best - velocity) ? asset.velocity : best, assets[0].velocity);
}
export function percussionRecording(context: BaseAudioContext, voice: string, kit: string, velocity: number, take: number): PercussionRecording | null {
  const assets = percussionSampleSet(voice, kit);
  if (!assets) return null;
  const nearest = percussionLayer(voice, kit, velocity);
  const choices = assets.filter(asset => asset.velocity === nearest);
  const selected = choices[take % choices.length];
  const bank = getCache(context).banks.get(kit);
  const recording = bank?.hits.get(selected.path);
  if (!bank || !recording) throw new Error('Recorded percussion is not ready. Load the sound before playing.');
  if (!recording.processed) return { buffer: recording.buffer, offset: recording.offset, gain: 1 };
  const loudest = Math.max(...assets.map(asset => bank.hits.get(asset.path)?.peak ?? 0), recording.peak);
  return { buffer: recording.buffer, offset: recording.offset,
    gain: CALIBRATED_PEAK / loudest * (loudest / recording.peak) ** LAYER_LIFT / selected.velocity };
}
