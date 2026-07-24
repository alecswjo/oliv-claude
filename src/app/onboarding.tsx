import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, Card, Chip, Field } from '@/components/ui';
import { TextThreadPreview } from '@/components/TextThreadPreview';
import { colors, spacing, type } from '@/components/theme';
import { computeGoals, feetInchesToCm, lbsToKg, validateGoalOverride } from '@/domain/goals';
import type { ActivityLevel, BodyGoal, BodyProfile, Sex } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';
import { isSeedUsernameTaken } from '@/services/seed/seedUsers';
import { backendActive } from '@/services/sync';
import { useAppStore } from '@/store/appStore';
import { useUserStore } from '@/store/userStore';

const AVATAR_EMOJIS = ['🫒', '🥑', '🍓', '🥦', '🍳', '🌮', '🍜', '🏃', '💪', '🧘', '🐟', '🌶️'];
const AVATAR_COLORS = ['#708238', '#C96F4A', '#B8860B', '#4F7942', '#8B6F47', '#556B2F'];

const ACTIVITIES: { key: ActivityLevel; label: string }[] = [
  { key: 'sedentary', label: 'Sedentary' },
  { key: 'light', label: 'Light' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'active', label: 'Active' },
  { key: 'veryActive', label: 'Very active' },
];

const GOALS: { key: BodyGoal; label: string }[] = [
  { key: 'lose', label: 'Lose weight' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'gain', label: 'Gain muscle' },
];

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useUserStore((state) => state.completeOnboarding);
  const units = useAppStore((state) => state.units);
  const setUnits = useAppStore((state) => state.setUnits);

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  // Step 0 — profile
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState(AVATAR_EMOJIS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);

  // Step 1 — body
  const [sex, setSex] = useState<Sex>('unspecified');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [bodyGoal, setBodyGoal] = useState<BodyGoal>('maintain');
  const [bodyError, setBodyError] = useState<string | null>(null);

  // Step 2 — targets
  const [body, setBody] = useState<BodyProfile | undefined>(undefined);
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [usedDefaults, setUsedDefaults] = useState(false);

  const validateProfile = async (): Promise<boolean> => {
    const name = displayName.trim();
    const handle = username.trim().toLowerCase();
    if (name.length < 1 || name.length > 30) {
      setProfileError('Display name needs 1–30 characters.');
      return false;
    }
    if (!USERNAME_RE.test(handle)) {
      setProfileError('Username: 3–20 characters, lowercase letters, numbers, underscores.');
      return false;
    }
    if (isSeedUsernameTaken(handle)) {
      setProfileError('That username is taken.');
      return false;
    }
    // Backend mode: a server-side collision would make the profile upsert fail
    // silently later (unique constraint), leaving the user unsynced forever.
    if (backendActive()) {
      setCheckingName(true);
      try {
        const repo = await import('@/services/supabase/repo');
        if (!(await repo.usernameAvailable(handle))) {
          setProfileError('That username is taken.');
          return false;
        }
      } catch {
        // Offline: let onboarding proceed; the upsert retries via the op log.
      } finally {
        setCheckingName(false);
      }
    }
    setProfileError(null);
    return true;
  };

  const continueFromBody = () => {
    const ageNum = Number(age);
    const weightNum = Number(weight);
    const cm = units === 'metric' ? Number(heightCm) : feetInchesToCm(Number(heightFt) || 0, Number(heightIn) || 0);
    const kg = units === 'metric' ? weightNum : lbsToKg(weightNum);

    if (!Number.isFinite(ageNum) || ageNum < 13 || ageNum > 100) {
      setBodyError('Age must be between 13 and 100.');
      return;
    }
    if (!Number.isFinite(cm) || cm < 100 || cm > 250) {
      setBodyError('Height looks off — double-check it.');
      return;
    }
    if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
      setBodyError('Weight looks off — double-check it.');
      return;
    }
    setBodyError(null);

    const bodyProfile: BodyProfile = {
      sex,
      age: Math.round(ageNum),
      heightCm: Math.round(cm * 10) / 10,
      weightKg: Math.round(kg * 10) / 10,
      activity,
      goal: bodyGoal,
    };
    const goals = computeGoals(bodyProfile);
    setBody(bodyProfile);
    setCalories(String(goals.dailyCalories));
    setProteinG(String(goals.proteinG));
    setCarbsG(String(goals.carbsG));
    setFatG(String(goals.fatG));
    setUsedDefaults(false);
    setStep(3);
  };

  const skipBody = () => {
    setBody(undefined);
    setCalories(String(DEFAULT_GOALS.dailyCalories));
    setProteinG(String(DEFAULT_GOALS.proteinG));
    setCarbsG(String(DEFAULT_GOALS.carbsG));
    setFatG(String(DEFAULT_GOALS.fatG));
    setUsedDefaults(true);
    setStep(3);
  };

  const finish = () => {
    const goals = {
      dailyCalories: Number(calories) || 0,
      proteinG: Number(proteinG) || 0,
      carbsG: Number(carbsG) || 0,
      fatG: Number(fatG) || 0,
    };
    const error = validateGoalOverride(goals);
    if (error) {
      setTargetsError(error);
      return;
    }
    completeOnboarding({
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      avatarEmoji,
      avatarColor,
      goals,
      goalsAreDefault: usedDefaults,
      body,
    });
    router.replace('/text-setup');
  };

  const stepDots = useMemo(
    () => (
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((dot) => (
          <View key={dot} style={[styles.dot, step === dot && styles.dotActive]} />
        ))}
      </View>
    ),
    [step],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.brand}>Oliv</Text>
        <Text style={styles.tagline}>
          {step === 0 ? 'Healthy eating, one text away.' : 'A few details, then you can text your first meal.'}
        </Text>
      </View>
      {stepDots}

      {step === 0 ? (
        <View style={{ gap: spacing(4) }}>
          <View style={{ gap: spacing(2) }}>
            <Text style={styles.introTitle}>Your nutrition coach already lives in Messages.</Text>
            <Text style={styles.introBody}>
              Send a photo, type what you ate, or ask how your day is going. Oliv logs it, learns your
              preferences, and keeps the full picture in the app.
            </Text>
          </View>
          <TextThreadPreview />
          <View style={styles.promiseRow}>
            <Text style={styles.promise}>No searching food databases</Text>
            <Text style={styles.promise}>Corrections by reply</Text>
            <Text style={styles.promise}>Private by default</Text>
          </View>
          <Button title="Build my plan" onPress={() => setStep(1)} />
          <Text style={styles.disclaimer}>
            Oliv provides estimates and general nutrition coaching, not medical care.
          </Text>
        </View>
      ) : null}

      {step === 1 ? (
        <Card style={{ gap: spacing(3) }}>
          <Text style={type.heading}>What should Oliv call you?</Text>
          <Text style={type.small}>This also creates your profile in the companion app.</Text>
          <View style={{ alignItems: 'center', marginVertical: spacing(2) }}>
            <UserAvatar emoji={avatarEmoji} color={avatarColor} size={72} />
          </View>
          <View style={styles.chipRow}>
            {AVATAR_EMOJIS.map((emoji) => (
              <Chip key={emoji} label={emoji} selected={avatarEmoji === emoji} onPress={() => setAvatarEmoji(emoji)} />
            ))}
          </View>
          <View style={styles.chipRow}>
            {AVATAR_COLORS.map((color) => (
              <Chip key={color} label=" " tone={color} selected={avatarColor === color} onPress={() => setAvatarColor(color)} />
            ))}
          </View>
          <Field label="Display name" placeholder="Maya Chen" value={displayName} onChangeText={setDisplayName} maxLength={30} />
          <Field
            label="Username"
            placeholder="maya_c"
            value={username}
            onChangeText={(value) => setUsername(value.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          {profileError ? <Text style={styles.error}>{profileError}</Text> : null}
          <Button
            title="Continue"
            loading={checkingName}
            onPress={async () => {
              if (await validateProfile()) setStep(2);
            }}
          />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card style={{ gap: spacing(3) }}>
          <Text style={type.heading}>Your numbers</Text>
          <Text style={type.small}>We'll compute daily calorie & macro targets (Mifflin-St Jeor). You can edit them next.</Text>

          <View style={{ gap: spacing(2) }}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.chipRow}>
              <Chip label="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
              <Chip label="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
              <Chip label="Prefer not to say" selected={sex === 'unspecified'} onPress={() => setSex('unspecified')} />
            </View>
          </View>

          <View style={{ gap: spacing(2) }}>
            <Text style={styles.label}>Units</Text>
            <View style={styles.chipRow}>
              <Chip label="kg / cm" selected={units === 'metric'} onPress={() => setUnits('metric')} />
              <Chip label="lb / ft-in" selected={units === 'imperial'} onPress={() => setUnits('imperial')} />
            </View>
          </View>

          <Field label="Age" keyboardType="numeric" value={age} onChangeText={setAge} placeholder="27" />
          {units === 'metric' ? (
            <Field label="Height (cm)" keyboardType="numeric" value={heightCm} onChangeText={setHeightCm} placeholder="165" />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing(3) }}>
              <View style={{ flex: 1 }}>
                <Field label="Height (ft)" keyboardType="numeric" value={heightFt} onChangeText={setHeightFt} placeholder="5" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="(in)" keyboardType="numeric" value={heightIn} onChangeText={setHeightIn} placeholder="5" />
              </View>
            </View>
          )}
          <Field
            label={units === 'metric' ? 'Weight (kg)' : 'Weight (lb)'}
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
            placeholder={units === 'metric' ? '62' : '137'}
          />

          <View style={{ gap: spacing(2) }}>
            <Text style={styles.label}>Activity</Text>
            <View style={styles.chipRow}>
              {ACTIVITIES.map((option) => (
                <Chip key={option.key} label={option.label} selected={activity === option.key} onPress={() => setActivity(option.key)} />
              ))}
            </View>
          </View>

          <View style={{ gap: spacing(2) }}>
            <Text style={styles.label}>Goal</Text>
            <View style={styles.chipRow}>
              {GOALS.map((option) => (
                <Chip key={option.key} label={option.label} selected={bodyGoal === option.key} onPress={() => setBodyGoal(option.key)} />
              ))}
            </View>
          </View>

          {bodyError ? <Text style={styles.error}>{bodyError}</Text> : null}
          <Button title="Compute my targets" onPress={continueFromBody} />
          <Button title="Skip for now" variant="ghost" onPress={skipBody} />
        </Card>
      ) : null}

      {step === 3 ? (
        <Card style={{ gap: spacing(3) }}>
          <Text style={type.heading}>Daily targets</Text>
          <Text style={type.small}>
            {usedDefaults
              ? 'Starting with sensible defaults — you can set personalized targets any time in Settings.'
              : 'Computed from your stats. Tweak anything before you start.'}
          </Text>
          <View style={styles.grid}>
            <View style={styles.cell}>
              <Field label="Calories" keyboardType="numeric" value={calories} onChangeText={setCalories} />
            </View>
            <View style={styles.cell}>
              <Field label="Protein (g)" keyboardType="numeric" value={proteinG} onChangeText={setProteinG} />
            </View>
            <View style={styles.cell}>
              <Field label="Carbs (g)" keyboardType="numeric" value={carbsG} onChangeText={setCarbsG} />
            </View>
            <View style={styles.cell}>
              <Field label="Fat (g)" keyboardType="numeric" value={fatG} onChangeText={setFatG} />
            </View>
          </View>
          {targetsError ? <Text style={styles.error}>{targetsError}</Text> : null}
          <Button title="Start tracking 🫒" onPress={finish} />
          <Button title="Back" variant="ghost" onPress={() => setStep(2)} />
        </Card>
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12), paddingTop: spacing(10), width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: spacing(1) },
  brand: { ...type.brand, fontSize: 36 },
  tagline: { ...type.small, textAlign: 'center', color: colors.ink50 },
  introTitle: { ...type.display, fontSize: 32, lineHeight: 36, textAlign: 'center' },
  introBody: { ...type.body, color: colors.ink70, lineHeight: 22, textAlign: 'center' },
  promiseRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing(2) },
  promise: {
    ...type.tiny,
    color: colors.oliveDeep,
    backgroundColor: colors.oliveSoft,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
    overflow: 'hidden',
  },
  disclaimer: { ...type.tiny, textAlign: 'center', lineHeight: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing(2) },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.oliveSoft },
  dotActive: { backgroundColor: colors.olive, width: 22 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  label: { ...type.smallBold, color: colors.oliveDeep },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  cell: { flexBasis: '46%', flexGrow: 1 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
