import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MealCard } from '@/components/MealCard';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import { dayKeyFromIso } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore } from '@/domain/summaries';
import { useMealStore } from '@/store/mealStore';
import { followCountsFor, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

/** Own profile — spec §F4.6. */
export default function ProfileScreen() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const meals = useMealStore((state) => state.meals);
  const followingIds = useSocialStore((state) => state.followingIds);
  const followerIds = useSocialStore((state) => state.followerIds);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);

  if (!profile) return null;

  const counts = followCountsFor(profile, { followingIds, followerIds });
  const streak = computeStreak(meals.map((meal) => dayKeyFromIso(meal.loggedAt)), new Date());
  const avgScore = averageScore(meals);
  const recent = meals.slice(0, 3);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.header}>
        <UserAvatar emoji={profile.avatarEmoji} color={profile.avatarColor} size={72} />
        <Text style={type.title}>{profile.displayName}</Text>
        <Text style={type.small}>@{profile.username}</Text>
        {profile.bio ? <Text style={[type.body, styles.bio]}>{profile.bio}</Text> : null}

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{meals.length}</Text>
            <Text style={type.tiny}>meals</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{counts.followers}</Text>
            <Text style={type.tiny}>followers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{counts.following}</Text>
            <Text style={type.tiny}>following</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🔥{streak}</Text>
            <Text style={type.tiny}>streak</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{avgScore != null ? avgScore.toFixed(1) : '—'}</Text>
            <Text style={type.tiny}>avg score</Text>
          </View>
        </View>

        <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} style={{ alignSelf: 'stretch' }} />
      </Card>

      {recent.length > 0 ? (
        <View style={{ gap: spacing(3) }}>
          <Text style={type.heading}>Recent meals</Text>
          {recent.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              isOwn
              oliveActive={meal.oliveUserIds.includes(profile.id)}
              onPress={() => router.push(`/meal/${meal.id}`)}
              onToggleOlive={() => toggleOlive(meal.id, profile.id)}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(10) },
  header: { alignItems: 'center', gap: spacing(2) },
  bio: { textAlign: 'center', marginTop: spacing(1) },
  statRow: {
    flexDirection: 'row',
    marginVertical: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
    alignSelf: 'stretch',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.oliveDeep, fontVariant: ['tabular-nums'] },
});
