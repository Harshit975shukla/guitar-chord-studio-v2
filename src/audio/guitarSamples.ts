export const GUITAR_SAMPLE_BANKS = {
  steel: 'Steel-string guitar', classical: 'Classical guitar', electric: 'Electric guitar',
} as const;
export type GuitarSampleBank = keyof typeof GUITAR_SAMPLE_BANKS;
export interface GuitarSample { id: string; midi: number; stringIndex: number }

// Musicca's identifiers count the open string as 1; 0 is one semitone below it.
const groups = [
  { prefix: 'f', base: 63, frets: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
  { prefix: 'h', base: 58, frets: [0, 1, 2, 3, 4, 5, 9] },
  { prefix: 'g', base: 54, frets: [0, 1, 2, 3, 4] },
  { prefix: 'd', base: 49, frets: [0, 1, 2, 3, 4, 5] },
  { prefix: 'a', base: 44, frets: [0, 1, 2, 3, 4, 5] },
  { prefix: 'e', base: 39, frets: [0, 1, 2, 3, 4, 5] },
];
export const GUITAR_SAMPLES: GuitarSample[] = groups.flatMap((group, stringIndex) =>
  group.frets.map(fret => ({ id: `${group.prefix}${fret}`, midi: group.base + fret, stringIndex })));

export function chooseGuitarSample(midi: number, stringIndex: number): GuitarSample {
  if (!Number.isFinite(midi) || !Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex > 5) throw new Error('Invalid guitar sample pitch or string.');
  return GUITAR_SAMPLES.reduce((best, sample) => {
    const distance = Math.abs(sample.midi - midi), previous = Math.abs(best.midi - midi);
    return distance < previous || (distance === previous && Math.abs(sample.stringIndex - stringIndex) < Math.abs(best.stringIndex - stringIndex)) ? sample : best;
  });
}

export interface DecodedGuitarSample { buffer: AudioBuffer; offset: number }
interface SampleCache {
  banks: Map<GuitarSampleBank, Map<string, DecodedGuitarSample>>;
  pending: Map<GuitarSampleBank, Promise<void>>;
  preferred: GuitarSampleBank | null;
}
const caches = new WeakMap<BaseAudioContext, SampleCache>();
function cacheFor(context: BaseAudioContext): SampleCache {
  let cache = caches.get(context);
  if (!cache) { cache = { banks: new Map(), pending: new Map(), preferred: null }; caches.set(context, cache); }
  return cache;
}

export function guitarBankReady(context: BaseAudioContext, bank: GuitarSampleBank): boolean {
  return cacheFor(context).banks.has(bank);
}

export async function loadGuitarBank(context: BaseAudioContext, bank: GuitarSampleBank, progress?: (done: number, total: number) => void): Promise<void> {
  if (!Object.hasOwn(GUITAR_SAMPLE_BANKS, bank)) throw new Error(`Unknown recorded guitar: ${bank}`);
  const cache = cacheFor(context);
  cache.preferred = bank;
  const ready = cache.banks.get(bank);
  if (ready) {
    cache.banks.delete(bank); cache.banks.set(bank, ready);
    return;
  }
  if (cache.pending.has(bank)) return cache.pending.get(bank)!;
  const load = async () => {
    const samples = new Map<string, DecodedGuitarSample>();
    const decoder = context.sampleRate > 48000 ? new OfflineAudioContext(2, 1, 48000) : context;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Guitar recordings took too long to load. Check your connection, then retry.')), 60000);
    let bytes = 0;
    try {
    for (let start = 0; start < GUITAR_SAMPLES.length; start += 4) {
      await Promise.all(GUITAR_SAMPLES.slice(start, start + 4).map(async sample => {
        const url = `${import.meta.env?.BASE_URL ?? './'}audio/musicca-guitar/${bank}/${sample.id}.mp3`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Recording ${bank}/${sample.id} could not load (${response.status}). Check your connection, then retry.`);
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        controller.signal.throwIfAborted();
        if (buffer.duration < .1 || buffer.duration > 20) throw new Error(`Invalid guitar recording: ${bank}/${sample.id}.`);
        bytes += buffer.length * buffer.numberOfChannels * 4;
        if (bytes > 64 * 1024 * 1024) throw new Error('This guitar bank exceeds the decoded audio memory limit.');
        let peak = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(value));
        if (!Number.isFinite(peak) || peak < .0001) throw new Error(`Silent or invalid guitar recording: ${bank}/${sample.id}.`);
        const threshold = Math.max(.00001, peak * .0005);
        let first = buffer.length;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const channel = buffer.getChannelData(c);
          for (let i = 0; i < first; i++) if (Math.abs(channel[i]) >= threshold) { first = i; break; }
        }
        samples.set(sample.id, { buffer, offset: Math.max(0, first / buffer.sampleRate - .003) });
        progress?.(samples.size, GUITAR_SAMPLES.length);
      }));
    }
    cache.banks.set(bank, samples);
    // Keep at most two decoded instruments; playing sources retain their own buffers.
    while (cache.banks.size > 2) {
      const oldest = [...cache.banks.keys()].find(key => key !== cache.preferred)!;
      cache.banks.delete(oldest);
    }
    } catch (error) {
      controller.abort(); throw error;
    } finally { clearTimeout(timeout); }
  };
  const promise = load().finally(() => cache.pending.delete(bank));
  cache.pending.set(bank, promise);
  return promise;
}

export function guitarSamplePlayback(context: BaseAudioContext, bank: GuitarSampleBank, frequency: number, stringIndex: number) {
  if (!Number.isFinite(frequency) || frequency < 20 || frequency > context.sampleRate / 4) throw new Error('Guitar frequency is outside the playback range.');
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const sample = chooseGuitarSample(midi, stringIndex);
  const decoded = cacheFor(context).banks.get(bank)?.get(sample.id);
  if (!decoded) throw new Error('Recorded guitar is not ready. Load the recordings, then retry playback.');
  return { ...decoded, sample, rate: 2 ** ((midi - sample.midi) / 12) };
}
