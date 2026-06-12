import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Chip, Field } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import { computeGoals, validateGoalOverride } from '@/domain/goals';
import { testApiKey } from '@/services/analyzer/claudeAnalyzer';
import { clearApiKey, getApiKey, maskKey, setApiKey } from '@/services/secureKey';
import { resetAllStores, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';

/** Settings — spec §F7. */
export default function SettingsScreen() {
  const router = useRouter();
  const requiresAuth = useAuthStore((state) => state.requiresAuth);
  const profile = useUserStore((state) => state.profile);
  const updateProfile = useUserStore((state) => state.updateProfile);
  const setGoals = useUserStore((state) => state.setGoals);
  const units = useAppStore((state) => state.units);
  const setUnits = useAppStore((state) => state.setUnits);
  const setHasApiKey = useAppStore((state) => state.setHasApiKey);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');

  const [calories, setCalories] = useState(String(profile?.goals.dailyCalories ?? ''));
  const [proteinG, setProteinG] = useState(String(profile?.goals.proteinG ?? ''));
  const [carbsG, setCarbsG] = useState(String(profile?.goals.carbsG ?? ''));
  const [fatG, setFatG] = useState(String(profile?.goals.fatG ?? ''));
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalSaved, setGoalSaved] = useState(false);

  const [storedKeyMask, setStoredKeyMask] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void getApiKey().then((key) => setStoredKeyMask(key ? maskKey(key) : null));
  }, []);

  if (!profile) return null;

  const saveProfile = () => {
    updateProfile({ displayName: displayName.trim() || profile.displayName, bio: bio.trim() });
  };

  const saveGoals = () => {
    const goals = {
      dailyCalories: Number(calories) || 0,
      proteinG: Number(proteinG) || 0,
      carbsG: Number(carbsG) || 0,
      fatG: Number(fatG) || 0,
    };
    const error = validateGoalOverride(goals);
    setGoalError(error);
    setGoalSaved(!error);
    if (!error) setGoals(goals, false);
  };

  const recomputeFromBody = () => {
    if (!profile.body) return;
    const goals = computeGoals(profile.body);
    setCalories(String(goals.dailyCalories));
    setProteinG(String(goals.proteinG));
    setCarbsG(String(goals.carbsG));
    setFatG(String(goals.fatG));
    setGoals(goals, false);
    setGoalError(null);
    setGoalSaved(true);
  };

  const saveKey = async () => {
    const draft = keyDraft.trim();
    if (!draft) return;
    await setApiKey(draft);
    setStoredKeyMask(maskKey(draft));
    setHasApiKey(true);
    setKeyDraft('');
    setKeyStatus('Key saved. Meals will now be analyzed by Claude.');
  };

  const removeKey = async () => {
    await clearApiKey();
    setStoredKeyMask(null);
    setHasApiKey(false);
    setKeyStatus('Key removed. Back to offline estimates.');
  };

  const runKeyTest = async () => {
    const key = (await getApiKey()) ?? keyDraft.trim();
    if (!key) {
      setKeyStatus('Enter or save a key first.');
      return;
    }
    setTesting(true);
    const result = await testApiKey(key);
    setTesting(false);
    setKeyStatus(
      result === 'valid'
        ? '✅ Key works.'
        : result === 'auth'
          ? '❌ Invalid key — double-check it in the Anthropic console.'
          : "⚠️ Couldn't reach Anthropic — check your connection.",
    );
  };

  const confirmReset = () => {
    Alert.alert('Reset Oliv?', 'This clears your profile, meals, follows, and demo data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset everything',
        style: 'destructive',
        onPress: () => {
          resetAllStores();
          router.dismissAll();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Profile</Text>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={30} />
        <Field label="Bio" value={bio} onChangeText={setBio} maxLength={120} multiline style={{ minHeight: 60 }} />
        <Button title="Save profile" variant="secondary" onPress={saveProfile} />
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Daily targets</Text>
        {profile.goalsAreDefault ? (
          <Text style={[type.small, { color: colors.terracotta }]}>
            You're on default targets — set them from your body stats or edit below.
          </Text>
        ) : null}
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
        {goalError ? <Text style={styles.error}>{goalError}</Text> : null}
        {goalSaved && !goalError ? <Text style={styles.success}>Targets updated.</Text> : null}
        <View style={{ flexDirection: 'row', gap: spacing(3) }}>
          <Button title="Save targets" onPress={saveGoals} style={{ flex: 1 }} />
          {profile.body ? (
            <Button title="From my body" variant="secondary" onPress={recomputeFromBody} style={{ flex: 1 }} />
          ) : null}
        </View>
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Preferences</Text>
        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Units for body inputs</Text>
          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
            <Chip label="Metric (kg/cm)" selected={units === 'metric'} onPress={() => setUnits('metric')} />
            <Chip label="Imperial (lb/ft)" selected={units === 'imperial'} onPress={() => setUnits('imperial')} />
          </View>
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyBold}>Private by default</Text>
            <Text style={type.tiny}>New meals start hidden from followers</Text>
          </View>
          <Switch
            accessibilityLabel="Private by default"
            value={profile.defaultPrivate}
            onValueChange={(value) => updateProfile({ defaultPrivate: value })}
            trackColor={{ true: colors.olive, false: colors.line }}
          />
        </View>
      </Card>

      <Card style={{ gap: spacing(3) }}>
        <Text style={type.heading}>Claude AI analysis</Text>
        <Text style={type.small}>
          Oliv works offline with built-in estimates. Add an Anthropic API key to get real AI photo
          analysis. The key is kept in the iOS Keychain and only sent to Anthropic.
        </Text>
        {storedKeyMask ? (
          <View style={styles.switchRow}>
            <Text style={[type.bodyBold, type.numeric]}>{storedKeyMask}</Text>
            <Button title="Remove" variant="danger" onPress={removeKey} style={styles.smallButton} />
          </View>
        ) : (
          <>
            <Field
              label="API key"
              placeholder="sk-ant-…"
              value={keyDraft}
              onChangeText={setKeyDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Button title="Save key" onPress={saveKey} disabled={keyDraft.trim().length === 0} />
          </>
        )}
        <Button title={testing ? 'Testing…' : 'Test key'} variant="secondary" loading={testing} onPress={runKeyTest} />
        {keyStatus ? <Text style={type.small}>{keyStatus}</Text> : null}
      </Card>

      {requiresAuth ? (
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() =>
            Alert.alert('Sign out?', 'Your data stays safe on the server.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                onPress: async () => {
                  await useAuthStore.getState().signOut();
                  router.replace('/sign-in');
                },
              },
            ])
          }
        />
      ) : null}

      <Button title="Reset all data" variant="danger" onPress={confirmReset} />
      <Text style={[type.tiny, { textAlign: 'center' }]}>
        Oliv v1 · AI estimates are approximations, not medical advice
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  cell: { flexBasis: '46%', flexGrow: 1 },
  label: { ...type.smallBold, color: colors.oliveDeep },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  smallButton: { minHeight: 36, paddingVertical: 6 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  success: { color: colors.olive, fontSize: 13, fontWeight: '600' },
});
