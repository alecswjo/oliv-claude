import { Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesPackage,
} from 'react-native-purchases';
import {
  REVENUECAT_ANDROID_API_KEY,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_IOS_API_KEY,
} from '@/config';

export interface PurchasePlan {
  id: string;
  title: string;
  price: string;
  period: string;
  intro: string | null;
  isMonthly: boolean;
}

export interface PurchaseSnapshot {
  configured: boolean;
  isPro: boolean;
  plans: PurchasePlan[];
}

const nativePackages = new Map<string, PurchasesPackage>();
let configured = false;
let configuredUserId: string | null = null;

function apiKey(): string {
  if (Platform.OS === 'ios') return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_ANDROID_API_KEY;
  return '';
}

function hasEntitlement(info: CustomerInfo): boolean {
  return info.entitlements.active[REVENUECAT_ENTITLEMENT_ID] != null;
}

function readablePeriod(period: string | null): string {
  if (!period) return '';
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return period;
  const count = Number(match[1]);
  const units: Record<string, string> = {
    D: 'day',
    W: 'week',
    M: 'month',
    Y: 'year',
  };
  const unit = units[match[2]];
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function planFromPackage(pkg: PurchasesPackage): PurchasePlan {
  const intro = pkg.product.introPrice;
  const introText =
    intro?.price === 0
      ? `${readablePeriod(intro.period)} free`
      : intro
        ? `${intro.priceString} for ${readablePeriod(intro.period)}`
        : null;
  return {
    id: pkg.identifier,
    title: pkg.product.title.replace(/\s*\([^)]*\)\s*$/, '') || 'Oliv Pro',
    price: pkg.product.priceString,
    period: readablePeriod(pkg.product.subscriptionPeriod) || 'subscription',
    intro: introText,
    isMonthly: pkg.packageType === 'MONTHLY' || pkg.product.subscriptionPeriod === 'P1M',
  };
}

async function sdk(userId: string | null) {
  const Purchases = (await import('react-native-purchases')).default;
  if (!configured) {
    Purchases.configure({
      apiKey: apiKey(),
      appUserID: userId ?? undefined,
      automaticDeviceIdentifierCollectionEnabled: false,
    });
    configured = true;
    configuredUserId = userId;
  } else if (userId && userId !== configuredUserId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }
  return Purchases;
}

async function snapshot(Purchases: Awaited<ReturnType<typeof sdk>>): Promise<PurchaseSnapshot> {
  const [offerings, info] = await Promise.all([
    Purchases.getOfferings(),
    Purchases.getCustomerInfo(),
  ]);
  nativePackages.clear();
  const packages = offerings.current?.availablePackages ?? [];
  for (const pkg of packages) nativePackages.set(pkg.identifier, pkg);
  const plans = packages
    .map(planFromPackage)
    .sort((a, b) => Number(b.isMonthly) - Number(a.isMonthly));
  return { configured: true, isPro: hasEntitlement(info), plans };
}

export async function initializePurchases(userId: string | null): Promise<PurchaseSnapshot> {
  if (!apiKey()) return { configured: false, isPro: false, plans: [] };
  const Purchases = await sdk(userId);
  return snapshot(Purchases);
}

export async function purchasePlan(
  planId: string,
  userId: string | null,
): Promise<PurchaseSnapshot> {
  const Purchases = await sdk(userId);
  const pkg = nativePackages.get(planId);
  if (!pkg) throw new Error('This plan is no longer available. Refresh and try again.');
  const result = await Purchases.purchasePackage(pkg);
  if (!hasEntitlement(result.customerInfo)) {
    throw new Error('The purchase completed, but Oliv Pro is not active yet. Try Restore Purchases.');
  }
  return snapshot(Purchases);
}

export async function restorePurchases(userId: string | null): Promise<PurchaseSnapshot> {
  const Purchases = await sdk(userId);
  await Purchases.restorePurchases();
  return snapshot(Purchases);
}

export async function presentOfferCode(): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('Offer-code redemption is available from the App Store on iPhone.');
  }
  const Purchases = await sdk(configuredUserId);
  await Purchases.presentCodeRedemptionSheet();
}

/** Detach this device from the signed-out Oliv account without losing App Store purchases. */
export async function clearPurchasesIdentity(): Promise<void> {
  if (!configured || !configuredUserId) return;
  const Purchases = (await import('react-native-purchases')).default;
  await Purchases.logOut();
  configuredUserId = null;
}

export function purchaseErrorMessage(error: unknown): string | null {
  const candidate = error as { userCancelled?: boolean; message?: string };
  if (candidate?.userCancelled) return null;
  return candidate?.message || 'Purchase could not be completed. Please try again.';
}
