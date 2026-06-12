import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { DailySummaryCard } from '@/components/DailySummaryCard';
import { MealCard } from '@/components/MealCard';
import { Button, EmptyState } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import { dayKey, dayLabel } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { dayKeyFromIso } from '@/domain/dates';
import { groupMealsByDay, summaryForDay } from '@/domain/summaries';
import type { Meal } from '@/domain/types';
import { useMealStore } from '@/store/mealStore';
import { useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

/** My Feed — the main page (spec §F3). */
export default function MyFeedScreen() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const meals = useMealStore((state) => state.meals);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);

  const now = new Date();
  const todayKey = dayKey(now);

  const summary = useMemo(
    () => summaryForDay(meals, todayKey, profile?.goals ?? { dailyCalories: 2000, proteinG: 100, carbsG: 263, fatG: 61 }),
    [meals, todayKey, profile?.goals],
  );

  const streak = useMemo(
    () => computeStreak(meals.map((meal) => dayKeyFromIso(meal.loggedAt)), now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, todayKey],
  );

  const sections = useMemo(
    () =>
      groupMealsByDay(meals).map((group) => ({
        title: dayLabel(group.dayKey, now),
        data: group.meals,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, todayKey],
  );

  if (!profile) return null;

  return (
    <SectionList<Meal>
      sections={sections}
      keyExtractor={(meal) => meal.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing(2) }}>
          <DailySummaryCard summary={summary} goals={profile.goals} streak={streak} />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.dayHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <View style={{ marginBottom: spacing(3) }}>
          <MealCard
            meal={item}
            isOwn
            oliveActive={item.oliveUserIds.includes(profile.id)}
            onPress={() => router.push(`/meal/${item.id}`)}
            onToggleOlive={() => toggleOlive(item.id, profile.id)}
          />
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          icon="camera"
          title="Your plate awaits"
          body="Snap a photo of your next meal and Oliv will figure out the calories, macros, and how healthy it really is."
          action={<Button title="Log your first meal" icon="plus" onPress={() => router.push('/log')} />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  dayHeader: {
    ...type.smallBold,
    color: colors.oliveDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 12,
    marginTop: spacing(2),
    marginBottom: spacing(2.5),
  },
});
