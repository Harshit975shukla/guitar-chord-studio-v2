/**
 * Main Application Entry Point
 * Initializes all systems and coordinates the studio tabs
 */

import { 
  UserSettings, 
  DEFAULT_SETTINGS, 
  StringTuning, 
  STANDARD_TUNING,
  TuningPreset,
  Song,
  DetectionResult,
  DetectionTargetMode,
  ChordVoicing,
  ChordQuality,
  ChordDefinition,
  PracticeSession,
  DrillConfig,
  DrillResult,
  NOTE_NAMES,
  NoteName,
  SARGAM_NAMES,
  AudioEngineConfig,
  AcousticModel,
  StrumStyle,
} from './types';

import { 
  loadSettings, 
  saveSettings, 
  savePracticeSession,
  loadCustomSongs,
  loadMidiConfig,
  saveCurrentSession,
  loadCurrentSession,
} from './storage';

import { 
  TUNING_PRESETS, 
  getTuningPreset,
  applyCapo,
  transposeTuning,
} from './chords/tunings';

import { createProfileModal } from './ui/components/ProfileModal';
import { createRecorderTab, initRecorderTab } from './tabs/recorder';

import {
  getAllChordDefinitions,
  buildChordDefinition,
  identifyChordFromFrets,
  parseChordSymbol,
  CHORD_QUALITY_DISPLAY,
  CapoState,
} from './chords/definitions';

import {
  createAcousticBus,
  updateAcousticBusSettings,
  strumChord,
  playTestChord,
  playInTuneChime,
  playMetronomeClick,
  playAcousticString,
  AcousticBus,
} from './audio/engine';

import { 
  DetectionEngine, 
  DEFAULT_DETECTION_CONFIG,
} from './detection/engine';

import { 
  MidiManager, 
  createMidiManager 
} from './midi/output';

import { BUILTIN_SONGS, SongStudio } from './tabs/songs';
import { RHYTHM_PRESETS } from './tabs/rhythm';
import { ScalesStudio } from './tabs/scales';
import { TrainerStudio } from './tabs/trainer';
import { prepareStudio, NeckController } from './ui/studio';
import { LibraryNeck } from './ui/libraryNeck';
import { buildSongCatalog } from './songs/catalog';
import { initSongTools } from './ui/songTools';

// ============================================================================
// Global State
// ============================================================================

interface AppState {
  // Audio
  audioContext: AudioContext | null;
  acousticBus: AcousticBus | null;
  micStream: MediaStream | null;
  analyser: AnalyserNode | null;
  micGainNode: GainNode | null;
  highpassFilter: BiquadFilterNode | null;
  lowpassFilter: BiquadFilterNode | null;
  isListening: boolean;
  animationFrameId: number | null;
  
  // Detection
  detectionEngine: DetectionEngine;
  
  // MIDI
  midiManager: MidiManager | null;
  
  // Settings
  settings: UserSettings;
  activeTuning: TuningPreset;
  capoState: CapoState;
  effectiveTuning: StringTuning[];
  
  // Fretboard
  currentFretboardState: (number | null)[];
  currentChord: string | null;
  
  // UI State
  activeTab: string;
  activeSong: Song | null;
  
  // Session
  currentSession: PracticeSession | null;
  sessionStartTime: number;
  
  // Drill
  drillConfig: DrillConfig | null;
  drillResults: DrillResult | null;
  isDrillActive: boolean;
  drillProgression: string[];
  drillCurrentIndex: number;

  // Studio Subsystems
  scalesStudio: ScalesStudio;
  trainerStudio: TrainerStudio;
  songStudio: SongStudio;
}

let appState: AppState = {
  audioContext: null,
  acousticBus: null,
  micStream: null,
  analyser: null,
  micGainNode: null,
  highpassFilter: null,
  lowpassFilter: null,
  isListening: false,
  animationFrameId: null,
  detectionEngine: new DetectionEngine(DEFAULT_DETECTION_CONFIG),
  midiManager: null,
  settings: DEFAULT_SETTINGS,
  activeTuning: TUNING_PRESETS[0],
  capoState: { enabled: false, fret: 0 },
  effectiveTuning: STANDARD_TUNING,
  currentFretboardState: [null, null, null, null, null, null],
  currentChord: null,
  activeTab: 'detector',
  activeSong: null,
  currentSession: null,
  sessionStartTime: 0,
  drillConfig: null,
  drillResults: null,
  isDrillActive: false,
  drillProgression: [],
  drillCurrentIndex: 0,
  scalesStudio: new ScalesStudio(),
  trainerStudio: new TrainerStudio(),
  songStudio: new SongStudio(getSongCatalog),
};

let neckController: NeckController | null = null;
let libraryNeck: LibraryNeck | null = null;
let liveNeckMidi: number | null = null;
let neckCaption = 'Explore the fretboard';
let microphonePending = false;
let theoryChord = '';

export async function initializeApp(): Promise<void> {
  // 1. Load settings
  appState.settings = loadSettings();
  applySettingsToState();
  
  // 2. Initialize Profile System (loads profiles from storage)
  // profileManager is a singleton, already initialized on import
  
  // 3. Initialize AudioContext (on first user interaction)
  document.addEventListener('click', ensureAudioContext, { once: true });
  document.addEventListener('keydown', ensureAudioContext, { once: true });
  document.addEventListener('touchstart', ensureAudioContext, { once: true });
  
  // MIDI is opt-in; a permissions prompt must not block the practice UI.
  const midiStatus = document.getElementById('top-midi-status');
  if (midiStatus) midiStatus.textContent = 'requestMIDIAccess' in navigator ? 'Not connected' : 'Unavailable';
  
  // 5. Create Profile Modal and append to body if not already in DOM
  if (!document.getElementById('user-profile-modal')) {
    const profileModal = createProfileModal();
    document.body.appendChild(profileModal);
  }
  
  // 6. Populate Recorder Tab inside #pane-recorder
  const existingRecorderPane = document.getElementById('pane-recorder');
  if (existingRecorderPane) {
    const recorderTab = createRecorderTab();
    existingRecorderPane.innerHTML = recorderTab.innerHTML;
  }
  
  // 7. Restore session if exists
  try {
    const savedSession = loadCurrentSession();
    if (savedSession && Date.now() - savedSession.timestamp < 24 * 60 * 60 * 1000) {
      restoreSession(savedSession);
    }
  } catch (err) {
    console.warn('Session restore non-fatal error:', err);
  }
  
  // 8. Initialize UI
  prepareStudio();
  neckController = new NeckController(onFretCellClick, chord => { void loadChordPreset(chord, true); });
  initializeUI();
  updateMicUI(false);
  
  // Wire Song Studio practice mic auto-start & pre-build fretboard
  appState.songStudio.onMicStartRequested = async () => {
    const started = appState.isListening || await startMicrophone();
    if (started && appState.activeTab === 'songs') setTargetMode('auto');
    return started;
  };
  appState.songStudio.onPlayRequested = async () => {
    await ensureAudioContext();
  };
  appState.scalesStudio.onPlayRequested = ensureAudioContext;
  appState.scalesStudio.onMicStartRequested = async () => {
    const started = appState.isListening || await startMicrophone();
    if (started) setTargetMode('notes');
    return started;
  };
  try {
    appState.songStudio.buildSongFretboardUI();
  } catch (e) {
    console.warn('Fretboard pre-build error:', e);
  }

  // Global Web Audio user gesture unlock listener
  const unlockAudioOnGesture = () => {
    if (!appState.audioContext || appState.audioContext.state === 'suspended') {
      ensureAudioContext().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudioOnGesture, { passive: true });
  window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });
  
  // 9. Initialize Recorder Tab (after UI is ready)
  try {
    initRecorderTab();
  } catch (err) {
    console.warn('Recorder tab init non-fatal error:', err);
  }
  
  // 10. Start session tracking
  startNewSession();
  
  console.log('Guitar Chord Studio v2 initialized successfully');
}

function applySettingsToState(): void {
  const s = appState.settings;
  appState.activeTuning = getTuningPreset(s.activeTuningPreset) || TUNING_PRESETS[0];
  updateEffectiveTuning();
  appState.detectionEngine.setConfig({
    noiseGateDb: s.noiseGateDb,
    seventhStrictness: s.seventhStrictness,
    triggerMode: s.triggerMode,
    targetMode: s.targetMode || 'chords',
    micGainMultiplier: s.micGain,
  });
}

function updateEffectiveTuning(): void {
  let tuning = appState.activeTuning.strings;
  if (appState.capoState.enabled) {
    tuning = applyCapo(appState.activeTuning, appState.capoState);
  }
  appState.effectiveTuning = tuning;
  if (appState.scalesStudio) appState.scalesStudio.setTuning(tuning);
  if (appState.trainerStudio) appState.trainerStudio.setTuning(tuning);
  if (appState.songStudio) appState.songStudio.setTuning(tuning, appState.capoState.enabled ? appState.capoState.fret : 0);
  libraryNeck?.setTuning(tuning);
}

function restoreSession(session: any): void {
  if (session.tuningPreset) {
    const tuning = getTuningPreset(session.tuningPreset);
    if (tuning) appState.activeTuning = tuning;
  }
  if (session.fretboardState) {
    appState.currentFretboardState = session.fretboardState;
  }
  updateEffectiveTuning();
}

function startNewSession(): void {
  appState.sessionStartTime = Date.now();
  appState.currentSession = {
    id: `session_${Date.now()}`,
    date: new Date().toISOString(),
    startTime: appState.sessionStartTime,
    durationSec: 0,
    mode: 'detector',
    chordsDetected: [],
  };
}

async function ensureAudioContext(): Promise<void> {
  if (!appState.audioContext) {
    appState.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create acoustic bus
    const engineConfig: AudioEngineConfig = {
      model: appState.settings.acousticModel,
      masterVolume: 1.0,
      strumStyle: 'down',
      sampleRate: appState.audioContext.sampleRate,
    };
    appState.acousticBus = createAcousticBus(appState.audioContext, engineConfig);
    
    // Update MIDI manager with audio context
    if (appState.midiManager) {
      (appState.midiManager as any).audioContext = appState.audioContext;
    }

    // Connect audio to studio subsystems
    appState.scalesStudio.setAudio(appState.audioContext, appState.acousticBus);
    appState.trainerStudio.setAudio(appState.audioContext, appState.acousticBus);
    appState.songStudio.setAudio(appState.audioContext, appState.acousticBus);
  }
  
  if (appState.audioContext.state === 'suspended') {
    await appState.audioContext.resume();
  }
}

// ============================================================================
// Microphone Handling
// ============================================================================

export async function startMicrophone(): Promise<boolean> {
  if (appState.isListening || microphonePending) return appState.isListening;
  microphonePending = true;
  const button = document.getElementById('btn-toggle-mic') as HTMLButtonElement | null;
  if (button) button.disabled = true;
  const label = document.getElementById('mic-btn-text');
  if (label) label.textContent = 'Allow microphone…';
  try {
    await ensureAudioContext();
    if (!appState.audioContext) return false;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: { ideal: 44100 },
      },
    });
    
    appState.micStream = stream;
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
      if (appState.micStream === stream) stopMicrophone();
    }, { once: true }));
    const source = appState.audioContext.createMediaStreamSource(stream);
    
    // Hardware filters (matches v1 proven audio pipeline)
    appState.highpassFilter = appState.audioContext.createBiquadFilter();
    appState.highpassFilter.type = 'highpass';
    appState.highpassFilter.frequency.value = 65; // Kills sub-bass rumble < 65 Hz, Drop D & Low E pass cleanly
    appState.highpassFilter.Q.value = 0.707;
    
    appState.lowpassFilter = appState.audioContext.createBiquadFilter();
    appState.lowpassFilter.type = 'lowpass';
    appState.lowpassFilter.frequency.value = 2200; // Preserves high string harmonics up to 2200 Hz
    appState.lowpassFilter.Q.value = 0.707;
    
    appState.micGainNode = appState.audioContext.createGain();
    appState.micGainNode.gain.value = appState.settings.micGain || 4.0;
    
    appState.analyser = appState.audioContext.createAnalyser();
    // 8192 halves bin width (~5.4 Hz) for far better low-string resolution
    // (low E ≈ 82 Hz, semitone spacing ~4.9 Hz). Still ~185ms window — fine.
    appState.analyser.fftSize = 8192;
    appState.analyser.smoothingTimeConstant = 0.10;

    appState.detectionEngine.setAnalyser(appState.analyser);
    appState.detectionEngine.setConfig({
      noiseGateDb: appState.settings.noiseGateDb,
      seventhStrictness: appState.settings.seventhStrictness,
      triggerMode: appState.settings.triggerMode,
      targetMode: appState.settings.targetMode || 'chords',
      micGainMultiplier: appState.settings.micGain,
      fftSize: 8192,
    });
    
    // Connect: source -> highpass -> lowpass -> gain -> analyser
    source.connect(appState.highpassFilter);
    appState.highpassFilter.connect(appState.lowpassFilter);
    appState.lowpassFilter.connect(appState.micGainNode);
    appState.micGainNode.connect(appState.analyser);
    
    appState.isListening = true;
    appState.detectionEngine.reset();
    
    // Automatically perform a 1.5s room noise calibration on microphone startup
    appState.detectionEngine.startNoiseCalibration();
    updateCalibrationUI(true);
    
    // Start detection loop
    startDetectionLoop();
    
    // Update UI
    updateMicUI(true);
    
    return true;
  } catch (error) {
    console.error('Failed to start microphone:', error);
    const name = (error as any)?.name || '';
    let msg: string;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      msg = '🎤 Microphone blocked. Click the mic/lock icon in your browser’s address bar and allow access, then try again.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      msg = '🎤 No microphone found. Check your input device in the OS sound settings, then try again.';
    } else if (name === 'NotReadableError') {
      msg = '🎤 Microphone is in use by another app. Close it (e.g. video call, DAW) and try again.';
    } else {
      msg = '🎤 Could not access the microphone. Check browser permissions and try again.';
    }
    updateMicUI(false);
    const substatus = document.getElementById('live-detector-substatus');
    if (substatus) {
      substatus.textContent = msg;
      substatus.style.color = 'var(--accent-rose, #f43f5e)';
    } else {
      alert(msg);
    }
    return false;
  } finally {
    microphonePending = false;
    if (button) button.disabled = false;
  }
}

