import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { UserRow } from '@/components/UserRow';
import { EmptyState } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { isBackendConfigured } from '@/config';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import type { UserProfile } from '@/domain/types';
import { selectDiscoverUsers, useSocialStore } from '@/store/socialStore';
import { showToast } from '@/store/toastStore';
import { useUserStore } from '@/store/userStore';

const BACKEND = isBackendConfigured();

/** Discover — find and follow people (spec §F4.3). */
export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const profile = useUserStore((state) => state.profile);
  const demoMeals = useSocialStore((s) => s.demoMeals);
  const demoUsers = useSocialStore((s) => s.demoUsers);
  const followingIds = useSocialStore((s) => s.followingIds);
  const blockedIds = useSocialStore((s) => s.blockedIds);
  const follow = useSocialStore((s) => s.follow);
  const unfollow = useSocialStore((s) => s.unfollow);
  const liveDiscover = useSocialStore((s) => s.discover);
  const searchResults = useSocialStore((s) => s.searchResults);
  const loadSocial = useSocialStore((s) => s.loadSocial);
  const searchUsers = useSocialStore((s) => s.searchUsers);
  const clearSearch = useSocialStore((s) => s.clearSearch);

  useEffect(() => {
    if (BACKEND) void loadSocial();
  }, [loadSocial]);

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

  const searching = BACKEND && query.trim().length > 0;
  const people = useMemo(() => {
    if (BACKEND) {
      const source = searching ? searchResults : liveDiscover;
      return source.filter((u) => u.id !== profile?.id && !blockedIds.includes(u.id));
    }
    return selectDiscoverUsers(demoUsers, followingIds, blockedIds);
  }, [searching, searchResults, liveDiscover, demoUsers, followingIds, blockedIds, profile?.id]);

  const statsFor = (userId: string) => {
    if (BACKEND) return undefined;
    const theirMeals = demoMeals.filter((meal) => meal.userId === userId);
    return {
      streak: computeStreak(theirMeals.map((meal) => dayKeyFromIso(meal.loggedAt)), new Date()),
      avgScore: averageScore(theirMeals),
    };
  };

  const toggleFollow = (user: UserProfile) => {
    if (followingIds.includes(user.id)) {
      unfollow(user.id);
      showToast(`Unfollowed ${user.displayName}`);
    } else {
      follow(user.id);
      showToast(`Following ${user.displayName}`);
    }
  };

  if (!profile) return null;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        BACKEND ? (
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
        ) : null
      }
      data={people}
      keyExtractor={(user) => user.id}
      renderItem={({ item }) => (
        <View style={{ marginBottom: spacing(3) }}>
          <UserRow
            user={item}
            stats={statsFor(item.id)}
            following={followingIds.includes(item.id)}
            onPress={() => router.push(`/user/${item.id}`)}
            onToggleFollow={() => toggleFollow(item)}
          />
        </View>
      )}
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
            body="You've followed every suggested eater. Their meals are waiting in your home feed."
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
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
