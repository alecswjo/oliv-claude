import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { HealthScoreBadge } from '@/components/HealthScoreBadge';
import { Icon } from '@/components/Icon';
import { useSafeBack } from '@/components/navigation';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { Button, Card, Chip, Divider, Field, PressableScale } from '@/components/ui';
import { colors, MEAL_TYPE_EMOJI, MEAL_TYPE_LABELS, radius, spacing, type } from '@/components/theme';
import { mealTypeForHour } from '@/domain/dates';
import { isBackendConfigured } from '@/config';
import { computeHealthScore } from '@/domain/healthScore';
import { newId } from '@/domain/ids';
import { parseNumericInput as num } from '@/domain/numbers';
import { validateAnalysis } from '@/domain/nutritionValidation';
import type { Confidence, Meal, MealAnalysis, MealType, ProcessingLevel } from '@/domain/types';
import { runAnalysis, type AnalysisOutcome } from '@/services/analyzer/provider';
import { AnalyzerError, MAX_ANALYZE_PHOTOS } from '@/services/analyzer/types';
import { confirmAction } from '@/services/confirm';
import { persistPhotos, preparePhotoForAnalysis, type PreparedPhoto } from '@/services/photos';
import { useMealStore } from '@/store/mealStore';
import { useAppStore } from '@/store/appStore';
import { useUserStore } from '@/store/userStore';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PROCESSING_LABELS: Record<ProcessingLevel, string> = {
  1: 'Whole', 2: 'Light', 3: 'Processed', 4: 'Ultra',
};

interface EditableFields {
  foodItems: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sugarG: string;
  sodiumMg: string;
  saturatedFatG: string;
}

function fieldsFromAnalysis(analysis: MealAnalysis): EditableFields {
  return {
    foodItems: analysis.foodItems.join(', '),
    calories: String(analysis.calories),
    proteinG: String(analysis.proteinG),
    carbsG: String(analysis.carbsG),
    fatG: String(analysis.fatG),
    fiberG: String(analysis.fiberG),
    sugarG: String(analysis.sugarG),
    sodiumMg: String(analysis.sodiumMg),
    saturatedFatG: String(analysis.saturatedFatG),
  };
}



const EMPTY_MANUAL: MealAnalysis = validateAnalysis({
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0,
  sodiumMg: 0, saturatedFatG: 0, fruitVegServings: 0, processingLevel: 2,
  confidence: 'high', foodItems: [],
});

