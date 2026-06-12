import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { isBackendConfigured } from '@/config';
import { colors } from '@/components/theme';
import { getApiKey } from '@/services/secureKey';
import { hydrateAll, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await hydrateAll();
      const key = await getApiKey();
      useAppStore.getState().setHasApiKey(Boolean(key));

      // Backend mode: resolve the session and, if signed in, load the user's
      // profile + meals from the server before the gate renders.
      if (isBackendConfigured()) {
        await useAuthStore.getState().init();
        const userId = useAuthStore.getState().userId;
        if (userId) {
          const { hydrateForUser } = await import('@/services/sync');
          await hydrateForUser(userId).catch(() => {});
        }
      }

      if (mounted) {
        setReady(true);
        void SplashScreen.hideAsync().catch(() => {});
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) return null; // native splash stays up while stores hydrate

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
        <Stack.Screen name="log" options={{ presentation: 'modal', title: 'Log a meal' }} />
        <Stack.Screen name="meal/[id]" options={{ title: 'Meal' }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
