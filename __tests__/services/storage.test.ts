import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAll, loadJson, saveJson, storageKey } from '@/services/storage';

describe('storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('namespaces keys with the app prefix and version', () => {
    expect(storageKey('meals')).toBe('oliv/v1/meals');
  });

  it('round-trips JSON values', async () => {
    await saveJson('meals', [{ id: 'm1', calories: 500 }]);
    const loaded = await loadJson<{ id: string; calories: number }[]>('meals');
    expect(loaded).toEqual([{ id: 'm1', calories: 500 }]);
  });

  it('returns undefined for missing keys', async () => {
    expect(await loadJson('nope')).toBeUndefined();
  });

  it('returns undefined (not a crash) for corrupt JSON', async () => {
    await AsyncStorage.setItem(storageKey('meals'), '{corrupt!!');
    expect(await loadJson('meals')).toBeUndefined();
  });

  it('clearAll removes only oliv-prefixed keys', async () => {
    await saveJson('meals', [1]);
    await AsyncStorage.setItem('someoneelse/key', 'keepme');
    await clearAll();
    expect(await loadJson('meals')).toBeUndefined();
    expect(await AsyncStorage.getItem('someoneelse/key')).toBe('keepme');
  });
});
