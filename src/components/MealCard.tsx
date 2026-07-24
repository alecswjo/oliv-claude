import { Image } from 'expo-image';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { dateTimeLabel } from '@/domain/dates';
import { mealTitle } from '@/domain/nutritionValidation';
import type { Meal, UserProfile } from '@/domain/types';
import { HealthScoreBadge } from './HealthScoreBadge';
import { Icon } from './Icon';
import { PressableScale } from './ui';
import { UserAvatar } from './UserAvatar';
import { colors, elevation, fonts, MEAL_TYPE_LABELS, radius, spacing, type } from './theme';

/** A single macro stat in the Strava-style stat strip. */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={type.micro}>{label}</Text>
    </View>
  );
}

export function MacroPills({ meal }: { meal: Meal }) {
  return (
    <View style={styles.statStrip}>
      <Stat label="Calories" value={`${meal.nutrition.calories}`} color={colors.oliveDeep} />
      <View style={styles.statDivider} />
      <Stat label="Protein" value={`${Math.round(meal.nutrition.proteinG)}g`} />
      <View style={styles.statDivider} />
      <Stat label="Carbs" value={`${Math.round(meal.nutrition.carbsG)}g`} />
      <View style={styles.statDivider} />
      <Stat label="Fat" value={`${Math.round(meal.nutrition.fatG)}g`} />
    </View>
  );
}

/** Feed meal card — Strava activity-card anatomy with Beli warmth (spec §F3.3/§F4.2). */
export function MealCard({
  meal,
  author,
  isOwn,
  onPress,
  onAuthorPress,
  onToggleOlive,
  oliveActive,
  showAuthor = false,
}: {
  meal: Meal;
  author?: UserProfile | null;
  isOwn: boolean;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onToggleOlive?: () => void;
  oliveActive: boolean;
  showAuthor?: boolean;
}) {
  const title = mealTitle(meal.foodItems, meal.description);
  const when = `${MEAL_TYPE_LABELS[meal.mealType]} · ${dateTimeLabel(meal.loggedAt, new Date())}`;

  const authorBlock = author ? (
    <>
      <UserAvatar emoji={author.avatarEmoji} color={author.avatarColor} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyBold} numberOfLines={1}>
          {author.displayName || 'Someone'}
          {isOwn ? <Text style={{ color: colors.olive }}>  · You</Text> : null}
        </Text>
        <Text style={type.tiny}>{when}</Text>
      </View>
    </>
  ) : null;

  return (
    <PressableScale
      // The card contains its own author/olive buttons. Giving the parent a
      // button role would create nested-button semantics on native and web.
      accessibilityLabel={`Meal: ${title}, ${meal.nutrition.calories} calories, health score ${meal.healthScore.value} out of 5`}
      onPress={onPress}
      style={styles.card}>
      {/* author / meta row */}
      <View style={styles.headerRow}>
        {showAuthor && author ? (
          onAuthorPress ? (
            <PressableScale
              accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
              accessibilityLabel={`View ${author.displayName}'s profile`}
              hitSlop={6}
              onPress={onAuthorPress}
              containerStyle={{ flex: 1 }}
              style={styles.authorTap}>
              {authorBlock}
            </PressableScale>
          ) : (
            <View style={styles.authorTap}>{authorBlock}</View>
          )
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={type.smallBold}>{when}</Text>
          </View>
        )}
        {meal.isPrivate ? <Icon name="lock" size={15} color={colors.ink30} accessibilityLabel="Private meal" /> : null}
      </View>

      {/* hero */}
      {meal.photoUris?.length ? (
        <View>
          <Image source={{ uri: meal.photoUris[0] }} style={styles.photo} contentFit="cover" accessibilityLabel="Meal photo" />
          {meal.photoUris.length > 1 ? (
            <View style={styles.photoCountBadge}>
              <Icon name="layers" size={12} color={colors.surface} />
              <Text style={styles.photoCountText}>{meal.photoUris.length}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emojiTile}>
          <Text style={{ fontSize: 44 }}>{meal.emoji ?? '🍽️'}</Text>
        </View>
      )}

      {/* title + score */}
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.heading} numberOfLines={2}>
            {meal.caption || title}
          </Text>
          {meal.caption ? (
            <Text style={type.small} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        <HealthScoreBadge value={meal.healthScore.value} size="sm" />
      </View>

      {/* stat strip */}
      <MacroPills meal={meal} />

      {/* action row */}
      <View style={styles.footerRow}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={oliveActive ? 'Remove olive' : 'Give an olive'}
          hitSlop={10}
          onPress={onToggleOlive}
          style={[styles.action, oliveActive && { backgroundColor: colors.oliveSoft }]}>
          <Text style={{ fontSize: 14 }}>🫒</Text>
          <Text style={[styles.actionCount, oliveActive && { color: colors.oliveDeep }]}>{meal.oliveUserIds.length}</Text>
        </PressableScale>
        <View style={styles.action}>
          <Icon name="message-circle" size={15} color={colors.ink50} />
          <Text style={styles.actionCount}>{meal.comments.length}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing(3.5),
    gap: spacing(3),
    ...elevation.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.oliveSoft },
  photoCountBadge: {
    position: 'absolute',
    top: spacing(2.5),
    right: spacing(2.5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(26,28,23,0.72)',
    borderRadius: radius.full,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  photoCountText: { color: colors.surface, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emojiTile: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.md,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', gap: spacing(3), alignItems: 'center' },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    paddingVertical: spacing(2.5),
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.line, marginVertical: spacing(1) },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing(2.5),
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
    borderRadius: radius.full,
  },
  actionCount: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.ink50, fontVariant: ['tabular-nums'] },
});
