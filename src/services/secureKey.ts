import * as SecureStore from 'expo-secure-store';

/** Claude API key custody — SecureStore only, never AsyncStorage (spec §7.2). */

const KEY_NAME = 'oliv.anthropic.apiKey';

export async function getApiKey(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(KEY_NAME);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await clearApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEY_NAME, trimmed);
}

export async function clearApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_NAME);
  } catch {
    // ignore
  }
}

/** Masked rendering for Settings: sk-ant-…abcd */
export function maskKey(key: string): string {
  if (key.length <= 10) return '••••';
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
