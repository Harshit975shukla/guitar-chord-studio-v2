/**
 * Recorder Tab UI Component
 * Audio Performance Recorder & Jam Looper tab
 */

import { audioRecorder } from '../audio/recorder';
import { profileManager } from '../storage/profiles';

let recorderTabInitialized = false;

export function createRecorderTab(): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'studio-tab-pane';
  tab.id = 'pane-recorder';
  tab.style.display = 'none';
  tab.innerHTML = `
    <div class="recorder-container">
      <div class="recorder-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
          <div>
            <h2 style="font-size:1.5rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:8px;">
              <span>🎙️</span> Guitar Audio Performance Recorder & Jam Looper
            </h2>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
              Capture high-fidelity acoustic guitar audio, check your strumming rhythm, loop chord tracks, and practice lead solos!
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge" id="rec-status-badge" style="background:rgba(255,255,255,0.06); border:1px solid var(--border-light); font-size:0.8rem;">
              <span id="rec-status-dot">⚪</span> <span id="rec-status-text">Ready to Record</span>
            </span>
          </div>
        </div>

        <!-- Live Waveform / Audio VU Visualizer Canvas -->
        <div style="position:relative; width:100%; height:84px; background:rgba(0,0,0,0.45); border:1px solid var(--border-light); border-radius:14px; margin-bottom:20px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
          <canvas id="rec-visualizer-canvas" width="760" height="84" style="width:100%; height:100%; display:block;"></canvas>
          <div id="rec-canvas-placeholder" style="position:absolute; font-size:0.8rem; color:var(--text-muted); pointer-events:none;">
            Waveform & Audio Level Meter (Active during recording & playback)
          </div>
        </div>

        <!-- Timer Display -->
        <div class="rec-time-display" id="rec-timer-readout">00:00.0</div>

        <!-- Main Action Buttons -->
        <div style="display:flex; justify-content:center; align-items:center; gap:20px; flex-wrap:wrap; margin-bottom:20px;">
          <!-- Count-in Toggle -->
          <button class="btn btn-secondary" id="rec-btn-countin" onclick="toggleRecordCountIn()" style="font-size:0.8rem; padding:8px 14px; border-radius:20px;">
            <span id="rec-countin-icon">⏱️</span> Count-In: <strong id="rec-countin-status" style="color:var(--text-muted);">Off</strong>
          </button>

          <!-- Big Record Button -->
          <button class="rec-button-big" id="rec-btn-main" onclick="toggleMainAudioRecording()" title="Start / Stop Recording">
            <span id="rec-btn-icon">🎙️</span>
          </button>

          <!-- Loop Mode Toggle -->
          <button class="btn btn-secondary" id="rec-btn-loop" onclick="toggleAudioLoopMode()" style="font-size:0.8rem; padding:8px 14px; border-radius:20px;">
            <span>🔁</span> Jam Looper: <strong id="rec-loop-status" style="color:var(--text-muted);">Off</strong>
          </button>
        </div>

        <!-- Count-In Visual Countdown Display -->
        <div id="rec-countin-overlay" style="display:none; font-size:2.2rem; font-weight:800; color:var(--accent-gold); margin-bottom:15px; text-align:center;">
          Get Ready... <span id="rec-countin-num" style="color:#ef4444; font-size:2.6rem;">4</span>
        </div>

        <!-- Current Take Preview & Audio Player Box -->
        <div id="rec-active-player-box" style="display:none; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:14px; padding:16px 20px; margin-top:10px; text-align:left;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <div>
              <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--accent-gold); font-weight:700;">Latest Recorded Take</span>
              <div id="rec-take-meta" style="font-size:0.85rem; color:var(--text-main); font-weight:600; margin-top:2px;">Take 1 • 00:15</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-primary" onclick="saveCurrentTakePrompt()" style="font-size:0.8rem; padding:6px 12px;">
                <span>💾</span> Save to Takes Library
              </button>
              <button class="btn btn-secondary" onclick="downloadCurrentTakeAudio()" style="font-size:0.8rem; padding:6px 12px; border-color:var(--accent-cyan); color:var(--accent-cyan);">
                <span>⬇️</span> Download Audio (.webm)
              </button>
            </div>
          </div>
          <audio id="rec-audio-element" controls style="width:100%; height:42px; outline:none; border-radius:8px;"></audio>
        </div>
      </div>

      <!-- Recorded Takes Manager / Library -->
      <div class="recorder-card" style="padding:24px 32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="font-size:1.15rem; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px;">
              <span>📂</span> My Recorded Takes (<span id="rec-takes-count">0</span>)
            </h3>
            <span style="font-size:0.75rem; color:var(--text-muted);">Saved practice recordings for <strong id="rec-user-name-display" style="color:var(--accent-gold);">${profileManager.getActiveProfile().name}</strong></span>
          </div>
          <button class="btn btn-secondary" onclick="clearAllRecordedTakes()" style="font-size:0.75rem; padding:5px 10px; color:#ef4444; border-color:rgba(239,68,68,0.3);">
            <span>🗑️</span> Clear All Takes
          </button>
        </div>

        <div class="rec-list" id="rec-takes-list">
          <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.85rem;">
            No recorded takes yet. Press the big red microphone button above to record your first guitar riff or rhythm progression!
          </div>
        </div>
      </div>
    </div>
  `;

  return tab;
}

