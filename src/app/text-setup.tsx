import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConnectAgent } from '@/components/ConnectAgent';
import { TextThreadPreview } from '@/components/TextThreadPreview';
import { Button, Card } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import { AGENT_NUMBER, isBackendConfigured } from '@/config';
import { useUserStore } from '@/store/userStore';

/** Final onboarding handoff: activate the primary texting surface first. */
export default function TextSetupScreen() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  if (!profile) return <Redirect href="/onboarding" />;

  const textingReady = isBackendConfigured() && AGENT_NUMBER.length > 0;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <View style={{ gap: spacing(2), alignItems: 'center' }}>
        <Text style={styles.eyebrow}>LAST STEP</Text>
        <Text style={styles.title}>Put Oliv in your contacts.</Text>
        <Text style={styles.body}>
          Texting is the product. The app is where you review trends, tune goals, and manage your data.
        </Text>
      </View>

      <TextThreadPreview />

      {textingReady ? (
        <ConnectAgent />
      ) : (
        <Card style={{ gap: spacing(2.5) }}>
          <Text style={type.heading}>Texting is not configured in this build</Text>
          <Text style={type.small}>
            You can still use the full meal log locally. Add the backend and Oliv number to enable the
            Messages connection.
          </Text>
        </Card>
      )}

      <Button title="Open my dashboard" onPress={() => router.replace('/(tabs)')} />
      <Text style={styles.skip}>
        You can connect or disconnect texting later in Settings. Your meals start private.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: spacing(4),
    paddingTop: spacing(12),
    paddingBottom: spacing(12),
    gap: spacing(4),
  },
  eyebrow: { ...type.micro, color: colors.olive },
  title: { ...type.display, textAlign: 'center', lineHeight: 40 },
  body: { ...type.body, color: colors.ink70, textAlign: 'center', lineHeight: 22, maxWidth: 440 },
  skip: { ...type.tiny, textAlign: 'center', lineHeight: 16 },
});
