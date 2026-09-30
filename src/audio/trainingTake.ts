export const TAKE_LIMIT_SECONDS = 12;
export const TRAINING_CONSENT_VERSION = '2026-09-30-v1';
export interface TakeSetup {
  intendedChord: string;
  tuning: number[];
  capo: number;
  instrument: string;
  engines: { standard: string; enhanced: string | null; app: string };
  detection: { target: string; trigger: string; sensitivity: number; noiseGateDb: number; seventhStrictness: number };
}
export interface TakePrediction {
  at: number;
  engine: 'standard' | 'enhanced';
  label: string | null;
  freshness: string;
  evidenceAt: number;
  attackId?: number;
}
export class TrainingTake {
  readonly createdAt: string;
  readonly id: string;
  readonly setup: TakeSetup;
  private samples: Float32Array<ArrayBuffer>;
  private length = 0;
  private start: number | null = null;
  private end: number | null = null;
  private predictions: TakePrediction[] = [];
  constructor(readonly sampleRate: number, setup: TakeSetup, recordingConsent: boolean, trainingConsent: boolean) {
    if (!recordingConsent || !trainingConsent) throw new Error('Both recording and local training-use permissions are required.');
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Unsupported take sample rate.');
    if (!setup.intendedChord || setup.tuning.length !== 6 || !setup.tuning.every(midi => Number.isInteger(midi) && midi >= 0 && midi <= 127)
      || !Number.isInteger(setup.capo) || setup.capo < 0 || setup.capo > 12
      || !['steel', 'classical', 'electric'].includes(setup.instrument)
      || ![setup.detection.sensitivity, setup.detection.noiseGateDb, setup.detection.seventhStrictness].every(Number.isFinite)) {
      throw new Error('Choose a chord and valid guitar/input settings.');
    }
    this.createdAt = new Date().toISOString(); this.id = crypto.randomUUID(); this.setup = structuredClone(setup);
    this.samples = new Float32Array(sampleRate * TAKE_LIMIT_SECONDS);
  }
  push(pcm: Float32Array, end: number): boolean {
    if (!pcm.length || !pcm.every(Number.isFinite) || !Number.isFinite(end)) throw new Error('Invalid take audio.');
    const start = end - pcm.length / this.sampleRate;
    if (this.end !== null && Math.abs(start - this.end) > .005) throw new Error('Recording was interrupted. Retake with a continuous input.');
    this.start ??= start;
    const remaining = this.samples.length - this.length, count = Math.min(pcm.length, remaining);
    this.samples.set(pcm.subarray(0, count), this.length); this.length += count;
    this.end = end;
    return this.length === this.samples.length;
  }
  get seconds(): number { return this.length / this.sampleRate; }
  addPrediction(prediction: TakePrediction): void {
    if (this.start === null || this.predictions.length >= 600 || prediction.at < this.start || prediction.at > this.start + TAKE_LIMIT_SECONDS) return;
    if (![prediction.at, prediction.evidenceAt].every(Number.isFinite)) throw new Error('Invalid prediction timestamp.');
    if (prediction.evidenceAt < this.start) return;
    this.predictions.push({ ...prediction, at: prediction.at - this.start, evidenceAt: prediction.evidenceAt - this.start });
  }
  discard(): void { this.samples.fill(0); this.length = 0; this.start = null; this.end = null; this.predictions = []; }
  async finish(): Promise<{ wav: Uint8Array<ArrayBuffer>; metadata: TakeMetadata }> {
    if (this.seconds < 1) throw new Error('The take is too short. Record at least one second, including a quiet lead-in.');
    const pcm = this.samples.slice(0, this.length), seconds = this.seconds, predictions = this.predictions.map(p => ({ ...p }));
    const wav = encodeWave(pcm, this.sampleRate);
    const quality = qualityChecks(pcm, this.sampleRate);
    const digest = await crypto.subtle.digest('SHA-256', wav);
    return {
      wav,
      metadata: {
        schemaVersion: 1, id: this.id, recordedAt: this.createdAt, sampleRate: this.sampleRate, channels: 1,
        durationSeconds: seconds, audioFile: 'microphone.wav',
        audioSha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''),
        consent: { version: TRAINING_CONSENT_VERSION, recordLocally: true, allowLocalTrainingReview: true, upload: false, guardianOrAdultConfirmed: true },
        ...this.setup, review: { status: 'unverified', verifiedChord: null },
        quality, predictions,
        note: 'Intended chord and detector guesses are not ground truth. Tuning is effective sounding open-string MIDI, including capo. Audio is browser-provided input before app filters/gain; device processing may still occur. Engine versions describe selected checks; predictions are the actual returned readings. Verify actual chord/notes before training. No automatic training or upload has occurred.',
      },
    };
  }
}
export interface TakeMetadata extends TakeSetup {
  schemaVersion: number; id: string; recordedAt: string; sampleRate: number; channels: number;
  durationSeconds: number; audioFile: string; audioSha256: string;
  consent: { version: string; recordLocally: boolean; allowLocalTrainingReview: boolean; upload: false; guardianOrAdultConfirmed: boolean };
  review: { status: 'unverified'; verifiedChord: null };
  quality: { rmsDbFS: number; clippedSamples: number; quietLeadIn: boolean; flags: string[] };
  predictions: TakePrediction[]; note: string;
}
function qualityChecks(pcm: Float32Array, rate: number): TakeMetadata['quality'] {
  let power = 0, lead = 0, clippedSamples = 0;
  const leadLength = Math.min(pcm.length, rate * 2);
  for (let i = 0; i < pcm.length; i++) {
    power += pcm[i] * pcm[i]; if (i < leadLength) lead += pcm[i] * pcm[i];
    if (Math.abs(pcm[i]) >= .98) clippedSamples++;
  }
  const rmsDbFS = 20 * Math.log10(Math.max(1e-8, Math.sqrt(power / pcm.length)));
  const quietLeadIn = pcm.length >= rate * 2 && Math.sqrt(lead / Math.max(1, leadLength)) < .005;
  const flags = [];
  if (rmsDbFS < -55) flags.push('Very quiet or silent take');
  if (clippedSamples) flags.push('Clipping detected');
  if (!quietLeadIn) flags.push('No complete quiet two-second lead-in');
  return { rmsDbFS: Math.round(rmsDbFS * 10) / 10, clippedSamples, quietLeadIn, flags };
}
export function encodeWave(pcm: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  if (!pcm.length || !pcm.every(Number.isFinite) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Invalid WAV input.');
  const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((value, i) => { const clamped = Math.max(-1, Math.min(1, value)); view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true); });
  return bytes;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Two standard uncompressed ZIP entries, so export is one explicit browser download. */
export function trainingPackage(wav: Uint8Array<ArrayBuffer>, metadata: TakeMetadata): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = [{ name: 'microphone.wav', data: wav }, { name: 'metadata.json', data: encoder.encode(JSON.stringify(metadata, null, 2) + '\n') }];
  const localSize = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22), view = new DataView(bytes.buffer);
  let offset = 0, central = localSize;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), crc = crc32(entry.data);
    view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 12, 33, true);
    view.setUint32(offset + 14, crc, true); view.setUint32(offset + 18, entry.data.length, true); view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, name.length, true); bytes.set(name, offset + 30); bytes.set(entry.data, offset + 30 + name.length);
    view.setUint32(central, 0x02014b50, true); view.setUint16(central + 4, 20, true); view.setUint16(central + 6, 20, true);
    view.setUint16(central + 14, 33, true);
    view.setUint32(central + 16, crc, true); view.setUint32(central + 20, entry.data.length, true); view.setUint32(central + 24, entry.data.length, true);
    view.setUint16(central + 28, name.length, true); view.setUint32(central + 42, offset, true); bytes.set(name, central + 46);
    offset += 30 + name.length + entry.data.length; central += 46 + name.length;
  }
  view.setUint32(central, 0x06054b50, true); view.setUint16(central + 8, 2, true); view.setUint16(central + 10, 2, true);
  view.setUint32(central + 12, centralSize, true); view.setUint32(central + 16, localSize, true);
  return bytes;
}
