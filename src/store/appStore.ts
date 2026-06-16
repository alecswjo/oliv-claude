import { create } from 'zustand';
import { loadJson } from '@/services/storage';
import { createPersister } from './persist';
import { useMealStore } from './mealStore';
import { useSocialStore } from './socialStore';
import { useUserStore } from './userStore';

/** App-level settings & hydration coordinator. */

const STORE_NAME = 'app';

export type Units = 'metric' | 'imperial';

interface PersistedApp {
  units: Units;
}

interface AppState extends PersistedApp {
  hydrated: boolean;

  setUnits(units: Units): void;
  hydrate(): Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => {
  const persist = createPersister<PersistedApp>(STORE_NAME, () => ({ units: get().units }));

  return {
    units: 'imperial', // US-first default (lb/ft); users can switch in Settings
    hydrated: false,

    setUnits(units) {
      set({ units });
      persist();
    },

    async hydrate() {
      const saved = await loadJson<PersistedApp>(STORE_NAME);
      if (saved) set({ units: saved.units });
      set({ hydrated: true });
    },
  };
});

/** Root hydration gate — spec §3.1 of the implementation plan / NFR-3. */
export async function hydrateAll(): Promise<void> {
  await Promise.all([
    useAppStore.getState().hydrate(),
    useUserStore.getState().hydrate(),
    useMealStore.getState().hydrate(),
    useSocialStore.getState().hydrate(),
  ]);
  useSocialStore.getState().seedIfNeeded();
}

/** Full local reset — Settings "reset demo data" (spec §F7). */
export function resetAllStores(): void {
  useMealStore.getState().reset();
  useSocialStore.getState().reset();
  useUserStore.getState().reset();
  // Re-seed immediately: without this the Social tab stays empty (with a
  // misleading "you follow everyone" state) until the next full app launch.
  useSocialStore.getState().seedIfNeeded();
}
