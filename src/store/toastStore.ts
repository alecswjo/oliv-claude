import { create } from 'zustand';

/**
 * Transient feedback messages ("Profile saved", "Meal deleted"). Action
 * buttons must visibly do something; the host renders in the root layout.
 */

interface ToastState {
  message: string | null;
  /** Bumped on every show() so repeat messages re-trigger the host animation. */
  seq: number;
  show(message: string): void;
  clear(): void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  seq: 0,

  show(message) {
    set((state) => ({ message, seq: state.seq + 1 }));
  },

  clear() {
    set({ message: null });
  },
}));

export function showToast(message: string): void {
  useToastStore.getState().show(message);
}
