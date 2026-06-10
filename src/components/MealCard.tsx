import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { timeLabel } from '@/domain/dates';
import { mealTitle } from '@/domain/nutritionValidation';
import type { Meal, UserProfile } from '@/domain/types';
import { HealthScoreBadge } from './HealthScoreBadge';
import { UserAvatar } from './UserAvatar';
import { colors, MEAL_TYPE_LABELS, radius, shadow, spacing, type } from './theme';

/** Feed meal card — spec §F3.3 / §F4.2. */

export function MacroPills({ meal }: { meal: Meal }) {
  const macros = [
    { label: 'P', value: meal.nutrition.proteinG, color: colors.olive },
    { label: 'C', value: meal.nutrition.carbsG, color: colors.amber },
    { label: 'F', value: meal.nutrition.fatG, color: colors.terracotta },
  ];
  return (
    <View style={styles.macroRow}>
      {macros.map((macro) => (
        <View key={macro.label} style={styles.macroPill}>
          <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
          <Text style={styles.macroText}>
            {macro.label} {Math.round(macro.value)}g
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MealCard({
  meal,
  author,
  isOwn,
  onPress,
  onToggleOlive,
  oliveActive,
  showAuthor = false,
}: {
  meal: Meal;
  author?: UserProfile | null;
  isOwn: boolean;
  onPress?: () => void;
  onToggleOlive?: () => void;
  oliveActive: boolean;
  showAuthor?: boolean;
}) {
  const title = mealTitle(meal.foodItems, meal.description);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Meal: ${title}, ${meal.nutrition.calories} calories, health score ${meal.healthScore.value} out of 5`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      {showAuthor && author ? (
        <View style={styles.authorRow}>
          <UserAvatar emoji={author.avatarEmoji} color={author.avatarColor} size={28} />
          <Text style={type.smallBold}>
            {author.displayName}
            {isOwn ? <Text style={{ color: colors.olive }}>  · You</Text> : null}
          </Text>
        </View>
      ) : null}

      <View style={styles.bodyRow}>
        {meal.photoUri ? (
          <Image source={{ uri: meal.photoUri }} style={styles.photo} contentFit="cover" accessibilityLabel="Meal photo" />
        ) : (
          <View style={styles.emojiTile}>
            <Text style={{ fontSize: 30 }}>{meal.emoji ?? '🍽️'}</Text>
          </View>
        )}

        <View style={{ flex: 1, gap: spacing(1) }}>
          <View style={styles.titleRow}>
            <Text style={[type.bodyBold, { flex: 1 }]} numberOfLines={2}>
              {title}
            </Text>
            {meal.isPrivate ? (
              <Text accessibilityLabel="Private meal" style={{ fontSize: 12 }}>
                🔒
              </Text>
            ) : null}
          </View>
          <Text style={type.tiny}>
            {MEAL_TYPE_LABELS[meal.mealType]} · {timeLabel(meal.loggedAt)}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[type.bodyBold, type.numeric, { color: colors.oliveDeep }]}>
              {meal.nutrition.calories} kcal
            </Text>
            <HealthScoreBadge value={meal.healthScore.value} size="sm" />
          </View>
          <MacroPills meal={meal} />
        </View>
      </View>

      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={oliveActive ? 'Remove olive' : 'Give an olive'}
          hitSlop={10}
          onPress={onToggleOlive}
          style={[styles.oliveButton, oliveActive && { backgroundColor: colors.oliveSoft }]}>
          <Text style={{ fontSize: 14 }}>🫒</Text>
          <Text style={[type.smallBold, oliveActive && { color: colors.oliveDeep }]}>
            {meal.oliveUserIds.length}
          </Text>
        </Pressable>
        <View style={styles.commentCount}>
          <Text style={{ fontSize: 13 }}>💬</Text>
          <Text style={type.smallBold}>{meal.comments.length}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing(3.5),
    gap: spacing(2.5),
    ...shadow.card,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  bodyRow: { flexDirection: 'row', gap: spacing(3) },
  photo: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.oliveSoft },
  emojiTile: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  macroRow: { flexDirection: 'row', gap: spacing(2) },
  macroPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroText: { ...type.tiny, fontVariant: ['tabular-nums'] },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(2.5),
  },
  oliveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.full,
  },
  commentCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
