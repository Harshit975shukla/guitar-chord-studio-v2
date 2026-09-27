export function median(values: readonly number[]): number {
  if (!values.length) throw new Error('A room reference needs input measurements.');
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Advisory checks only: these never adjust matching thresholds or the noise profile. */
export function calibrationWarning(levels: readonly number[], gateMargin: number): string | undefined {
  const steady = levels.slice(6);
  if (steady.length && Math.max(...levels) - median(steady) >= 12) {
    return 'The room check included a sudden sound. Mute your strings, stop talking and recheck the room.';
  }
  if (Math.max(...levels) + gateMargin > -12) {
    return 'The room reference leaves little detection headroom. Reduce background noise or input gain, then recheck.';
  }
  return undefined;
}

export function measureInput(samples: Float32Array) {
  let energy = 0, peak = 0, nearLimit = 0;
  for (const value of samples) {
    energy += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= .995) nearLimit++;
  }
  const rms = samples.length ? Math.sqrt(energy / samples.length) : 0;
  return { rmsDb: 20 * Math.log10(Math.max(rms, .000001)), peak, nearLimit: nearLimit / Math.max(1, samples.length) };
}

export interface InputHealthFrame {
  samples: Float32Array;
  calibrating: boolean;
  calibrationComplete: boolean;
  calibrated: boolean;
  needsCalibration: boolean;
  settling?: boolean;
  warning?: string;
  signalPresent: boolean;
  spectralDb: number;
  gateDb: number;
}
export interface InputHealthReading {
  state: 'calibrating' | 'settling' | 'recheck' | 'headroom' | 'weak' | 'waiting' | 'signal';
  message: string;
  inputDb: number;
  roomDb: number | null;
  aboveRoomDb: number | null;
  gateMarginDb: number;
}

export class InputHealthMonitor {
  private roomFrames: number[] = [];
  private roomDb: number | null = null;
  reset(): void { this.roomFrames = []; this.roomDb = null; }
  update(frame: InputHealthFrame): InputHealthReading {
    const input = measureInput(frame.samples);
    if (frame.calibrating || frame.calibrationComplete) this.roomFrames.push(input.rmsDb);
    if (frame.calibrationComplete && this.roomFrames.length) this.roomDb = median(this.roomFrames.slice(-45));
    const aboveRoomDb = this.roomDb === null ? null : input.rmsDb - this.roomDb;
    const data = { inputDb: input.rmsDb, roomDb: this.roomDb, aboveRoomDb, gateMarginDb: frame.spectralDb - frame.gateDb };
    if (frame.calibrating) return { ...data, state: 'calibrating', message: 'Checking the room. Mute the guitar strings and stay quiet until this finishes.' };
    if (input.nearLimit >= .005) return { ...data, state: 'headroom', message: 'Microphone input is near its digital limit. Lower the device/interface input gain or move the mic back. App sensitivity cannot repair clipped capture.' };
    if (frame.settling) return { ...data, state: 'settling', message: 'Adjusting to the new sensitivity. Detection resumes automatically after the input settles.' };
    if (frame.needsCalibration || !frame.calibrated) return { ...data, state: 'recheck', message: 'No room reference yet. A quiet room check can improve rejection of steady background noise.' };
    if (frame.warning) return { ...data, state: 'recheck', message: frame.warning };
    if (frame.signalPresent) return { ...data, state: 'signal', message: 'Input is reaching the detector. This checks signal level, not whether a chord is correct.' };
    if (aboveRoomDb !== null && aboveRoomDb > 6) return { ...data, state: 'weak', message: 'Input rose above the room reference but is below the detection gate. Try a closer mic and a clear full strum; avoid raising sensitivity just to amplify room noise.' };
    return { ...data, state: 'waiting', message: 'Waiting for a clear strum. If the room changes, mute your strings and recheck it.' };
  }
}