export function stopMicrophone(): void {
  if (!appState.isListening) return;
  
  if (appState.micStream) {
    appState.micStream.getTracks().forEach(track => track.stop());
    appState.micStream = null;
  }
  
  if (appState.animationFrameId) {
    cancelAnimationFrame(appState.animationFrameId);
    appState.animationFrameId = null;
  }
  
  appState.isListening = false;
  appState.scalesStudio.setMicPracticeActive(false);
  appState.songStudio.onMicrophoneStopped();
  appState.detectionEngine.reset();
  updateMicUI(false);
  liveNeckMidi = null;
  renderFretboard();
}

let lastDspTimestamp = 0;

function startDetectionLoop(): void {
  const loop = () => {
    if (!appState.isListening || !appState.analyser || !appState.audioContext) return;
    
    try {
      const bufferLength = appState.analyser.frequencyBinCount;
      const freqData = new Float32Array(bufferLength);
      appState.analyser.getFloatFrequencyData(freqData);
      
      // Update UI meters & visualizers on every frame for 60fps responsiveness
      updateLevelMeter(freqData);
      updateSpectrumVisualizer(freqData);
      
      // Heavy DSP Throttle: Spectrum and volume meter animate at 60 FPS,
      // while FFT peak extraction, autocorrelation, and chord matching run at ~30 FPS (every 32ms)
      const now = performance.now();
      if (now - lastDspTimestamp >= 32) {
        lastDspTimestamp = now;
        const result = appState.detectionEngine.processFrame(
          freqData, 
          appState.audioContext.sampleRate,
          appState.effectiveTuning
        );
        
        if (result) {
          handleDetectionResult(result, freqData);
        }
      }
    } catch (err) {
      console.error('Detection loop error (handled, loop continuing):', err);
    } finally {
      if (appState.isListening) {
        appState.animationFrameId = requestAnimationFrame(loop);
      }
    }
  };
  
  appState.animationFrameId = requestAnimationFrame(loop);
}

