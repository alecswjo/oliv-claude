import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Versioned JSON persistence over AsyncStorage — spec §8 / NFR-3.
 * Corrupt or missing data resolves to `undefined`; callers keep defaults.
 */

export const STORAGE_VERSION = 'v1';

export function storageKey(name: string): string {
  return `oliv/${STORAGE_VERSION}/${name}`;
}

export async function loadJson<T>(name: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(name));
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function saveJson(name: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    // Persistence is best-effort; in-memory state remains the source of truth
    // for the session and the next successful write self-heals.
  }
}

export async function removeKey(name: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(name));
  } catch {
    // ignore
  }
}

export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith('oliv/')));
  } catch {
    // ignore
  }
}
