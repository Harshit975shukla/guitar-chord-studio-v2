/**
 * User Profile Storage Manager
 * Handles multi-user profiles, active session, and practice stats
 */

import {
  UserProfile,
  RecordedTake,
  DEFAULT_GUEST_PROFILE,
  STORAGE_KEYS,
  AVATAR_OPTIONS,
  LEVEL_OPTIONS,
} from '../types/profiles';

class ProfileManager {
  private profiles: UserProfile[] = [];
  private activeProfileId: string = 'guest';
  private practiceTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
    this.startPracticeTracking();
  }

  // ============================================================================
  // Storage
  // ============================================================================

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.profiles);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.profiles = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load profiles:', e);
    }

    if (this.profiles.length === 0) {
      this.profiles = [{ ...DEFAULT_GUEST_PROFILE }];
      this.saveToStorage();
    }

    try {
      const savedActive = localStorage.getItem(STORAGE_KEYS.activeId);
      if (savedActive && this.profiles.some(p => p.id === savedActive)) {
        this.activeProfileId = savedActive;
      } else {
        this.activeProfileId = this.profiles[0].id;
      }
    } catch (e) {
      this.activeProfileId = this.profiles[0].id;
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(this.profiles));
      localStorage.setItem(STORAGE_KEYS.activeId, this.activeProfileId);
    } catch (e) {
      console.warn('Could not save profiles:', e);
    }
    this.notifyListeners();
  }

  // ============================================================================
  // Profile CRUD
  // ============================================================================

  getAllProfiles(): UserProfile[] {
    return [...this.profiles];
  }

  getActiveProfile(): UserProfile {
    const p = this.profiles.find(x => x.id === this.activeProfileId);
    return p || this.profiles[0] || DEFAULT_GUEST_PROFILE;
  }

  getActiveProfileId(): string {
    return this.activeProfileId;
  }

  createProfile(
    name: string,
    level: UserProfile['level'] = 'Beginner',
    avatar: string = '🎸',
    pin?: string
  ): UserProfile {
    const newProfile: UserProfile = {
      id: `profile_${Date.now()}`,
      name: name.trim(),
      avatar,
      level,
      pin: pin || undefined,
      createdAt: Date.now(),
      stats: {
        practiceSeconds: 0,
        notesDetected: 0,
        chordsDetected: 0,
        quizHighScore: 0,
        streakDays: 1,
        lastPracticeDate: new Date().toISOString().slice(0, 10),
      },
    };

    this.profiles.push(newProfile);
    this.activeProfileId = newProfile.id;
    this.saveToStorage();
    return newProfile;
  }

  switchProfile(targetId: string, pinAttempt?: string): boolean {
    const target = this.profiles.find(p => p.id === targetId);
    if (!target) return false;

    if (target.pin && target.pin !== pinAttempt) {
      return false;
    }

    this.activeProfileId = target.id;
    this.saveToStorage();
    return true;
  }

  updateActiveProfile(updates: Partial<Pick<UserProfile, 'name' | 'level' | 'avatar'>>): void {
    const profile = this.getActiveProfile();
    Object.assign(profile, updates);
    this.saveToStorage();
  }

  deleteProfile(profileId: string): boolean {
    if (profileId === 'guest') return false;
    if (this.profiles.length <= 1) return false;

    const wasActive = this.activeProfileId === profileId;
    this.profiles = this.profiles.filter(p => p.id !== profileId);

    if (wasActive) {
      this.activeProfileId = this.profiles[0].id;
    }

    this.saveToStorage();
    return true;
  }

  logoutToGuest(): void {
    let guest = this.profiles.find(p => p.id === 'guest');
    if (!guest) {
      guest = { ...DEFAULT_GUEST_PROFILE };
      this.profiles.unshift(guest);
    }
    this.activeProfileId = 'guest';
    this.saveToStorage();
  }

  // ============================================================================
  // Stats & Practice Tracking
  // ============================================================================

  private startPracticeTracking(): void {
    if (this.practiceTimer) clearInterval(this.practiceTimer);

    this.practiceTimer = setInterval(() => {
      // We'll check global state from main.ts via a callback
      if (ProfileManager.isPracticing) {
        const profile = this.getActiveProfile();
        profile.stats.practiceSeconds = (profile.stats.practiceSeconds || 0) + 1;

        // Check for streak
        const today = new Date().toISOString().slice(0, 10);
        if (profile.stats.lastPracticeDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          if (profile.stats.lastPracticeDate === yesterday) {
            profile.stats.streakDays = (profile.stats.streakDays || 0) + 1;
          } else {
            profile.stats.streakDays = 1;
          }
          profile.stats.lastPracticeDate = today;
        }

        this.saveToStorage();
      }
    }, 1000);
  }

  static isPracticing = false;

  recordPluckEvent(type: 'note' | 'chord'): void {
    const profile = this.getActiveProfile();
    if (type === 'chord') {
      profile.stats.chordsDetected = (profile.stats.chordsDetected || 0) + 1;
    } else {
      profile.stats.notesDetected = (profile.stats.notesDetected || 0) + 1;
    }
    this.saveToStorage();
  }

  updateQuizScore(score: number): void {
    const profile = this.getActiveProfile();
    if (score > (profile.stats.quizHighScore || 0)) {
      profile.stats.quizHighScore = score;
      this.saveToStorage();
    }
  }

  // ============================================================================
  // Backup / Export / Import
  // ============================================================================

  exportActiveProfile(): string {
    const profile = this.getActiveProfile();
    const takes = this.getTakesForActiveUser();
    const data = {
      app: 'GuitarChordStudio',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      profile,
      takes,
    };
    return JSON.stringify(data, null, 2);
  }

  importProfile(jsonString: string): { success: boolean; error?: string; profile?: UserProfile } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.profile || !parsed.profile.name) {
        return { success: false, error: 'Invalid profile backup format' };
      }

      const imported = parsed.profile;
      imported.id = `imported_${Date.now()}`;
      this.profiles.push(imported);
      this.activeProfileId = imported.id;

      if (Array.isArray(parsed.takes) && parsed.takes.length > 0) {
        this.saveTakesForActiveUser(parsed.takes);
      }

      this.saveToStorage();
      return { success: true, profile: imported };
    } catch (err) {
      return { success: false, error: `Parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ============================================================================
  // Takes Management (per profile)
  // ============================================================================

  private getTakesKey(): string {
    return `${STORAGE_KEYS.takesPrefix}${this.activeProfileId}`;
  }

  getTakesForActiveUser(): RecordedTake[] {
    try {
      const saved = localStorage.getItem(this.getTakesKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  saveTakesForActiveUser(takes: RecordedTake[]): void {
    try {
      localStorage.setItem(this.getTakesKey(), JSON.stringify(takes));
    } catch (e) {
      console.warn('Could not save takes:', e);
    }
    this.notifyListeners();
  }

  addTake(take: Omit<RecordedTake, 'id'>): RecordedTake {
    const takes = this.getTakesForActiveUser();
    const newTake: RecordedTake = {
      ...take,
      id: `take_${Date.now()}`,
    };
    takes.unshift(newTake);
    this.saveTakesForActiveUser(takes);
    return newTake;
  }

  deleteTake(takeId: string): void {
    const takes = this.getTakesForActiveUser().filter(t => t.id !== takeId);
    this.saveTakesForActiveUser(takes);
  }

  clearAllTakes(): void {
    this.saveTakesForActiveUser([]);
  }

  // ============================================================================
  // Change Listeners
  // ============================================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }

  // ============================================================================
  // Constants
  // ============================================================================

  static getAvatarOptions() {
    return AVATAR_OPTIONS;
  }

  static getLevelOptions() {
    return LEVEL_OPTIONS;
  }
}

export const profileManager = new ProfileManager();