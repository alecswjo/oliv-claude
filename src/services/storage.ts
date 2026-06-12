import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Versioned JSON persistence over AsyncStorage — spec §8 / NFR-3.
 * Corrupt or missing data resolves to `undefined`; callers keep defaults.
 * Write failures (e.g. the ~5MB web localStorage quota) are surfaced once per
 * key via `onSaveError` — silent failure here means silent data loss.
 */

type SaveErrorListener = (name: string, error: unknown) => void;
let saveErrorListener: SaveErrorListener | null = null;
const notifiedKeys = new Set<string>();

/** Wire a UI surface (toast) for persistence failures; fires once per key. */
export function onSaveError(listener: SaveErrorListener | null): void {
  saveErrorListener = listener;
  notifiedKeys.clear();
}

export const STORAGE_VERSION = 'v1';

export function storageKey(name: string): string {
  return `oliv/${STORAGE_VERSION}/${name}`;
}

export async function loadJson<T>(name: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(name));
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[oliv:storage] load of "${name}" failed (corrupt?)`, error);
    return undefined;
  }
}

export async function saveJson(name: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(name), JSON.stringify(value));
    notifiedKeys.delete(name); // a later success re-arms the warning
  } catch (error) {
    // In-memory state remains the source of truth for the session, but the
    // user must know the device copy is stale (web quota, disk full).
    // eslint-disable-next-line no-console
    console.warn(`[oliv:storage] save of "${name}" failed`, error);
    if (saveErrorListener && !notifiedKeys.has(name)) {
      notifiedKeys.add(name);
      saveErrorListener(name, error);
    }
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