export function handleDetectionResult(result: DetectionResult, spectrum: Float32Array): void {
  // Wait mode also needs current gate/release metadata on held and idle frames.
  if (appState.activeTab === 'songs') appState.songStudio.evaluatePractice(result);
  // Handle room noise calibration progress and completion
  if (result.isCalibrating) {
    const nameEl = document.getElementById('display-chord-name');
    if (nameEl) nameEl.innerHTML = `<span style="font-size:1.4rem; color:var(--accent-cyan); font-weight:700;">🧹 Calibrating Room Noise (${result.calibrationProgress || 0}%)</span>`;
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Calibrating Ambient Room Noise (${result.calibrationProgress || 0}%) • Please stay silent...`;
    const substatusEl = document.getElementById('live-detector-substatus');
    if (substatusEl) substatusEl.textContent = result.statusMessage || 'Measuring room background noise...';
    return;
  }

  if (result.calibrationComplete) {
    updateCalibrationUI(false);
    if (result.calibratedDb !== undefined) {
      completeNoiseCalibrationUI(result.calibratedDb);
    }
    const nameEl = document.getElementById('display-chord-name');
    if (nameEl && (!appState.currentChord || nameEl.textContent?.includes('Calibrating'))) {
      nameEl.textContent = 'Ready';
    }
    const substatusEl = document.getElementById('live-detector-substatus');
    if (substatusEl) substatusEl.innerHTML = `✅ Room Noise Calibrated (${Math.round(result.calibratedDb || -60)} dB) • Strum any chord or pluck any string`;
  }

  // Update chord display
  updateChordDisplay(result);
  const isFresh = result.freshness === 'fresh';
  const nextLiveMidi = isFresh && result.mode === 'single-note' && result.note ? result.note.pitch.midi : null;
  if (nextLiveMidi !== liveNeckMidi) {
    liveNeckMidi = nextLiveMidi;
    renderFretboard();
  }
  
  // Only supported evidence drives side effects. Repeated fresh frames still
  // reach practice; freshness is not note/chord event deduplication.
  if (isFresh) {
    // Send to MIDI
    if (appState.midiManager && appState.settings.midiConfig.sendChords && result.chord) {
      appState.midiManager.sendChord({ root: result.chord.root, quality: result.chord.quality }, appState.settings.midiConfig.noteVelocity);
    }
    if (appState.midiManager && appState.settings.midiConfig.sendSingleNotes && result.note) {
      appState.midiManager.sendNoteOn(result.note.pitch.midi, appState.settings.midiConfig.noteVelocity);
    }
  
    // Log chord for session and update interactive fretboard
    if (result.mode === 'chord' && result.chord && result.chord.symbol !== appState.currentChord) {
      logChordDetection(result.chord);
      appState.currentChord = result.chord.symbol;
      loadChordPreset(result.chord.symbol);
    }

    if (appState.isDrillActive && appState.drillConfig) {
      evaluateDrillResult(result);
    }

    // Route only to the active studio; background practice must not react.
    if (result.chord) {
      if (appState.activeTab === 'trainer') appState.trainerStudio?.onChordDetected(result.chord.symbol);
    }
    if (result.note) {
      if (appState.activeTab === 'scales') appState.scalesStudio?.onSingleNoteDetected(result.note.pitch.note);
    }
  }

  if (result.mode === 'chord' && result.chord) {
    neckCaption = `${result.chord.symbol} · ${isFresh ? 'suggested voicing' : 'last confirmed · held'}`;
    syncNeck();
  } else if (result.mode === 'single-note' && result.note) {
    neckCaption = `${result.note.pitch.note}${result.note.pitch.octave} · ${isFresh ? 'possible positions' : 'last confirmed · held'}`;
    syncNeck();
  }
  
  // Update visualizers
  updateSpectrumVisualizer(spectrum);
  updateChromaVisualizer(result.chroma, result.freshness === 'held');
}

function logChordDetection(chord: any): void {
  if (!appState.currentSession) return;
  
  const existing = appState.currentSession.chordsDetected.find(c => c.chord === chord.symbol);
  if (existing) {
    existing.count++;
    existing.avgConfidence = (existing.avgConfidence * (existing.count - 1) + parseInt(chord.confidence)) / existing.count;
    existing.lastSeen = Date.now();
  } else {
    appState.currentSession.chordsDetected.push({
      chord: chord.symbol,
      count: 1,
      avgConfidence: parseInt(chord.confidence),
      modeChanges: 0,
      lastSeen: Date.now(),
    });
  }
}

// ============================================================================
// Audio Engine Controls
// ============================================================================

export async function strumCurrentChord(style: StrumStyle = 'down'): Promise<void> {
  await ensureAudioContext();
  if (!appState.audioContext || !appState.acousticBus) return;
  
  strumChord(appState.audioContext, appState.acousticBus, {
    frets: appState.currentFretboardState,
    style,
    velocity: 0.85,
    tuning: appState.effectiveTuning,
    model: appState.settings.acousticModel,
  });
}

export async function playTestSound(): Promise<void> {
  await ensureAudioContext();
  if (!appState.audioContext || !appState.acousticBus) return;
  playTestChord(appState.audioContext, appState.acousticBus);
}

export function setAcousticModel(model: AcousticModel): void {
  appState.settings.acousticModel = model;
  saveSettings(appState.settings);
  
  if (appState.acousticBus) {
    updateAcousticBusSettings(appState.acousticBus, model);
  }
  
  // Play preview
  strumCurrentChord('down');
}

export function updateMicGain(gain: number): void {
  appState.settings.micGain = gain;
  saveSettings(appState.settings);
  if (appState.micGainNode) {
    appState.micGainNode.gain.value = gain;
  }
  appState.detectionEngine.setConfig({ micGainMultiplier: gain });
}

export function updateNoiseGate(db: number): void {
  appState.settings.noiseGateDb = db;
  saveSettings(appState.settings);
  appState.detectionEngine.setConfig({ noiseGateDb: db });
}

export function updateSeventhStrictness(value: number): void {
  appState.settings.seventhStrictness = value;
  saveSettings(appState.settings);
  appState.detectionEngine.setConfig({ seventhStrictness: value });
}

export function setTriggerMode(mode: 'guitartuna' | 'continuous'): void {
  appState.settings.triggerMode = mode;
  saveSettings(appState.settings);
  appState.detectionEngine.setConfig({ triggerMode: mode });
  
  const guitartunaBtn = document.getElementById('btn-trigger-guitartuna');
  const continuousBtn = document.getElementById('btn-trigger-continuous');
  if (guitartunaBtn) {
    guitartunaBtn.classList.toggle('active', mode === 'guitartuna');
    guitartunaBtn.setAttribute('aria-pressed', mode === 'guitartuna' ? 'true' : 'false');
  }
  if (continuousBtn) {
    continuousBtn.classList.toggle('active', mode === 'continuous');
    continuousBtn.setAttribute('aria-pressed', mode === 'continuous' ? 'true' : 'false');
  }
}

export function setTargetMode(mode: DetectionTargetMode): void {
  appState.settings.targetMode = mode;
  saveSettings(appState.settings);
  appState.detectionEngine.setConfig({ targetMode: mode });
  appState.detectionEngine.reset();
  
  const chordsBtn = document.getElementById('btn-target-chords');
  const notesBtn = document.getElementById('btn-target-notes');
  const autoBtn = document.getElementById('btn-target-auto');
  const explainer = document.getElementById('target-mode-explainer');
  const badgeLabel = document.getElementById('target-mode-badge-label');
  const tuningGauge = document.getElementById('live-note-tuning-gauge');

  if (chordsBtn) {
    chordsBtn.classList.toggle('active', mode === 'chords');
    chordsBtn.setAttribute('aria-pressed', mode === 'chords' ? 'true' : 'false');
  }
  if (notesBtn) {
    notesBtn.classList.toggle('active', mode === 'notes');
    notesBtn.setAttribute('aria-pressed', mode === 'notes' ? 'true' : 'false');
  }
  if (autoBtn) {
    autoBtn.classList.toggle('active', mode === 'auto');
    autoBtn.setAttribute('aria-pressed', mode === 'auto' ? 'true' : 'false');
  }
  if (badgeLabel) {
    badgeLabel.textContent = mode === 'chords' ? 'Chords Only' : mode === 'notes' ? 'Notes & Tuner' : 'Auto (Smart)';
    badgeLabel.style.color = mode === 'chords' ? '#ffd54f' : mode === 'notes' ? '#38bdf8' : '#a78bfa';
  }
  if (explainer) {
    if (mode === 'chords') {
      explainer.textContent = 'Focuses 100% on chords with strict certainty (no note confusion)';
    } else if (mode === 'notes') {
      explainer.textContent = 'Focuses 100% on single notes & chromatic tuner (no chord guessing)';
    } else {
      explainer.textContent = 'Smart auto-discriminator between chords and single notes';
    }
  }
  if (tuningGauge) {
    tuningGauge.style.display = mode === 'notes' ? 'block' : 'none';
  }

  const substatusEl = document.getElementById('live-detector-substatus');
  if (substatusEl) {
    if (mode === 'chords') {
      substatusEl.textContent = appState.isListening ? 'Chord mode · Strum one chord and let it ring.' : 'Chord mode · Start listening, or choose a chord to explore.';
    } else if (mode === 'notes') {
      substatusEl.textContent = appState.isListening ? 'Notes mode · Pluck one string for pitch and tuning.' : 'Notes mode · Start listening to tune a string.';
    } else {
      substatusEl.textContent = appState.isListening ? 'Auto mode · Strum a chord or pluck a string.' : 'Auto mode · Start listening to recognise chords and notes.';
    }
  }
}

export function startNoiseCalibration(): void {
  if (!appState.isListening) {
    document.getElementById('live-detector-substatus')!.textContent = 'Start listening first; room calibration begins automatically.';
    return;
  }
  appState.detectionEngine.startNoiseCalibration();
  updateCalibrationUI(true);
}

export function toggleMonitor(enabled: boolean): void {
  appState.settings.monitorEnabled = enabled;
  saveSettings(appState.settings);
  updateMonitorUI(enabled);
}

// ============================================================================
// Fretboard Management
// ============================================================================

export function setFret(stringIndex: number, fret: number | null): void {
  appState.currentFretboardState[stringIndex] = fret;
  renderFretboard();
  
  // Analyze chord from fretboard
  const chord = identifyChordFromFrets(appState.currentFretboardState, appState.effectiveTuning);
  if (chord) {
    updateChordFromFretboard(chord);
    strumCurrentChord('down');
  }
}

export function setFretboardState(frets: (number | null)[]): void {
  appState.currentFretboardState = frets;
  renderFretboard();
  
  const chord = identifyChordFromFrets(frets, appState.effectiveTuning);
  if (chord) {
    updateChordFromFretboard(chord);
  }
}

export function clearFretboard(): void {
  appState.currentChord = null;
  liveNeckMidi = null;
  neckCaption = 'Explore the fretboard';
  appState.currentFretboardState = [null, null, null, null, null, null];
  renderFretboard();
  updateChordDisplay({ mode: 'idle', freshness: 'none', timestamp: Date.now(), chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -120 });
}

function fretboardChordName(chord: ChordDefinition): string {
  return chord.symbol.root + CHORD_QUALITY_DISPLAY[chord.symbol.quality];
}

function updateChordFromFretboard(chord: ChordDefinition): void {
  appState.currentChord = fretboardChordName(chord);
  neckCaption = `${appState.currentChord} · selected voicing`;
  syncNeck();
}

// ============================================================================
// Tuning Management
// ============================================================================

export function setTuningPreset(presetId: string): void {
  const preset = getTuningPreset(presetId);
  if (!preset) return;
  
  appState.activeTuning = preset;
  appState.settings.activeTuningPreset = presetId;
  saveSettings(appState.settings);
  
  updateEffectiveTuning();
  renderFretboard();
  updateTuningUI();
  
  // Update detection engine (preserve the live FFT size so bin->frequency math
  // stays consistent with the analyser; otherwise detected pitches jump an octave)
  appState.detectionEngine = new DetectionEngine({
    ...DEFAULT_DETECTION_CONFIG,
    noiseGateDb: appState.settings.noiseGateDb,
    seventhStrictness: appState.settings.seventhStrictness,
    triggerMode: appState.settings.triggerMode,
    micGainMultiplier: appState.settings.micGain,
    fftSize: appState.analyser ? appState.analyser.fftSize : DEFAULT_DETECTION_CONFIG.fftSize,
  });
  if (appState.analyser) {
    appState.detectionEngine.setAnalyser(appState.analyser);
  }
}

export function setCapo(fret: number): void {
  appState.capoState = { enabled: fret > 0, fret: Math.max(0, Math.min(12, fret)) };
  updateEffectiveTuning();
  renderFretboard();
  updateCapoUI();
}

export function transposeTuningUtil(semitones: number): void {
  const newTuning = transposeTuning(appState.activeTuning, semitones);
  appState.activeTuning = newTuning;
  updateEffectiveTuning();
  renderFretboard();
  updateTuningUI();
}

// ============================================================================
// Chord Library
// ============================================================================

export function getChordDefinitions(): ReturnType<typeof getAllChordDefinitions> {
  return getAllChordDefinitions(appState.effectiveTuning);
}

export function getChordVoicings(root: string, quality: string): ChordVoicing[] {
  const def = buildChordDefinition(root as any, quality as any, appState.effectiveTuning);
  return def.voicings;
}

export async function loadChordPreset(chordSymbol: string, autoPlay: boolean = false): Promise<void> {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed) return;

  const voicings = getChordVoicings(parsed.root, parsed.quality);
  if (voicings.length === 0) return;

  // Prefer a voicing that fits on the rendered 0-12 fretboard
  const playable =
    voicings.find(v => v.frets.every(f => f === null || (f >= 0 && f <= 12))) ??
    voicings[0];
  setFretboardState(playable.frets);

  appState.currentChord = chordSymbol;
  neckCaption = `${chordSymbol} · ${autoPlay ? 'selected' : 'suggested'} voicing`;
  liveNeckMidi = null;
  renderFretboard();

  // If manually triggered (autoPlay), update chord display card & strum acoustic audio
  if (autoPlay) {
    const activeNotes: NoteName[] = playable.frets
      .map((f, s) => (f !== null ? NOTE_NAMES[((appState.effectiveTuning[s].midi + f) % 12 + 12) % 12] : null))
      .filter((n): n is NoteName => n !== null);
    const uniqueNotes = Array.from(new Set(activeNotes));

    updateChordDisplay({
      mode: 'chord',
      freshness: 'none',
      timestamp: Date.now(),
      chord: {
        symbol: chordSymbol,
        root: parsed.root as NoteName,
        quality: parsed.quality as ChordQuality,
        confidence: 100,
        activeNotes: uniqueNotes.length > 0 ? uniqueNotes : [parsed.root as NoteName],
        intervals: '',
        formula: '',
        sargam: '',
        candidates: [{ symbol: chordSymbol, confidence: 100, name: chordSymbol }],
      },
      chroma: new Float32Array(12),
      peaks: [],
      ringingNotes: [],
      spectrum: new Float32Array(0),
      signalLevelDb: 0,
      statusMessage: `🎸 Preset Chord: ${chordSymbol} loaded`,
    });
    const confidence = document.getElementById('info-confidence');
    if (confidence) confidence.textContent = 'Preview';
    document.getElementById('cand-1')!.textContent = chordSymbol;
    document.getElementById('cand-2')!.textContent = '—';
    document.getElementById('cand-3')!.textContent = '—';
    document.getElementById('status-text')!.textContent = appState.isListening ? 'Microphone on · chord preview' : 'Chord preview · microphone off';

    await ensureAudioContext();
    await strumCurrentChord('down');
  }
}

// ============================================================================
// Song Management
// ============================================================================

export function getAllSongs(): Song[] {
  return getSongCatalog();
}

function getSongCatalog() {
  return buildSongCatalog(BUILTIN_SONGS, window.SONG_CATALOG, loadCustomSongs());
}
export function getSong(id: string): Song | undefined {
  return getAllSongs().find(s => s.id === id);
}

export function loadSong(song: Song): void {
  appState.activeSong = song;
  appState.activeTab = 'songs';
  updateSongUI(song);
  switchTab('songs');
}

// ============================================================================
// Drill Mode (Chord Change Practice)
// ============================================================================

let drillChordStartTime = 0;
let drillMatchedThisChord = false;
let drillStreak = 0;

export async function startDrill(config: DrillConfig): Promise<void> {
  await ensureAudioContext();
  if (!appState.isListening) {
    await startMicrophone();
  }

  appState.drillConfig = config;
  appState.isDrillActive = true;
  appState.drillResults = {
    config,
    chordResults: [],
    overallAccuracy: 0,
    avgLatencyMs: 0,
    weakTransitions: [],
  };
  
  appState.activeTab = 'drill';
  if (appState.currentSession) appState.currentSession.mode = 'drill';
  switchTab('drill');
  
  appState.drillProgression = generateDrillProgression(config);
  appState.drillCurrentIndex = 0;
  drillStreak = 0;
  showNextDrillChord();
}

// ── Diatonic harmony engine (drill progressions in any key/mode) ─────────────
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUAL = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUAL = ['m', 'dim', '', 'm', 'm', '', ''];

interface ProgDef { id: string; label: string; mode: 'major' | 'minor'; degrees: number[]; seventh?: 'blues' | 'jazz'; }

export const DRILL_PROGRESSIONS: ProgDef[] = [
  // Major
  { id: 'I-IV-V',       label: 'I – IV – V (Classic)',      mode: 'major', degrees: [0, 3, 4] },
  { id: 'I-V-vi-IV',    label: 'I – V – vi – IV (Pop)',     mode: 'major', degrees: [0, 4, 5, 3] },
  { id: 'I-vi-IV-V',    label: 'I – vi – IV – V (50s)',     mode: 'major', degrees: [0, 5, 3, 4] },
  { id: 'vi-IV-I-V',    label: 'vi – IV – I – V',           mode: 'major', degrees: [5, 3, 0, 4] },
  { id: 'I-IV-V-IV',    label: 'I – IV – V – IV',           mode: 'major', degrees: [0, 3, 4, 3] },
  { id: 'ii-V-I',       label: 'ii – V – I (Jazz 7ths)',    mode: 'major', degrees: [1, 4, 0], seventh: 'jazz' },
  { id: 'blues-major',  label: '12-Bar Blues (dom 7ths)',   mode: 'major', degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], seventh: 'blues' },
  // Minor
  { id: 'i-iv-v',       label: 'i – iv – v',                mode: 'minor', degrees: [0, 3, 4] },
  { id: 'i-VI-VII',     label: 'i – VI – VII',              mode: 'minor', degrees: [0, 5, 6] },
  { id: 'i-VI-III-VII', label: 'i – VI – III – VII (Epic)', mode: 'minor', degrees: [0, 5, 2, 6] },
  { id: 'i-iv-VII-III', label: 'i – iv – VII – III',        mode: 'minor', degrees: [0, 3, 6, 2] },
  { id: 'ii-v-i',       label: 'ii° – v – i',               mode: 'minor', degrees: [1, 4, 0] },
  { id: 'i-VII-VI-VII', label: 'i – VII – VI – VII',        mode: 'minor', degrees: [0, 6, 5, 6] },
];

export function diatonicChord(rootPc: number, mode: 'major' | 'minor', degIdx: number): string {
  const steps = mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS;
  const quals = mode === 'minor' ? MINOR_QUAL : MAJOR_QUAL;
  return NOTE_NAMES_SHARP[(rootPc + steps[degIdx]) % 12] + quals[degIdx];
}

/** All 7 diatonic chords of a key (I..vii°). */
export function diatonicChords(rootPc: number, mode: 'major' | 'minor'): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map(d => diatonicChord(rootPc, mode, d));
}

function realizeProgression(rootPc: number, mode: 'major' | 'minor', prog: ProgDef): string[] {
  const steps = mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS;
  const quals = mode === 'minor' ? MINOR_QUAL : MAJOR_QUAL;
  return prog.degrees.map(d => {
    const note = NOTE_NAMES_SHARP[(rootPc + steps[d]) % 12];
    if (prog.seventh === 'blues') return note + '7';
    if (prog.seventh === 'jazz') {
      if (d === 4) return note + '7';              // V → dominant 7
      if (quals[d] === '') return note + 'maj7';   // major → maj7
      if (quals[d] === 'm') return note + 'm7';    // minor → m7
      return note + quals[d];                      // dim etc.
    }
    return note + quals[d];
  });
}

/** Realized chord list for the currently-selected drill key/mode/progression (preview). */
export function drillProgressionChords(config: DrillConfig): string[] {
  const rootPc = Math.max(0, NOTE_NAMES_SHARP.indexOf(config.key || 'C'));
  const mode = config.mode || 'major';
  if (config.progressionType === 'all-diatonic') return diatonicChords(rootPc, mode);
  if (config.progressionType === 'random') {
    // Random walk over diatonic chords (skip the diminished for playability)
    const pool = diatonicChords(rootPc, mode).filter(c => !c.endsWith('dim'));
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (i > 0 && next === out[i - 1] && pool.length > 1) next = pool[(pool.indexOf(next) + 1) % pool.length];
      out.push(next);
    }
    return out;
  }
  const prog = DRILL_PROGRESSIONS.find(p => p.id === config.progressionType);
  if (prog) return realizeProgression(rootPc, mode, prog);
  return diatonicChords(rootPc, mode).slice(0, 4);
}

function generateDrillProgression(config: DrillConfig): string[] {
  const base = drillProgressionChords(config);
  if (base.length === 0) return [];
  const result: string[] = [];
  for (let i = 0; i < config.totalChords; i++) result.push(base[i % base.length]);
  return result;
}

function showNextDrillChord(): void {
  if (appState.drillCurrentIndex >= appState.drillProgression.length) {
    stopDrill();
    return;
  }
  
  drillMatchedThisChord = false;
  drillChordStartTime = Date.now();
  
  const chord = appState.drillProgression[appState.drillCurrentIndex];
  const display = document.getElementById('drill-current-chord');
  if (display) {
    display.innerHTML = `<span>${chord}</span><div id="drill-feedback-banner" style="font-size:1.1rem; color:var(--text-muted); font-weight:700; margin-top:8px;">Strum ${chord} on your guitar now...</div>`;
  }
  
  loadChordPreset(chord);
}

function evaluateDrillResult(result: DetectionResult): void {
  if (result.freshness !== 'fresh') return;
  if (!appState.isDrillActive || !appState.drillConfig || !appState.drillResults || drillMatchedThisChord) return;
  
  const targetChord = appState.drillProgression[appState.drillCurrentIndex];
  if (!targetChord) return;

  const candidates: string[] = [];
  if (result.chord) {
    candidates.push(result.chord.symbol);
    if (result.chord.candidates) {
      result.chord.candidates.forEach(c => {
        if (!candidates.includes(c.symbol)) candidates.push(c.symbol);
      });
    }
  }

  const feedbackBanner = document.getElementById('drill-feedback-banner');
  const display = document.getElementById('drill-current-chord');

  let isMatch = false;
  let matchedSymbol = '';

  for (const c of candidates) {
    if (!c) continue;
    if (c === targetChord) {
      isMatch = true;
      matchedSymbol = c;
      break;
    }
    if (targetChord.endsWith('m')) {
      if (c === targetChord || c === targetChord + '7' || c.startsWith(targetChord)) {
        isMatch = true;
        matchedSymbol = c;
        break;
      }
    } else {
      if (c === targetChord || c === targetChord + 'maj7' || c === targetChord + 'add9' || c === targetChord + '7') {
        isMatch = true;
        matchedSymbol = c;
        break;
      }
    }
  }

  if (isMatch) {
    drillMatchedThisChord = true;
    const latency = Math.max(60, Date.now() - drillChordStartTime);
    drillStreak++;

    appState.drillResults.chordResults.push({
      targetChord,
      detectedChord: matchedSymbol,
      matched: true,
      latencyMs: latency,
      confidence: Math.round(result.chord?.confidence || 90),
    });

    if (display) {
      display.classList.add('hit-match');
      setTimeout(() => display.classList.remove('hit-match'), 600);
    }

    if (feedbackBanner) {
      feedbackBanner.innerHTML = `<span style="color:#34d399; font-weight:800;">✅ MATCHED! Heard ${matchedSymbol} in ${latency}ms! 🔥 Streak: ${drillStreak}</span>`;
    }

    if (appState.audioContext) {
      playInTuneChime(appState.audioContext);
    }

    // Update HUD counters
    const matchedCount = appState.drillResults.chordResults.filter(r => r.matched).length;
    const total = appState.drillResults.chordResults.length;
    const accEl = document.getElementById('drill-accuracy');
    const latEl = document.getElementById('drill-latency');
    const streakEl = document.getElementById('drill-streak');

    if (accEl) accEl.textContent = `${Math.round((matchedCount / total) * 100)}%`;
    if (latEl) latEl.textContent = `${latency} ms`;
    if (streakEl) streakEl.textContent = String(drillStreak);

    window.setTimeout(() => {
      appState.drillCurrentIndex++;
      showNextDrillChord();
    }, 750);
  } else if (candidates.length > 0 && feedbackBanner && !drillMatchedThisChord) {
    feedbackBanner.innerHTML = `👂 Hearing: <strong style="color:var(--accent-gold);">${candidates[0]}</strong> • Target: <strong style="color:var(--accent-cyan);">${targetChord}</strong> (Strum target now!)`;
  }
}

export function stopDrill(): void {
  appState.isDrillActive = false;
  if (appState.drillResults) {
    const results = appState.drillResults.chordResults;
    const matched = results.filter(r => r.matched).length;
    appState.drillResults.overallAccuracy = results.length > 0 ? matched / results.length : 0;
    appState.drillResults.avgLatencyMs = results.reduce((a, b) => a + b.latencyMs, 0) / (results.length || 1);
    
    if (appState.currentSession) {
      appState.currentSession.drillResults = appState.drillResults;
      endSession();
    }
  }
}

// ============================================================================
// Session Management
// ============================================================================

export function endSession(): void {
  if (!appState.currentSession) return;
  
  appState.currentSession.endTime = Date.now();
  appState.currentSession.durationSec = Math.round((appState.currentSession.endTime - appState.currentSession.startTime) / 1000);
  
  savePracticeSession(appState.currentSession);
  appState.currentSession = null;
  
  startNewSession();
}

// ============================================================================
// Tab Switching
// ============================================================================

export function switchTab(tabId: string): void {
  appState.activeTab = tabId;

  // Stop transport players when navigating away from their own tab, so their
  // audio doesn't keep sounding on other tabs (e.g. a song/rhythm/metronome
  // still playing while you're on the Tuner).
  if (tabId !== 'metronome') stopMetronome();
  if (tabId !== 'rhythm' && rhythmPlaying) toggleRhythmPlayback();
  if (tabId !== 'songs') appState.songStudio.stopPlayback();

  // Update tab buttons
  document.querySelectorAll('.studio-tab-btn').forEach(btn => {
    const button = btn as HTMLElement;
    button.classList.toggle('active', button.dataset.tab === tabId);
    if (button.dataset.tab) button.setAttribute('aria-current', button.dataset.tab === tabId ? 'page' : 'false');
  });
  neckController?.setActive(tabId === 'detector');
  libraryNeck?.setActive(tabId === 'chords');
  appState.songStudio.setActive(tabId === 'songs');
  appState.scalesStudio.setActive(tabId === 'scales');
  
  // Update tab panes
  document.querySelectorAll('.studio-tab-pane').forEach(pane => {
    const element = pane as HTMLElement;
    element.classList.toggle('active', element.id === `pane-${tabId}`);
    element.style.display = element.id === `pane-${tabId}` ? 'block' : 'none';
  });
  
  // Tab-specific initialization
  if (tabId === 'songs') appState.songStudio.init();
  if (tabId === 'trainer') appState.trainerStudio.init();
  if (tabId === 'scales') appState.scalesStudio.init();
  if (tabId === 'tuner') updateTuningUI();
  if (tabId === 'chords') renderChordLibrary();
  if (tabId === 'metronome') renderMetronome();
  if (tabId === 'drill') renderDrillUI();
  if (tabId === 'rhythm') renderRhythmPresets();
  if (tabId === 'transcriber') renderTranscriber();
  if (tabId === 'looper') renderLooper();
  if (tabId === 'recorder') initRecorderTab();
  if (tabId === 'tuner') populateTunerPegs();
  
  saveCurrentSession({
    activeTab: tabId,
    tuningPreset: appState.activeTuning.id,
    fretboardState: appState.currentFretboardState,
    lastChord: appState.currentChord,
    songId: appState.activeSong?.id || null,
    timestamp: Date.now(),
  });
}

// ============================================================================
// UI Update Functions
// ============================================================================

function populateTunerPegs(): void {
  const pegsContainer = document.getElementById('tuner-pegs');
  if (!pegsContainer) return;
  pegsContainer.innerHTML = '';
  appState.effectiveTuning.forEach((st, idx) => {
    const btn = document.createElement('button');
    btn.className = 'studio-tab-btn';
    btn.style.padding = '8px 12px';
    btn.style.textAlign = 'center';
    btn.style.justifyContent = 'center';
    btn.id = `tuner-peg-${idx}`;
    const octave = Math.floor(st.midi / 12) - 1;
    btn.innerHTML = `<div><strong>${st.note}${octave}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">${st.freq.toFixed(1)}Hz</span></div>`;
    btn.addEventListener('click', () => {
      playTestSound();
    });
    pegsContainer.appendChild(btn);
  });
}

