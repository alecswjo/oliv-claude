import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { isBackendConfigured } from '@/config';
import { Icon } from '@/components/Icon';
import { useSafeBack } from '@/components/navigation';
import { colors } from '@/components/theme';
import { getApiKey } from '@/services/secureKey';
import { hydrateAll, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

void SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [fontsLoaded] = useFonts({
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

      if (mounted) setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const ready = hydrated && fontsLoaded;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
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
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