export function initRecorderTab(): void {
  if (recorderTabInitialized) return;
  recorderTabInitialized = true;

  const canvas = document.getElementById('rec-visualizer-canvas') as HTMLCanvasElement;
  if (canvas) {
    audioRecorder.setVisualizerCanvas(canvas);
    audioRecorder.drawIdleWaveform();
  }

  // Set up callbacks
  audioRecorder.setStateChangeCallback(handleRecorderStateChange);
  audioRecorder.setCountInCallback(handleCountInUpdate);
  audioRecorder.setCompleteCallback(handleRecordingComplete);

  // Initial render
  renderRecordedTakesList();
  updateUserDisplay();
}

function handleRecorderStateChange(partial: Partial<import('../types/recorder').AudioRecorderState>): void {
  const state = audioRecorder.getState();

  // Update record button
  const btn = document.getElementById('rec-btn-main');
  const icon = document.getElementById('rec-btn-icon');
  const badgeDot = document.getElementById('rec-status-dot');
  const badgeText = document.getElementById('rec-status-text');
  const placeholder = document.getElementById('rec-canvas-placeholder');

  if (state.isRecording) {
    btn?.classList.add('recording-now');
    if (icon) icon.textContent = '⏹️';
    if (badgeDot) badgeDot.textContent = '🔴';
    if (badgeText) badgeText.textContent = 'Recording Take...';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    btn?.classList.remove('recording-now');
    if (icon) icon.textContent = '🎙️';
    if (badgeDot) badgeDot.textContent = state.recordedBlob ? '🟢' : '⚪';
    if (badgeText) badgeText.textContent = state.recordedBlob ? 'Take Finished' : 'Ready to Record';
    if (placeholder && !state.recordedBlob) placeholder.style.display = 'block';
  }

  // Update timer
  if (partial.duration !== undefined) {
    const readout = document.getElementById('rec-timer-readout');
    if (readout) {
      const totalSec = Math.floor(partial.duration / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const tenths = Math.floor((partial.duration % 1000) / 100);
      readout.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}.${tenths}`;
    }
  }

  // Show/hide player box when recording stops
  if (state.recordedBlob && !state.isRecording) {
    const playerBox = document.getElementById('rec-active-player-box');
    if (playerBox) playerBox.style.display = 'block';
  }
}

function handleCountInUpdate(beat: number, total: number): void {
  const overlay = document.getElementById('rec-countin-overlay');
  const numEl = document.getElementById('rec-countin-num');

  if (beat > 0) {
    if (overlay) overlay.style.display = 'block';
    if (numEl) numEl.textContent = String(beat);
  } else if (beat === 0) {
    if (numEl) {
      numEl.textContent = 'GO!';
      numEl.style.color = '#ef4444';
      numEl.style.fontSize = '2.6rem';
    }
  } else {
    if (overlay) overlay.style.display = 'none';
    if (numEl) {
      numEl.textContent = String(total);
      numEl.style.color = '#ef4444';
      numEl.style.fontSize = '2.6rem';
    }
  }
}

function handleRecordingComplete(_blob: Blob, durationMs: number): void {
  const audioEl = document.getElementById('rec-audio-element') as HTMLAudioElement;
  const playerBox = document.getElementById('rec-active-player-box');
  const metaEl = document.getElementById('rec-take-meta');
  const url = audioRecorder.getRecordedUrl();

  if (audioEl && url) {
    audioEl.src = url;
    audioEl.loop = audioRecorder.isJamLoopActive();
  }
  if (playerBox) playerBox.style.display = 'block';

  const totalSec = Math.round(durationMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const durStr = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

  if (metaEl) {
    metaEl.textContent = `Latest Take • Duration ${durStr}`;
  }

  // The recorder auto-saves, just refresh the list
  renderRecordedTakesList();
}

function updateUserDisplay(): void {
  const profile = profileManager.getActiveProfile();
  const userEl = document.getElementById('rec-user-name-display');
  if (userEl) userEl.textContent = profile.name;
}

function renderRecordedTakesList(): void {
  const listEl = document.getElementById('rec-takes-list');
  const countEl = document.getElementById('rec-takes-count');
  if (!listEl) return;

  const takes = profileManager.getTakesForActiveUser();
  if (countEl) countEl.textContent = String(takes.length);

  if (takes.length === 0) {
    const profile = profileManager.getActiveProfile();
    listEl.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.85rem;">
        No recorded takes yet for ${profile.name}. Press the red microphone button above to record your guitar!
      </div>
    `;
    return;
  }

  listEl.innerHTML = takes.map(t => `
    <div class="rec-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border-light); border-radius:12px; padding:12px 16px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:36px; height:36px; border-radius:50%; background:rgba(239,68,68,0.15); border:1px solid #ef4444; display:flex; align-items:center; justify-content:center; font-size:1rem;">
          🎵
        </div>
        <div>
          <div style="font-size:0.92rem; font-weight:700; color:#fff;">${t.title}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${t.date} at ${t.timestamp} • ${t.duration}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn btn-secondary" onclick="playSavedTake('${t.id}')" style="font-size:0.78rem; padding:6px 12px; border-color:var(--accent-gold); color:var(--accent-gold);">
          ▶️ Play Take
        </button>
        <button class="btn btn-secondary" onclick="downloadSavedTake('${t.id}')" style="font-size:0.78rem; padding:6px 10px; border-color:var(--accent-cyan); color:var(--accent-cyan);" title="Download Audio File">
          ⬇️ Download
        </button>
        <button class="btn btn-secondary" onclick="deleteSavedTake('${t.id}')" style="font-size:0.78rem; padding:6px 10px; color:#ef4444; border-color:rgba(239,68,68,0.3);" title="Delete Take">
          🗑️
        </button>
      </div>
    </div>
  `).join('');
}

// ============================================================================
// Global Functions (for onclick handlers)
// ============================================================================

declare global {
  interface Window {
    toggleRecordCountIn: () => void;
    toggleAudioLoopMode: () => void;
    toggleMainAudioRecording: () => void;
    playSavedTake: (id: string) => void;
    downloadSavedTake: (id: string) => void;
    downloadCurrentTakeAudio: () => void;
    saveCurrentTakePrompt: () => void;
    deleteSavedTake: (id: string) => void;
    clearAllRecordedTakes: () => void;
  }
}

window.toggleRecordCountIn = () => {
  const enabled = !audioRecorder.isCountInActive();
  audioRecorder.setCountIn(enabled);

  const statusEl = document.getElementById('rec-countin-status');
  const iconEl = document.getElementById('rec-countin-icon');
  if (statusEl) {
    statusEl.textContent = enabled ? '4-Beats' : 'Off';
    statusEl.style.color = enabled ? 'var(--accent-gold)' : 'var(--text-muted)';
  }
  if (iconEl) iconEl.textContent = enabled ? '🔔' : '⏱️';
};

window.toggleAudioLoopMode = () => {
  const enabled = !audioRecorder.isJamLoopActive();
  audioRecorder.setJamLoop(enabled);

  const statusEl = document.getElementById('rec-loop-status');
  const audioEl = document.getElementById('rec-audio-element') as HTMLAudioElement;

  if (statusEl) {
    statusEl.textContent = enabled ? 'ON' : 'Off';
    statusEl.style.color = enabled ? 'var(--accent-cyan)' : 'var(--text-muted)';
  }
  if (audioEl) {
    audioEl.loop = enabled;
  }
};

window.toggleMainAudioRecording = () => {
  if (audioRecorder.isRecording()) {
    audioRecorder.stopRecording();
  } else {
    audioRecorder.startRecording();
  }
};

window.playSavedTake = (takeId: string) => {
  const takes = profileManager.getTakesForActiveUser();
  const take = takes.find(x => x.id === takeId);
  if (!take || !take.dataUrl) return;

  const audioEl = document.getElementById('rec-audio-element') as HTMLAudioElement;
  const playerBox = document.getElementById('rec-active-player-box');
  const metaEl = document.getElementById('rec-take-meta');

  if (audioEl) {
    audioEl.src = take.dataUrl;
    audioEl.loop = audioRecorder.isJamLoopActive();
    audioEl.play();
  }
  if (playerBox) playerBox.style.display = 'block';
  if (metaEl) metaEl.textContent = `${take.title} • Duration ${take.duration}`;
};

window.downloadSavedTake = (takeId: string) => {
  const takes = profileManager.getTakesForActiveUser();
  const take = takes.find(x => x.id === takeId);
  if (!take || !take.dataUrl) return;

  const a = document.createElement('a');
  a.href = take.dataUrl;
  a.download = (take.title.replace(/[^a-zA-Z0-9]/g, '_')) + '.webm';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.downloadCurrentTakeAudio = () => {
  const url = audioRecorder.getRecordedUrl();
  if (!url) return;

  const a = document.createElement('a');
  a.href = url;
  a.download = 'Guitar_Studio_Take_' + Date.now() + '.webm';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.saveCurrentTakePrompt = () => {
  const takes = profileManager.getTakesForActiveUser();
  const defaultName = 'Acoustic Take #' + (takes.length + 1);
  const name = prompt('Enter a name for this take:', defaultName);
  if (!name) return;

  if (takes.length > 0) {
    takes[0].title = name;
    profileManager.saveTakesForActiveUser(takes);
    renderRecordedTakesList();
    alert('Take saved as "' + name + '"!');
  }
};

window.deleteSavedTake = (takeId: string) => {
  profileManager.deleteTake(takeId);
  renderRecordedTakesList();
};

window.clearAllRecordedTakes = () => {
  const profile = profileManager.getActiveProfile();
  if (!confirm('Are you sure you want to delete all recorded takes for ' + profile.name + '?')) return;
  profileManager.clearAllTakes();
  renderRecordedTakesList();
};