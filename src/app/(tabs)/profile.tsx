import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Flame } from '@/components/Icon';
import { MealCard } from '@/components/MealCard';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card, Section } from '@/components/ui';
import { colors, fonts, scoreColor, spacing, type } from '@/components/theme';
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
        <View style={styles.identity}>
          <UserAvatar emoji={profile.avatarEmoji} color={profile.avatarColor} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.title}>{profile.displayName}</Text>
            <Text style={type.small}>@{profile.username}</Text>
          </View>
        </View>
        {profile.bio ? <Text style={[type.body, styles.bio]}>{profile.bio}</Text> : null}

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{meals.length}</Text>
            <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Meals</Text>
          </View>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            accessibilityRole="button"
            accessibilityLabel={`${counts.followers} followers`}
            onPress={() => router.push(`/connections?userId=${profile.id}&type=followers`)}>
            <Text style={styles.statValue}>{counts.followers}</Text>
            <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Followers</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            accessibilityRole="button"
            accessibilityLabel={`${counts.following} following`}
            onPress={() => router.push(`/connections?userId=${profile.id}&type=following`)}>
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

        <Button title="Settings" variant="secondary" icon="settings" onPress={() => router.push('/settings')} style={{ alignSelf: 'stretch' }} />
      </Card>

      {recent.length > 0 ? (
        <Section title="Recent meals">
          <View style={{ gap: spacing(3) }}>
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
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(10) },
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
});
