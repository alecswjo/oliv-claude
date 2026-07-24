import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Flame } from '@/components/Icon';
import { Card } from '@/components/ui';
import { colors, fonts, radius, scoreColor, spacing, type } from '@/components/theme';
import { dayKeyFromIso, lastNDayKeys } from '@/domain/dates';
import { computeStreak } from '@/domain/streaks';
import { averageScore, caloriesByDay } from '@/domain/summaries';
import { useMealStore } from '@/store/mealStore';
import { useUserStore } from '@/store/userStore';

const CHART_HEIGHT = 120;
const BAR_BASELINE_OFFSET = 18; // barDay lineHeight 13 + column gap 5

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
        <View style={styles.streakBadge}>
          <Flame size={26} color={colors.ember} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.streakNumberRow}>
            <Text style={styles.streakNumber}>{streak}</Text>
            <Text style={styles.streakUnit}>day{streak === 1 ? '' : 's'}</Text>
          </View>
          <Text style={type.micro}>Current streak · longest {longest}</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <View style={styles.consistencyTop}>
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={type.heading}>Weekly consistency</Text>
            <Text style={type.small}>
              {daysWithMeals >= 5
                ? 'You hit the 5-day consistency goal. Missed days do not erase that work.'
                : `${5 - daysWithMeals} more logging day${5 - daysWithMeals === 1 ? '' : 's'} for a consistent week.`}
            </Text>
          </View>
          <Text style={styles.consistencyValue}>{daysWithMeals}/5</Text>
        </View>
        <View style={styles.dayDots}>
          {week.map((day) => (
            <View
              key={day.dayKey}
              accessibilityLabel={`${day.dayKey}: ${day.calories > 0 ? 'logged' : 'not logged'}`}
              style={[styles.dayDot, day.calories > 0 && styles.dayDotDone]}
            />
          ))}
        </View>
        <Text style={type.tiny}>A flexible habit goal alongside your exact daily streak.</Text>
      </Card>

      <Card>
        <Text style={[type.micro, { marginBottom: spacing(3) }]}>Last 7 days</Text>
        <View style={styles.chartArea}>
          {/* target line */}
          <View
            accessibilityLabel={`Daily target ${target} calories`}
            // The bars' zero baseline sits above the day label + column gap;
            // without this offset the line reads ~18px lower than the truth.
            style={[styles.targetLine, { bottom: BAR_BASELINE_OFFSET + (target / maxBar) * CHART_HEIGHT }]}
          />
          <View style={styles.barsRow}>
            {week.map((day) => {
              const height = Math.max(3, (day.calories / maxBar) * CHART_HEIGHT);
              const over = day.calories > target;
              return (
                <View key={day.dayKey} style={styles.barColumn}>
                  <Text style={[styles.barValue, day.calories === 0 && { opacity: 0 }]}>
                    {day.calories > 0 ? day.calories : '0'}
                  </Text>
                  <View
                    accessibilityLabel={`${day.dayKey}: ${day.calories} calories`}
                    style={[
                      styles.bar,
                      { height, backgroundColor: over ? colors.ember : colors.olive },
                      day.calories === 0 && { backgroundColor: colors.oliveSoft },
                    ]}
                  />
                  <Text style={styles.barDay}>{day.dayKey.slice(8)}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <Text style={[type.tiny, { marginTop: spacing(3) }]}>
          Dashed line = your {target} kcal target (today's goal applied to all days)
        </Text>
      </Card>

      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{meals.length}</Text>
          <Text style={type.micro}>Meals logged</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{avgCalories || '—'}</Text>
          <Text style={type.micro}>Avg kcal / day</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statValue, avgScore != null && { color: scoreColor(avgScore) }]}>
            {avgScore != null ? avgScore.toFixed(1) : '—'}
          </Text>
          <Text style={type.micro}>7-day avg score</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{daysWithMeals}/7</Text>
          <Text style={type.micro}>Days logged</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(10) },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(3.5) },
  streakBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.emberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing(1.5) },
  streakNumber: { fontFamily: fonts.display, fontSize: 32, color: colors.oliveDeep, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  streakUnit: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink50 },
  consistencyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  consistencyValue: { fontFamily: fonts.display, fontSize: 26, color: colors.olive },
  dayDots: { flexDirection: 'row', gap: spacing(2) },
  dayDot: { flex: 1, height: 8, borderRadius: radius.full, backgroundColor: colors.fill },
  dayDotDone: { backgroundColor: colors.olive },
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
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  bar: { width: '100%', borderRadius: radius.sm },
  barValue: { fontFamily: fonts.display, fontSize: 10, color: colors.ink50, fontVariant: ['tabular-nums'] },
  barDay: { fontFamily: fonts.sansMed, fontSize: 11, lineHeight: 13, color: colors.ink30 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  statCard: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: spacing(1) },
  statValue: { fontFamily: fonts.display, fontSize: 26, color: colors.oliveDeep, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
});
