import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserProfile } from '@/domain/types';
import { Button } from './ui';
import { UserAvatar } from './UserAvatar';
import { colors, radius, shadow, spacing, type } from './theme';

/** Discover / follower list row — spec §F4.3. */
export function UserRow({
  user,
  stats,
  following,
  onPress,
  onToggleFollow,
}: {
  user: UserProfile;
  stats?: { streak: number; avgScore: number | null };
  following: boolean;
  onPress?: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${user.displayName}, @${user.username}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.92 }]}>
      <UserAvatar emoji={user.avatarEmoji} color={user.avatarColor} size={46} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.bodyBold} numberOfLines={1}>
          {user.displayName}
        </Text>
        <Text style={type.tiny} numberOfLines={1}>
          @{user.username}
        </Text>
        {stats ? (
          <Text style={type.tiny}>
            🔥 {stats.streak} streak{stats.avgScore != null ? `  ·  🫒 ${stats.avgScore.toFixed(1)} avg` : ''}
          </Text>
        ) : null}
      </View>
      <Button
        title={following ? 'Following' : 'Follow'}
        variant={following ? 'secondary' : 'primary'}
        onPress={onToggleFollow}
        style={styles.followButton}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing(3),
    ...shadow.card,
  },
  followButton: { minHeight: 40, paddingVertical: spacing(2), paddingHorizontal: spacing(3.5) },
});
