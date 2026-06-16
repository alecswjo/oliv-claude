import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MealCard } from '@/components/MealCard';
import { UserRow } from '@/components/UserRow';
import { Button, EmptyState } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { isBackendConfigured } from '@/config';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import type { Meal, UserProfile } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { selectDiscoverUsers, selectSocialFeed, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const PAGE_SIZE = 20;
const BACKEND = isBackendConfigured();

/** Social tab — feed of followed users + discover (spec §F4). */
export default function SocialScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'feed' | 'discover'>('feed');
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState('');

  const profile = useUserStore((state) => state.profile);
  const ownMeals = useMealStore((state) => state.meals);
  const demoMeals = useSocialStore((s) => s.demoMeals);
  const demoUsers = useSocialStore((s) => s.demoUsers);
  const followingIds = useSocialStore((s) => s.followingIds);
  const blockedIds = useSocialStore((s) => s.blockedIds);
  const follow = useSocialStore((s) => s.follow);
  const unfollow = useSocialStore((s) => s.unfollow);
  const toggleOlive = useSocialStore((s) => s.toggleOlive);
  // backend-only live data
  const liveFeed = useSocialStore((s) => s.feed);
  const liveDiscover = useSocialStore((s) => s.discover);
  const searchResults = useSocialStore((s) => s.searchResults);
  const knownUsers = useSocialStore((s) => s.knownUsers);
  const loadSocial = useSocialStore((s) => s.loadSocial);
  const searchUsers = useSocialStore((s) => s.searchUsers);
  const clearSearch = useSocialStore((s) => s.clearSearch);

  // Pull the live graph whenever the tab is shown.
  useEffect(() => {
    if (BACKEND) void loadSocial();
  }, [loadSocial]);

  // Debounced user search.
  useEffect(() => {
    if (!BACKEND) return;
    const q = query.trim();
    if (!q) {
      clearSearch();
      return;
    }
    const handle = setTimeout(() => void searchUsers(q), 300);
    return () => clearTimeout(handle);
  }, [query, searchUsers, clearSearch]);

  const feed = useMemo(
    () =>
      selectSocialFeed({
        demoMeals: BACKEND ? liveFeed : demoMeals,
        ownMeals,
        followingIds,
        meId: profile?.id,
        blockedIds,
      }),
    [liveFeed, demoMeals, ownMeals, followingIds, profile?.id, blockedIds],
  );
  const visibleFeed = feed.slice(0, pages * PAGE_SIZE);

  const searching = BACKEND && query.trim().length > 0;
  const discover = useMemo(() => {
    if (BACKEND) {
      return searching
        ? searchResults.filter((u) => u.id !== profile?.id && !blockedIds.includes(u.id))
        : selectDiscoverUsers(liveDiscover, followingIds, blockedIds);
    }
    return selectDiscoverUsers(demoUsers, followingIds, blockedIds);
  }, [searching, searchResults, liveDiscover, demoUsers, followingIds, blockedIds, profile?.id]);

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

  const statsFor = (userId: string) => {
    if (BACKEND) return undefined; // real users' stats aren't cached locally
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
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {Toggle}
            {BACKEND ? (
              <TextInput
                style={styles.search}
                placeholder="Search by name or @username"
                placeholderTextColor={colors.ink30}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search people"
              />
            ) : null}
          </>
        }
        data={discover}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => {
          const following = followingIds.includes(item.id);
          return (
            <View style={{ marginBottom: spacing(3) }}>
              <UserRow
                user={item}
                stats={statsFor(item.id)}
                following={following}
                onPress={() => router.push(`/user/${item.id}`)}
                onToggleFollow={() => (following ? unfollow(item.id) : follow(item.id))}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          searching ? (
            <EmptyState
              icon="search"
              title="No one found"
              body={`No users match "${query.trim()}". Try a different name or @username.`}
            />
          ) : BACKEND ? (
            <EmptyState
              icon="users"
              title="No one to discover yet"
              body="As more people join Oliv they'll show up here. Search above to find a friend by username."
            />
          ) : (
            <EmptyState
              icon="check-circle"
              title="You follow everyone"
              body="You've followed every suggested eater. Their meals are waiting in your Following feed."
            />
          )
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
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontFamily: fonts.sansMed,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing(4),
  },
});
