import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { isBackendConfigured } from '@/config';
import { Icon } from '@/components/Icon';
import { useSafeBack } from '@/components/navigation';
import { colors } from '@/components/theme';
import { ToastHost } from '@/components/ToastHost';
import { KeyboardDoneBar } from '@/components/ui';
import { onSaveError } from '@/services/storage';
import { hydrateAll } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { showToast } from '@/store/toastStore';

/** Route to the relevant screen when a notification is tapped. */
function routeFromNotification(data: Record<string, unknown> | null): void {
  if (!data) return;
  if (typeof data.mealId === 'string') router.push(`/meal/${data.mealId}`);
  else if (typeof data.userId === 'string') router.push(`/user/${data.userId}`);
}

void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * On cold start, check for an OTA update and — if one is ready — download and
 * reload into it while the splash screen is still up, so updates apply on the
 * FIRST launch instead of the next one. Bounded by timeouts and guarded for
 * dev/offline so it can never strand the splash; reloadAsync() restarts the app
 * and does not return.
 */
async function applyPendingUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await Promise.race([
      Updates.checkForUpdateAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (check && check.isAvailable) {
      const fetched = await Promise.race([
        Updates.fetchUpdateAsync().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 7000)),
      ]);
      if (fetched) await Updates.reloadAsync();
    }
  } catch {
    // Offline or the check failed — boot the bundle we already have; the
    // update (if any) will land on the next launch the old way.
  }
}

// Deep links (oliv://meal/…) land on top of the tabs instead of dead-ending.
export const unstable_settings = { initialRouteName: '(tabs)' };

onSaveError(() => {
  showToast("Couldn't save to this device — storage may be full");
});

/** Modal screens get no back chevron — always show an explicit close. */
function HeaderClose() {
  const goBack = useSafeBack();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={goBack}>
      <Icon name="x" size={24} color={colors.oliveDeep} />
    </Pressable>
  );
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    'Grove-Display': SpaceGrotesk_700Bold,
    'Grove-DisplayMed': SpaceGrotesk_500Medium,
    'Grove-Sans': HankenGrotesk_400Regular,
    'Grove-SansMed': HankenGrotesk_500Medium,
    'Grove-SansSemi': HankenGrotesk_600SemiBold,
    'Grove-SansBold': HankenGrotesk_700Bold,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // First: apply any pending OTA update before we render anything.
        await applyPendingUpdate();

        await hydrateAll();

        // Backend mode: resolve the session and, if signed in, load the user's
        // profile + meals from the server before the gate renders.
        if (isBackendConfigured()) {
          await useAuthStore.getState().init();
          const userId = useAuthStore.getState().userId;
          if (userId) {
            const { hydrateForUser } = await import('@/services/sync');
            await hydrateForUser(userId).catch(() => {
              useAuthStore.getState().setHydrateFailed(true);
            });
          }
        }

        // Configure the notification handler + re-register the push token and
        // local reminder. Never prompts — only acts if permission is already
        // granted (the prompt lives in Settings, per best practice).
        await useNotificationStore.getState().syncRegistration();
      } catch (error) {
        // Never strand the user on the splash screen — local mode still works.
        // eslint-disable-next-line no-console
        console.warn('[oliv] startup hydration failed', error);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // A font failure must not strand the splash either — system fonts render.
  const ready = hydrated && (fontsLoaded || fontError != null);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Route on notification taps (foreground/background + cold-start). Set up
  // once the router is mounted; the service is dynamically imported so the
  // native module never enters the offline/test graph.
  useEffect(() => {
    if (!ready) return;
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      try {
        const notif = await import('@/services/notifications');
        if (cancelled) return;
        unsubscribe = notif.addResponseListener(routeFromNotification);
        const initial = await notif.getInitialResponseData();
        if (!cancelled) routeFromNotification(initial);
      } catch {
        // notifications unavailable (web / unsupported)
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ready]);

  if (!ready) return null; // native splash holds while stores hydrate + fonts load

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.oliveDeep,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.cream },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen
          name="log"
          options={{ presentation: 'modal', title: 'Log a meal', headerLeft: () => <HeaderClose /> }}
        />
        <Stack.Screen name="meal/[id]" options={{ title: 'Meal' }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="connections" options={{ title: 'Connections' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="legal/privacy" options={{ title: 'Privacy Policy' }} />
        <Stack.Screen name="legal/terms" options={{ title: 'Terms of Use' }} />
      </Stack>
      <ToastHost />
      <KeyboardDoneBar />
    </>
  );
}
