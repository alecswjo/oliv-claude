import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from './theme';

function Bubble({
  side,
  children,
}: {
  side: 'user' | 'oliv';
  children: React.ReactNode;
}) {
  const user = side === 'user';
  return (
    <View style={[styles.row, user && styles.rowUser]}>
      {!user ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>O</Text>
        </View>
      ) : null}
      <View style={[styles.bubble, user ? styles.userBubble : styles.olivBubble]}>
        <Text style={[styles.message, user && styles.userMessage]}>{children}</Text>
      </View>
    </View>
  );
}

/** A compact Messages-like preview of Oliv's core capture loop. */
export function TextThreadPreview() {
  return (
    <View style={styles.thread} accessibilityLabel="Example conversation with Oliv">
      <View style={styles.threadHeader}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>O</Text>
        </View>
        <View style={{ gap: 1 }}>
          <Text style={styles.headerName}>Oliv</Text>
          <Text style={type.tiny}>your nutrition coach</Text>
        </View>
      </View>
      <Bubble side="user">I had a chicken shawarma bowl for lunch</Bubble>
      <Bubble side="oliv">
        Logged ✓ ~710 cal · 42g protein{'\n'}Solid lunch. Biggest estimate is the garlic sauce. 🫒
      </Bubble>
      <Bubble side="user">Actually light sauce — remember that’s my usual</Bubble>
      <Bubble side="oliv">Fixed, and I’ll remember for next time.</Bubble>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: {
    backgroundColor: '#F4F4F6',
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    padding: spacing(3),
    gap: spacing(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E1E1E6',
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingHorizontal: spacing(1),
    paddingBottom: spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DADADF',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.oliveDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { fontFamily: fonts.display, color: colors.surface, fontSize: 17 },
  headerName: { ...type.bodyBold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(1.5), maxWidth: '88%' },
  rowUser: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.oliveDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.display, color: colors.surface, fontSize: 11 },
  bubble: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.25),
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  userBubble: { backgroundColor: '#147EFB', borderBottomRightRadius: 5 },
  olivBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 5 },
  message: { ...type.small, color: colors.ink, lineHeight: 18 },
  userMessage: { color: colors.surface },
});
