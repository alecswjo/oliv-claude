import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Auth-session storage. On native, refresh tokens belong in the Keychain —
 * not plaintext AsyncStorage (included in unencrypted backups). SecureStore
 * values should stay under ~2KB, and a Supabase session JSON is larger, so the
 * value is split across chunked keys. Web falls back to AsyncStorage
 * (localStorage) as there is no Keychain.
 */

const CHUNK_SIZE = 1800;

function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const secureChunkedStorage: StorageAdapter = {
  async getItem(key) {
    const SecureStore = await import('expo-secure-store');
    const base = sanitize(key);
    const countRaw = await SecureStore.getItemAsync(`${base}.n`);
    if (countRaw == null) return null;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count <= 0) return null;
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`);
      if (part == null) return null; // torn write — treat as signed out
      value += part;
    }
    return value;
  },

  async setItem(key, value) {
    const SecureStore = await import('expo-secure-store');
    const base = sanitize(key);
    const previous = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0') || 0;
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${base}.${i}`, chunks[i]);
    }
    await SecureStore.setItemAsync(`${base}.n`, String(chunks.length));
    for (let i = chunks.length; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${base}.${i}`).catch(() => {});
    }
  },

  async removeItem(key) {
    const SecureStore = await import('expo-secure-store');
    const base = sanitize(key);
    const count = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? '0') || 0;
    await SecureStore.deleteItemAsync(`${base}.n`).catch(() => {});
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${base}.${i}`).catch(() => {});
    }
  },
};

export const sessionStorage: StorageAdapter =
  Platform.OS === 'web' ? AsyncStorage : secureChunkedStorage;
