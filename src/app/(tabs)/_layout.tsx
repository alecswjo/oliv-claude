import { Redirect, Tabs, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import { colors, elevation, fonts, spacing, type } from '@/components/theme';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';

/**
 * Shown when the user is signed in but their server profile couldn't be
 * loaded. Routing to onboarding here would let them create a fresh profile
 * that overwrites their real one — so we make them retry instead.
 */
function HydrateRetry() {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const userId = useAuthStore.getState().userId;
      if (userId) {
        const { hydrateForUser } = await import('@/services/sync');
        await hydrateForUser(userId);
        useAuthStore.getState().setHydrateFailed(false);
      }
    } catch {
      // stay on the retry screen
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.retryScreen}>
      <Icon name="cloud-off" size={40} color={colors.ink30} />
      <Text style={type.heading}>Couldn't load your data</Text>
      <Text style={[type.small, { textAlign: 'center' }]}>
        Check your connection and try again.
      </Text>
      <Button title="Retry" loading={busy} onPress={retry} />
      <Button title="Sign out" variant="ghost" onPress={() => useAuthStore.getState().signOut()} />
    </View>
  );
}

function TabGlyph({ icon, label, focused }: { icon: IconName; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Icon name={icon} size={22} color={focused ? colors.olive : colors.ink30} />
      <Text style={[styles.tabLabel, focused && { color: colors.oliveDeep }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const requiresAuth = useAuthStore((state) => state.requiresAuth);
  const authStatus = useAuthStore((state) => state.status);
  const hydrateFailed = useAuthStore((state) => state.hydrateFailed);

  // Backend mode: must be signed in before anything else.
  if (requiresAuth && authStatus !== 'signedIn') {
    return <Redirect href="/sign-in" />;
  }
  if (!profile) {
    if (requiresAuth && hydrateFailed) return <HydrateRetry />;
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.display, color: colors.oliveDeep, fontSize: 22, letterSpacing: -0.4 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 86,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oliv',
          tabBarAccessibilityLabel: 'Feed tab',
          tabBarIcon: ({ focused }) => <TabGlyph icon="home" label="Feed" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Discover',
          tabBarAccessibilityLabel: 'Discover tab',
          tabBarIcon: ({ focused }) => <TabGlyph icon="search" label="Discover" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="log-tab"
        options={{
          title: 'Log a meal',
          tabBarButton: (props) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log a meal"
              onPress={() => router.push('/log')}
              style={[styles.logButtonWrap, props.style as object]}>
              <View style={styles.logButton}>
                <Icon name="plus" size={28} color={colors.surface} />
              </View>
            </Pressable>
          ),
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push('/log');
          },
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarAccessibilityLabel: 'Progress tab',
          tabBarIcon: ({ focused }) => <TabGlyph icon="bar-chart-2" label="Progress" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ focused }) => <TabGlyph icon="user" label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  retryScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(3),
    padding: spacing(8),
    backgroundColor: colors.paper,
  },
  tabItem: { alignItems: 'center', gap: 3, width: 64 },
  tabLabel: { fontFamily: fonts.sansSemi, fontSize: 10, color: colors.ink30, letterSpacing: 0.2 },
  logButtonWrap: { alignItems: 'center', justifyContent: 'center' },
  logButton: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    ...elevation.raised,
  },
});
