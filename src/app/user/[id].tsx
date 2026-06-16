import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Flame } from '@/components/Icon';
import { MealCard } from '@/components/MealCard';
import { useSafeBack } from '@/components/navigation';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card, EmptyState } from '@/components/ui';
import { colors, fonts, scoreColor, spacing, type } from '@/components/theme';
import { isBackendConfigured } from '@/config';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import type { Meal, UserProfile } from '@/domain/types';
import { blockUser, reportContent, unblockUser } from '@/services/safety';
import { followCountsFor, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const BACKEND = isBackendConfigured();

/** Other-user profile — spec §F4.6. */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useSafeBack();

  const profile = useUserStore((state) => state.profile);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const demoMeals = useSocialStore((state) => state.demoMeals);
  const knownUsers = useSocialStore((state) => state.knownUsers);
  const followingIds = useSocialStore((state) => state.followingIds);
  const followerIds = useSocialStore((state) => state.followerIds);
  const follow = useSocialStore((state) => state.follow);
  const unfollow = useSocialStore((state) => state.unfollow);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);
  const blockedIds = useSocialStore((state) => state.blockedIds);

  const [remoteUser, setRemoteUser] = useState<UserProfile | null>(null);
  const [remoteMeals, setRemoteMeals] = useState<Meal[]>([]);
  const [remoteStats, setRemoteStats] = useState<{ followers: number; following: number; avgScore: number | null } | null>(null);
  const [loading, setLoading] = useState(BACKEND);

  useEffect(() => {
    if (!BACKEND || !id) return;
    let active = true;
    setLoading(true);
    void (async () => {
      const repo = await import('@/services/supabase/repo');
      try {
        const [u, meals, stats] = await Promise.all([
          repo.fetchPublicProfile(id),
          repo.fetchPublicMeals(id),
          repo.fetchStats(id),
        ]);
        if (!active) return;
        setRemoteUser(u);
        setRemoteMeals(meals);
        setRemoteStats({ followers: stats.followers, following: stats.following, avgScore: stats.avgScore });
      } catch {
        // leave nulls → not-found / empty state
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const user = BACKEND
    ? remoteUser ?? (id ? knownUsers[id] : undefined)
    : demoUsers.find((candidate) => candidate.id === id);

  const theirMeals = useMemo(() => {
    if (blockedIds.includes(id ?? '')) return [];
    const source = BACKEND ? remoteMeals : demoMeals.filter((meal) => meal.userId === id && !meal.isPrivate);
    return [...source].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
  }, [remoteMeals, demoMeals, id, blockedIds]);

  if (!user || !profile) {
    if (BACKEND && loading) {
      return (
        <View style={styles.missing}>
          <ActivityIndicator color={colors.olive} />
        </View>
      );
    }
    return (
      <View style={styles.missing}>
        <Text style={type.heading}>User not found</Text>
        <Button title="Go back" variant="secondary" onPress={goBack} />
      </View>
    );
  }

  const following = followingIds.includes(user.id);
  const blocked = blockedIds.includes(user.id);
  const counts =
    BACKEND && remoteStats
      ? { followers: remoteStats.followers, following: remoteStats.following }
      : followCountsFor(user, { followingIds, followerIds });
  const streak = computeStreak(theirMeals.map((meal) => dayKeyFromIso(meal.loggedAt)), new Date());
  const avgScore = BACKEND && remoteStats ? remoteStats.avgScore : averageScore(theirMeals);

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
              <Pressable
                style={styles.stat}
                accessibilityRole="button"
                accessibilityLabel={`${counts.followers} followers`}
                onPress={() => router.push(`/connections?userId=${user.id}&type=followers`)}>
                <Text style={styles.statValue}>{counts.followers}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Followers</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <Pressable
                style={styles.stat}
                accessibilityRole="button"
                accessibilityLabel={`${counts.following} following`}
                onPress={() => router.push(`/connections?userId=${user.id}&type=following`)}>
                <Text style={styles.statValue}>{counts.following}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Following</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <View style={styles.stat} accessibilityLabel={`${streak} day streak`}>
                <View style={styles.streakValue}>
                  <Flame size={15} color={colors.ember} />
                  <Text style={styles.statValue}>{streak}</Text>
                </View>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Streak</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, avgScore != null && { color: scoreColor(avgScore) }]}>
                  {avgScore != null ? avgScore.toFixed(1) : '—'}
                </Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Avg</Text>
              </View>
            </View>

            {blocked ? (
              <Button
                title="Unblock"
                variant="secondary"
                icon="rotate-ccw"
                onPress={() => unblockUser(user.id, user.displayName)}
                style={{ alignSelf: 'stretch' }}
              />
            ) : (
              <Button
                title={following ? 'Following' : 'Follow'}
                variant={following ? 'secondary' : 'primary'}
                icon={following ? 'check' : 'user-plus'}
                onPress={() => (following ? unfollow(user.id) : follow(user.id))}
                style={{ alignSelf: 'stretch' }}
              />
            )}
            <View style={styles.safetyRow}>
              <Button
                title="Report"
                variant="ghost"
                icon="flag"
                onPress={() => reportContent('user', user.id)}
                style={{ flex: 1 }}
              />
              {!blocked ? (
                <Button
                  title="Block"
                  variant="ghost"
                  icon="slash"
                  onPress={() => blockUser(user.id, user.displayName)}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
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
  statLabel: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.2, color: colors.ink50, textTransform: 'uppercase', alignSelf: 'stretch', textAlign: 'center' },
  streakValue: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  safetyRow: { flexDirection: 'row', gap: spacing(2) },
});
