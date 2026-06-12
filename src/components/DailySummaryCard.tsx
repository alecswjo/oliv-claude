import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DaySummary } from '@/domain/summaries';
import type { Goals } from '@/domain/types';
import { Bar } from './ui';
import { colors, radius, shadow, spacing, type } from './theme';

/** My Feed header — spec §F3.2. */

const TICKS = 36;

function CalorieDial({ eaten, target }: { eaten: number; target: number }) {
  const ratio = target > 0 ? Math.min(1, eaten / target) : 0;
  const over = target > 0 && eaten > target;
  const litTicks = Math.round(ratio * TICKS);
  const size = 148;
  const radius_ = size / 2 - 6;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="image"
      accessibilityLabel={`${eaten} of ${target} calories eaten`}>
      {Array.from({ length: TICKS }, (_, index) => {
        const angle = (index / TICKS) * 360;
        const lit = index < litTicks;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              width: 3,
              height: 12,
              borderRadius: 2,
              backgroundColor: lit ? (over ? colors.terracotta : colors.olive) : colors.oliveSoft,
              transform: [
                { rotate: `${angle}deg` },
                { translateY: -radius_ },
              ],
            }}
          />
        );
      })}
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.dialNumber, over && { color: colors.terracotta }]}>{eaten}</Text>
        <Text style={type.tiny}>of {target} kcal</Text>
      </View>
    </View>
  );
}

function MacroBar({ label, eaten, target, color }: { label: string; eaten: number; target: number; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.macroLabelRow}>
        <Text style={type.tiny}>{label}</Text>
        <Text style={[type.tiny, type.numeric]}>
          {Math.round(eaten)}/{target}g
        </Text>
      </View>
      <Bar value={eaten} max={target} color={color} height={6} />
    </View>
  );
}

export function DailySummaryCard({
  summary,
  goals,
  streak,
}: {
  summary: DaySummary;
  goals: Goals;
  streak: number;
}) {
  const remaining = summary.remainingCalories;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <CalorieDial eaten={summary.calories} target={goals.dailyCalories} />
        <View style={{ flex: 1, gap: spacing(3) }}>
          <View>
            <Text
              style={[styles.remaining, remaining < 0 && { color: colors.terracotta }]}
              accessibilityLabel={
                remaining >= 0 ? `${remaining} calories remaining` : `${-remaining} calories over target`
              }>
              {remaining >= 0 ? remaining : -remaining}
            </Text>
            <Text style={type.tiny}>{remaining >= 0 ? 'kcal remaining' : 'kcal over target'}</Text>
          </View>
          <MacroBar label="Protein" eaten={summary.proteinG} target={goals.proteinG} color={colors.olive} />
          <MacroBar label="Carbs" eaten={summary.carbsG} target={goals.carbsG} color={colors.amber} />
          <MacroBar label="Fat" eaten={summary.fatG} target={goals.fatG} color={colors.terracotta} />
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>🔥 {streak}</Text>
          <Text style={type.tiny}>day streak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, type.numeric]}>{summary.mealCount}</Text>
          <Text style={type.tiny}>meals today</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, type.numeric]}>
            {summary.avgScore != null ? `🫒 ${summary.avgScore.toFixed(1)}` : '—'}
          </Text>
          <Text style={type.tiny}>avg score</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing(4),
    gap: spacing(4),
    ...shadow.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  dialNumber: { fontSize: 30, fontWeight: '800', color: colors.oliveDeep, fontVariant: ['tabular-nums'] },
  remaining: { fontSize: 24, fontWeight: '800', color: colors.oliveDeep, fontVariant: ['tabular-nums'] },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bottomRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(3),
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 17, fontWeight: '700', color: colors.charcoal },
});
