import { create } from 'zustand';
import type { PurchasePlan, PurchaseSnapshot } from '@/services/purchases';

export type SubscriptionStatus =
  | 'loading'
  | 'unconfigured'
  | 'free'
  | 'pro';

interface SubscriptionState {
  status: SubscriptionStatus;
  plans: PurchasePlan[];
  busy: boolean;
  error: string | null;
  initialize(userId: string | null): Promise<void>;
  purchase(planId: string, userId: string | null): Promise<boolean>;
  restore(userId: string | null): Promise<boolean>;
  redeem(): Promise<boolean>;
}

function fromSnapshot(snapshot: PurchaseSnapshot) {
  return {
    status: snapshot.configured
      ? snapshot.isPro
        ? ('pro' as const)
        : ('free' as const)
      : ('unconfigured' as const),
    plans: snapshot.plans,
    error: null,
  };
}

export const useSubscriptionStore = create<SubscriptionState>()((set) => ({
  status: 'loading',
  plans: [],
  busy: false,
  error: null,

  async initialize(userId) {
    try {
      const purchases = await import('@/services/purchases');
      set(fromSnapshot(await purchases.initializePurchases(userId)));
    } catch (error) {
      const purchases = await import('@/services/purchases');
      set({
        status: 'free',
        error: purchases.purchaseErrorMessage(error),
      });
    }
  },

  async purchase(planId, userId) {
    set({ busy: true, error: null });
    try {
      const purchases = await import('@/services/purchases');
      const snapshot = await purchases.purchasePlan(planId, userId);
      set({ ...fromSnapshot(snapshot), busy: false });
      return snapshot.isPro;
    } catch (error) {
      const purchases = await import('@/services/purchases');
      set({ busy: false, error: purchases.purchaseErrorMessage(error) });
      return false;
    }
  },

  async restore(userId) {
    set({ busy: true, error: null });
    try {
      const purchases = await import('@/services/purchases');
      const snapshot = await purchases.restorePurchases(userId);
      set({ ...fromSnapshot(snapshot), busy: false });
      return snapshot.isPro;
    } catch (error) {
      const purchases = await import('@/services/purchases');
      set({ busy: false, error: purchases.purchaseErrorMessage(error) });
      return false;
    }
  },

  async redeem() {
    set({ busy: true, error: null });
    try {
      const purchases = await import('@/services/purchases');
      await purchases.presentOfferCode();
      set({ busy: false });
      return true;
    } catch (error) {
      const purchases = await import('@/services/purchases');
      set({ busy: false, error: purchases.purchaseErrorMessage(error) });
      return false;
    }
  },
}));

