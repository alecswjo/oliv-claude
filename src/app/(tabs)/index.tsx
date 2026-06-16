import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { DailySummaryCard } from '@/components/DailySummaryCard';
import { MealCard } from '@/components/MealCard';
import { Button, EmptyState } from '@/components/ui';
import { colors, spacing } from '@/components/theme';
import { isBackendConfigured } from '@/config';
import { dayKey, dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { summaryForDay } from '@/domain/summaries';
import { DEFAULT_GOALS, type Meal, type UserProfile } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { selectHomeFeed, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const BACKEND = isBackendConfigured();
const PAGE_SIZE = 20;

/** Home — your daily summary + a combined feed of your meals and friends' meals (spec §F3). */
export default function HomeFeedScreen() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const meals = useMealStore((state) => state.meals);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);
  const demoMeals = useSocialStore((state) => state.demoMeals);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const liveFeed = useSocialStore((state) => state.feed);
  const knownUsers = useSocialStore((state) => state.knownUsers);
  const followingIds = useSocialStore((state) => state.followingIds);
  const blockedIds = useSocialStore((state) => state.blockedIds);
  const loadSocial = useSocialStore((state) => state.loadSocial);

  const [pages, setPages] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Pull friends' meals when the home tab shows.
  useEffect(() => {
    if (BACKEND) void loadSocial();
  }, [loadSocial]);

  const now = new Date();
  const todayKey = dayKey(now);

  const summary = useMemo(
    () => summaryForDay(meals, todayKey, profile?.goals ?? DEFAULT_GOALS),
    [meals, todayKey, profile?.goals],
  );

  const streak = useMemo(
    () => computeStreak(meals.map((meal) => dayKeyFromIso(meal.loggedAt)), now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, todayKey],
  );

  const feed = useMemo(
    () =>
      selectHomeFeed({
        friendMeals: BACKEND ? liveFeed : demoMeals,
        ownMeals: meals,
        followingIds,
        meId: profile?.id,
        blockedIds,
      }),
    [liveFeed, demoMeals, meals, followingIds, profile?.id, blockedIds],
  );
  const visible = feed.slice(0, pages * PAGE_SIZE);

  const userById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    if (BACKEND) {
      for (const id of Object.keys(knownUsers)) map.set(id, knownUsers[id]);
    } else {
      for (const user of demoUsers) map.set(user.id, user);
    }
    if (profile) map.set(profile.id, profile);
    return map;
  }, [knownUsers, demoUsers, profile]);

  const onRefresh = async () => {
    if (!BACKEND) return;
    const { backendActive, currentUserId, hydrateForUser } = await import('@/services/sync');
    if (!backendActive()) return;
    setRefreshing(true);
    try {
      await Promise.all([hydrateForUser(currentUserId()!), loadSocial()]);
    } catch {
      // pull again later
    } finally {
      setRefreshing(false);
    }
  };

  if (!profile) return null;

  return (
    <FlatList<Meal>
      data={visible}
      keyExtractor={(meal) => meal.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.olive} onRefresh={onRefresh} />}
      onEndReached={() => {
        if (visible.length < feed.length) setPages((count) => count + 1);
      }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing(2) }}>
          <DailySummaryCard summary={summary} goals={profile.goals} streak={streak} />
        </View>
      }
      renderItem={({ item }) => {
        const isOwn = item.userId === profile.id;
        return (
          <View style={{ marginBottom: spacing(3) }}>
            <MealCard
              meal={item}
              author={userById.get(item.userId) ?? null}
              showAuthor
              isOwn={isOwn}
              oliveActive={item.oliveUserIds.includes(profile.id)}
              onPress={() => router.push(`/meal/${item.id}`)}
              onAuthorPress={isOwn ? undefined : () => router.push(`/user/${item.userId}`)}
              onToggleOlive={() => toggleOlive(item.id, profile.id)}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon="camera"
          title="Your plate awaits"
          body="Snap your next meal — and follow friends so their plates show up here too."
          action={<Button title="Log your first meal" icon="plus" onPress={() => router.push('/log')} />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
});
