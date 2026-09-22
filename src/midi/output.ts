/**
 * Web MIDI Output Controller
 * Sends detected notes/chords to external MIDI devices or virtual synth
 */

import { MidiConfig, MidiDevice, ChordSymbol, NOTE_NAMES } from '../types';

// ============================================================================
// MIDI Manager Class
// ============================================================================

export class MidiManager {
  private config: MidiConfig;
  private midiAccess: any = null;
  private selectedOutput: any = null;
  private isSupported = false;
  private virtualSynthEnabled = false;
  private audioContext: AudioContext | null = null;
  private lastSentNotes = new Map<number, number>(); // pitch -> timestamp
  private noteOffTimers = new Map<number, number>(); // pitch -> timeoutId

  public isMidiSupported(): boolean {
    return this.isSupported;
  }

  constructor(config: MidiConfig, audioContext: AudioContext | null = null) {
    this.config = config;
    this.audioContext = audioContext;
  }

  async initialize(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.log('Web MIDI API not supported');
      this.isSupported = false;
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.isSupported = true;
      
      // Only select a real hardware MIDI device if one is explicitly configured.
      // The virtual synth is opt-in only — never auto-enabled — so the live
      // detector never synthesizes tones on detection (including on false
      // detections of room noise while the user isn't playing).
      if (this.config.outputDeviceId && this.config.outputDeviceId !== 'virtual') {
        this.selectOutput(this.config.outputDeviceId);
      }
      
      // Listen for device changes
      this.midiAccess.addEventListener('statechange', () => {
        this.handleStateChange();
      });
      
      return true;
    } catch (e) {
      console.warn('Web MIDI initialization failed:', e);
      this.isSupported = false;
      return false;
    }
  }

  private handleStateChange(): void {
    if (!this.midiAccess) return;
    
    // Re-select if current device disconnected
    if (this.selectedOutput && this.selectedOutput.state === 'disconnected') {
      this.selectedOutput = null;
      // Try to find another device
      const outputs: any[] = Array.from(this.midiAccess.outputs.values());
      if (outputs.length > 0) {
        this.selectOutput(outputs[0].id);
      }
      // No device: stay silent (do not auto-enable the virtual synth)
    }
  }

  // ============================================================================
  // Device Management
  // ============================================================================

  getAvailableOutputs(): MidiDevice[] {
    if (!this.midiAccess) return [];
    
    return Array.from(this.midiAccess.outputs.values()).map((out: any) => ({
      id: out.id,
      name: out.name,
      manufacturer: out.manufacturer,
      type: 'output' as const,
    }));
  }

  selectOutput(deviceId: string): boolean {
    if (!this.midiAccess) return false;
    
    if (deviceId === 'virtual') {
      this.enableVirtualSynth(true);
      return true;
    }
    
    const output = this.midiAccess.outputs.get(deviceId);
    if (output) {
      this.selectedOutput = output;
      this.enableVirtualSynth(false);
      this.config.outputDeviceId = deviceId;
      return true;
    }
    
    return false;
  }

  enableVirtualSynth(enabled: boolean): void {
    this.virtualSynthEnabled = enabled;
    if (enabled) {
      this.selectedOutput = null;
      this.config.outputDeviceId = 'virtual';
    }
  }

  getSelectedOutputId(): string {
    return this.config.outputDeviceId;
  }

  getConfig(): MidiConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<MidiConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.outputDeviceId !== undefined) {
      this.selectOutput(config.outputDeviceId);
    }
    if (config.channel !== undefined) {
      this.config.channel = config.channel;
    }
  }

  // ============================================================================
  // Note/Chord Output
  // ============================================================================

  sendNoteOn(pitch: number, velocity: number = 90): void {
    const channel = this.config.channel;
    const now = Date.now();
    
    // Debounce: don't retrigger same note within 50ms
    const lastTime = this.lastSentNotes.get(pitch) || 0;
    if (now - lastTime < 50) return;
    this.lastSentNotes.set(pitch, now);
    
    // Clear any pending note-off
    const existingTimer = this.noteOffTimers.get(pitch);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Send to hardware MIDI
    if (this.selectedOutput && !this.virtualSynthEnabled) {
      try {
        this.selectedOutput.send([0x90 + channel, pitch, velocity]);
      } catch (e) {
        console.warn('MIDI send error:', e);
      }
    }
    
    // Play virtual synth
    if (this.virtualSynthEnabled && this.audioContext) {
      this.playVirtualSynthVoice(pitch, velocity);
    }
    
    // Schedule note-off
    const timer = window.setTimeout(() => {
      this.sendNoteOff(pitch);
      this.noteOffTimers.delete(pitch);
    }, this.config.chordNoteDurationMs);
    
    this.noteOffTimers.set(pitch, timer);
  }

  sendNoteOff(pitch: number): void {
    const channel = this.config.channel;
    
    if (this.selectedOutput && !this.virtualSynthEnabled) {
      try {
        this.selectedOutput.send([0x80 + channel, pitch, 0]);
      } catch (e) {
        console.warn('MIDI note-off error:', e);
      }
    }
    
    // Virtual synth note-off handled by envelope
  }

  sendChord(chordSymbol: ChordSymbol, velocity: number = 85): void {
    // Build chord notes from symbol
    const notes = this.buildChordNotes(chordSymbol);
    
    notes.forEach((pitch, i) => {
      // Stagger slightly for realistic strum
      setTimeout(() => {
        this.sendNoteOn(pitch, velocity);
      }, i * 20);
    });
  }

  sendChordFromFrets(frets: (number | null)[], stringMidis: number[]): void {
    const notes: number[] = [];
    
    for (let s = 0; s < 6; s++) {
      const fret = frets[s];
      if (fret !== null && fret !== -1 && fret !== undefined) {
        const midi = stringMidis[s] + fret;
        notes.push(midi);
      }
    }
    
    notes.forEach((pitch, i) => {
      setTimeout(() => {
        this.sendNoteOn(pitch, this.config.noteVelocity);
      }, i * 20);
    });
  }

  // ============================================================================
  // Chord Building
  // ============================================================================

  private buildChordNotes(symbol: ChordSymbol): number[] {
    // Simplified chord building - in production use chord definitions
    const rootMidi = this.noteNameToMidi(symbol.root);
    const intervals = this.getChordIntervals(symbol.quality);
    
    return intervals.map(i => rootMidi + i);
  }

  private noteNameToMidi(note: string): number {
    const noteName = note.replace(/[#b].*/, '') as any;
    const accidental = note.match(/[#b]/)?.[0] || '';
    const baseIdx = NOTE_NAMES.indexOf(noteName as any);
    if (baseIdx === -1) return 60;
    
    let idx = baseIdx;
    if (accidental === '#') idx += 1;
    else if (accidental === 'b') idx -= 1;
    
    // Middle C = 60, so C4 = 60
    return 60 + idx;
  }

  private getChordIntervals(quality: string): number[] {
    const intervals: Record<string, number[]> = {
      'Major': [0, 4, 7],
      'Minor': [0, 3, 7],
      '7': [0, 4, 7, 10],
      'maj7': [0, 4, 7, 11],
      'm7': [0, 3, 7, 10],
      'sus2': [0, 2, 7],
      'sus4': [0, 5, 7],
      '5': [0, 7],
      'dim': [0, 3, 6],
      'aug': [0, 4, 8],
      '6': [0, 4, 7, 9],
      'm6': [0, 3, 7, 9],
      '9': [0, 4, 7, 10, 14],
      'm9': [0, 3, 7, 10, 14],
      'maj9': [0, 4, 7, 11, 14],
      'add9': [0, 4, 7, 14],
      'm7b5': [0, 3, 6, 10],
      'dim7': [0, 3, 6, 9],
    };
    return intervals[quality] || [0, 4, 7];
  }

  // ============================================================================
  // Virtual Synth (simple fallback)
  // ============================================================================

  private playVirtualSynthVoice(pitch: number, velocity: number): void {
    if (!this.audioContext) return;
    
    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    const now = this.audioContext.currentTime;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, now);
    filter.frequency.exponentialRampToValueAtTime(freq, now + 0.35);
    filter.Q.setValueAtTime(2, now);
    
    gain.gain.setValueAtTime((velocity / 127) * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.start(now);
    osc.stop(now + 0.42);
  }

  // ============================================================================
  // Test / Utility
  // ============================================================================

  testConnection(): void {
    // Send a C major chord
    this.sendChord({ root: 'C', quality: 'Major' }, 90);
  }

  panic(): void {
    // Send all notes off on all channels
    if (this.selectedOutput && !this.virtualSynthEnabled) {
      for (let ch = 0; ch < 16; ch++) {
        this.selectedOutput.send([0xB0 + ch, 0x7B, 0]); // All Notes Off
      }
    }
    
    // Clear all pending timers
    this.noteOffTimers.forEach(timer => clearTimeout(timer));
    this.noteOffTimers.clear();
    this.lastSentNotes.clear();
  }

  dispose(): void {
    this.panic();
    this.midiAccess = null;
    this.selectedOutput = null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createMidiManager(
  config: MidiConfig, 
  audioContext: AudioContext | null = null
): Promise<MidiManager> {
  const manager = new MidiManager(config, audioContext);
  await manager.initialize();
  return manager;
}