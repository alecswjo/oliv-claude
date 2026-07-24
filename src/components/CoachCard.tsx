import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AGENT_NUMBER } from '@/config';
import { openAgentThread } from '@/services/agentLink';
import { Icon } from './Icon';
import { Button } from './ui';
import { colors, radius, spacing, type } from './theme';

/** Home-screen handoff to the primary texting experience. */
export function CoachCard() {
  if (!AGENT_NUMBER) return null;
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Icon name="message-circle" size={20} color={colors.surface} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.bodyBold}>Oliv is a text away</Text>
        <Text style={type.tiny}>Send a photo, correct a meal, or ask about today.</Text>
      </View>
      <Button
        title="Text"
        variant="secondary"
        style={styles.button}
        onPress={() => openAgentThread().catch(() => {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    backgroundColor: colors.oliveSoft,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing(3),
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.oliveDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: { minHeight: 38, paddingVertical: spacing(2), paddingHorizontal: spacing(3) },
});
