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
  PracticeSession,
  DrillConfig,
  DrillResult,
  NOTE_NAMES,
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
  saveCustomSong,
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
  songStudio: new SongStudio(),
};

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
  
  // 4. Initialize MIDI (graceful fallback if unsupported/denied)
  try {
    const midiConfig = loadMidiConfig();
    appState.midiManager = await createMidiManager(midiConfig, appState.audioContext || undefined);
  } catch (err) {
    console.warn('Web MIDI non-fatal init error:', err);
  }
  
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
  initializeUI();
  
  // Wire Song Studio practice mic auto-start & pre-build fretboard
  appState.songStudio.onMicStartRequested = () => {
    if (!appState.isListening) {
      startMicrophone();
    }
  };
  appState.songStudio.onPlayRequested = async () => {
    await ensureAudioContext();
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
  if (appState.songStudio) appState.songStudio.setTuning(tuning);
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
  await ensureAudioContext();
  if (!appState.audioContext) return false;
  
  try {
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
    appState.analyser.fftSize = 4096; // 4096 matches V1 for fast 93ms response
    appState.analyser.smoothingTimeConstant = 0.10;
    
    appState.detectionEngine.setAnalyser(appState.analyser);
    appState.detectionEngine.setConfig({
      noiseGateDb: appState.settings.noiseGateDb,
      seventhStrictness: appState.settings.seventhStrictness,
      triggerMode: appState.settings.triggerMode,
      targetMode: appState.settings.targetMode || 'chords',
      micGainMultiplier: appState.settings.micGain,
      fftSize: 4096,
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
    alert('Could not access microphone. Please check permissions in your browser settings.');
    return false;
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
  appState.detectionEngine.reset();
  updateMicUI(false);
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

function handleDetectionResult(result: DetectionResult, spectrum: Float32Array): void {
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
  
  // Drill mode evaluation
  if (appState.isDrillActive && appState.drillConfig) {
    evaluateDrillResult(result);
  }
  
  // Studio Subsystem Evaluation
  if (result.chord) {
    appState.trainerStudio?.onChordDetected(result.chord.symbol);
    appState.songStudio?.evaluatePractice(result.chord.symbol);
  }
  if (result.note) {
    appState.scalesStudio?.onSingleNoteDetected(result.note.pitch.note);
    appState.songStudio?.evaluatePractice(result.note.pitch.note);
  }
  
  // Update visualizers
  updateSpectrumVisualizer(spectrum);
  updateChromaVisualizer(result.chroma);
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
      substatusEl.textContent = '🎸 Chords Mode Active • Strum full chord cleanly (strict certainty lock)';
    } else if (mode === 'notes') {
      substatusEl.textContent = '🎵 Notes & Tuner Mode Active • Pluck single string for pitch & tuning';
    } else {
      substatusEl.textContent = '👂 Auto Smart Mode Active • Strum any chord or pluck any string';
    }
  }
}

export function startNoiseCalibration(): void {
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
  appState.currentFretboardState = [null, null, null, null, null, null];
  renderFretboard();
  updateChordDisplay({ mode: 'idle', timestamp: Date.now(), chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -120 });
}

function updateChordFromFretboard(chord: any): void {
  appState.currentChord = chord.symbol;
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

export function loadChordPreset(chordSymbol: string): void {
  const parsed = parseChordSymbol(chordSymbol);
  if (!parsed) return;

  const voicings = getChordVoicings(parsed.root, parsed.quality);
  if (voicings.length === 0) return;

  // Prefer a voicing that fits on the rendered 0-12 fretboard
  const playable =
    voicings.find(v => v.frets.every(f => f === null || (f >= 0 && f <= 12))) ??
    voicings[0];
  setFretboardState(playable.frets);
}

// ============================================================================
// Song Management
// ============================================================================

export function getAllSongs(): Song[] {
  const customSongs = loadCustomSongs();
  return [...customSongs, ...BUILTIN_SONGS];
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

function generateDrillProgression(config: DrillConfig): string[] {
  const progressions: Record<string, string[]> = {
    'I-V-vi-IV': ['C', 'G', 'Am', 'F'],
    'ii-V-I': ['Dm', 'G', 'C'],
    'blues': ['A7', 'D7', 'E7'],
    'random': ['C', 'Am', 'F', 'G', 'Dm', 'Em', 'Am', 'G'],
  };
  
  const base = progressions[config.progressionType] || progressions['random'];
  const result: string[] = [];
  
  for (let i = 0; i < config.totalChords; i++) {
    result.push(base[i % base.length]);
  }
  
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
  
  // Update tab buttons
  document.querySelectorAll('.studio-tab-btn').forEach(btn => {
    const button = btn as HTMLElement;
    button.classList.toggle('active', button.dataset.tab === tabId);
  });
  
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
    if (textEl) textEl.textContent = listening ? 'Listening... (Click to Stop)' : 'Start Listening (Microphone)';
  }
  if (status) status.textContent = listening ? 'Microphone Active • Strum Guitar' : 'Ready • Click "Start Listening"';
  if (indicator) indicator.className = `status-dot ${listening ? 'listening' : ''}`;
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
  
  if (result.mode === 'single-note' && result.note) {
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
  
  // Update ringing notes chips with frequencies and octaves
  if (ringingChipsEl && result.ringingNotes && result.ringingNotes.length > 0) {
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

function updateChromaVisualizer(chroma: Float32Array): void {
  for (let i = 0; i < 12; i++) {
    const fill = document.getElementById(`chroma-fill-${i}`);
    const col = document.getElementById(`chroma-col-${i}`);
    if (!fill || !col) continue;
    
    const pct = Math.min(100, Math.round(chroma[i] * 100));
    fill.style.height = `${pct}%`;
    
    if (pct > 50) col.classList.add('highlight');
    else col.classList.remove('highlight');
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
      <div class="mute-btn" id="mute-btn-${s}" title="Mute String">X</div>
      <span>${strInfo.note}</span>
    `;
    row.appendChild(header);
    
    const cellsContainer = document.createElement('div');
    cellsContainer.className = 'fret-cells-container';
    
    const wire = document.createElement('div');
    wire.className = `string-wire ${strInfo.gaugeClass}`;
    cellsContainer.appendChild(wire);
    
    for (let f = 0; f <= 12; f++) {
      const cell = document.createElement('div');
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
  renderFretboard();
  
  const chord = identifyChordFromFrets(appState.currentFretboardState, appState.effectiveTuning);
  if (chord) {
    updateChordFromFretboard(chord);
    strumCurrentChord('down');
  }
}

function renderFretboard(): void {
  for (let s = 0; s < 6; s++) {
    const fret = appState.currentFretboardState[s];
    const muteBtn = document.getElementById(`mute-btn-${s}`);
    
    if (muteBtn) {
      muteBtn.classList.toggle('muted', fret === null);
    }
    
    for (let f = 0; f <= 12; f++) {
      const cell = document.getElementById(`fret-cell-${s}-${f}`);
      if (!cell) continue;
      
      cell.innerHTML = '';
      
      if (fret === f && fret !== null) {
        const dot = document.createElement('div');
        dot.className = 'finger-dot';
        const midi = appState.effectiveTuning[s].midi + f;
        const noteIdx = ((midi % 12) + 12) % 12;
        dot.textContent = NOTE_NAMES[noteIdx];
        cell.appendChild(dot);
      }
    }
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
      if (chord) loadChordPreset(chord);
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
  if (amBtn) amBtn.addEventListener('click', () => loadChordPreset('Am'));
  if (am7Btn) am7Btn.addEventListener('click', () => loadChordPreset('Am7'));
  
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
  if (midiBtn) midiBtn.addEventListener('click', () => {
    document.getElementById('midi-modal')!.style.display = 'flex';
    populateMidiDevices();
  });
  
  // Custom song modal
  const saveCustomSong = document.getElementById('btn-save-custom-song');
  if (saveCustomSong) saveCustomSong.addEventListener('click', saveCustomSongHandler);
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
      chip.addEventListener('click', () => loadChordPreset(chord));
      standardGrid.appendChild(chip);
    });
  }
  
  if (bollywoodGrid) {
    bollywoodGrid.innerHTML = '';
    bollywoodChords.forEach(chord => {
      const chip = document.createElement('div');
      chip.className = 'preset-chip';
      chip.textContent = chord;
      chip.addEventListener('click', () => loadChordPreset(chord));
      bollywoodGrid.appendChild(chip);
    });
  }
}

function renderChordLibrary(): void {
  const rootContainer = document.getElementById('lib-root-filters');
  const qualContainer = document.getElementById('lib-quality-filters');
  const grid = document.getElementById('library-cards-grid');
  
  if (!grid) return;
  
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
      <div style="display:flex; gap:8px; margin-top:4px;">
        <button class="lib-chord-strum-btn" onclick="strumChordPreset('${symbol}')">🔊 Strum</button>
        <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.75rem;" onclick="inspectChordPreset('${symbol}')">🔍 Inspect</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderMetronome(): void {
  // Metronome initialized
}

function renderDrillUI(): void {
  const progressionSelect = document.getElementById('drill-progression-type') as HTMLSelectElement;
  if (progressionSelect) {
    progressionSelect.addEventListener('change', () => {
      // Update UI
    });
  }
  
  const bpmSlider = document.getElementById('drill-bpm') as HTMLInputElement;
  if (bpmSlider) {
    bpmSlider.addEventListener('input', (e) => {
      document.getElementById('drill-bpm-val')!.textContent = (e.target as HTMLInputElement).value + ' BPM';
    });
  }
  
  const startBtn = document.getElementById('btn-start-drill') as HTMLButtonElement | null;
  if (startBtn) startBtn.addEventListener('click', () => {
    const progressionType = (document.getElementById('drill-progression-type') as HTMLSelectElement).value as any;
    const bpm = parseInt((document.getElementById('drill-bpm') as HTMLInputElement).value);
    const barsPerChord = parseInt((document.getElementById('drill-bars-per-chord') as HTMLSelectElement).value);
    const totalChords = parseInt((document.getElementById('drill-total-chords') as HTMLInputElement).value);
    
    startDrill({ progressionType, bpm, barsPerChord, countInBars: 1, totalChords });
    
    startBtn.disabled = true;
    (document.getElementById('btn-stop-drill') as HTMLButtonElement).disabled = false;
    (document.getElementById('btn-next-drill-chord') as HTMLButtonElement).disabled = false;
  });
  
  const stopBtn = document.getElementById('btn-stop-drill') as HTMLButtonElement | null;
  if (stopBtn) stopBtn.addEventListener('click', () => {
    stopDrill();
    (document.getElementById('btn-start-drill') as HTMLButtonElement).disabled = false;
    stopBtn.disabled = true;
    (document.getElementById('btn-next-drill-chord') as HTMLButtonElement).disabled = true;
  });
  
  const nextBtn = document.getElementById('btn-next-drill-chord');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    appState.drillCurrentIndex++;
    showNextDrillChord();
  });
}

function renderRhythmPresets(): void {
  const container = document.getElementById('rhythm-presets');
  const dockSelect = document.getElementById('dock-rhythm-select') as HTMLSelectElement;
  
  if (!container) return;
  
  container.innerHTML = '';
  RHYTHM_PRESETS.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'mini-chord-card' + (preset.id === 'keharwa' ? ' active-rhythm' : '');
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
    dockSelect.value = 'keharwa';
    dockSelect.addEventListener('change', (e) => selectRhythmPreset((e.target as HTMLSelectElement).value));
  }
  
  updateRhythmDots();
  
  // Dock controls
  const dockToggle = document.getElementById('btn-dock-rhythm-toggle');
  if (dockToggle) dockToggle.addEventListener('click', toggleRhythmPlayback);
  
  const tempoSlider = document.getElementById('dock-tempo-slider') as HTMLInputElement;
  if (tempoSlider) tempoSlider.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value);
    document.getElementById('dock-tempo-readout')!.textContent = val.toString();
    document.getElementById('rhythm-tempo-val')!.textContent = `${val} BPM`;
  });
  
  const bassVol = document.getElementById('dock-bass-vol') as HTMLInputElement;
  if (bassVol) bassVol.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('rhythm-bass-vol')!.textContent = `${Math.round(val * 100)}%`;
  });
  
  const trebleVol = document.getElementById('dock-treble-vol') as HTMLInputElement;
  if (trebleVol) trebleVol.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('rhythm-treble-vol')!.textContent = `${Math.round(val * 100)}%`;
  });
}

function selectRhythmPreset(presetId: string): void {
  document.querySelectorAll('[id^="rhy-card-"]').forEach(c => c.classList.remove('active-rhythm'));
  const card = document.getElementById('rhy-card-' + presetId);
  if (card) card.classList.add('active-rhythm');
  
  const dockSelect = document.getElementById('dock-rhythm-select') as HTMLSelectElement;
  if (dockSelect) dockSelect.value = presetId;
  
  updateRhythmDots();
}

function updateRhythmDots(): void {
  const preset = RHYTHM_PRESETS.find(p => p.id === 'keharwa'); // default
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

function toggleRhythmPlayback(): void {
  // Placeholder
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

function saveCustomSongHandler(): void {
  const title = (document.getElementById('custom-song-title-input') as HTMLInputElement).value.trim();
  const artist = (document.getElementById('custom-song-artist-input') as HTMLInputElement).value.trim() || 'Custom Artist';
  const key = (document.getElementById('custom-song-key') as HTMLSelectElement).value;
  const bpm = parseInt((document.getElementById('custom-song-bpm') as HTMLInputElement).value) || 80;
  const strum = (document.getElementById('custom-song-strum') as HTMLSelectElement).value;
  const lyrics = (document.getElementById('custom-song-lyrics') as HTMLTextAreaElement).value.trim();
  
  if (!title) { alert('Please enter a Song Title.'); return; }
  if (!lyrics) { alert('Please enter lyrics with [Chord] tags.'); return; }
  
  const chordMatches = lyrics.match(/\[([A-G][#b]?[a-zA-Z0-9]*)\]/g) || [];
  const extractedChords = Array.from(new Set(chordMatches.map(c => c.replace(/[\[\]]/g, ''))));
  const chordsToUse = extractedChords.length > 0 ? extractedChords : ['C', 'G', 'Am', 'F'];
  
  const customSong: Song = {
    id: 'custom_' + Date.now(),
    title,
    movie: artist,
    singer: 'My Song / Acoustic',
    key,
    bpm,
    strum,
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: chordsToUse,
    westernHook: 'C4 D4 E4 F4 G4 | F4 E4 D4 C4',
    lines: [],
    lyrics,
    isCustom: true,
  };
  
  saveCustomSong(customSong);
  
  // Add to dropdown
  const dropdown = document.getElementById('song-selector-select') as HTMLSelectElement;
  if (dropdown) {
    const opt = document.createElement('option');
    opt.value = customSong.id;
    opt.textContent = '⭐ ' + customSong.title + ' (My Song)';
    dropdown.insertBefore(opt, dropdown.firstChild);
  }
  
  document.getElementById('custom-song-modal')!.style.display = 'none';
  alert('Song "' + title + '" saved to your personal library!');
}

function initSearchTab(): void {
  const input = document.getElementById('search-song-input') as HTMLInputElement;
  const btn = document.getElementById('btn-search-song');
  const resultsDiv = document.getElementById('search-results');
  if (!input || !btn || !resultsDiv) return;

  const performSearch = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return;

    const matches = BUILTIN_SONGS.filter(s => 
      s.title.toLowerCase().includes(q) || 
      (s.movie && s.movie.toLowerCase().includes(q)) ||
      (s.singer && s.singer.toLowerCase().includes(q)) ||
      (s.chordsUsed && s.chordsUsed.some(c => c.toLowerCase() === q))
    );

    resultsDiv.style.display = 'block';
    if (matches.length === 0) {
      resultsDiv.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.9rem;">No songs found matching "<strong>${input.value}</strong>". Try searching "Hotel California", "Kesariya", or "C".</div>`;
      return;
    }

    resultsDiv.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:16px;">
        ${matches.map(song => `
          <div class="card" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); padding:16px; border-radius:14px; cursor:pointer;" onclick="selectSongFromSearch('${song.id}')">
            <h4 style="font-size:1.1rem; color:var(--accent-gold); font-weight:800; margin-bottom:4px;">🎸 ${song.title}</h4>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">${song.movie || song.singer || 'Acoustic'} • Key: ${song.key} • ${song.bpm} BPM</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
              ${song.chordsUsed.map(c => `<span class="badge" style="background:rgba(255,179,0,0.15); border:1px solid rgba(255,179,0,0.3); color:#ffd54f; font-size:0.75rem; padding:2px 8px;">${c}</span>`).join('')}
            </div>
            <button class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem; width:100%; justify-content:center;">Play This Song ➔</button>
          </div>
        `).join('')}
      </div>
    `;
  };

  btn.onclick = performSearch;
  input.onkeydown = (e) => { if (e.key === 'Enter') performSearch(); };
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
    loadChordPreset: (chord: string) => void;
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
  }
}

if (typeof window !== 'undefined') {
  window.initializeApp = initializeApp;
  window.switchTab = switchTab;
  window.strumCurrentChord = strumCurrentChord;
  window.loadChordPreset = loadChordPreset;
  window.setTargetMode = setTargetMode;
  window.setTriggerMode = setTriggerMode;
  // Inspect loads the chord onto the detector fretboard and switches to it so it's visible
  window.inspectChordPreset = (chord: string) => {
    loadChordPreset(chord);
    switchTab('detector');
  };
  // Strum loads the chord's voicing, then strums it
  window.strumChordPreset = (chord: string) => {
    loadChordPreset(chord);
    strumCurrentChord('down');
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