function updateMicUI(listening: boolean): void {
  const btn = document.getElementById('btn-toggle-mic');
  const status = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');
  
  if (btn) {
    btn.classList.toggle('btn-listen-active', listening);
    const textEl = btn.querySelector('#mic-btn-text');
    if (textEl) textEl.textContent = listening ? 'Stop listening' : 'Start listening';
    btn.setAttribute('aria-label', listening ? 'Stop microphone listening' : 'Start microphone listening');
    btn.setAttribute('aria-pressed', String(listening));
  }
  if (status) status.textContent = listening ? 'Microphone on · listening' : 'Your microphone is off';
  if (indicator) indicator.className = `status-dot ${listening ? 'listening' : ''}`;
  const substatus = document.getElementById('live-detector-substatus');
  if (substatus) {
    substatus.style.removeProperty('color');
    substatus.textContent = listening ? 'Stay quiet for room calibration, then strum one chord.' : 'Start listening to hear your guitar, or explore a chord without a microphone.';
  }
}

function updateCalibrationUI(calibrating: boolean): void {
  const btn = document.getElementById('btn-calibrate-noise');
  const status = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');
  
  if (calibrating) {
    const textEl = btn?.querySelector('#calibrate-btn-text');
    if (textEl) textEl.textContent = 'Measuring Silence... (1.5s)';
    if (status) status.textContent = 'Calibrating Ambient Room Noise • Stay Silent...';
    if (indicator) indicator.className = 'status-dot calibrating';
    const badge = document.getElementById('noise-reduction-badge');
    if (badge) badge.className = 'badge';
    const noiseStatusText = document.getElementById('noise-status-text');
    if (noiseStatusText) {
      noiseStatusText.textContent = 'Calibrating (1.5s)...';
      noiseStatusText.style.color = '#ffd54f';
    }
  } else {
    const textEl = btn?.querySelector('#calibrate-btn-text');
    if (textEl) textEl.textContent = 'Re-Calibrate Room Noise (1.5s)';
    if (indicator) indicator.className = 'status-dot listening';
  }
}

function completeNoiseCalibrationUI(measuredDb: number): void {
  const noiseStatusText = document.getElementById('noise-status-text');
  if (noiseStatusText) {
    noiseStatusText.textContent = `Active (${Math.round(measuredDb)} dB Subtracted)`;
    noiseStatusText.style.color = '#38bdf8';
  }
  const noiseFloorLabel = document.getElementById('noise-floor-label');
  if (noiseFloorLabel) {
    noiseFloorLabel.textContent = `${Math.round(measuredDb)} dB`;
  }
  const noiseBadge = document.getElementById('noise-reduction-badge');
  if (noiseBadge) {
    noiseBadge.className = 'badge calibrated';
  }
  const noisePct = Math.max(0, Math.min(100, (measuredDb + 75) * 1.66));
  const marker = document.getElementById('noise-floor-marker');
  if (marker) {
    marker.style.left = `${noisePct}%`;
  }
  const status = document.getElementById('status-text');
  if (status) {
    status.textContent = `Calibrated (${Math.round(measuredDb)} dB) • Strum Guitar`;
  }
  const indicator = document.getElementById('status-indicator');
  if (indicator) {
    indicator.className = 'status-dot listening';
  }
}

function updateMonitorUI(enabled: boolean): void {
  const btn = document.getElementById('btn-toggle-monitor');
  if (btn) btn.classList.toggle('active', enabled);
}

