import { CHALLENGES } from './theoryContent';

export const APP_STORAGE_KEYS = ['des-challenges', 'des-theme', 'des-sidebar-collapsed', 'des-model-library', 'des-model-autosave'] as const;

export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Keep the app usable without browser storage. */ }
}

export function readCompletedChallenges(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('des-challenges') ?? '[]');
    return new Set(Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string' && CHALLENGES.some(ch => ch.id === id))
      : []);
  } catch { return new Set(); }
}

export function clearAppData() {
  // Only remove this application's data, even when sharing an origin.
  for (const key of APP_STORAGE_KEYS) localStorage.removeItem(key);
}
