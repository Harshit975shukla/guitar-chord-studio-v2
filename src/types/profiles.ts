/**
 * User Profile Types
 */

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  level: 'Beginner' | 'Intermediate' | 'Pro Guitarist';
  pin?: string;
  createdAt: number;
  stats: ProfileStats;
}

export interface ProfileStats {
  practiceSeconds: number;
  notesDetected: number;
  chordsDetected: number;
  quizHighScore: number;
  streakDays: number;
  lastPracticeDate: string;
}

export interface RecordedTake {
  id: string;
  title: string;
  duration: string;
  timestamp: string;
  date: string;
  dataUrl: string;
}

export const AVATAR_OPTIONS = [
  { value: '🎸', label: 'Classic Acoustic' },
  { value: '⚡', label: 'Electric Rocker' },
  { value: '🤠', label: 'Folk / Country' },
  { value: '🎼', label: 'Fingerstyle Composer' },
  { value: '🦊', label: 'Jamming Fox' },
  { value: '🚀', label: 'Space Shredder' },
] as const;

export const LEVEL_OPTIONS = [
  'Beginner',
  'Intermediate',
  'Pro Guitarist',
] as const;

export const DEFAULT_GUEST_PROFILE: UserProfile = {
  id: 'guest',
  name: 'Guest Guitarist',
  avatar: '🎸',
  level: 'Beginner',
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

export const STORAGE_KEYS = {
  profiles: 'guitar_studio_profiles',
  activeId: 'guitar_studio_active_id',
  takesPrefix: 'guitar_takes_',
} as const;