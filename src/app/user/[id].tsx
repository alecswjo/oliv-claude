import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Flame } from '@/components/Icon';
import { MealCard } from '@/components/MealCard';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card, EmptyState } from '@/components/ui';
import { colors, fonts, scoreColor, spacing, type } from '@/components/theme';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import { followCountsFor, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

/** Other-user profile — spec §F4.6. */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const profile = useUserStore((state) => state.profile);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const demoMeals = useSocialStore((state) => state.demoMeals);
  const followingIds = useSocialStore((state) => state.followingIds);
  const followerIds = useSocialStore((state) => state.followerIds);
  const follow = useSocialStore((state) => state.follow);
  const unfollow = useSocialStore((state) => state.unfollow);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);

  const user = demoUsers.find((candidate) => candidate.id === id);

  const theirMeals = useMemo(
    () =>
      demoMeals
        .filter((meal) => meal.userId === id && !meal.isPrivate)
        .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()),
    [demoMeals, id],
  );

  if (!user || !profile) {
    return (
      <View style={styles.missing}>
        <Text style={type.heading}>User not found</Text>
        <Button title="Go back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const following = followingIds.includes(user.id);
  const counts = followCountsFor(user, { followingIds, followerIds });
  const streak = computeStreak(theirMeals.map((meal) => dayKeyFromIso(meal.loggedAt)), new Date());
  const avgScore = averageScore(theirMeals);

  return (
    <>
      <Stack.Screen options={{ title: `@${user.username}` }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={theirMeals}
        keyExtractor={(meal) => meal.id}
        ListHeaderComponent={
          <Card style={styles.header}>
            <View style={styles.identity}>
              <UserAvatar emoji={user.avatarEmoji} color={user.avatarColor} size={64} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.title}>{user.displayName}</Text>
                <Text style={type.small}>@{user.username}</Text>
              </View>
            </View>
            {user.bio ? <Text style={[type.body, styles.bio]}>{user.bio}</Text> : null}

            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{counts.followers}</Text>
                <Text style={type.micro}>Followers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{counts.following}</Text>
                <Text style={type.micro}>Following</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat} accessibilityLabel={`${streak} day streak`}>
                <View style={styles.streakValue}>
                  <Flame size={15} color={colors.ember} />
                  <Text style={styles.statValue}>{streak}</Text>
                </View>
                <Text style={type.micro}>Streak</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, avgScore != null && { color: scoreColor(avgScore) }]}>
                  {avgScore != null ? avgScore.toFixed(1) : '—'}
                </Text>
                <Text style={type.micro}>Avg</Text>
              </View>
            </View>

            <Button
              title={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'check' : 'user-plus'}
              onPress={() => (following ? unfollow(user.id) : follow(user.id))}
              style={{ alignSelf: 'stretch' }}
            />
          </Card>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: spacing(3) }}>
            <MealCard
              meal={item}
              isOwn={false}
              oliveActive={item.oliveUserIds.includes(profile.id)}
              onPress={() => router.push(`/meal/${item.id}`)}
              onToggleOlive={() => toggleOlive(item.id, profile.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState icon="inbox" title="No meals yet" body="Nothing public on this plate so far." />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(4), backgroundColor: colors.paper },
  header: { gap: spacing(3.5) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing(3.5) },
  bio: { color: colors.ink70 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: spacing(3),
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.line },
  statValue: { fontFamily: fonts.display, fontSize: 19, color: colors.oliveDeep, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  streakValue: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
