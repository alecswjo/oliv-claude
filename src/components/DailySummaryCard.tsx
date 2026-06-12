import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DaySummary } from '@/domain/summaries';
import type { Goals } from '@/domain/types';
import { Flame } from './Icon';
import { Bar } from './ui';
import { colors, elevation, fonts, radius, scoreColor, spacing, type } from './theme';

function MacroBar({ label, eaten, target, color }: { label: string; eaten: number; target: number; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.macroLabelRow}>
        <Text style={type.micro}>{label}</Text>
        <Text style={styles.macroValue}>
          {Math.round(eaten)}<Text style={type.tiny}> / {target}g</Text>
        </Text>
      </View>
      <Bar value={eaten} max={target} color={color} height={6} />
    </View>
  );
}

export function DailySummaryCard({ summary, goals, streak }: { summary: DaySummary; goals: Goals; streak: number }) {
  const remaining = summary.remainingCalories;
  const over = remaining < 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {/* hero: big remaining number */}
        <View style={styles.hero}>
          <Text
            style={[styles.heroNumber, over && { color: colors.ember }]}
            accessibilityLabel={over ? `${-remaining} calories over target` : `${remaining} calories remaining`}>
            {over ? -remaining : remaining}
          </Text>
          <Text style={type.micro}>{over ? 'kcal over target' : 'kcal left'}</Text>
          <View
            style={{ marginTop: spacing(2.5) }}
            accessibilityLabel={`${summary.calories} of ${goals.dailyCalories} calories eaten`}>
            <Bar value={summary.calories} max={goals.dailyCalories} color={over ? colors.ember : colors.olive} height={8} />
            <Text style={[type.tiny, { marginTop: 5 }]}>
              {summary.calories} of {goals.dailyCalories} kcal
            </Text>
          </View>
        </View>

        {/* macro mini-bars */}
        <View style={styles.macros}>
          <MacroBar label="Protein" eaten={summary.proteinG} target={goals.proteinG} color={colors.olive} />
          <MacroBar label="Carbs" eaten={summary.carbsG} target={goals.carbsG} color={colors.amber} />
          <MacroBar label="Fat" eaten={summary.fatG} target={goals.fatG} color={colors.ember} />
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.streakChip} accessibilityLabel={`${streak} day streak`}>
          <Flame size={16} color={colors.ember} />
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={type.micro}>day{streak === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{summary.mealCount}</Text>
          <Text style={type.micro}>meals</Text>
        </View>
        <View style={styles.stat}>
          {summary.avgScore != null ? (
            <View style={[styles.scorePill, { backgroundColor: scoreColor(summary.avgScore) }]}>
              <Text style={styles.scorePillText}>{summary.avgScore.toFixed(1)}</Text>
            </View>
          ) : (
            <Text style={styles.statNum}>—</Text>
          )}
          <Text style={type.micro}>avg score</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing(4.5),
    gap: spacing(4),
    ...elevation.card,
  },
  topRow: { flexDirection: 'row', gap: spacing(5) },
  hero: { width: 132 },
  heroNumber: { fontFamily: fonts.display, fontSize: 46, color: colors.oliveDeep, letterSpacing: -1.5, fontVariant: ['tabular-nums'], lineHeight: 50 },
  macros: { flex: 1, gap: spacing(3), justifyContent: 'center' },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  macroValue: { fontFamily: fonts.display, fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3.5),
  },
  streakChip: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  streakNum: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
  scorePill: { borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 2 },
  scorePillText: { fontFamily: fonts.display, fontSize: 14, color: colors.surface, fontVariant: ['tabular-nums'] },
});
