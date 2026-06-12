import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { MealCard } from '@/components/MealCard';
import { UserRow } from '@/components/UserRow';
import { Button, EmptyState } from '@/components/ui';
import { colors, radius, spacing } from '@/components/theme';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import type { Meal } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { selectDiscoverUsers, selectSocialFeed, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const PAGE_SIZE = 20;

/** Social tab — feed of followed users + discover (spec §F4). */
export default function SocialScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'feed' | 'discover'>('feed');
  const [pages, setPages] = useState(1);

  const profile = useUserStore((state) => state.profile);
  const ownMeals = useMealStore((state) => state.meals);
  const demoMeals = useSocialStore((state) => state.demoMeals);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const followingIds = useSocialStore((state) => state.followingIds);
  const follow = useSocialStore((state) => state.follow);
  const unfollow = useSocialStore((state) => state.unfollow);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);

  const feed = useMemo(
    () => selectSocialFeed({ demoMeals, ownMeals, followingIds, meId: profile?.id }),
    [demoMeals, ownMeals, followingIds, profile?.id],
  );
  const visibleFeed = feed.slice(0, pages * PAGE_SIZE);

  const discover = useMemo(
    () => selectDiscoverUsers(demoUsers, followingIds),
    [demoUsers, followingIds],
  );

  const userById = useMemo(() => {
    const map = new Map(demoUsers.map((user) => [user.id, user]));
    if (profile) map.set(profile.id, profile);
    return map;
  }, [demoUsers, profile]);

  const statsFor = (userId: string) => {
    const theirMeals = demoMeals.filter((meal) => meal.userId === userId);
    return {
      streak: computeStreak(theirMeals.map((meal) => dayKeyFromIso(meal.loggedAt)), new Date()),
      avgScore: averageScore(theirMeals),
    };
  };

  if (!profile) return null;

  const Toggle = (
    <View style={styles.toggleRow}>
      {(['feed', 'discover'] as const).map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === key }}
          onPress={() => setTab(key)}
          style={[styles.toggle, tab === key && styles.toggleActive]}>
          <Text style={[styles.toggleText, tab === key && styles.toggleTextActive]}>
            {key === 'feed' ? 'Following' : 'Discover'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (tab === 'discover') {
    return (
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={Toggle}
        data={discover}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing(3) }}>
            <UserRow
              user={item}
              stats={statsFor(item.id)}
              following={false}
              onPress={() => router.push(`/user/${item.id}`)}
              onToggleFollow={() => follow(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="check-circle"
            title="You follow everyone"
            body="You've followed every suggested eater. Their meals are waiting in your Following feed."
          />
        }
      />
    );
  }

  return (
    <FlatList<Meal>
      style={styles.list}
      contentContainerStyle={styles.content}
      ListHeaderComponent={Toggle}
      data={visibleFeed}
      keyExtractor={(meal) => meal.id}
      onEndReached={() => {
        if (visibleFeed.length < feed.length) setPages((count) => count + 1);
      }}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => {
        const author = userById.get(item.userId) ?? null;
        return (
          <View style={{ marginBottom: spacing(3) }}>
            <MealCard
              meal={item}
              author={author}
              showAuthor
              isOwn={item.userId === profile.id}
              oliveActive={item.oliveUserIds.includes(profile.id)}
              onPress={() => router.push(`/meal/${item.id}`)}
              onToggleOlive={() => toggleOlive(item.id, profile.id)}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon="users"
          title="Nothing here yet"
          body="Follow a few people in Discover to fill this feed with what they're eating."
          action={<Button title="Find people" variant="secondary" icon="search" onPress={() => setTab('discover')} />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.oliveSoft,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing(4),
  },
  toggle: {
    flex: 1,
    paddingVertical: spacing(2),
    borderRadius: radius.full,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.white },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.slate },
  toggleTextActive: { color: colors.oliveDeep },
});
