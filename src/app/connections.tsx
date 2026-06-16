import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { UserRow } from '@/components/UserRow';
import { EmptyState } from '@/components/ui';
import { colors, spacing } from '@/components/theme';
import { isBackendConfigured } from '@/config';
import type { UserProfile } from '@/domain/types';
import { showToast } from '@/store/toastStore';
import { useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

const BACKEND = isBackendConfigured();

/** Followers / following list — opened from a profile's stat counts (spec §F4.6). */
export default function ConnectionsScreen() {
  const { userId, type: kind } = useLocalSearchParams<{ userId: string; type: 'followers' | 'following' }>();
  const router = useRouter();

  const me = useUserStore((state) => state.profile);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const followingIds = useSocialStore((state) => state.followingIds);
  const follow = useSocialStore((state) => state.follow);
  const unfollow = useSocialStore((state) => state.unfollow);
  const blockedIds = useSocialStore((state) => state.blockedIds);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(BACKEND);

  useEffect(() => {
    if (!userId) return;
    if (!BACKEND) {
      // Offline/demo: only "following" is resolvable to demo profiles.
      setUsers(kind === 'following' ? demoUsers.filter((u) => followingIds.includes(u.id)) : []);
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      const repo = await import('@/services/supabase/repo');
      try {
        const ids = kind === 'followers'
          ? await repo.fetchFollowerIds(userId)
          : await repo.fetchFollowingIds(userId);
        const profiles = await repo.fetchProfilesByIds(ids);
        if (active) setUsers(profiles.filter((u) => !blockedIds.includes(u.id)));
      } catch {
        if (active) setUsers([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, kind, demoUsers, followingIds, blockedIds]);

  const title = kind === 'followers' ? 'Followers' : 'Following';

  const toggleFollow = (user: UserProfile) => {
    if (followingIds.includes(user.id)) {
      unfollow(user.id);
      showToast(`Unfollowed ${user.displayName}`);
    } else {
      follow(user.id);
      showToast(`Following ${user.displayName}`);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={users}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing(3) }}>
            <UserRow
              user={item}
              following={followingIds.includes(item.id)}
              onPress={() => router.push(`/user/${item.id}`)}
              onToggleFollow={() => toggleFollow(item)}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.olive} />
            </View>
          ) : (
            <EmptyState
              icon="users"
              title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              body={
                kind === 'followers'
                  ? me?.id === userId
                    ? 'When people follow you, they’ll show up here.'
                    : 'No followers to show.'
                  : 'Find people in Discover to start building a feed.'
              }
            />
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  center: { paddingTop: spacing(12), alignItems: 'center' },
});
