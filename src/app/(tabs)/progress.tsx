import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { colors, radius, spacing, type } from '@/components/theme';
import { dayKeyFromIso, lastNDayKeys } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore, caloriesByDay } from '@/domain/summaries';
import { useMealStore } from '@/store/mealStore';
import { useUserStore } from '@/store/userStore';

const CHART_HEIGHT = 120;

/** Progress tab — spec §F6. */
export default function ProgressScreen() {
  const profile = useUserStore((state) => state.profile);
  const meals = useMealStore((state) => state.meals);

  const now = new Date();
  const weekKeys = useMemo(() => lastNDayKeys(now, 7), [now.getDate()]); // eslint-disable-line react-hooks/exhaustive-deps

  const week = useMemo(() => caloriesByDay(meals, weekKeys), [meals, weekKeys]);
  const target = profile?.goals.dailyCalories ?? 2000;
  const maxBar = Math.max(target, ...week.map((day) => day.calories)) || 1;

  const streak = computeStreak(meals.map((meal) => dayKeyFromIso(meal.loggedAt)), now);
  const longest = profile?.longestStreak ?? 0;

  const weekMeals = useMemo(() => {
    const keys = new Set(weekKeys);
    return meals.filter((meal) => keys.has(dayKeyFromIso(meal.loggedAt)));
  }, [meals, weekKeys]);

  const daysWithMeals = new Set(weekMeals.map((meal) => dayKeyFromIso(meal.loggedAt))).size;
  const avgCalories = daysWithMeals > 0
    ? Math.round(weekMeals.reduce((sum, meal) => sum + meal.nutrition.calories, 0) / daysWithMeals)
    : 0;
  const avgScore = averageScore(weekMeals);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.streakCard}>
        <Text style={{ fontSize: 40 }}>🔥</Text>
        <View>
          <Text style={styles.streakNumber}>{streak} day{streak === 1 ? '' : 's'}</Text>
          <Text style={type.small}>current streak · longest {longest}</Text>
        </View>
      </Card>

      <Card>
        <Text style={[type.heading, { marginBottom: spacing(3) }]}>Last 7 days</Text>
        <View style={styles.chartArea}>
          {/* target line */}
          <View
            accessibilityLabel={`Daily target ${target} calories`}
            style={[styles.targetLine, { bottom: (target / maxBar) * CHART_HEIGHT }]}
          />
          <View style={styles.barsRow}>
            {week.map((day) => {
              const height = Math.max(3, (day.calories / maxBar) * CHART_HEIGHT);
              const over = day.calories > target;
              return (
                <View key={day.dayKey} style={styles.barColumn}>
                  <Text style={[type.tiny, type.numeric, { fontSize: 9 }]}>
                    {day.calories > 0 ? day.calories : ''}
                  </Text>
                  <View
                    accessibilityLabel={`${day.dayKey}: ${day.calories} calories`}
                    style={[
                      styles.bar,
                      { height, backgroundColor: over ? colors.terracotta : colors.olive },
                      day.calories === 0 && { backgroundColor: colors.oliveSoft },
                    ]}
                  />
                  <Text style={type.tiny}>{day.dayKey.slice(8)}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <Text style={[type.tiny, { marginTop: spacing(2) }]}>
          Dashed line = your {target} kcal target (today's goal applied to all days)
        </Text>
      </Card>

      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{meals.length}</Text>
          <Text style={type.tiny}>meals logged</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{avgCalories || '—'}</Text>
          <Text style={type.tiny}>avg kcal / active day</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{avgScore != null ? avgScore.toFixed(1) : '—'}</Text>
          <Text style={type.tiny}>7-day avg score</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{daysWithMeals}/7</Text>
          <Text style={type.tiny}>days logged</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(10) },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  streakNumber: { fontSize: 26, fontWeight: '800', color: colors.oliveDeep },
  chartArea: { position: 'relative' },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1.5,
    borderColor: colors.amber,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing(2) },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '100%', borderRadius: radius.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  statCard: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.oliveDeep, fontVariant: ['tabular-nums'] },
});