function updateChordDisplay(result: DetectionResult): void {
  const nameEl = document.getElementById('display-chord-name');
  const rootEl = document.getElementById('info-root');
  const qualityEl = document.getElementById('info-quality');
  const notesEl = document.getElementById('info-notes');
  const intervalsEl = document.getElementById('info-intervals');
  const sargamEl = document.getElementById('info-sargam');
  const confidenceEl = document.getElementById('info-confidence');
  const substatusEl = document.getElementById('live-detector-substatus');
  const ringingChipsEl = document.getElementById('live-ringing-notes-chips');
  const c1 = document.getElementById('cand-1');
  const c2 = document.getElementById('cand-2');
  const c3 = document.getElementById('cand-3');
  const tuningGauge = document.getElementById('live-note-tuning-gauge');
  const liveNeedle = document.getElementById('live-note-needle');
  const liveVerdict = document.getElementById('live-tuner-verdict');
  const held = result.freshness === 'held';
  
  if (result.mode === 'single-note' && result.note && appState.settings.targetMode !== 'chords') {
    nameEl!.innerHTML = `Note: <span style="color:#38bdf8;">${result.note.pitch.note}${result.note.pitch.octave}</span>`;
    rootEl!.textContent = `${result.note.pitch.note}${result.note.pitch.octave}`;
    qualityEl!.textContent = 'Single Note';
    notesEl!.textContent = `${result.note.pitch.freq.toFixed(1)} Hz (${result.note.pitch.cents > 0 ? '+' : ''}${result.note.pitch.cents}¢)`;
    if (intervalsEl) intervalsEl.textContent = SARGAM_NAMES[((result.note.pitch.midi % 12) + 12) % 12];
    if (sargamEl) sargamEl.textContent = SARGAM_NAMES[((result.note.pitch.midi % 12) + 12) % 12];
    confidenceEl!.innerHTML = `<span style="color:${result.note.tunerVerdict === 'in-tune' ? '#10b981' : result.note.tunerVerdict === 'flat' ? '#38bdf8' : '#f43f5e'}">${result.note.tunerVerdict}</span>`;

    if (c1) c1.innerHTML = `#1 <strong>${result.note.pitch.note}${result.note.pitch.octave}</strong> (${result.note.pitch.freq.toFixed(1)}Hz)`;
    if (c2) c2.innerHTML = `#2 <strong>-</strong>`;
    if (c3) c3.innerHTML = `#3 <strong>-</strong>`;

    // Inline tuning needle
    if (tuningGauge) tuningGauge.style.display = 'block';
    const clampedCents = Math.max(-50, Math.min(50, result.note.pitch.cents));
    const needlePct = 50 + (clampedCents / 50) * 45;
    if (liveNeedle) {
      liveNeedle.style.left = `${needlePct}%`;
      liveNeedle.style.background = result.note.tunerVerdict === 'in-tune' ? '#10b981' : result.note.tunerVerdict === 'flat' ? '#38bdf8' : '#f43f5e';
    }
    if (liveVerdict) {
      liveVerdict.textContent = result.note.tunerVerdict === 'in-tune' 
        ? `🎯 In Tune (${result.note.pitch.cents > 0 ? '+' : ''}${result.note.pitch.cents}¢)` 
        : result.note.tunerVerdict === 'flat' 
        ? `♭ Flat • Tune Up (${result.note.pitch.cents}¢)` 
        : `♯ Sharp • Tune Down (+${result.note.pitch.cents}¢)`;
      liveVerdict.style.color = result.note.tunerVerdict === 'in-tune' ? '#10b981' : result.note.tunerVerdict === 'flat' ? '#38bdf8' : '#f43f5e';
    }

    // Sync Headstock Tuner tab elements
    const tunerCenterNote = document.getElementById('tuner-center-note');
    const tunerCenterFreq = document.getElementById('tuner-center-freq');
    const tunerGaugeNeedle = document.getElementById('tuner-gauge-needle');
    const tunerStatusBadge = document.getElementById('tuner-status-badge');
    if (tunerCenterNote) tunerCenterNote.textContent = `${result.note.pitch.note}${result.note.pitch.octave}`;
    if (tunerCenterFreq) tunerCenterFreq.textContent = `Target: ${result.note.pitch.note} • Detected: ${result.note.pitch.freq.toFixed(1)} Hz (${result.note.pitch.cents > 0 ? '+' : ''}${result.note.pitch.cents}¢)`;
    if (tunerGaugeNeedle) tunerGaugeNeedle.style.left = `${needlePct}%`;
    if (tunerStatusBadge) {
      tunerStatusBadge.textContent = result.note.tunerVerdict === 'in-tune' ? '✅ In Tune' : result.note.tunerVerdict === 'flat' ? '♭ Too Flat (Tune Up)' : '♯ Too Sharp (Tune Down)';
      tunerStatusBadge.style.color = result.note.tunerVerdict === 'in-tune' ? '#10b981' : result.note.tunerVerdict === 'flat' ? '#38bdf8' : '#f43f5e';
    }
  } else if (result.mode === 'chord' && result.chord) {
    if (tuningGauge) tuningGauge.style.display = 'none';
    const strumHoldBadge = document.getElementById('strum-hold-badge');
    if (strumHoldBadge) strumHoldBadge.style.display = 'inline-flex';
    nameEl!.textContent = result.chord.symbol;
    rootEl!.textContent = result.chord.root;
    qualityEl!.textContent = result.chord.quality;
    notesEl!.textContent = result.chord.activeNotes.join(' - ');
    if (intervalsEl) intervalsEl.textContent = result.chord.intervals || '-';
    if (sargamEl) sargamEl.textContent = result.chord.sargam || '-';
    confidenceEl!.textContent = `${result.chord.confidence}%`;

    if (result.chord.candidates && result.chord.candidates.length > 0) {
      const c = result.chord.candidates;
      if (c1 && c[0]) c1.innerHTML = `#1 <strong>${c[0].symbol}</strong> (${c[0].confidence}%)`;
      if (c2 && c[1]) c2.innerHTML = `#2 <strong>${c[1].symbol}</strong> (${c[1].confidence}%)`;
      if (c3 && c[2]) c3.innerHTML = `#3 <strong>${c[2].symbol}</strong> (${c[2].confidence}%)`;
    }
  } else {
    if (tuningGauge && appState.settings.targetMode !== 'notes') {
      tuningGauge.style.display = 'none';
    }
    const strumHoldBadge = document.getElementById('strum-hold-badge');
    if (strumHoldBadge) strumHoldBadge.style.display = 'none';

    // When the engine is idle and no chord is being held, reset display cleanly
    if (!result.chord) {
      if (nameEl && nameEl.textContent !== 'Ready') {
        nameEl.textContent = 'Ready';
        rootEl!.textContent = '-';
        qualityEl!.textContent = '-';
        notesEl!.textContent = '-';
        if (intervalsEl) intervalsEl.textContent = '-';
        if (sargamEl) sargamEl.textContent = '-';
        confidenceEl!.textContent = '-';
        if (c1) c1.innerHTML = `#1 <strong>-</strong>`;
        if (c2) c2.innerHTML = `#2 <strong>-</strong>`;
        if (c3) c3.innerHTML = `#3 <strong>-</strong>`;
        appState.currentChord = null;
      }
    }
  }

  if (held) {
    if (confidenceEl) confidenceEl.textContent = `Held · last confidence ${result.chord?.confidence ?? result.note?.confidence}%`;
    if (tuningGauge) tuningGauge.style.display = 'none';
  }
  if (result.freshness !== 'fresh') {
    const tunerStatus = document.getElementById('tuner-status-badge');
    const tunerNeedle = document.getElementById('tuner-gauge-needle');
    const tunerFreq = document.getElementById('tuner-center-freq');
    if (tunerStatus) {
      tunerStatus.textContent = held && result.note ? 'Last note held · Pluck again to tune' : 'Waiting for a fresh note';
      tunerStatus.style.color = 'var(--text-muted)';
    }
    if (tunerNeedle) tunerNeedle.style.left = '50%';
    if (tunerFreq) tunerFreq.textContent = held && result.note
      ? `Last measured: ${result.note.pitch.freq.toFixed(1)} Hz`
      : 'No current pitch';
  }

  // Update ringing notes chips with frequencies and octaves
  if (ringingChipsEl && held) {
    ringingChipsEl.textContent = 'Last confirmed result · waiting for fresh evidence';
  } else if (ringingChipsEl && result.ringingNotes && result.ringingNotes.length > 0) {
    ringingChipsEl.innerHTML = result.ringingNotes.map(n =>
      `<span class="badge" style="background:rgba(56,189,248,0.18); border:1px solid rgba(56,189,248,0.4); color:#38bdf8; font-size:0.82rem; padding:3px 8px; border-radius:6px; font-weight:700;">${n.note}${n.octave} <span style="font-size:0.7rem; color:var(--text-muted);">(${Math.round(n.freq)}Hz)</span></span>`
    ).join('');
  } else if (ringingChipsEl) {
    if (result.chord) {
      ringingChipsEl.innerHTML = `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--accent-gold); font-size:0.78rem; border:1px solid rgba(255,179,0,0.25);">🎸 ${result.chord.symbol} confirmed</span>`;
    } else {
      ringingChipsEl.innerHTML = '<span class="badge" style="background:rgba(255,255,255,0.04); color:var(--text-muted); font-size:0.75rem;">Listening • Strike any chord or note</span>';
    }
  }
  
  // Update continuous status message
  if (substatusEl && result.statusMessage) {
    substatusEl.textContent = result.statusMessage;
  }
}


function updateLevelMeter(freqData: Float32Array): void {
  let maxDb = -120;
  for (let i = 0; i < freqData.length; i++) {
    if (freqData[i] > maxDb) maxDb = freqData[i];
  }
  
  const meterVal = Math.max(0, Math.min(100, (maxDb + 75) * 1.66));
  const meter = document.getElementById('audio-meter');
  const dbReadout = document.getElementById('db-readout');
  
  if (meter) meter.style.width = `${meterVal}%`;
  if (dbReadout) dbReadout.textContent = `${Math.round(maxDb)} dB`;
  
  const noiseProfile = appState.detectionEngine.getNoiseProfile();
  if (noiseProfile?.calibrated) {
    const noiseFloor = noiseProfile.measuredNoiseFloorDb;
    const noisePct = Math.max(0, Math.min(100, (noiseFloor + 75) * 1.66));
    const marker = document.getElementById('noise-floor-marker');
    if (marker) marker.style.left = `${noisePct}%`;
  }

  const gateDb = appState.detectionEngine.getGateThresholdDb();
  const gatePct = Math.max(0, Math.min(100, (gateDb + 75) * 1.66));
  const gateMarker = document.getElementById('gate-marker');
  if (gateMarker) gateMarker.style.left = `${gatePct}%`;

  const qualityLabel = document.getElementById('signal-quality-label');
  if (qualityLabel) {
    if (maxDb > gateDb) {
      qualityLabel.textContent = 'Active (Guitar)';
      qualityLabel.style.color = '#10b981';
    } else if (noiseProfile?.calibrated && maxDb > noiseProfile.measuredNoiseFloorDb) {
      qualityLabel.textContent = 'Room Noise Filtered';
      qualityLabel.style.color = '#94a3b8';
    } else {
      qualityLabel.textContent = 'Silence';
      qualityLabel.style.color = '#64748b';
    }
  }
}