export default function LogMealScreen() {
  const goBack = useSafeBack();
  const profile = useUserStore((state) => state.profile);
  const addMeal = useMealStore((state) => state.addMeal);
  const aiDataConsentAt = useAppStore((state) => state.aiDataConsentAt);
  const grantAiDataConsent = useAppStore((state) => state.grantAiDataConsent);

  const [mealType, setMealType] = useState<MealType>(mealTypeForHour(new Date().getHours()));
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState('');
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // Review state
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [fruitVeg, setFruitVeg] = useState(0);
  const [processing, setProcessing] = useState<ProcessingLevel>(2);
  const [confidence, setConfidence] = useState<Confidence>('high');
  const [isPrivate, setIsPrivate] = useState(profile?.defaultPrivate ?? false);
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  // Hard re-entry guard: even if navigation ever fails again, repeat taps on
  // "Save meal" must not create duplicate meals.
  const savedRef = useRef(false);

  const reviewing = fields !== null;
  const photoSlotsLeft = MAX_ANALYZE_PHOTOS - photos.length;

  /** Live-validated analysis from the editable fields (spec F2.4). */
  const liveAnalysis: MealAnalysis | null = useMemo(() => {
    if (!fields) return null;
    return validateAnalysis({
      foodItems: fields.foodItems.split(',').map((item) => item.trim()).filter(Boolean),
      calories: num(fields.calories),
      proteinG: num(fields.proteinG),
      carbsG: num(fields.carbsG),
      fatG: num(fields.fatG),
      fiberG: num(fields.fiberG),
      sugarG: num(fields.sugarG),
      sodiumMg: num(fields.sodiumMg),
      saturatedFatG: num(fields.saturatedFatG),
      fruitVegServings: fruitVeg,
      processingLevel: processing,
      confidence,
    });
  }, [fields, fruitVeg, processing, confidence]);

  const liveScore = useMemo(
    () => (liveAnalysis ? computeHealthScore(liveAnalysis) : null),
    [liveAnalysis],
  );

  const enterReview = (analysis: MealAnalysis, fromOutcome: AnalysisOutcome | null, manual: boolean) => {
    setOutcome(fromOutcome);
    setIsManual(manual);
    setFields(fieldsFromAnalysis(analysis));
    setFruitVeg(analysis.fruitVegServings);
    setProcessing(analysis.processingLevel);
    setConfidence(manual ? 'high' : analysis.confidence);
    setEdited(false);
  };

  const addAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    // Per-asset isolation: one corrupt image must not kill the whole batch —
    // and a silent unhandled rejection looked like a dead button.
    const results = await Promise.allSettled(
      assets
        .slice(0, photoSlotsLeft)
        .map((asset) => preparePhotoForAnalysis(asset.uri, asset.width, asset.height)),
    );
    const prepared = results
      .filter((r): r is PromiseFulfilledResult<PreparedPhoto> => r.status === 'fulfilled')
      .map((r) => r.value);
    if (prepared.length < results.length) {
      setInputError("Couldn't load one of those photos — try a different one.");
    }
    if (prepared.length > 0) {
      setPhotos((current) => [...current, ...prepared].slice(0, MAX_ANALYZE_PHOTOS));
    }
  };

  const pickFromLibrary = async () => {
    if (photoSlotsLeft === 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: photoSlotsLeft,
      });
      if (result.canceled || !result.assets?.length) return;
      await addAssets(result.assets);
    } catch {
      setInputError("Couldn't open your photo library.");
    }
  };

  const pickFromCamera = async () => {
    if (photoSlotsLeft === 0) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraDenied(true); // spec F2.9 — library & description paths stay open
        return;
      }
      setCameraDenied(false);
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (result.canceled || !result.assets?.length) return;
      await addAssets(result.assets);
    } catch {
      setInputError("Couldn't open the camera.");
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((current) => current.filter((_, i) => i !== index));
  };

  const abortRef = useRef<AbortController | null>(null);

  const analyze = async () => {
    setInputError(null);
    if (photos.length === 0 && description.trim().length === 0) {
      setInputError('Add a photo or describe your meal first.');
      return;
    }
    if (isBackendConfigured() && !aiDataConsentAt) {
      const allowed = await confirmAction({
        title: 'Allow AI meal analysis?',
        message:
          'Oliv will send the photos and description for this meal to our secure backend and configured AI provider to estimate nutrition. They are used to provide this feature, not for advertising. You can revoke permission in Settings.',
        confirmLabel: 'Allow AI analysis',
      });
      if (!allowed) {
        setInputError('AI analysis is off. You can still enter this meal manually.');
        return;
      }
      grantAiDataConsent();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    try {
      const result = await runAnalysis(
        {
          photos: photos.map((photo) => ({ base64: photo.base64, mediaType: photo.mediaType })),
          description: description.trim() || undefined,
          mealType,
        },
        { signal: controller.signal },
      );
      enterReview(result.analysis, result, false);
    } catch (error) {
      if (error instanceof AnalyzerError && error.code === 'cancelled') {
        // User backed out — return to the compose form silently.
      } else if (error instanceof AnalyzerError && error.code === 'empty-input') {
        setInputError(error.message);
      } else {
        setInputError('Analysis failed unexpectedly. You can still enter the meal manually.');
      }
    } finally {
      abortRef.current = null;
      setAnalyzing(false);
    }
  };

  const save = () => {
    if (savedRef.current) return;
    if (!profile || !liveAnalysis || !liveScore) return;
    if (liveAnalysis.calories <= 0) {
      setInputError('Calories must be above zero to save.');
      return;
    }
    savedRef.current = true;
    setSaving(true);

    const id = newId();
    const photoUris = photos.length > 0 ? persistPhotos(photos, id) : undefined;

    const meal: Meal = {
      id,
      userId: profile.id,
      photoUris,
      emoji: photoUris?.length ? undefined : MEAL_TYPE_EMOJI[mealType],
      caption: caption.trim() || undefined,
      description: description.trim() || liveAnalysis.foodItems.join(', '),
      mealType,
      loggedAt: new Date().toISOString(),
      nutrition: {
        calories: liveAnalysis.calories,
        proteinG: liveAnalysis.proteinG,
        carbsG: liveAnalysis.carbsG,
        fatG: liveAnalysis.fatG,
        fiberG: liveAnalysis.fiberG,
        sugarG: liveAnalysis.sugarG,
        sodiumMg: liveAnalysis.sodiumMg,
        saturatedFatG: liveAnalysis.saturatedFatG,
      },
      foodItems: liveAnalysis.foodItems,
      fruitVegServings: liveAnalysis.fruitVegServings,
      processingLevel: liveAnalysis.processingLevel,
      confidence: liveAnalysis.confidence,
      healthScore: liveScore,
      source: isManual ? 'manual' : edited ? 'ai-adjusted' : 'ai',
      isPrivate,
      oliveUserIds: [],
      comments: [],
    };

    addMeal(meal);
    goBack();
  };

  const markEdited = () => setEdited(true);
  const setField = (key: keyof EditableFields) => (value: string) => {
    markEdited();
    setFields((current) => (current ? { ...current, [key]: value } : current));
  };

  if (!profile) return null;

  /* ---------------------------- analyzing phase ---------------------------- */
  if (analyzing) {
    return (
      <View style={styles.analyzingScreen}>
        {photos[0] ? (
          <Image source={{ uri: photos[0].uri }} style={styles.analyzingPhoto} contentFit="cover" />
        ) : (
          <View style={styles.analyzingTile}>
            <Icon name="coffee" size={40} color={colors.olive} />
          </View>
        )}
        <ActivityIndicator size="large" color={colors.olive} />
        <Text style={type.heading}>Reading your plate…</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>
          Identifying foods and estimating nutrition
        </Text>
        <Button title="Cancel" variant="ghost" onPress={() => abortRef.current?.abort()} />
      </View>
    );
  }

  /* ----------------------------- compose phase ----------------------------- */
  if (!reviewing) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {/* --- photos --- */}
        <View style={{ gap: spacing(2.5) }}>
          <Text style={type.micro}>Photos</Text>

          {photos.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              onPress={pickFromLibrary}
              style={styles.photoHeroEmpty}>
              <View style={styles.photoIconBadge}>
                <Icon name="camera" size={26} color={colors.olive} />
              </View>
              <Text style={type.bodyBold}>Add photos of your meal</Text>
              <Text style={type.tiny}>Up to {MAX_ANALYZE_PHOTOS} — different angles help</Text>
            </Pressable>
          ) : (
            <>
              <View>
                <Image source={{ uri: photos[0].uri }} style={styles.photoHero} contentFit="cover" />
                {photos.length > 1 ? (
                  <View style={styles.photoCountBadge}>
                    <Icon name="layers" size={12} color={colors.surface} />
                    <Text style={styles.photoCountText}>{photos.length}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.thumbRow}>
                {photos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`} style={styles.thumbWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${index + 1}`}
                      hitSlop={8}
                      onPress={() => removePhoto(index)}
                      style={styles.thumbRemove}>
                      <Icon name="x" size={11} color={colors.surface} />
                    </PressableScale>
                  </View>
                ))}
                {photoSlotsLeft > 0 ? (
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Add another photo"
                    onPress={pickFromLibrary}
                    style={styles.thumbAdd}>
                    <Icon name="plus" size={18} color={colors.olive} />
                  </PressableScale>
                ) : null}
              </View>
            </>
          )}

          <View style={styles.photoButtons}>
            <Button
              title="Take photo"
              variant="secondary"
              icon="camera"
              onPress={pickFromCamera}
              disabled={photoSlotsLeft === 0}
              style={{ flex: 1 }}
            />
            <Button
              title="Library"
              variant="secondary"
              icon="image"
              onPress={pickFromLibrary}
              disabled={photoSlotsLeft === 0}
              style={{ flex: 1 }}
            />
          </View>

          {cameraDenied ? (
            <Card style={styles.noticeCard}>
              <Text style={type.small}>
                Camera access is off. You can still pick from your library or just describe the meal.
              </Text>
              {Platform.OS !== 'web' ? (
                <Button title="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} />
              ) : null}
            </Card>
          ) : null}
        </View>

        {/* --- details --- */}
        <View style={{ gap: spacing(2.5) }}>
          <Text style={type.micro}>Details</Text>
          <Field
            label="What did you eat?"
            placeholder="e.g. grilled chicken with brown rice and broccoli"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            style={{ minHeight: 72 }}
          />
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((mealTypeOption) => (
              <Chip
                key={mealTypeOption}
                label={MEAL_TYPE_LABELS[mealTypeOption]}
                selected={mealType === mealTypeOption}
                onPress={() => setMealType(mealTypeOption)}
              />
            ))}
          </View>
        </View>

        {inputError ? <Text style={styles.error}>{inputError}</Text> : null}

        <Button title="Analyze" onPress={analyze} />
        <Button
          title="Enter manually instead"
          variant="ghost"
          onPress={() => enterReview(EMPTY_MANUAL, null, true)}
        />
      </ScrollView>
    );
  }

  /* ----------------------------- review phase ----------------------------- */
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      {outcome?.fallbackNotice ? (
        <Card style={styles.noticeCard}>
          <Text style={type.small}>{outcome.fallbackNotice}</Text>
        </Card>
      ) : null}

      <Card style={{ gap: spacing(3) }}>
        <View style={styles.scoreRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.heading}>Health Score</Text>
            {!isManual ? (
              <Text style={type.tiny}>
                {outcome?.analyzerUsed === 'proxy' ? 'Estimated' : 'Offline estimate'} · {confidence}{' '}
                confidence
              </Text>
            ) : (
              <Text style={type.tiny}>Manual entry</Text>
            )}
          </View>
          {liveScore ? <HealthScoreBadge value={liveScore.value} size="lg" /> : null}
        </View>
        {liveScore ? <ScoreBreakdown score={liveScore} /> : null}
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Field
          label="Caption (optional)"
          placeholder="Say something about this meal…"
          value={caption}
          onChangeText={setCaption}
          maxLength={140}
        />
        <Text style={type.tiny}>Shown on your post — separate from the food details used for analysis.</Text>
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Field label="Food items (comma separated)" value={fields.foodItems} onChangeText={setField('foodItems')} />
        <View style={styles.numGrid}>
          <View style={styles.numCell}>
            <Field label="Calories" keyboardType="numeric" value={fields.calories} onChangeText={setField('calories')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Protein (g)" keyboardType="numeric" value={fields.proteinG} onChangeText={setField('proteinG')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Carbs (g)" keyboardType="numeric" value={fields.carbsG} onChangeText={setField('carbsG')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Fat (g)" keyboardType="numeric" value={fields.fatG} onChangeText={setField('fatG')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Fiber (g)" keyboardType="numeric" value={fields.fiberG} onChangeText={setField('fiberG')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Sugar (g)" keyboardType="numeric" value={fields.sugarG} onChangeText={setField('sugarG')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Sodium (mg)" keyboardType="numeric" value={fields.sodiumMg} onChangeText={setField('sodiumMg')} />
          </View>
          <View style={styles.numCell}>
            <Field label="Sat. fat (g)" keyboardType="numeric" value={fields.saturatedFatG} onChangeText={setField('saturatedFatG')} />
          </View>
        </View>

        <Divider />

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.fieldLabel}>Fruit & veg servings: {fruitVeg}</Text>
          <View style={styles.chipRow}>
            {[0, 0.5, 1, 1.5, 2, 3, 4].map((value) => (
              <Chip
                key={value}
                label={String(value)}
                selected={fruitVeg === value}
                onPress={() => {
                  markEdited();
                  setFruitVeg(value);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.fieldLabel}>Processing level</Text>
          <View style={styles.chipRow}>
            {([1, 2, 3, 4] as ProcessingLevel[]).map((level) => (
              <Chip
                key={level}
                label={`${level} · ${PROCESSING_LABELS[level]}`}
                selected={processing === level}
                onPress={() => {
                  markEdited();
                  setProcessing(level);
                }}
              />
            ))}
          </View>
        </View>
      </Card>

      <Card style={styles.privacyRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyBold}>Private meal</Text>
          <Text style={type.tiny}>Hidden from your followers' feeds</Text>
        </View>
        <Switch
          accessibilityLabel="Private meal"
          value={isPrivate}
          onValueChange={setIsPrivate}
          trackColor={{ true: colors.olive, false: colors.line }}
        />
      </Card>

      {inputError ? <Text style={styles.error}>{inputError}</Text> : null}

      <Button title="Save meal" onPress={save} loading={saving} />
      <Button
        title="Back"
        variant="ghost"
        onPress={() => {
          setFields(null);
          setOutcome(null);
          setInputError(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12) },
  analyzingScreen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(4),
    padding: spacing(6),
  },
  analyzingPhoto: { width: 132, height: 132, borderRadius: radius.lg, backgroundColor: colors.oliveSoft },
  analyzingTile: {
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHeroEmpty: {
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  photoHero: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.lg, backgroundColor: colors.oliveSoft },
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
  photoIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.oliveSoft },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAdd: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  photoButtons: { flexDirection: 'row', gap: spacing(3) },
  noticeCard: { backgroundColor: colors.amberSoft, gap: spacing(2) },
  fieldLabel: { ...type.smallBold, color: colors.oliveDeep },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  numCell: { flexBasis: '46%', flexGrow: 1 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
});
