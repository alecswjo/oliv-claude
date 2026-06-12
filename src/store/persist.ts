import { saveJson } from '@/services/storage';

/**
 * Microtask-coalesced persistence: synchronous bursts of store updates produce
 * a single AsyncStorage write. No timers → trivially awaitable in tests.
 */
export function createPersister<T>(name: string, select: () => T): () => void {
  let scheduled = false;
  return function schedulePersist() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void saveJson(name, select());
    });
  };
}

/** Await pending microtask persistence (test helper, harmless in app code). */
export async function flushPersistence(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