function updateSpectrumVisualizer(freqData: Float32Array): void {
  const canvas = document.getElementById('canvas-spectrum') as HTMLCanvasElement;
  if (!canvas || canvas.clientWidth === 0) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Match the backing store to the displayed size (× DPR) so the spectrum isn't blurry/stretched
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.round(canvas.clientWidth * dpr);
  const targetH = Math.round(canvas.clientHeight * dpr);
  if (targetW > 0 && targetH > 0 && (canvas.width !== targetW || canvas.height !== targetH)) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  
  const gradient = ctx.createLinearGradient(0, h, 0, 0);
  gradient.addColorStop(0, 'rgba(255, 179, 0, 0.1)');
  gradient.addColorStop(0.6, 'rgba(255, 179, 0, 0.6)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.9)');
  
  ctx.beginPath();
  ctx.moveTo(0, h);
  
  const binsToDraw = Math.min(freqData.length, 320);
  const step = w / binsToDraw;
  
  for (let i = 0; i < binsToDraw; i++) {
    const db = freqData[i];
    const norm = Math.max(0, Math.min(1, (db + 90) / 75));
    const y = h - (norm * h);
    const x = i * step;
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function updateChromaVisualizer(chroma: Float32Array, held = false): void {
  let maxVal = 0;
  let maxIdx = -1;

  for (let i = 0; i < 12; i++) {
    const fill = document.getElementById(`chroma-fill-${i}`);
    const col = document.getElementById(`chroma-col-${i}`);
    if (!fill || !col) continue;
    
    const pct = Math.min(100, Math.round(chroma[i] * 100));
    fill.style.height = `${pct}%`;
    
    if (pct > 50) col.classList.add('highlight');
    else col.classList.remove('highlight');

    if (chroma[i] > maxVal) {
      maxVal = chroma[i];
      maxIdx = i;
    }
  }

  const indicator = document.getElementById('chroma-active-note-indicator');
  if (indicator) {
    if (!held && maxVal >= 0.40 && maxIdx >= 0) {
      indicator.textContent = `🎵 Active Note: ${NOTE_NAMES[maxIdx]}`;
      indicator.style.display = 'inline-block';
    } else {
      indicator.textContent = '';
      indicator.style.display = 'none';
    }
  }
}

// UI initialization functions
function initializeUI(): void {
  try { initChromaBars(); } catch (e) { console.warn('initChromaBars:', e); }
  try { initFretboard(); } catch (e) { console.warn('initFretboard:', e); }
  try { initTabButtons(); } catch (e) { console.warn('initTabButtons:', e); }
  try { renderFretboard(); } catch (e) { console.warn('renderFretboard:', e); }
  try { updateTuningUI(); } catch (e) { console.warn('updateTuningUI:', e); }
  try { renderPresetChips(); } catch (e) { console.warn('renderPresetChips:', e); }
  try { renderRhythmPresets(); } catch (e) { console.warn('renderRhythmPresets:', e); }
  try { renderLooperTracks(); } catch (e) { console.warn('renderLooperTracks:', e); }
  try { initSearchTab(); } catch (e) { console.warn('initSearchTab:', e); }
  try { initVideoTab(); } catch (e) { console.warn('initVideoTab:', e); }
}

function initChromaBars(): void {
  const container = document.getElementById('chroma-bars-container');
  if (!container) return;
  
  container.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const col = document.createElement('div');
    col.className = 'chroma-col';
    col.id = `chroma-col-${i}`;
    col.innerHTML = `
      <div class="chroma-fill" id="chroma-fill-${i}"></div>
      <div class="chroma-note-name">${NOTE_NAMES[i]}</div>
    `;
    container.appendChild(col);
  }
}

function initFretboard(): void {
  const container = document.getElementById('fretboard-strings-rows');
  if (!container) return;
  
  container.innerHTML = '';
  for (let s = 0; s < 6; s++) {
    const strInfo = appState.effectiveTuning[s];
    const row = document.createElement('div');
    row.className = 'guitar-string-row';
    
    const header = document.createElement('div');
    header.className = 'string-header';
    header.innerHTML = `
      <button type="button" class="mute-btn" id="mute-btn-${s}" aria-label="Mute string ${s + 1}">×</button>
      <span>${strInfo.note}</span>
    `;
    row.appendChild(header);
    header.querySelector('button')!.addEventListener('click', () => {
      appState.currentFretboardState[s] = null;
      updateEditedChord();
    });
    
    const cellsContainer = document.createElement('div');
    cellsContainer.className = 'fret-cells-container';
    
    const wire = document.createElement('div');
    wire.className = `string-wire ${strInfo.gaugeClass}`;
    cellsContainer.appendChild(wire);
    
    for (let f = 0; f <= 12; f++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'fret-cell';
      cell.id = `fret-cell-${s}-${f}`;
      cell.title = `String ${s+1}, Fret ${f}`;
      cell.onclick = () => onFretCellClick(s, f);
      cellsContainer.appendChild(cell);
    }
    
    row.appendChild(cellsContainer);
    container.appendChild(row);
  }
}

function onFretCellClick(stringIndex: number, fretIndex: number): void {
  const current = appState.currentFretboardState[stringIndex];
  if (current === fretIndex) {
    appState.currentFretboardState[stringIndex] = null;
  } else {
    appState.currentFretboardState[stringIndex] = fretIndex;
  }
  liveNeckMidi = null;
  updateEditedChord();
  if (appState.currentFretboardState[stringIndex] !== null) {
    void ensureAudioContext().then(() => {
      if (!appState.audioContext || !appState.acousticBus) return;
      playAcousticString(appState.audioContext, appState.acousticBus, {
        freq: 440 * Math.pow(2, (appState.effectiveTuning[stringIndex].midi + fretIndex - 69) / 12),
        startTime: appState.audioContext.currentTime,
        stringIndex,
        velocity: 0.75,
        model: appState.settings.acousticModel,
      });
    }).catch(error => console.warn('Note playback unavailable:', error));
  }
}

function updateEditedChord(): void {
  const chord = identifyChordFromFrets(appState.currentFretboardState, appState.effectiveTuning);
  appState.currentChord = chord ? fretboardChordName(chord) : null;
  neckCaption = chord ? `${appState.currentChord} · selected voicing` : 'Your custom voicing';
  if (chord) {
    document.getElementById('display-chord-name')!.textContent = fretboardChordName(chord);
    document.getElementById('info-root')!.textContent = chord.symbol.root;
    document.getElementById('info-quality')!.textContent = chord.symbol.quality;
  } else {
    document.getElementById('display-chord-name')!.textContent = appState.currentFretboardState.every(f => f === null) ? 'Let’s play' : 'Explore';
    document.getElementById('info-root')!.textContent = '—';
    document.getElementById('info-quality')!.textContent = 'Custom';
  }
  document.getElementById('info-confidence')!.textContent = 'Preview';
  document.getElementById('cand-1')!.textContent = appState.currentChord || '—';
  document.getElementById('cand-2')!.textContent = '—';
  document.getElementById('cand-3')!.textContent = '—';
  document.getElementById('info-notes')!.textContent = appState.currentFretboardState.map((f, s) => f === null ? null : NOTE_NAMES[(appState.effectiveTuning[s].midi + f) % 12]).filter(Boolean).join(' · ') || '—';
  renderFretboard();
}

function syncNeck(): void {
  neckController?.update({
    frets: appState.currentFretboardState,
    tuning: appState.effectiveTuning,
    liveMidi: liveNeckMidi,
    root: appState.currentChord ? parseChordSymbol(appState.currentChord)?.root || null : null,
  }, neckCaption);
  const symbol = appState.currentChord || '';
  if (symbol !== theoryChord) {
    theoryChord = symbol;
    const parsed = parseChordSymbol(symbol);
    const chord = parsed ? buildChordDefinition(parsed.root, parsed.quality, appState.effectiveTuning) : null;
    const formula = document.getElementById('theory-formula');
    const intervals = document.getElementById('theory-intervals');
    const degrees = document.getElementById('theory-degrees');
    if (formula) formula.textContent = chord?.formula || '—';
    if (intervals) intervals.textContent = chord ? `${chord.intervals.join(' · ')} semitones` : '—';
    if (degrees) degrees.textContent = chord?.notes.join(' · ') || '—';
  }
}

function renderFretboard(): void {
  for (let s = 0; s < 6; s++) {
    const fret = appState.currentFretboardState[s];
    const muteBtn = document.getElementById(`mute-btn-${s}`);
    
    if (muteBtn) {
      muteBtn.classList.toggle('muted', fret === null);
      muteBtn.setAttribute('aria-pressed', String(fret === null));
      const label = muteBtn.nextElementSibling;
      if (label) label.textContent = appState.effectiveTuning[s].note;
    }
    
    for (let f = 0; f <= 12; f++) {
      const cell = document.getElementById(`fret-cell-${s}-${f}`);
      if (!cell) continue;
      
      cell.innerHTML = '';
      const midi = appState.effectiveTuning[s].midi + f;
      const note = NOTE_NAMES[midi % 12];
      cell.setAttribute('aria-label', `String ${s + 1}, ${f === 0 ? 'open' : `fret ${f}`}, ${note}${Math.floor(midi / 12) - 1}`);
      cell.setAttribute('aria-pressed', String(fret === f));
      cell.classList.toggle('live-note', liveNeckMidi === midi);
      
      if (fret === f && fret !== null) {
        const dot = document.createElement('div');
        dot.className = 'finger-dot';
        const midi = appState.effectiveTuning[s].midi + f;
        const noteIdx = ((midi % 12) + 12) % 12;
        dot.textContent = NOTE_NAMES[noteIdx];
        dot.classList.toggle('root-note', appState.currentChord ? parseChordSymbol(appState.currentChord)?.root === note : false);
        cell.appendChild(dot);
      }
    }
    syncNeck();
  }
}

function initTabButtons(): void {
  document.querySelectorAll('.studio-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const button = btn as HTMLElement;
      switchTab(button.dataset.tab!);
    });
  });
  
  // Preset chip clicks
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const element = chip as HTMLElement;
      const chord = element.textContent?.trim();
      if (chord) loadChordPreset(chord, true);
    });
  });
  
  // Sound buttons
  document.querySelectorAll('.sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const button = btn as HTMLElement;
      if (button.id === 'btn-sound-dreadnought') setAcousticModel('dreadnought');
      else if (button.id === 'btn-sound-nylon') setAcousticModel('nylon');
      else if (button.id === 'btn-sound-twelve') setAcousticModel('twelve');
    });
  });
  
  // Strum style buttons
  const strumButtons = {
    'btn-strum-down': 'down',
    'btn-strum-up': 'up',
    'btn-strum-arpeggio': 'arpeggio',
    'btn-strum-roll': 'roll',
    'btn-strum-style-down': 'down',
    'btn-strum-style-up': 'up',
    'btn-strum-style-arpeggio': 'arpeggio',
    'btn-strum-style-roll': 'roll',
  };
  
  Object.entries(strumButtons).forEach(([id, style]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => strumCurrentChord(style as StrumStyle));
  });
  
  // Compare buttons
  const amBtn = document.getElementById('btn-preset-am');
  const am7Btn = document.getElementById('btn-preset-am7');
  if (amBtn) amBtn.addEventListener('click', () => loadChordPreset('Am', true));
  if (am7Btn) am7Btn.addEventListener('click', () => loadChordPreset('Am7', true));
  
  // Control buttons
  const toggleMic = document.getElementById('btn-toggle-mic');
  if (toggleMic) toggleMic.addEventListener('click', () => {
    if (appState.isListening) stopMicrophone();
    else startMicrophone();
  });
  
  const calibrateBtn = document.getElementById('btn-calibrate-noise');
  if (calibrateBtn) calibrateBtn.addEventListener('click', startNoiseCalibration);
  
  const clearBtn = document.getElementById('btn-clear-fretboard');
  if (clearBtn) clearBtn.addEventListener('click', clearFretboard);
  
  const testSpeaker = document.getElementById('btn-test-speaker');
  if (testSpeaker) testSpeaker.addEventListener('click', playTestSound);
  
  const clearHistory = document.getElementById('btn-clear-history');
  if (clearHistory) clearHistory.addEventListener('click', () => {
    document.getElementById('history-log')!.innerHTML = '';
    appState.detectionEngine.reset();
  });
  
  // Sliders
  const gainSlider = document.getElementById('mic-gain-slider') as HTMLInputElement;
  if (gainSlider) {
    gainSlider.value = String(appState.settings.micGain);
    const gainVal = document.getElementById('gain-val');
    if (gainVal) gainVal.textContent = `${appState.settings.micGain.toFixed(1)}x`;
    gainSlider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      updateMicGain(val);
      if (gainVal) gainVal.textContent = `${val.toFixed(1)}x`;
    });
  }
  
  const gateSlider = document.getElementById('noise-gate-slider') as HTMLInputElement;
  if (gateSlider) {
    gateSlider.value = String(appState.settings.noiseGateDb);
    const gateVal = document.getElementById('gate-val');
    if (gateVal) gateVal.textContent = `${Math.round(appState.settings.noiseGateDb)} dB`;
    gateSlider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      updateNoiseGate(val);
      if (gateVal) gateVal.textContent = `${Math.round(val)} dB`;
    });
  }
  
  const strictSlider = document.getElementById('seventh-strict-slider') as HTMLInputElement | null;
  if (strictSlider) {
    strictSlider.value = String(Math.round(appState.settings.seventhStrictness * 100));
    const strictVal = document.getElementById('strict-val');
    if (strictVal) strictVal.textContent = `${Math.round(appState.settings.seventhStrictness * 100)}%`;
    const marker = document.getElementById('seventh-marker');
    if (marker) marker.style.left = `${Math.round(appState.settings.seventhStrictness * 100)}%`;
    strictSlider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      updateSeventhStrictness(val / 100);
      if (strictVal) strictVal.textContent = `${val}%`;
      if (marker) marker.style.left = `${val}%`;
    });
  }
  
  // Trigger mode buttons
  const guitartunaBtn = document.getElementById('btn-trigger-guitartuna');
  const continuousBtn = document.getElementById('btn-trigger-continuous');
  if (guitartunaBtn) {
    guitartunaBtn.classList.toggle('active', appState.settings.triggerMode === 'guitartuna');
    guitartunaBtn.setAttribute('aria-pressed', appState.settings.triggerMode === 'guitartuna' ? 'true' : 'false');
    guitartunaBtn.addEventListener('click', () => setTriggerMode('guitartuna'));
  }
  if (continuousBtn) {
    continuousBtn.classList.toggle('active', appState.settings.triggerMode === 'continuous');
    continuousBtn.setAttribute('aria-pressed', appState.settings.triggerMode === 'continuous' ? 'true' : 'false');
    continuousBtn.addEventListener('click', () => setTriggerMode('continuous'));
  }
  
  // Target mode buttons (Chords Only vs Notes & Tuner vs Auto)
  const targetMode = appState.settings.targetMode || 'chords';
  const chordsTargetBtn = document.getElementById('btn-target-chords');
  const notesTargetBtn = document.getElementById('btn-target-notes');
  const autoTargetBtn = document.getElementById('btn-target-auto');
  if (chordsTargetBtn) {
    chordsTargetBtn.addEventListener('click', () => setTargetMode('chords'));
  }
  if (notesTargetBtn) {
    notesTargetBtn.addEventListener('click', () => setTargetMode('notes'));
  }
  if (autoTargetBtn) {
    autoTargetBtn.addEventListener('click', () => setTargetMode('auto'));
  }
  setTargetMode(targetMode);

  // Tuning preset select
  const tuningSelect = document.getElementById('tuner-preset-select') as HTMLSelectElement;
  if (tuningSelect && tuningSelect.options.length === 0) {
    TUNING_PRESETS.forEach(tp => {
      const opt = document.createElement('option');
      opt.value = tp.id;
      opt.textContent = `${tp.name} (${tp.description})`;
      if (tp.id === appState.activeTuning.id) opt.selected = true;
      tuningSelect.appendChild(opt);
    });
  }
  populateTunerPegs();
  if (tuningSelect) tuningSelect.addEventListener('change', (e) => setTuningPreset((e.target as HTMLSelectElement).value));
  
  // Capo select
  const capoSelect = document.getElementById('capo-select') as HTMLSelectElement;
  if (capoSelect) capoSelect.addEventListener('change', (e) => setCapo(parseInt((e.target as HTMLSelectElement).value)));
  
  // MIDI modal
  const midiBtn = document.getElementById('btn-open-midi-modal');
  if (midiBtn) midiBtn.addEventListener('click', async () => {
    document.getElementById('midi-modal')!.style.display = 'flex';
    if (!appState.midiManager) {
      document.getElementById('top-midi-status')!.textContent = 'Connecting…';
      try {
        appState.midiManager = await createMidiManager(loadMidiConfig(), appState.audioContext || undefined);
        document.getElementById('top-midi-status')!.textContent = appState.midiManager.isMidiSupported() ? 'Available' : 'Unavailable';
      } catch {
        document.getElementById('top-midi-status')!.textContent = 'Unavailable';
      }
    }
    populateMidiDevices();
  });
  
  // Custom song modal
}

function updateTuningUI(): void {
  for (let s = 0; s < 6; s++) {
    const noteEl = document.getElementById(`peg-note-${s}`);
    const freqEl = document.getElementById(`peg-freq-${s}`);
    if (noteEl) noteEl.textContent = appState.effectiveTuning[s].note;
    if (freqEl) freqEl.textContent = `${appState.effectiveTuning[s].freq.toFixed(1)} Hz`;
  }
  
  const tuningSelect = document.getElementById('tuner-preset-select') as HTMLSelectElement;
  if (tuningSelect) {
    tuningSelect.innerHTML = '';
    TUNING_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      tuningSelect.appendChild(opt);
    });
    tuningSelect.value = appState.activeTuning.id;
  }
}

function updateCapoUI(): void {
  const capoSelect = document.getElementById('capo-select') as HTMLSelectElement;
  if (capoSelect) capoSelect.value = appState.capoState.fret.toString();
}

function renderPresetChips(): void {
  const standardGrid = document.getElementById('preset-chips-standard');
  const bollywoodGrid = document.getElementById('preset-chips-bollywood');
  
  const standardChords = ['C', 'D', 'Dm', 'E', 'Em', 'F', 'G', 'A', 'Am', 'Am7', 'B7', 'Cadd9'];
  const bollywoodChords = ['Dm', 'F#m', 'G#m', 'A'];
  
  if (standardGrid) {
    standardGrid.innerHTML = '';
    standardChords.forEach(chord => {
      const chip = document.createElement('div');
      chip.className = 'preset-chip';
      chip.textContent = chord;
      chip.addEventListener('click', () => loadChordPreset(chord, true));
      standardGrid.appendChild(chip);
    });
  }
  
  if (bollywoodGrid) {
    bollywoodGrid.innerHTML = '';
    bollywoodChords.forEach(chord => {
      const chip = document.createElement('div');
      chip.className = 'preset-chip';
      chip.textContent = chord;
      chip.addEventListener('click', () => loadChordPreset(chord, true));
      bollywoodGrid.appendChild(chip);
    });
  }
}

