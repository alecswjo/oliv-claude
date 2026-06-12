import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/components/theme';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';

function TabGlyph({ glyph, label, focused }: { glyph: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
      <Text style={[styles.tabLabel, focused && { color: colors.oliveDeep, opacity: 1 }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const requiresAuth = useAuthStore((state) => state.requiresAuth);
  const authStatus = useAuthStore((state) => state.status);

  // Backend mode: must be signed in before anything else.
  if (requiresAuth && authStatus !== 'signedIn') {
    return <Redirect href="/sign-in" />;
  }
  if (!profile) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', color: colors.oliveDeep, fontSize: 22 },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          height: 84,
          paddingTop: 6,
        },
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.cream },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oliv',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="🏠" label="My Feed" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="👥" label="Social" focused={focused} />,
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
                <Text style={{ fontSize: 26, color: colors.white }}>📷</Text>
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
          tabBarIcon: ({ focused }) => <TabGlyph glyph="📈" label="Progress" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabGlyph glyph="🫒" label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 2, width: 64 },
  tabLabel: { fontSize: 10, fontWeight: '600', color: colors.slate, opacity: 0.6 },
  logButtonWrap: { alignItems: 'center', justifyContent: 'center' },
  logButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: colors.oliveDeep,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
