/**
 * Profile Modal UI Component
 * Handles the multi-user profile modal with tabs
 */

import { profileManager } from '../../storage/profiles';
import { UserProfile } from '../../types/profiles';

interface ModalTab {
  id: string;
  label: string;
  icon: string;
}

const MODAL_TABS: ModalTab[] = [
  { id: 'active', label: 'Active Profile & Stats', icon: '👤' },
  { id: 'switch', label: 'Switch / Add Account', icon: '👥' },
  { id: 'backup', label: 'Cloud & Backup', icon: '💾' },
];

let modalElement: HTMLElement | null = null;
let activeTab: string = 'active';
let unsubscribe: (() => void) | null = null;

export function createProfileModal(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'user-profile-modal';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.3rem;">🎸</span>
          <div>
            <h3 style="font-size:1.1rem; font-weight:800; color:#fff;">Guitarist Profiles & Multi-User Studio</h3>
            <span style="font-size:0.75rem; color:var(--text-muted);">Switch accounts, track practice stats, and save individual songbooks</span>
          </div>
        </div>
        <button class="btn btn-secondary" onclick="closeUserProfileModal()" style="padding:4px 10px; font-size:1rem; border-radius:50%;">✕</button>
      </div>

      <div class="modal-body">
        <div class="modal-tab-row" id="profile-modal-tabs"></div>
        
        <div id="modal-pane-active" class="modal-pane"></div>
        <div id="modal-pane-switch" class="modal-pane" style="display:none;"></div>
        <div id="modal-pane-backup" class="modal-pane" style="display:none;"></div>
      </div>
    </div>
  `;

  modalElement = modal;
  setupModalTabs();
  setupClickOutside(modal);
  
  // Subscribe to profile changes
  unsubscribe = profileManager.subscribe(() => {
    if (modalElement && modalElement.classList.contains('active')) {
      renderCurrentTab();
    }
  });

  return modal;
}

export function destroyProfileModal(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

function setupModalTabs(): void {
  const container = document.getElementById('profile-modal-tabs');
  if (!container) return;

  container.innerHTML = MODAL_TABS.map(tab => `
    <button class="modal-tab-btn ${tab.id === activeTab ? 'active' : ''}" 
            id="modal-tab-btn-${tab.id}" 
            onclick="switchUserProfileTab('${tab.id}')">
      <span>${tab.icon}</span> ${tab.label}
    </button>
  `).join('');
}

function setupClickOutside(modal: HTMLElement): void {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeUserProfileModal();
    }
  });
}

function renderCurrentTab(): void {
  switch (activeTab) {
    case 'active':
      renderActiveProfileView();
      break;
    case 'switch':
      renderProfilesList();
      break;
    case 'backup':
      renderBackupPane();
      break;
  }
}

export function openUserProfileModal(): void {
  if (!modalElement) {
    document.body.appendChild(createProfileModal());
  }
  modalElement!.classList.add('active');
  activeTab = 'active';
  updateTabUI();
  renderCurrentTab();
}

export function closeUserProfileModal(): void {
  if (modalElement) {
    modalElement.classList.remove('active');
  }
}

export function switchUserProfileTab(tabId: string): void {
  activeTab = tabId;
  updateTabUI();
  renderCurrentTab();
}

function updateTabUI(): void {
  MODAL_TABS.forEach(tab => {
    const btn = document.getElementById(`modal-tab-btn-${tab.id}`);
    const pane = document.getElementById(`modal-pane-${tab.id}`);
    if (btn) btn.classList.toggle('active', tab.id === activeTab);
    if (pane) pane.style.display = tab.id === activeTab ? 'block' : 'none';
  });
}

function renderActiveProfileView(): void {
  const pane = document.getElementById('modal-pane-active');
  if (!pane) return;

  const profile = profileManager.getActiveProfile();
  const stats = profile.stats;
  const mins = Math.floor((stats.practiceSeconds || 0) / 60);
  const timeStr = mins >= 60 
    ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
    : `${mins}m`;

  pane.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:18px; padding:16px 20px;">
      <div id="modal-active-avatar" style="font-size:2.4rem; width:56px; height:56px; border-radius:50%; background:rgba(255,179,0,0.15); border:2px solid var(--accent-gold); display:flex; align-items:center; justify-content:center;">
        ${profile.avatar}
      </div>
      <div style="flex:1;">
        <div style="display:flex; align-items:center; gap:8px;">
          <h4 id="modal-active-name" style="font-size:1.2rem; font-weight:800; color:#fff;">${profile.name}</h4>
          <span class="user-level-badge" id="modal-active-level" style="background:rgba(255,179,0,0.15); border:1px solid var(--accent-gold); padding:2px 8px; border-radius:10px;">${profile.level}</span>
        </div>
        <p style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
          Member since <span id="modal-active-date">${new Date(profile.createdAt).toLocaleDateString()}</span> • Status: <strong style="color:var(--accent-emerald);">Active Session</strong>
        </p>
      </div>
      <button class="btn btn-secondary" onclick="logoutToGuest()" style="font-size:0.75rem; padding:6px 12px; color:var(--accent-gold); border-color:var(--border-subtle);">
        <span>🚪</span> Log Out
      </button>
    </div>

    <div class="stats-grid-4">
      <div class="stat-card-mini">
        <div class="stat-num-mini" id="stat-practice-time">${timeStr}</div>
        <div class="stat-label-mini">Practice Time</div>
      </div>
      <div class="stat-card-mini">
        <div class="stat-num-mini" id="stat-notes-detected">${(stats.notesDetected || 0) + (stats.chordsDetected || 0)}</div>
        <div class="stat-label-mini">Notes & Chords Plucked</div>
      </div>
      <div class="stat-card-mini">
        <div class="stat-num-mini" id="stat-quiz-score">${stats.quizHighScore || 0}</div>
        <div class="stat-label-mini">Quiz High Score</div>
      </div>
      <div class="stat-card-mini">
        <div class="stat-num-mini" id="stat-takes-count">${profileManager.getTakesForActiveUser().length}</div>
        <div class="stat-label-mini">Recorded Takes</div>
      </div>
    </div>

    <div style="margin-top:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-light); border-radius:14px; padding:14px 18px;">
      <div style="font-size:0.78rem; font-weight:700; color:var(--accent-gold); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Edit Current Profile</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <input type="text" id="edit-profile-name" class="song-search-input" style="flex:1; min-width:140px; padding:6px 12px; font-size:0.85rem;" placeholder="Display Name" value="${profile.name}">
        <select id="edit-profile-level" class="song-select-dropdown" style="padding:6px 12px; font-size:0.85rem;">
          ${['Beginner', 'Intermediate', 'Pro Guitarist'].map(l => `<option value="${l}" ${l === profile.level ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select id="edit-profile-avatar" class="song-select-dropdown" style="padding:6px 12px; font-size:0.85rem;">
          ${['🎸', '⚡', '🤠', '🎼', '🦊', '🚀'].map(a => `<option value="${a}" ${a === profile.avatar ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="saveActiveProfileEdits()" style="font-size:0.8rem; padding:6px 14px;">Save</button>
      </div>
    </div>
  `;
}

function renderProfilesList(): void {
  const container = document.getElementById('modal-pane-switch');
  if (!container) return;

  const profiles = profileManager.getAllProfiles();
  const activeId = profileManager.getActiveProfileId();

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--accent-gold); font-weight:700;">Guitarists On This Device</span>
      <div id="profiles-list-container" style="margin-top:8px;">
        ${profiles.map(p => {
          const isActive = p.id === activeId;
          const mins = Math.floor(((p.stats || {}).practiceSeconds || 0) / 60);
          const hasPin = !!p.pin;
          return `
            <div class="profile-list-item ${isActive ? 'active-profile' : ''}">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:1.8rem;">${p.avatar || '🎸'}</span>
                <div>
                  <div style="font-size:0.95rem; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                    ${p.name}
                    ${isActive ? '<span style="font-size:0.65rem; background:var(--accent-gold); color:#000; padding:1px 6px; border-radius:8px; font-weight:800;">ACTIVE</span>' : ''}
                    ${hasPin ? '<span title="PIN Protected" style="font-size:0.75rem;">🔒</span>' : ''}
                  </div>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${p.level} • ${mins} mins practiced</span>
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                ${!isActive ? `<button class="btn btn-primary" onclick="switchActiveProfile('${p.id}')" style="font-size:0.78rem; padding:5px 12px;">Log In</button>` : ''}
                ${p.id !== 'guest' && profiles.length > 1 ? `<button class="btn btn-secondary" onclick="deleteUserProfile('${p.id}')" style="font-size:0.75rem; padding:5px 8px; color:#ef4444; border-color:rgba(239,68,68,0.3);" title="Delete Profile">🗑️</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:16px; padding:18px;">
      <h4 style="font-size:0.95rem; font-weight:800; color:#fff; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <span>➕</span> Create New Guitarist Profile
      </h4>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Guitarist Name</label>
          <input type="text" id="new-profile-name" class="song-search-input" placeholder="e.g. Alex, Maya, John..." style="width:100%; padding:8px 12px; font-size:0.85rem;">
        </div>
        <div>
          <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Skill Level</label>
          <select id="new-profile-level" class="song-select-dropdown" style="width:100%; padding:8px 12px; font-size:0.85rem;">
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Pro Guitarist">Pro Guitarist</option>
          </select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Avatar</label>
          <select id="new-profile-avatar" class="song-select-dropdown" style="width:100%; padding:8px 12px; font-size:0.85rem;">
            <option value="🎸">🎸 Classic Acoustic</option>
            <option value="⚡">⚡ Electric Rocker</option>
            <option value="🤠">🤠 Folk / Country</option>
            <option value="🎼">🎼 Fingerstyle Composer</option>
            <option value="🦊">🦊 Jamming Fox</option>
            <option value="🚀">🚀 Space Shredder</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">PIN (Optional, 4 digits)</label>
          <input type="password" id="new-profile-pin" class="song-search-input" placeholder="e.g. 1234" maxlength="4" style="width:100%; padding:8px 12px; font-size:0.85rem;">
        </div>
      </div>
      <button class="btn btn-primary" onclick="createNewUserProfile()" style="width:100%; font-size:0.85rem; padding:10px;">
        Create Profile & Log In
      </button>
    </div>
  `;
}

function renderBackupPane(): void {
  const container = document.getElementById('modal-pane-backup');
  if (!container) return;

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h4 style="font-size:0.95rem; font-weight:800; color:#fff; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <span>⬇️</span> Export Current Profile & Takes
      </h4>
      <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">
        Download a JSON file containing your profile, stats, and all recorded takes.
        Can be imported on another device or browser.
      </p>
      <button class="btn btn-primary" onclick="exportActiveUserProfileData()" style="width:100%;">
        <span>💾</span> Download Backup (.json)
      </button>
    </div>

    <div style="margin-bottom:20px; padding-top:20px; border-top:1px solid var(--border-light);">
      <h4 style="font-size:0.95rem; font-weight:800; color:#fff; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <span>⬆️</span> Import Profile & Takes
      </h4>
      <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">
        Select a previously exported backup file to restore a profile and its takes.
      </p>
      <input type="file" id="import-profile-file" accept=".json" style="display:none;" onchange="importUserProfileData(event)">
      <button class="btn btn-secondary" onclick="document.getElementById('import-profile-file').click()" style="width:100%;">
        <span>📁</span> Choose Backup File
      </button>
    </div>

    <div style="padding-top:20px; border-top:1px solid var(--border-light);">
      <h4 style="font-size:0.95rem; font-weight:800; color:#fff; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <span>☁️</span> Cloud Sync (Coming Soon)
      </h4>
      <p style="font-size:0.8rem; color:var(--text-muted);">
        Automatic cloud backup and cross-device sync will be available in a future update.
        For now, use the Export/Import buttons above for manual backup.
      </p>
    </div>
  `;
}

// ============================================================================
// Global Functions (for onclick handlers)
// ============================================================================

declare global {
  interface Window {
    saveActiveProfileEdits: () => void;
    createNewUserProfile: () => void;
    switchActiveProfile: (id: string) => void;
    logoutToGuest: () => void;
    deleteUserProfile: (id: string) => void;
    exportActiveUserProfileData: () => void;
    importUserProfileData: (event: Event) => void;
  }
}

window.saveActiveProfileEdits = () => {
  const name = (document.getElementById('edit-profile-name') as HTMLInputElement)?.value?.trim();
  const level = (document.getElementById('edit-profile-level') as HTMLSelectElement)?.value;
  const avatar = (document.getElementById('edit-profile-avatar') as HTMLSelectElement)?.value;

  if (!name) {
    alert('Please enter a display name.');
    return;
  }

  profileManager.updateActiveProfile({ name, level: level as UserProfile['level'], avatar });
  alert('Profile updated successfully!');
  renderActiveProfileView();
};

window.createNewUserProfile = () => {
  const name = (document.getElementById('new-profile-name') as HTMLInputElement)?.value?.trim();
  const level = (document.getElementById('new-profile-level') as HTMLSelectElement)?.value;
  const avatar = (document.getElementById('new-profile-avatar') as HTMLSelectElement)?.value;
  const pin = (document.getElementById('new-profile-pin') as HTMLInputElement)?.value?.trim();

  if (!name) {
    alert('Please enter a guitarist name.');
    return;
  }

  profileManager.createProfile(name, level as UserProfile['level'], avatar, pin || undefined);
  
  (document.getElementById('new-profile-name') as HTMLInputElement).value = '';
  (document.getElementById('new-profile-pin') as HTMLInputElement).value = '';

  activeTab = 'active';
  updateTabUI();
  renderCurrentTab();
  alert('Welcome to Guitar Studio, ' + name + '! Your profile has been created.');
};

window.switchActiveProfile = (targetId: string) => {
  const target = profileManager.getAllProfiles().find(p => p.id === targetId);
  if (!target) return;

  let pinAttempt: string | undefined;
  if (target.pin) {
    const input = prompt('Enter 4-digit PIN for ' + target.name + ':');
    if (!input) return;
    pinAttempt = input;
  }

  if (profileManager.switchProfile(targetId, pinAttempt)) {
    activeTab = 'active';
    updateTabUI();
    renderCurrentTab();
  } else {
    alert('Incorrect PIN.');
  }
};

window.logoutToGuest = () => {
  profileManager.logoutToGuest();
  activeTab = 'active';
  updateTabUI();
  renderCurrentTab();
};

window.deleteUserProfile = (profileId: string) => {
  const p = profileManager.getAllProfiles().find(x => x.id === profileId);
  if (!p || p.id === 'guest') return;
  if (!confirm('Are you sure you want to delete profile "' + p.name + '"?')) return;

  profileManager.deleteProfile(profileId);
  renderProfilesList();
};

window.exportActiveUserProfileData = () => {
  const jsonStr = profileManager.exportActiveProfile();
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const profile = profileManager.getActiveProfile();
  a.href = url;
  a.download = 'guitar_studio_' + (profile.name.replace(/[^a-zA-Z0-9]/g, '_')) + '_backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.importUserProfileData = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const result = profileManager.importProfile(e.target?.result as string);
    if (result.success) {
      alert('Successfully imported profile for ' + result.profile?.name + '!');
      activeTab = 'active';
      updateTabUI();
      renderCurrentTab();
    } else {
      alert('Import failed: ' + result.error);
    }
  };
  reader.readAsText(file);
  
  // Reset file input
  (event.target as HTMLInputElement).value = '';
};