function renderChordLibrary(): void {
  const rootContainer = document.getElementById('lib-root-filters');
  const qualContainer = document.getElementById('lib-quality-filters');
  const grid = document.getElementById('library-cards-grid');
  
  if (!grid) return;
  if (!libraryNeck) {
    libraryNeck = new LibraryNeck(document.getElementById('library-neck')!, appState.effectiveTuning,
      async (frets, style) => {
        await ensureAudioContext();
        if (appState.audioContext && appState.acousticBus) {
          strumChord(appState.audioContext, appState.acousticBus, {
            frets, style, velocity: 0.85, tuning: appState.effectiveTuning, model: appState.settings.acousticModel,
          });
        }
      },
      async (s, f) => {
        await ensureAudioContext();
        if (appState.audioContext && appState.acousticBus) {
          playAcousticString(appState.audioContext, appState.acousticBus, {
            freq: 440 * Math.pow(2, (appState.effectiveTuning[s].midi + f - 69) / 12),
            startTime: appState.audioContext.currentTime + 0.005, stringIndex: s, velocity: 0.9,
          });
        }
      });
  }
  libraryNeck.setActive(true);
  
  if (rootContainer && rootContainer.children.length === 0) {
    const roots = ['All', 'C', 'D', 'E', 'F', 'F#', 'G', 'A', 'B'];
    roots.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'library-filter-pill' + (r === 'All' ? ' active' : '');
      btn.textContent = r;
      btn.onclick = () => {
        filterChordLibrary({ root: r === 'All' ? null : r });
      };
      rootContainer.appendChild(btn);
    });
  }
  
  if (qualContainer && qualContainer.children.length === 0) {
    const quals = ['All', 'Major', 'Minor', '7th', 'Maj7', 'Min7', 'Sus4', 'Sus2', 'Power'];
    quals.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'library-filter-pill' + (q === 'All' ? ' active' : '');
      btn.textContent = q;
      btn.onclick = () => {
        filterChordLibrary({ quality: q === 'All' ? null : q });
      };
      qualContainer.appendChild(btn);
    });
  }
  
  renderChordLibraryGrid();
}

let currentLibFilter = { root: null as string | null, quality: null as string | null };

function filterChordLibrary(filter: { root?: string | null; quality?: string | null }): void {
  if (filter.root !== undefined) currentLibFilter.root = filter.root;
  if (filter.quality !== undefined) currentLibFilter.quality = filter.quality;
  
  document.querySelectorAll('#lib-root-filters .library-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (currentLibFilter.root || 'All'));
  });
  document.querySelectorAll('#lib-quality-filters .library-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (currentLibFilter.quality || 'All'));
  });
  
  renderChordLibraryGrid();
}

function renderChordLibraryGrid(): void {
  const grid = document.getElementById('library-cards-grid');
  if (!grid) return;
  
  const definitions = getAllChordDefinitions(appState.effectiveTuning);
  const filtered = definitions.filter(c => {
    const rootMatch = !currentLibFilter.root || c.symbol.root === currentLibFilter.root;
    const qualMatch = !currentLibFilter.quality || c.symbol.quality === currentLibFilter.quality;
    return rootMatch && qualMatch;
  });
  
  grid.innerHTML = '';
  filtered.forEach(chord => {
    const card = document.createElement('div');
    card.className = 'library-chord-card';
    const fretsStr = chord.voicings[0]?.frets.map(f => f === null ? 'x' : f.toString()).reverse().join('  ') || '-';
    const symbol = `${chord.symbol.root}${CHORD_QUALITY_DISPLAY[chord.symbol.quality]}`;
    card.innerHTML = `
      <div class="lib-chord-title">
        <span>${symbol}</span>
        <span style="font-size:0.75rem; color:var(--text-muted);">${chord.symbol.quality}</span>
      </div>
      <div class="lib-chord-notes">${chord.notes.join(' - ')}</div>
      <div style="font-family:monospace; font-size:0.8rem; background:rgba(0,0,0,0.3); padding:6px 10px; border-radius:6px; color:var(--accent-gold);">
        Frets: ${fretsStr}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
        <button class="lib-chord-strum-btn" data-library-strum>🔊 Strum</button>
        <button class="btn btn-secondary" data-library-select>Show</button>
        <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.75rem;" onclick="inspectChordPreset('${symbol}')">🔍 Inspect</button>
      </div>
    `;
    card.querySelector('[data-library-select]')!.addEventListener('click', () => {
      libraryNeck?.select(chord);
      document.getElementById('library-neck')!.scrollIntoView({ block: 'start' });
    });
    card.querySelector('[data-library-strum]')!.addEventListener('click', () => {
      libraryNeck?.select(chord);
      void libraryNeck?.strum();
    });
    grid.appendChild(card);
  });
}

// ---- Metronome state (persists across tab re-renders) ----
let metroBpm = 100;
let metroRunning = false;
let metroTimer: number | null = null;
let metroBeat = 0;
let metroBeatsPerMeasure = 4;
let metroAccent = true;
const metroTapTimes: number[] = [];

function metroTempoName(bpm: number): string {
  if (bpm < 60) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 168) return 'Allegro';
  return 'Presto';
}

function renderMetroBeats(): void {
  const c = document.getElementById('metro-beats-container');
  if (!c) return;
  c.innerHTML = '';
  for (let i = 0; i < metroBeatsPerMeasure; i++) {
    const dot = document.createElement('div');
    dot.id = `metro-beat-${i}`;
    dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:${i === metroBeat && metroRunning ? (i === 0 ? 'var(--accent-gold)' : '#d0d0d0') : '#2a2a2a'};transition:background 0.05s;`;
    c.appendChild(dot);
  }
}

function updateMetroBpmUI(): void {
  const disp = document.getElementById('metro-bpm-display');
  const name = document.getElementById('metro-tempo-name');
  const slider = document.getElementById('metro-slider') as HTMLInputElement | null;
  if (disp) disp.textContent = String(metroBpm);
  if (name) name.textContent = metroTempoName(metroBpm);
  if (slider) slider.value = String(metroBpm);
}

function metroTick(): void {
  ensureAudioContext();
  if (appState.audioContext) {
    playMetronomeClick(appState.audioContext, metroAccent && metroBeat === 0);
  }
  renderMetroBeats();
  metroBeat = (metroBeat + 1) % metroBeatsPerMeasure;
}

function startMetronome(): void {
  if (metroRunning) return;
  ensureAudioContext();
  metroRunning = true;
  metroBeat = 0;
  const icon = document.getElementById('metro-play-icon');
  if (icon) icon.textContent = '⏸️';
  metroTick(); // immediate first click
  metroTimer = window.setInterval(metroTick, 60000 / metroBpm);
}

function stopMetronome(): void {
  metroRunning = false;
  if (metroTimer !== null) { clearInterval(metroTimer); metroTimer = null; }
  const icon = document.getElementById('metro-play-icon');
  if (icon) icon.textContent = '▶️';
  metroBeat = 0;
  renderMetroBeats();
}

function setMetroBpm(bpm: number): void {
  metroBpm = Math.max(40, Math.min(240, Math.round(bpm)));
  updateMetroBpmUI();
  if (metroRunning) { // restart interval at new tempo
    if (metroTimer !== null) clearInterval(metroTimer);
    metroTimer = window.setInterval(metroTick, 60000 / metroBpm);
  }
}

function renderMetronome(): void {
  // Idempotent wiring (renderMetronome runs on every metronome tab open)
  updateMetroBpmUI();
  renderMetroBeats();

  const slider = document.getElementById('metro-slider') as HTMLInputElement | null;
  if (slider) slider.oninput = () => setMetroBpm(Number(slider.value));

  const minus = document.getElementById('metro-bpm-minus');
  if (minus) minus.onclick = () => setMetroBpm(metroBpm - 1);
  const plus = document.getElementById('metro-bpm-plus');
  if (plus) plus.onclick = () => setMetroBpm(metroBpm + 1);

  const toggle = document.getElementById('btn-metro-toggle');
  if (toggle) toggle.onclick = () => (metroRunning ? stopMetronome() : startMetronome());

  const accent = document.getElementById('metro-accent') as HTMLInputElement | null;
  if (accent) { accent.checked = metroAccent; accent.onchange = () => { metroAccent = accent.checked; }; }

  const setSig = (beats: number, activeId: string) => {
    metroBeatsPerMeasure = beats;
    metroBeat = 0;
    renderMetroBeats();
    ['metro-sig-3', 'metro-sig-4', 'metro-sig-6'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('active', id === activeId);
    });
  };
  const sig3 = document.getElementById('metro-sig-3');
  if (sig3) sig3.onclick = () => setSig(3, 'metro-sig-3');
  const sig4 = document.getElementById('metro-sig-4');
  if (sig4) sig4.onclick = () => setSig(4, 'metro-sig-4');
  const sig6 = document.getElementById('metro-sig-6');
  if (sig6) sig6.onclick = () => setSig(6, 'metro-sig-6');

  const tap = document.getElementById('metro-tap');
  if (tap) tap.onclick = () => {
    const now = Date.now();
    if (metroTapTimes.length && now - metroTapTimes[metroTapTimes.length - 1] > 2000) metroTapTimes.length = 0;
    metroTapTimes.push(now);
    if (metroTapTimes.length > 4) metroTapTimes.shift();
    if (metroTapTimes.length >= 2) {
      let sum = 0;
      for (let i = 1; i < metroTapTimes.length; i++) sum += metroTapTimes[i] - metroTapTimes[i - 1];
      const avgMs = sum / (metroTapTimes.length - 1);
      if (avgMs > 0) setMetroBpm(60000 / avgMs);
    }
  };
}

function currentDrillConfig(): DrillConfig {
  const key = ((document.getElementById('drill-key') as HTMLSelectElement)?.value || 'C') as NoteName;
  const mode = ((document.getElementById('drill-mode') as HTMLSelectElement)?.value || 'major') as 'major' | 'minor';
  const progressionType = (document.getElementById('drill-progression-type') as HTMLSelectElement)?.value || 'I-IV-V';
  const bpm = parseInt((document.getElementById('drill-bpm') as HTMLInputElement)?.value || '80');
  const barsPerChord = parseInt((document.getElementById('drill-bars-per-chord') as HTMLSelectElement)?.value || '2');
  const totalChords = parseInt((document.getElementById('drill-total-chords') as HTMLInputElement)?.value || '16');
  return { progressionType, bpm, barsPerChord, countInBars: 1, totalChords, key, mode };
}

function chip(text: string, playChord?: string): string {
  const base = 'background:rgba(255,179,0,0.15); border:1px solid rgba(255,179,0,0.35); color:#ffd54f; font-size:0.85rem; font-weight:700; padding:4px 10px; border-radius:8px;';
  if (!playChord) return `<span style="${base}">${text}</span>`;
  const safe = playChord.replace(/'/g, '');
  return `<button type="button" style="${base} cursor:pointer;" onclick="window.strumChordPreset && window.strumChordPreset('${safe}')" title="Click to hear ${safe}">${text}</button>`;
}

function populateDrillProgressions(mode: 'major' | 'minor'): void {
  const sel = document.getElementById('drill-progression-type') as HTMLSelectElement | null;
  if (!sel) return;
  const prev = sel.value;
  const opts = DRILL_PROGRESSIONS.filter(p => p.mode === mode)
    .map(p => `<option value="${p.id}">${p.label}</option>`).join('');
  sel.innerHTML = opts +
    `<option value="random">Random (diatonic)</option>` +
    `<option value="all-diatonic">All diatonic chords</option>`;
  // keep selection if still valid for this mode
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function updateDrillPreview(): void {
  const cfg = currentDrillConfig();
  const rootPc = Math.max(0, NOTE_NAMES_SHARP.indexOf(cfg.key || 'C'));
  const progEl = document.getElementById('drill-progression-preview');
  const diatEl = document.getElementById('drill-diatonic-preview');
  const keyEl = document.getElementById('drill-preview-key');
  if (keyEl) keyEl.textContent = `— ${cfg.key} ${cfg.mode === 'minor' ? 'Minor' : 'Major'}`;
  if (progEl) progEl.innerHTML = drillProgressionChords(cfg).map(c => chip(c, c)).join('');
  if (diatEl) {
    const romans = cfg.mode === 'minor' ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    diatEl.innerHTML = diatonicChords(rootPc, cfg.mode || 'major')
      .map((c, i) => chip(`${romans[i]} · ${c}`, c)).join('');
  }
}

function renderDrillUI(): void {
  // Populate Key dropdown once
  const keySel = document.getElementById('drill-key') as HTMLSelectElement | null;
  if (keySel && keySel.children.length === 0) {
    keySel.innerHTML = NOTE_NAMES_SHARP.map(n => `<option value="${n}"${n === 'C' ? ' selected' : ''}>${n}</option>`).join('');
  }

  const modeSel = document.getElementById('drill-mode') as HTMLSelectElement | null;
  populateDrillProgressions((modeSel?.value as 'major' | 'minor') || 'major');
  updateDrillPreview();

  if (keySel) keySel.onchange = updateDrillPreview;
  if (modeSel) modeSel.onchange = () => { populateDrillProgressions(modeSel.value as 'major' | 'minor'); updateDrillPreview(); };
  const progSel = document.getElementById('drill-progression-type') as HTMLSelectElement | null;
  if (progSel) progSel.onchange = updateDrillPreview;

  const bpmSlider = document.getElementById('drill-bpm') as HTMLInputElement | null;
  if (bpmSlider) bpmSlider.oninput = (e) => {
    document.getElementById('drill-bpm-val')!.textContent = (e.target as HTMLInputElement).value + ' BPM';
  };

  const startBtn = document.getElementById('btn-start-drill') as HTMLButtonElement | null;
  if (startBtn) startBtn.onclick = () => {
    startDrill(currentDrillConfig());
    startBtn.disabled = true;
    (document.getElementById('btn-stop-drill') as HTMLButtonElement).disabled = false;
    (document.getElementById('btn-next-drill-chord') as HTMLButtonElement).disabled = false;
  };

  const stopBtn = document.getElementById('btn-stop-drill') as HTMLButtonElement | null;
  if (stopBtn) stopBtn.onclick = () => {
    stopDrill();
    (document.getElementById('btn-start-drill') as HTMLButtonElement).disabled = false;
    stopBtn.disabled = true;
    (document.getElementById('btn-next-drill-chord') as HTMLButtonElement).disabled = true;
  };

  const nextBtn = document.getElementById('btn-next-drill-chord');
  if (nextBtn) nextBtn.onclick = () => {
    appState.drillCurrentIndex++;
    showNextDrillChord();
  };
}

function renderRhythmPresets(): void {
  const container = document.getElementById('rhythm-presets');
  const dockSelect = document.getElementById('dock-rhythm-select') as HTMLSelectElement;
  
  if (!container) return;
  
  container.innerHTML = '';
  RHYTHM_PRESETS.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'mini-chord-card' + (preset.id === currentRhythmId ? ' active-rhythm' : '');
    card.id = `rhy-card-${preset.id}`;
    card.innerHTML = `
      <div style="font-size:1.1rem; font-weight:800; color:var(--accent-gold);">${preset.name}</div>
      <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${preset.pattern.map(p => p.name).join(' ')}</div>
      <div style="font-size:0.68rem; color:#6ee7b7; margin-top:4px;">${preset.description}</div>
    `;
    card.onclick = () => selectRhythmPreset(preset.id);
    container.appendChild(card);
  });
  
  if (dockSelect) {
    dockSelect.innerHTML = '';
    RHYTHM_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      dockSelect.appendChild(opt);
    });
    dockSelect.value = currentRhythmId;
    // on* assignment is idempotent — renderRhythmPresets runs on every tab open
    dockSelect.onchange = (e) => selectRhythmPreset((e.target as HTMLSelectElement).value);
  }

  updateRhythmDots();

  // Dock controls (idempotent handlers to avoid stacking on repeat tab visits)
  const dockToggle = document.getElementById('btn-dock-rhythm-toggle');
  if (dockToggle) dockToggle.onclick = toggleRhythmPlayback;

  const tempoSlider = document.getElementById('dock-tempo-slider') as HTMLInputElement;
  if (tempoSlider) tempoSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    const r1 = document.getElementById('dock-tempo-readout'); if (r1) r1.textContent = val.toString();
    const r2 = document.getElementById('rhythm-tempo-val'); if (r2) r2.textContent = `${val} BPM`;
  };

  const bassVol = document.getElementById('dock-bass-vol') as HTMLInputElement;
  if (bassVol) bassVol.oninput = (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    const el = document.getElementById('rhythm-bass-vol'); if (el) el.textContent = `${Math.round(val * 100)}%`;
  };

  const trebleVol = document.getElementById('dock-treble-vol') as HTMLInputElement;
  if (trebleVol) trebleVol.oninput = (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    const el = document.getElementById('rhythm-treble-vol'); if (el) el.textContent = `${Math.round(val * 100)}%`;
  };
}

function selectRhythmPreset(presetId: string): void {
  currentRhythmId = presetId;
  rhythmStep = 0;
  document.querySelectorAll('[id^="rhy-card-"]').forEach(c => c.classList.remove('active-rhythm'));
  const card = document.getElementById('rhy-card-' + presetId);
  if (card) card.classList.add('active-rhythm');

  const dockSelect = document.getElementById('dock-rhythm-select') as HTMLSelectElement;
  if (dockSelect) dockSelect.value = presetId;

  updateRhythmDots();
}

function updateRhythmDots(): void {
  const preset = getRhythmPreset();
  const container = document.getElementById('dock-beat-dots');
  if (!container || !preset) return;
  
  container.innerHTML = '';
  for (let b = 0; b < preset.beats; b++) {
    const dot = document.createElement('div');
    dot.className = 'rhythm-beat-dot' + (b === 0 ? ' sam-beat' : '');
    dot.id = 'rhy-dot-' + b;
    container.appendChild(dot);
  }
}

// ---- Rhythm player state ----
let currentRhythmId = 'keharwa';
let rhythmPlaying = false;
let rhythmTimer: number | null = null;
let rhythmStep = 0;

function getRhythmPreset() {
  return RHYTHM_PRESETS.find(p => p.id === currentRhythmId) || RHYTHM_PRESETS[0];
}

function rhythmVolumes(): { bass: number; treble: number } {
  const bass = parseFloat((document.getElementById('dock-bass-vol') as HTMLInputElement | null)?.value || '0.9');
  const treble = parseFloat((document.getElementById('dock-treble-vol') as HTMLInputElement | null)?.value || '0.8');
  return { bass: isNaN(bass) ? 0.9 : bass, treble: isNaN(treble) ? 0.8 : treble };
}

function rhythmBpm(): number {
  const v = parseInt((document.getElementById('dock-tempo-slider') as HTMLInputElement | null)?.value || '80');
  return Math.max(40, Math.min(240, isNaN(v) ? 80 : v));
}

function playRhythmStroke(type: string, vel: number): void {
  ensureAudioContext();
  const ctx = appState.audioContext;
  if (!ctx) return;
  const { bass, treble } = rhythmVolumes();
  const now = ctx.currentTime;
  const hasBass = type === 'cajon_bass' || type === 'bayan' || type === 'bayan_dayan';
  const hasTreble = type.startsWith('dayan') || type === 'cajon_snare' || type === 'shaker' || type === 'bayan_dayan';

  if (hasBass) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.16);
    g.gain.setValueAtTime(Math.max(0.0001, vel * bass * 0.5), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.24);
  }
  if (hasTreble) {
    if (type === 'shaker' || type === 'cajon_snare') {
      // noise burst
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = type === 'shaker' ? 5000 : 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, vel * treble * 0.4), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      src.connect(hp); hp.connect(g); g.connect(ctx.destination);
      src.start(now); src.stop(now + 0.1);
    } else {
      // tabla dayan-style tone
      const osc = ctx.createOscillator();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 6;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      g.gain.setValueAtTime(Math.max(0.0001, vel * treble * 0.32), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.14);
    }
  }
}

function stepRhythm(): void {
  const preset = getRhythmPreset();
  const stroke = preset.pattern[rhythmStep % preset.pattern.length];
  if (stroke) playRhythmStroke(stroke.type, stroke.vel);

  // Highlight the active beat dot
  const dots = document.querySelectorAll('[id^="rhy-dot-"]');
  dots.forEach((d, i) => d.classList.toggle('active-beat', i === rhythmStep % preset.beats));

  rhythmStep = (rhythmStep + 1) % preset.pattern.length;
  if (rhythmPlaying) {
    rhythmTimer = window.setTimeout(stepRhythm, 60000 / rhythmBpm());
  }
}

function toggleRhythmPlayback(): void {
  const btn = document.getElementById('btn-dock-rhythm-toggle');
  if (rhythmPlaying) {
    rhythmPlaying = false;
    if (rhythmTimer !== null) { clearTimeout(rhythmTimer); rhythmTimer = null; }
    document.querySelectorAll('[id^="rhy-dot-"]').forEach(d => d.classList.remove('active-beat'));
    if (btn) btn.innerHTML = '<span>▶️</span> Play';
  } else {
    ensureAudioContext();
    rhythmPlaying = true;
    rhythmStep = 0;
    if (btn) btn.innerHTML = '<span>⏹️</span> Stop';
    stepRhythm();
  }
}

function renderTranscriber(): void {
  const btn = document.getElementById('btn-toggle-transcribing');
  if (btn) btn.addEventListener('click', () => {
    // Toggle transcribing
  });
}

function renderLooper(): void {
  // Render looper tracks
  renderLooperTracks();
}

function renderLooperTracks(): void {
  const container = document.getElementById('looper-tracks');
  if (!container) return;
  
  const tracks = ['Rhythm Chords', 'Lead Solo Riff', 'Harmonies / Taps'];
  const colors = ['var(--accent-gold)', 'var(--accent-cyan)', 'var(--accent-purple)'];
  const icons = ['●', '●', '●'];
  
  container.innerHTML = '';
  tracks.forEach((name, i) => {
    const box = document.createElement('div');
    box.className = 'looper-track-box';
    box.id = `looper-track-${i}`;
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size:1.1rem; color:${colors[i]};">Track ${i+1}: ${name}</strong>
        <span class="badge" id="trk-status-${i}">Empty</span>
      </div>
      <button class="track-rec-btn idle" id="btn-rec-track-${i}" onclick="toggleTrackRecord(${i})">
        <span>${icons[i]}</span> Record Track
      </button>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span style="font-size:0.75rem; color:var(--text-muted);">Vol:</span>
        <input type="range" min="0" max="1" step="0.05" value="0.9" oninput="setTrackVolume(${i}, this.value)" style="flex:1;">
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.7rem;" onclick="toggleTrackMute(${i})" id="btn-mute-${i}">Mute</button>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.7rem; color:#f43f5e;" onclick="clearTrack(${i})">🗑️</button>
      </div>
    `;
    container.appendChild(box);
  });
}

