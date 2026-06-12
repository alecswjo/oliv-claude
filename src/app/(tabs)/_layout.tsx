import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { colors, elevation, fonts } from '@/components/theme';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';

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
        options={{ title: 'Oliv', tabBarIcon: ({ focused }) => <TabGlyph icon="home" label="Feed" focused={focused} /> }}
      />
      <Tabs.Screen
        name="social"
        options={{ title: 'Social', tabBarIcon: ({ focused }) => <TabGlyph icon="users" label="Social" focused={focused} /> }}
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
        options={{ title: 'Progress', tabBarIcon: ({ focused }) => <TabGlyph icon="bar-chart-2" label="Progress" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabGlyph icon="user" label="Profile" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
