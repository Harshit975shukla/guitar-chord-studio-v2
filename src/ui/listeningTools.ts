import { InputTap, type InputBlock } from '../audio/inputTap';
import { TrainingTake, TAKE_LIMIT_SECONDS, trainingPackage, type TakeSetup } from '../audio/trainingTake';
import { DetectionEngine } from '../detection/engine';
import { Agreement, AudioWindow, fastIdentity, modelIdentity } from '../detection/enhanced/core';
import { EnhancedModel } from '../detection/enhanced/modelClient';
import { DSP_VERSION, ML_ASSET_VERSION, MODEL_RATE, MODEL_WINDOW, WINDOW_SECONDS, MAX_AGE, type TimedPrediction, type Comparison } from '../detection/enhanced/types';
import type { DetectionResult, DetectionTargetMode, StringTuning } from '../types';
import './listeningTools.css';

export interface ListeningInput {
  context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode;
  tuning: StringTuning[]; target: DetectionTargetMode; micGain: number; noiseGate: number; seventhStrictness: number;
  calibrated: boolean; calibrationWarning?: string;
}
interface Hooks {
  input(): ListeningInput | null;
  startMicrophone(): Promise<boolean>;
  stopMicrophone(): void;
  calibrate(): void;
  stopReference(): void;
  takeSetup(): Omit<TakeSetup, 'intendedChord' | 'instrument' | 'engines'>;
}
const text = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export class ListeningTools {
  private tap = new InputTap();
  private tapInput: MediaStreamAudioSourceNode | null = null;
  private tapConnecting: Promise<void> | null = null;
  private model: EnhancedModel | null = null;
  private modelReady = false;
  private verifier: DetectionEngine | null = null;
  private agreement = new Agreement();
  private ring: AudioWindow | null = null;
  private generation = 0;
  private epoch = 0;
  private busy = false;
  private lastWindow = -Infinity;
  private modelStatus = 'Enable listening to use enhanced checking.';
  private signal = false;
  private clipped = false;
  private latest: DetectionResult | null = null;
  private comparison: Comparison | null = null;
  private active = true;
  private take: TrainingTake | null = null;
  private takePending = false;
  private finalizing = false;
  private takeGeneration = 0;
  private ownedMic = false;
  private takeUrls: string[] = [];
  private lastProgress = -1;

  private toggle: HTMLInputElement;
  private status: HTMLElement;
  private takeHost: HTMLDetailsElement;
  private recordConsent: HTMLInputElement;
  private trainingConsent: HTMLInputElement;
  private chord: HTMLSelectElement;
  private instrument: HTMLSelectElement;
  private recordButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private deleteButton: HTMLButtonElement;
  private takeStatus: HTMLElement;
  private preview: HTMLAudioElement;
  private download: HTMLAnchorElement;

  constructor(hero: HTMLElement, private hooks: Hooks) {
    const control = document.createElement('div');
    control.className = 'enhanced-control';
    control.innerHTML = `<label><input id="enhanced-detection" type="checkbox"> Enhanced detection <small>experimental · optional</small></label>
      <p>Two local checks of the same sound. Matching names appear once; different supported answers appear as “Could be … or …”. Standard detection stays available.</p>
      <p id="enhanced-status" role="status">Off · no model download or extra audio capture.</p>
      <button id="enhanced-retry" class="btn btn-secondary" type="button" hidden>Retry enhanced detection</button>
      <p class="enhanced-disclaimer">Not 100% certainty. Results may lag; use Standard for the lightest response. Live studio display only—not a new practice grade.</p>`;
    hero.append(control);
    this.toggle = control.querySelector<HTMLInputElement>('#enhanced-detection')!;
    this.status = control.querySelector('#enhanced-status')!;
    this.takeHost = document.createElement('details');
    this.takeHost.className = 'studio-disclosure training-take'; this.takeHost.id = 'training-take';
    this.takeHost.innerHTML = `<summary>Help improve detection · record a local take</summary>
      <p>Optional, deliberate recording for teacher review. Nothing is uploaded or trained automatically. Avoid speech or personal information. For a child’s recording, a parent/guardian must consent.</p>
      <div class="take-fields">
        <label for="take-chord">Intended chord</label><select id="take-chord">${['Am', 'Am7', 'C', 'Cmaj7', 'A', 'Amaj7'].map(chord => `<option>${chord}</option>`).join('')}</select>
        <label for="take-instrument">Guitar</label><select id="take-instrument"><option value="steel">Steel-string acoustic</option><option value="classical">Classical / nylon</option><option value="electric">Clean electric / interface</option></select>
      </div>
      <label class="take-consent"><input id="take-record-consent" type="checkbox"> I agree to record this take locally. I am an adult, or have appropriate parent/guardian consent.</label>
      <label class="take-consent"><input id="take-training-consent" type="checkbox"> I permit this take to be exported for local training review. The intended chord and detector guesses are unverified.</label>
      <div class="neck-play-controls">
        <button id="take-start" class="btn btn-primary" type="button" disabled>Record 12-second take</button>
        <button id="take-stop" class="btn btn-secondary" type="button" disabled>Stop recording</button>
        <button id="take-delete" class="btn btn-secondary" type="button" disabled>Delete take</button>
      </div>
      <p id="take-status" role="status">Choose a chord and grant both permissions. Keep quiet for the first two seconds, then play a few slow strums.</p>
      <audio id="take-preview" controls preload="none" aria-label="Listen to your recorded take" hidden></audio>
      <a id="take-download" class="btn btn-secondary" hidden>Export WAV + metadata (.zip)</a>
      <p id="take-update-notice" class="take-caveat" role="status" hidden>A website update is ready. Export or delete your take, then reload when you are ready. This page will not discard the take automatically.</p>
      <p class="take-caveat">Label: unverified. A teacher must check what was actually played before training. Delete removes this page’s copy, not files you already exported. Reloading discards the local take.</p>`;
    document.querySelector('#main-container .primary-col')!.append(this.takeHost);
    const get = <T extends HTMLElement>(id: string) => this.takeHost.querySelector<T>(`#${id}`)!;
    this.recordConsent = get('take-record-consent'); this.trainingConsent = get('take-training-consent');
    this.chord = get('take-chord'); this.instrument = get('take-instrument');
    this.recordButton = get('take-start'); this.stopButton = get('take-stop'); this.deleteButton = get('take-delete');
    this.takeStatus = get('take-status'); this.preview = get('take-preview'); this.download = get('take-download');
    this.toggle.addEventListener('change', () => {
      if (this.take || this.takePending) this.deleteTake('Recording discarded because detection settings changed.');
      this.stopEnhanced();
      if (this.toggle.checked && this.active && this.hooks.input()) {
        this.startEnhanced(); this.hooks.calibrate();
      }
      this.updateControls();
    });
    control.querySelector('#enhanced-retry')!.addEventListener('click', () => {
      this.stopEnhanced(); if (this.toggle.checked && this.active && this.hooks.input()) { this.startEnhanced(); this.hooks.calibrate(); }
    });
    this.recordButton.addEventListener('click', () => { void this.record(); });
    this.stopButton.addEventListener('click', () => {
      if (this.takePending) this.deleteTake('Recording request cancelled. No take was saved.');
      else void this.finishTake();
    });
    this.deleteButton.addEventListener('click', () => this.deleteTake('Take deleted from this page.'));
    for (const consent of [this.recordConsent, this.trainingConsent]) consent.addEventListener('change', () => {
      if (!consent.checked) this.deleteTake('Permission withdrawn. This page’s take was deleted; already exported files are not affected.', false);
      this.updateControls();
    });
    for (const select of [this.chord, this.instrument]) select.addEventListener('change', () => this.deleteTake('Selection changed. Grant both permissions for a new take.'));
    this.preview.addEventListener('play', () => {
      if (this.hooks.input()) { this.preview.pause(); text(this.takeStatus, 'Stop microphone listening before playing back the take.'); }
    });
    this.takeHost.addEventListener('toggle', () => {
      if (!this.takeHost.open && (this.take || this.takePending)) this.deleteTake('Recording cancelled because the panel was closed.');
    });
    window.addEventListener('pagehide', () => { this.deleteTake('Take discarded on page exit.'); this.stopEnhanced(); this.disconnectTap(); });
    window.addEventListener('guitar-update-pending', () => { document.getElementById('take-update-notice')!.hidden = false; });
  }
  get recording(): boolean { return !!this.take || this.takePending || this.finalizing; }
  get enabled(): boolean { return this.toggle.checked && this.active; }
  private updateControls(): void {
    const ready = this.active && this.recordConsent.checked && this.trainingConsent.checked;
    this.recordButton.disabled = !ready || this.recording;
    this.recordButton.textContent = this.takeUrls.length ? 'Retake (12 seconds)' : 'Record 12-second take';
    this.stopButton.disabled = !this.take && !this.takePending;
    this.deleteButton.disabled = !this.take && !this.takePending && !this.finalizing && !this.takeUrls.length;
    this.chord.disabled = this.recording; this.instrument.disabled = this.recording;
    this.download.hidden = !this.takeUrls.length || !ready;
    this.preview.hidden = !this.takeUrls.length;
    if (this.takePending || this.take) this.preview.pause();
    this.toggle.disabled = this.recording;
    (document.getElementById('enhanced-retry') as HTMLButtonElement).disabled = this.recording;
  }
  microphoneStarted(): void {
    this.preview.pause();
    if (this.enabled) this.startEnhanced();
  }
  microphoneStopped(): void {
    this.latest = null;
    this.ownedMic = false;
    if (this.take || this.takePending) this.deleteTake('Microphone stopped. The unfinished take was discarded.');
    this.stopEnhanced(); this.disconnectTap();
  }
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      if (this.recording) this.deleteTake('Recording cancelled because you left Live studio.');
      this.preview.pause(); this.stopEnhanced(); this.disconnectTap();
    } else if (this.enabled && this.hooks.input()) { this.startEnhanced(); this.hooks.calibrate(); }
    this.updateControls();
  }
  settingsChanged(): void {
    if (this.recording) this.deleteTake('Take discarded because tuning, capo or detection settings changed.');
    if (this.enabled && this.hooks.input()) { this.stopEnhanced(); this.startEnhanced(); this.hooks.calibrate(); }
  }
  calibrate(): void {
    this.epoch++; this.agreement.reset(); this.ring?.clear(); this.signal = false;
    this.verifier?.reset(); this.verifier?.startNoiseCalibration();
    if (this.take) this.deleteTake('Take discarded because a new room check started.');
  }
  private async ensureTap(): Promise<void> {
    const input = this.hooks.input();
    if (!input) throw new Error('Start microphone listening first.');
    if (this.tapInput === input.source) return this.tapConnecting ?? undefined;
    this.disconnectTap();
    this.tapInput = input.source;
    const connection = this.tap.connect(input.source, block => this.receive(block), error => {
      console.error('Optional input capture failed:', error);
      this.tapInput = null; this.tapConnecting = null;
      if (this.take || this.takePending) this.deleteTake(error.message);
      this.enhancedFailed(error);
    }).catch(error => { if (this.tapConnecting === connection) this.tapInput = null; throw error; })
      .finally(() => { if (this.tapConnecting === connection) this.tapConnecting = null; });
    this.tapConnecting = connection;
    await connection;
  }
  private disconnectTap(): void { this.tap.disconnect(); this.tapInput = null; this.tapConnecting = null; }
  private releaseUnusedTap(): void { if ((!this.enabled || !this.model) && !this.recording) this.disconnectTap(); }
  private startEnhanced(): void {
    const input = this.hooks.input();
    if (!input || !this.enabled) return;
    const generation = ++this.generation;
    this.agreement.reset(); this.ring = new AudioWindow(input.context.sampleRate);
    this.model = new EnhancedModel(); this.modelReady = false; this.modelStatus = 'Preparing enhanced checking. Audio stays on this device.';
    this.verifier = new DetectionEngine({ fftSize: 8192, triggerMode: 'continuous', targetMode: 'chords',
      micGainMultiplier: input.micGain, noiseGateDb: input.noiseGate, seventhStrictness: input.seventhStrictness });
    this.verifier.setAnalyser(input.analyser); this.verifier.startNoiseCalibration();
    document.getElementById('enhanced-retry')!.hidden = true;
    text(this.status, this.modelStatus);
    Promise.all([this.ensureTap(), this.model.load()]).then(() => {
      if (generation !== this.generation || !this.enabled) return;
      this.modelReady = true; this.modelStatus = 'Enhanced checking ready. Play slowly and let the sound ring.';
      text(this.status, this.modelStatus);
    }).catch(error => { if (generation === this.generation && !aborted(error)) this.enhancedFailed(error); });
  }
  private stopEnhanced(): void {
    this.generation++; this.epoch++; this.model?.dispose(); this.model = null; this.modelReady = false;
    this.verifier = null; this.ring?.clear(); this.ring = null; this.agreement.reset(); this.busy = false; this.signal = false; this.comparison = null;
    this.lastWindow = -Infinity;
    delete document.getElementById('display-chord-name')!.dataset.enhancedState;
    document.getElementById('enhanced-retry')!.hidden = true;
    text(this.status, this.toggle.checked ? 'Enhanced checking paused. Start listening in Live studio to use it.' : 'Off · standard detector unchanged.');
    this.releaseUnusedTap();
  }
  private enhancedFailed(error: unknown): void {
    console.error('Enhanced detection unavailable:', error);
    this.generation++; this.epoch++; this.model?.dispose(); this.model = null; this.modelReady = false; this.verifier = null;
    this.busy = false; this.ring?.clear(); this.ring = null; this.agreement.reset(); this.comparison = null;
    this.modelStatus = 'Enhanced checking unavailable. Standard detection still works. Retry or turn the option off.';
    text(this.status, this.modelStatus);
    document.getElementById('enhanced-retry')!.hidden = !this.enabled;
    if (!this.recording) this.disconnectTap();
  }
  private receive(block: InputBlock): void {
    const input = this.hooks.input();
    if (!input || !this.active) return;
    this.clipped = block.pcm.some(value => Math.abs(value) >= .98);
    if (this.take) {
      const finished = this.take.push(block.pcm, block.end);
      const progress = Math.floor(this.take.seconds * 10);
      if (progress !== this.lastProgress) {
        this.lastProgress = progress;
        text(this.takeStatus, `${this.take.seconds < 2 ? 'Recording room lead-in — stay quiet' : `Recording — play ${this.chord.value}`} (${this.take.seconds.toFixed(1)} / ${TAKE_LIMIT_SECONDS} s). Nothing is uploaded.`);
      }
      if (finished) void this.finishTake();
    }
    if (!this.enabled || !this.modelReady || !this.ring) return;
    if (this.ring.push(block.pcm, block.end)) { this.epoch++; this.agreement.invalidateModel(); }
    if (this.signal && this.ring.ready && !this.busy && block.end - this.lastWindow >= .5 && input.context.currentTime - block.end <= .25) {
      void this.infer(this.ring.snapshot(), block.end, input);
    }
  }
  private async infer(pcm: Float32Array<ArrayBuffer>, end: number, input: ListeningInput): Promise<void> {
    const generation = this.generation, epoch = this.epoch, model = this.model;
    if (!model) return;
    this.busy = true; this.lastWindow = end;
    try {
      let mono = pcm;
      if (input.context.sampleRate !== MODEL_RATE) {
        const context = new OfflineAudioContext(1, MODEL_WINDOW, MODEL_RATE), source = context.createBufferSource();
        source.buffer = context.createBuffer(1, pcm.length, input.context.sampleRate); source.buffer.getChannelData(0).set(pcm);
        source.connect(context.destination); source.start();
        mono = (await context.startRendering()).getChannelData(0).slice();
      }
      if (generation !== this.generation || epoch !== this.epoch || !this.enabled) return;
      const result = await model.infer(mono, input.target);
      if (generation !== this.generation || epoch !== this.epoch || !this.signal || !this.enabled) return;
      const start = end - WINDOW_SECONDS, receivedAt = input.context.currentTime;
      const timed: TimedPrediction = { ...result, receivedAt, evidenceAt: start + result.evidenceOffset,
        evidenceStart: start + result.evidenceStartOffset, evidenceEnd: start + result.evidenceEndOffset };
      if (receivedAt - timed.evidenceAt > MAX_AGE) {
        this.agreement.invalidateModel(); this.modelStatus = 'Enhanced checking is delayed. Showing the standard estimate until a fresh second opinion arrives.';
      } else {
        this.agreement.update(timed);
        this.modelStatus = `Enhanced checking · ${(result.inferenceMs / 1000).toFixed(2)} s processing. Agreement is not certainty.`;
        this.take?.addPrediction({ at: receivedAt, evidenceAt: timed.evidenceAt, engine: 'enhanced', label: modelIdentity(timed)?.label ?? null, freshness: 'model-prediction' });
      }
      this.render();
    } catch (error) { if (generation === this.generation && !aborted(error)) this.enhancedFailed(error); }
    finally { if (generation === this.generation) this.busy = false; }
  }
  onDetection(result: DetectionResult, spectrum: Float32Array): void {
    const input = this.hooks.input();
    if (!input || !this.active) return;
    const now = input.context.currentTime, p = result.performance;
    this.latest = result;
    const label = fastIdentity(result);
    this.take?.addPrediction({ at: now, evidenceAt: now - Math.max(0, (p?.frameAt ?? Date.now()) - result.timestamp) / 1000,
      engine: 'standard', label: label?.label ?? null, freshness: result.freshness, attackId: p?.id });
    if (!this.enabled) return;
    const present = p?.signalPresent === true && !result.isCalibrating && !result.calibrationComplete;
    if (present !== this.signal) { this.signal = present; this.epoch++; this.agreement.invalidateModel(); }
    if (result.isCalibrating) this.ring?.clear();
    const verified = this.verifier?.processFrame(spectrum, input.context.sampleRate, input.tuning);
    this.agreement.observe({
      at: now, attackAt: p?.attackAt ? now - Math.max(0, p.frameAt - p.attackAt) / 1000 : now, attackId: p?.id ?? 0,
      ready: input.calibrated && !result.isCalibrating && !result.calibrationComplete && !input.calibrationWarning,
      signalPresent: present, clipped: this.clipped, identity: label,
      fresh: result.freshness === 'fresh' && (!!result.chord || (result.note?.confidence ?? 0) >= 70),
      verified: verified?.freshness === 'fresh' && verified.chord ? {
        at: now - 8192 / input.context.sampleRate / 2, identity: fastIdentity(verified),
      } : { at: now - 8192 / input.context.sampleRate / 2, identity: null },
    });
    this.render();
  }
  private render(): void {
    if (!this.enabled || !this.hooks.input() || !this.latest || this.latest.isCalibrating) return;
    this.comparison = this.agreement.compare(this.hooks.input()!.context.currentTime);
    const answer = this.comparison;
    const status = this.hooks.input()!.calibrationWarning
      ? 'The room reference needs a recheck. Mute your strings and use Recheck room noise.'
      : this.modelReady ? answer.message : this.modelStatus;
    text(this.status, status);
    // Notes/tuner feedback remains the standard detector's exact-frequency path.
    if (this.latest.mode === 'single-note') return;
    if (answer.label && !['quiet', 'warning'].includes(answer.state)) {
      text(document.getElementById('display-chord-name')!, answer.label);
      text(document.getElementById('live-detector-substatus')!, status);
      text(document.getElementById('info-confidence')!, answer.state === 'agree' ? 'Matching checks' : answer.state === 'recent' ? 'Recent match' : 'Estimate');
      document.getElementById('display-chord-name')!.dataset.enhancedState = answer.state;
    }
  }
  private async record(): Promise<void> {
    if (this.recording || !this.active || !this.recordConsent.checked || !this.trainingConsent.checked) return;
    this.clearUrls();
    this.hooks.stopReference();
    this.takePending = true; const token = ++this.takeGeneration;
    this.ownedMic = !this.hooks.input();
    this.updateControls();
    text(this.takeStatus, 'Preparing an explicit local take. Stop recording cancels this request.');
    try {
      if (!this.hooks.input() && !await this.hooks.startMicrophone()) throw new Error('Microphone permission is needed. No take was recorded.');
      if (token !== this.takeGeneration || !this.active || !this.recordConsent.checked || !this.trainingConsent.checked) return;
      await this.ensureTap();
      if (token !== this.takeGeneration) return;
      const input = this.hooks.input();
      if (!input) throw new Error('Microphone stopped before recording.');
      this.take = new TrainingTake(input.context.sampleRate, {
        ...this.hooks.takeSetup(), intendedChord: this.chord.value, instrument: this.instrument.value,
        engines: { standard: DSP_VERSION, enhanced: this.enabled ? ML_ASSET_VERSION : null, app: __APP_REVISION__ },
      }, this.recordConsent.checked, this.trainingConsent.checked);
      this.lastProgress = -1;
      text(this.takeStatus, 'Recording — stay quiet for two seconds, then play the intended chord.');
      this.takeHost.dataset.recording = 'true';
    } catch (error) {
      if (token === this.takeGeneration) {
        console.error('Training take could not start:', error);
        this.deleteTake(error instanceof Error ? error.message : 'Recording failed.');
      }
    } finally { if (token === this.takeGeneration) { this.takePending = false; this.updateControls(); } }
  }
  private async finishTake(): Promise<void> {
    const take = this.take;
    if (!take) return;
    this.take = null; this.finalizing = true;
    const token = this.takeGeneration, owned = this.ownedMic; this.ownedMic = false;
    this.takeHost.dataset.recording = 'false'; this.updateControls();
    text(this.takeStatus, 'Preparing your local WAV and unverified metadata…');
    if (owned) this.hooks.stopMicrophone();
    try {
      const { wav, metadata } = await take.finish();
      if (token !== this.takeGeneration || !this.recordConsent.checked || !this.trainingConsent.checked) return;
      this.clearUrls();
      const audio = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const zip = URL.createObjectURL(new Blob([trainingPackage(wav, metadata)], { type: 'application/zip' }));
      this.takeUrls = [audio, zip]; this.preview.src = audio; this.download.href = zip;
      this.download.download = `guitar-training-${metadata.recordedAt.slice(0, 10)}-${metadata.id}.zip`;
      text(this.takeStatus, `Take ready: ${metadata.durationSeconds.toFixed(1)} s. Label is unverified. ${metadata.quality.flags.join('. ') || 'No basic level warnings.'} Listen, export or delete. No automatic training has happened.`);
    } catch (error) {
      if (token === this.takeGeneration) { console.error('Take export failed:', error); text(this.takeStatus, error instanceof Error ? error.message : 'The take could not be prepared.'); }
    } finally {
      take.discard();
      if (token === this.takeGeneration) this.finalizing = false;
      this.releaseUnusedTap(); this.updateControls();
    }
  }
  private clearUrls(): void {
    this.preview.pause(); this.preview.removeAttribute('src'); this.preview.load();
    this.download.removeAttribute('href');
    this.takeUrls.forEach(url => URL.revokeObjectURL(url)); this.takeUrls = [];
  }
  deleteTake(message: string, resetConsent = true): void {
    this.takeGeneration++; this.take?.discard(); this.take = null; this.takePending = false; this.finalizing = false;
    this.takeHost.dataset.recording = 'false'; this.clearUrls();
    const owned = this.ownedMic; this.ownedMic = false;
    if (resetConsent) { this.recordConsent.checked = false; this.trainingConsent.checked = false; }
    if (owned) this.hooks.stopMicrophone();
    text(this.takeStatus, message); this.releaseUnusedTap(); this.updateControls();
  }
  diagnostics() { return { enabled: this.enabled, modelReady: this.modelReady, busy: this.busy, recording: this.recording, comparison: this.comparison, retainedTake: this.takeUrls.length > 0 }; }
}