(window as any).toggleTrackRecord = (_trackIdx: number): void => {
  // Placeholder
};

(window as any).setTrackVolume = (_trackIdx: number, _val: number): void => {
  // Placeholder
};

(window as any).toggleTrackMute = (_trackIdx: number): void => {
  // Placeholder
};

(window as any).clearTrack = (_trackIdx: number): void => {
  // Placeholder
};

function updateSongUI(song: Song): void {
  // Update song display elements
  const titleEl = document.getElementById('song-display-title');
  const metaEl = document.getElementById('song-display-meta');
  if (titleEl) titleEl.innerHTML = `🎸 ${song.title}`;
  if (metaEl) metaEl.textContent = `Movie: ${song.movie || ''} • Singer: ${song.singer || ''} • Music: ${song.music || ''}`;
}


function populateMidiDevices(): void {
  if (appState.midiManager) {
    const outputs = appState.midiManager.getAvailableOutputs();
    const select = document.getElementById('midi-device-select') as HTMLSelectElement;
    if (select) {
      select.innerHTML = '';
      const virtualOpt = document.createElement('option');
      virtualOpt.value = 'virtual';
      virtualOpt.textContent = '🎵 Virtual Synth (Built-in)';
      select.appendChild(virtualOpt);
      
      outputs.forEach(out => {
        const opt = document.createElement('option');
        opt.value = out.id;
        opt.textContent = `🎹 ${out.name} (${out.manufacturer || 'MIDI'})`;
        select.appendChild(opt);
      });
      
      select.value = appState.midiManager.getSelectedOutputId();
      select.addEventListener('change', (e) => {
        appState.midiManager?.selectOutput((e.target as HTMLSelectElement).value);
      });
    }
  }
}

function initSearchTab(): void {
  initSongTools({
    catalog: getSongCatalog,
    open: (id, part) => { switchTab('songs'); appState.songStudio.loadSong(id, part); },
    editing: () => appState.songStudio.getSongForEditing(),
    pause: () => appState.songStudio.stopPlayback(),
  });
}

function initVideoTab(): void {
  const toggleBtn = document.getElementById('btn-toggle-webcam');
  const videoEl = document.getElementById('camera-video-element') as HTMLVideoElement;
  let stream: MediaStream | null = null;

  if (toggleBtn && videoEl) {
    toggleBtn.onclick = async () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        videoEl.srcObject = null;
        toggleBtn.innerHTML = '<span>📷</span> Enable Camera';
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoEl.srcObject = stream;
          toggleBtn.innerHTML = '<span>⏹️</span> Stop Camera';
        } catch (e) {
          alert('Could not access camera: ' + e);
        }
      }
    };
  }
}

// ============================================================================
// Global Window API and Auto-Initialization
// ============================================================================

declare global {
  interface Window {
    initializeApp: () => Promise<void>;
    switchTab: (tabId: string) => void;
    strumCurrentChord: (style?: StrumStyle) => Promise<void>;
    loadChordPreset: (chord: string, autoPlay?: boolean) => Promise<void>;
    inspectChordPreset: (chord: string) => void;
    strumChordPreset: (chord: string) => void;
    selectSongFromSearch: (songId: string) => void;
    toggleTrackRecord: (i: number) => void;
    setTrackVolume: (i: number, v: number) => void;
    toggleTrackMute: (i: number) => void;
    clearTrack: (i: number) => void;
    setTargetMode: (mode: DetectionTargetMode) => void;
    setTriggerMode: (mode: 'guitartuna' | 'continuous') => void;
    appState: AppState;
    SONG_CATALOG?: unknown;
  }
}

if (typeof window !== 'undefined') {
  window.initializeApp = initializeApp;
  window.switchTab = switchTab;
  window.strumCurrentChord = strumCurrentChord;
  window.loadChordPreset = (chord: string, autoPlay: boolean = true) => loadChordPreset(chord, autoPlay);
  window.setTargetMode = setTargetMode;
  window.setTriggerMode = setTriggerMode;
  // Inspect loads the chord onto the detector fretboard, strums it, and switches to it
  window.inspectChordPreset = (chord: string) => {
    loadChordPreset(chord, true);
    switchTab('detector');
  };
  // Strum loads the chord's voicing, then strums it
  window.strumChordPreset = (chord: string) => {
    loadChordPreset(chord, true);
  };
  window.selectSongFromSearch = (songId: string) => {
    switchTab('songs');
    appState.songStudio.loadSong(songId);
  };
  window.appState = appState;

  // Auto-run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeApp().catch(err => console.error('App initialization error:', err));
    });
  } else {
    initializeApp().catch(err => console.error('App initialization error:', err));
  }
}

// Export app state for debugging
export { appState };