import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { HealthScoreBadge } from '@/components/HealthScoreBadge';
import { Icon } from '@/components/Icon';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { Button, Card, Chip, Divider, Field } from '@/components/ui';
import { colors, MEAL_TYPE_EMOJI, MEAL_TYPE_LABELS, radius, spacing, type } from '@/components/theme';
import { mealTypeForHour } from '@/domain/dates';
import { computeHealthScore } from '@/domain/healthScore';
import { newId } from '@/domain/ids';
import { validateAnalysis } from '@/domain/nutritionValidation';
import type { Confidence, Meal, MealAnalysis, MealType, ProcessingLevel } from '@/domain/types';
import { runAnalysis, type AnalysisOutcome } from '@/services/analyzer/provider';
import { AnalyzerError } from '@/services/analyzer/types';
import { persistPhoto, preparePhotoForAnalysis, type PreparedPhoto } from '@/services/photos';
import { getApiKey } from '@/services/secureKey';
import { useMealStore } from '@/store/mealStore';
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

function num(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

const EMPTY_MANUAL: MealAnalysis = validateAnalysis({
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0,
  sodiumMg: 0, saturatedFatG: 0, fruitVegServings: 0, processingLevel: 2,
  confidence: 'high', foodItems: [],
});

export default function LogMealScreen() {
  const router = useRouter();
  const profile = useUserStore((state) => state.profile);
  const addMeal = useMealStore((state) => state.addMeal);

  const [mealType, setMealType] = useState<MealType>(mealTypeForHour(new Date().getHours()));
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
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

  const reviewing = fields !== null;

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

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    const prepared = await preparePhotoForAnalysis(asset.uri, asset.width, asset.height);
    setPhoto(prepared);
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraDenied(true); // spec F2.9 — library & description paths stay open
      return;
    }
    setCameraDenied(false);
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    const prepared = await preparePhotoForAnalysis(asset.uri, asset.width, asset.height);
    setPhoto(prepared);
  };

  const analyze = async () => {
    setInputError(null);
    if (!photo && description.trim().length === 0) {
      setInputError('Add a photo or describe your meal first.');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await runAnalysis(
        {
          photoBase64: photo?.base64,
          photoMediaType: photo?.mediaType,
          description: description.trim() || undefined,
          mealType,
        },
        { getApiKey },
      );
      enterReview(result.analysis, result, false);
    } catch (error) {
      if (error instanceof AnalyzerError && error.code === 'empty-input') {
        setInputError(error.message);
      } else {
        setInputError('Analysis failed unexpectedly. You can still enter the meal manually.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const save = () => {
    if (!profile || !liveAnalysis || !liveScore) return;
    if (liveAnalysis.calories <= 0) {
      setInputError('Calories must be above zero to save.');
      return;
    }

    const id = newId('meal');
    let photoUri: string | undefined;
    if (photo) {
      try {
        photoUri = persistPhoto(photo.uri, id);
      } catch {
        photoUri = photo.uri; // fall back to the cache URI rather than losing the photo
      }
    }

    const meal: Meal = {
      id,
      userId: profile.id,
      photoUri,
      emoji: photoUri ? undefined : MEAL_TYPE_EMOJI[mealType],
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
    router.back();
  };

  const markEdited = () => setEdited(true);
  const setField = (key: keyof EditableFields) => (value: string) => {
    markEdited();
    setFields((current) => (current ? { ...current, [key]: value } : current));
  };

  if (!profile) return null;

  /* ----------------------------- compose phase ----------------------------- */
  if (!reviewing) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Change photo' : 'Add a photo'}
          onPress={pickFromLibrary}
          style={styles.photoArea}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: spacing(2) }}>
              <View style={styles.photoIconBadge}>
                <Icon name="camera" size={26} color={colors.olive} />
              </View>
              <Text style={type.small}>Tap to choose a photo</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.photoButtons}>
          <Button title="Take photo" variant="secondary" onPress={pickFromCamera} style={{ flex: 1 }} />
          <Button title="Library" variant="secondary" onPress={pickFromLibrary} style={{ flex: 1 }} />
        </View>

        {cameraDenied ? (
          <Card style={styles.noticeCard}>
            <Text style={type.small}>
              Camera access is off. You can still pick from your library or just describe the meal.
            </Text>
            <Button title="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} />
          </Card>
        ) : null}

        <Field
          label="What did you eat?"
          placeholder="e.g. grilled chicken with brown rice and broccoli"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
          style={{ minHeight: 72 }}
        />

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.fieldLabel}>Meal</Text>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((mealTypeOption) => (
              <Chip
                key={mealTypeOption}
                label={`${MEAL_TYPE_EMOJI[mealTypeOption]} ${MEAL_TYPE_LABELS[mealTypeOption]}`}
                selected={mealType === mealTypeOption}
                onPress={() => setMealType(mealTypeOption)}
              />
            ))}
          </View>
        </View>

        {inputError ? <Text style={styles.error}>{inputError}</Text> : null}

        <Button
          title={analyzing ? 'Reading your plate…' : 'Analyze with AI'}
          loading={analyzing}
          onPress={analyze}
        />
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
                {outcome?.analyzerUsed === 'proxy'
                  ? 'Analyzed by AI'
                  : outcome?.analyzerUsed === 'claude'
                    ? 'Analyzed by Claude'
                    : 'Offline estimate'}{' '}
                · {confidence} confidence
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

      <Button title="Save meal" onPress={save} />
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
  photoArea: {
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
