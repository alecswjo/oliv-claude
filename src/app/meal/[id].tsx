import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { CommentList } from '@/components/CommentList';
import { HealthScoreBadge } from '@/components/HealthScoreBadge';
import { Icon } from '@/components/Icon';
import { useSafeBack } from '@/components/navigation';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card, Divider, Field, PressableScale } from '@/components/ui';
import { colors, fonts, MEAL_TYPE_LABELS, radius, spacing, type } from '@/components/theme';
import { timeLabel } from '@/domain/dates';
import { computeHealthScore } from '@/domain/healthScore';
import { newId } from '@/domain/ids';
import { parseNumericInput } from '@/domain/numbers';
import { mealTitle, validateAnalysis } from '@/domain/nutritionValidation';
import type { Meal } from '@/domain/types';
import { confirmAction } from '@/services/confirm';
import { blockUser, reportContent } from '@/services/safety';
import { deletePhotosForMeal } from '@/services/photos';
import { useMealStore } from '@/store/mealStore';
import { showToast } from '@/store/toastStore';
import { canDeleteComment, useSocialStore } from '@/store/socialStore';
import { useUserStore } from '@/store/userStore';

/** Meal detail — nutrition, score breakdown, olives & comments (spec §F3.3/F4.4/F4.5/F2.8). */
export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useSafeBack();

  const profile = useUserStore((state) => state.profile);
  const ownMeals = useMealStore((state) => state.meals);
  const demoMeals = useSocialStore((state) => state.demoMeals);
  const demoUsers = useSocialStore((state) => state.demoUsers);
  const updateMeal = useMealStore((state) => state.updateMeal);
  const deleteMeal = useMealStore((state) => state.deleteMeal);
  const toggleOlive = useSocialStore((state) => state.toggleOlive);
  const addComment = useSocialStore((state) => state.addComment);
  const deleteComment = useSocialStore((state) => state.deleteComment);

  const meal: Meal | undefined =
    ownMeals.find((candidate) => candidate.id === id) ??
    demoMeals.find((candidate) => candidate.id === id);

  const isOwn = Boolean(meal && profile && meal.userId === profile.id);
  const author = isOwn ? profile : demoUsers.find((user) => user.id === meal?.userId);
  const oliveActive = Boolean(meal && profile && meal.oliveUserIds.includes(profile.id));

  const [editing, setEditing] = useState(false);
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');

  const resolveUser = useMemo(() => {
    const map = new Map(demoUsers.map((user) => [user.id, user]));
    if (profile) map.set(profile.id, profile);
    return (userId: string) => map.get(userId);
  }, [demoUsers, profile]);

  if (!meal || !profile) {
    return (
      <View style={styles.missing}>
        <Text style={type.heading}>Meal not found</Text>
        <Button title="Go back" variant="secondary" onPress={goBack} />
      </View>
    );
  }

  const startEditing = () => {
    setCalories(String(meal.nutrition.calories));
    setProteinG(String(meal.nutrition.proteinG));
    setCarbsG(String(meal.nutrition.carbsG));
    setFatG(String(meal.nutrition.fatG));
    setEditing(true);
  };

  const saveEdits = () => {
    if (parseNumericInput(calories) <= 0) {
      showToast('Calories must be above zero.');
      return;
    }
    const next = validateAnalysis({
      ...meal.nutrition,
      calories: parseNumericInput(calories),
      proteinG: parseNumericInput(proteinG),
      carbsG: parseNumericInput(carbsG),
      fatG: parseNumericInput(fatG),
      fruitVegServings: meal.fruitVegServings,
      processingLevel: meal.processingLevel,
      confidence: meal.confidence,
      foodItems: meal.foodItems,
    });
    updateMeal(meal.id, {
      nutrition: {
        calories: next.calories,
        proteinG: next.proteinG,
        carbsG: next.carbsG,
        fatG: next.fatG,
        fiberG: next.fiberG,
        sugarG: next.sugarG,
        sodiumMg: next.sodiumMg,
        saturatedFatG: next.saturatedFatG,
      },
      healthScore: computeHealthScore(next),
    });
    setEditing(false);
    showToast('Nutrition updated');
  };

  const confirmDelete = async () => {
    const ok = await confirmAction({
      title: 'Delete this meal?',
      message: 'This also updates your daily totals and streak.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deletePhotosForMeal(meal.id);
    deleteMeal(meal.id);
    showToast('Meal deleted');
    goBack();
  };

  const nutritionRows: [string, string][] = [
    ['Calories', `${meal.nutrition.calories} kcal`],
    ['Protein', `${meal.nutrition.proteinG} g`],
    ['Carbs', `${meal.nutrition.carbsG} g`],
    ['Fat', `${meal.nutrition.fatG} g`],
    ['Fiber', `${meal.nutrition.fiberG} g`],
    ['Sugar', `${meal.nutrition.sugarG} g`],
    ['Sodium', `${meal.nutrition.sodiumMg} mg`],
    ['Saturated fat', `${meal.nutrition.saturatedFatG} g`],
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: spacing(3) }}>
        <View style={styles.authorRow}>
          <UserAvatar
            emoji={author?.avatarEmoji ?? '🙂'}
            color={author?.avatarColor ?? colors.olive}
            size={36}
          />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyBold}>
              {author?.displayName ?? 'Someone'}
              {isOwn ? <Text style={{ color: colors.olive }}> · You</Text> : null}
            </Text>
            <View style={styles.metaRow}>
              <Text style={type.tiny}>
                {MEAL_TYPE_LABELS[meal.mealType]} · {timeLabel(meal.loggedAt)}
              </Text>
              {meal.isPrivate ? <Icon name="lock" size={12} color={colors.ink30} accessibilityLabel="Private" /> : null}
            </View>
          </View>
        </View>

        {meal.photoUris?.length ? (
          meal.photoUris.length === 1 ? (
            <Image source={{ uri: meal.photoUris[0] }} style={styles.photo} contentFit="cover" />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2.5) }}>
              {meal.photoUris.map((uri, index) => (
                <Image
                  key={`${uri}-${index}`}
                  source={{ uri }}
                  style={styles.photoMulti}
                  contentFit="cover"
                  accessibilityLabel={`Meal photo ${index + 1} of ${meal.photoUris?.length}`}
                />
              ))}
            </ScrollView>
          )
        ) : (
          <View style={styles.emojiTile}>
            <Text style={{ fontSize: 56 }}>{meal.emoji ?? '🍽️'}</Text>
          </View>
        )}

        <Text style={type.heading}>{mealTitle(meal.foodItems, meal.description)}</Text>
        {meal.description ? <Text style={type.body}>{meal.description}</Text> : null}

        <View style={styles.scoreRow}>
          <HealthScoreBadge value={meal.healthScore.value} size="lg" />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={oliveActive ? 'Remove olive' : 'Give an olive'}
            onPress={() => toggleOlive(meal.id, profile.id)}
            style={[styles.oliveButton, oliveActive && { backgroundColor: colors.oliveSoft, borderColor: colors.olive }]}>
            <Text style={{ fontSize: 16 }}>🫒</Text>
            <Text style={[styles.oliveCount, oliveActive && { color: colors.oliveDeep }]}>
              {meal.oliveUserIds.length}
            </Text>
          </PressableScale>
        </View>
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Why this score</Text>
        <ScoreBreakdown score={meal.healthScore} />
      </Card>

      <Card style={{ gap: spacing(2) }}>
        <View style={styles.nutritionHeader}>
          <Text style={type.heading}>Nutrition</Text>
          {isOwn && !editing ? <Button title="Edit" variant="ghost" onPress={startEditing} style={styles.smallButton} /> : null}
        </View>

        {editing ? (
          <View style={{ gap: spacing(3) }}>
            <View style={styles.editGrid}>
              <View style={styles.editCell}>
                <Field label="Calories" keyboardType="numeric" value={calories} onChangeText={setCalories} />
              </View>
              <View style={styles.editCell}>
                <Field label="Protein (g)" keyboardType="numeric" value={proteinG} onChangeText={setProteinG} />
              </View>
              <View style={styles.editCell}>
                <Field label="Carbs (g)" keyboardType="numeric" value={carbsG} onChangeText={setCarbsG} />
              </View>
              <View style={styles.editCell}>
                <Field label="Fat (g)" keyboardType="numeric" value={fatG} onChangeText={setFatG} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing(3) }}>
              <Button title="Save changes" onPress={saveEdits} style={{ flex: 1 }} />
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          nutritionRows.map(([label, value]) => (
            <View key={label} style={styles.nutritionRow}>
              <Text style={type.body}>{label}</Text>
              <Text style={[type.bodyBold, type.numeric]}>{value}</Text>
            </View>
          ))
        )}
      </Card>

      {isOwn ? (
        <Card style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyBold}>Private meal</Text>
            <Text style={type.tiny}>Hidden from your followers' feeds</Text>
          </View>
          <Switch
            accessibilityLabel="Private meal"
            value={meal.isPrivate}
            onValueChange={(value) => updateMeal(meal.id, { isPrivate: value })}
            trackColor={{ true: colors.olive, false: colors.line }}
          />
        </Card>
      ) : null}

      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Comments</Text>
        <CommentList
          comments={meal.comments}
          resolveUser={resolveUser}
          canDelete={(comment) =>
            canDeleteComment({ comment, mealOwnerId: meal.userId, meId: profile.id })
          }
          onDelete={(commentId) => deleteComment(meal.id, commentId)}
          onReport={(comment) => reportContent('comment', comment.id)}
          onSubmit={(text) =>
            addComment(meal.id, {
              id: newId(),
              userId: profile.id,
              text,
              createdAt: new Date().toISOString(),
            })
          }
        />
      </Card>

      {isOwn ? (
        <>
          <Divider />
          <Button title="Delete meal" variant="danger" onPress={confirmDelete} />
        </>
      ) : (
        <>
          <Divider />
          <View style={styles.safetyRow}>
            <Button
              title="Report meal"
              variant="ghost"
              icon="flag"
              onPress={() => reportContent('meal', meal.id)}
              style={{ flex: 1 }}
            />
            <Button
              title={`Block ${author?.displayName ?? 'user'}`}
              variant="ghost"
              icon="slash"
              onPress={async () => {
                await blockUser(meal.userId, author?.displayName ?? 'this user');
                goBack();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12) },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(4), backgroundColor: colors.cream },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  photo: { width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: colors.oliveSoft },
  photoMulti: { width: 260, height: 220, borderRadius: radius.lg, backgroundColor: colors.oliveSoft },
  emojiTile: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  oliveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  oliveCount: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.ink70, fontVariant: ['tabular-nums'] },
  nutritionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallButton: { minHeight: 32, paddingVertical: 4, paddingHorizontal: spacing(3) },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  editCell: { flexBasis: '46%', flexGrow: 1 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  safetyRow: { flexDirection: 'row', gap: spacing(2) },
});
