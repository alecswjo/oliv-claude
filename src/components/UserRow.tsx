import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserProfile } from '@/domain/types';
import { Flame } from './Icon';
import { Button, PressableScale } from './ui';
import { UserAvatar } from './UserAvatar';
import { colors, elevation, fonts, radius, scoreColor, spacing, type } from './theme';

/** Discover / suggested-user row — spec §F4.3. */
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${user.displayName}, @${user.username}`}
      onPress={onPress}
      style={styles.row}>
      <UserAvatar emoji={user.avatarEmoji} color={user.avatarColor} size={48} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={type.bodyBold} numberOfLines={1}>
          {user.displayName}
        </Text>
        <Text style={type.tiny} numberOfLines={1}>
          @{user.username}
        </Text>
        {stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Flame size={13} color={colors.ember} />
              <Text style={styles.statText}>{stats.streak}</Text>
            </View>
            {stats.avgScore != null ? (
              <View style={[styles.scoreDot, { backgroundColor: scoreColor(stats.avgScore) }]}>
                <Text style={styles.scoreDotText}>{stats.avgScore.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <Button
        title={following ? 'Following' : 'Follow'}
        variant={following ? 'secondary' : 'primary'}
        onPress={onToggleFollow}
        style={styles.followButton}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(3),
    ...elevation.card,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: 1 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.ink50, fontVariant: ['tabular-nums'] },
  scoreDot: { borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1 },
  scoreDotText: { fontFamily: fonts.display, fontSize: 11, color: colors.surface, fontVariant: ['tabular-nums'] },
  followButton: { minHeight: 40, paddingVertical: spacing(2), paddingHorizontal: spacing(4) },
});
