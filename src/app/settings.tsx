import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Chip, Field } from '@/components/ui';
import { ConnectAgent } from '@/components/ConnectAgent';
import { NotificationsSettings } from '@/components/NotificationsSettings';
import { colors, spacing, type } from '@/components/theme';
import { SUPPORT_EMAIL } from '@/config';
import { computeGoals, validateGoalOverride } from '@/domain/goals';
import { confirmAction } from '@/services/confirm';
import { resetAllStores, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { showToast } from '@/store/toastStore';
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
  const aiDataConsentAt = useAppStore((state) => state.aiDataConsentAt);
  const revokeAiDataConsent = useAppStore((state) => state.revokeAiDataConsent);
  const subscriptionStatus = useSubscriptionStore((state) => state.status);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');

  const [calories, setCalories] = useState(String(profile?.goals.dailyCalories ?? ''));
  const [proteinG, setProteinG] = useState(String(profile?.goals.proteinG ?? ''));
  const [carbsG, setCarbsG] = useState(String(profile?.goals.carbsG ?? ''));
  const [fatG, setFatG] = useState(String(profile?.goals.fatG ?? ''));
  const [goalError, setGoalError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!profile) return null;

  const saveProfile = () => {
    updateProfile({ displayName: displayName.trim() || profile.displayName, bio: bio.trim() });
    showToast('Profile saved');
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
    if (!error) {
      setGoals(goals, false);
      showToast('Targets updated');
    }
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
    showToast('Targets recomputed from your body stats');
  };

  const signOut = async () => {
    const ok = await confirmAction({
      title: 'Sign out?',
      message: 'Your data stays safe on the server.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    setSigningOut(true);
    try {
      await useAuthStore.getState().signOut();
      if (router.canGoBack()) router.dismissAll();
      router.replace('/sign-in');
    } finally {
      setSigningOut(false);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmAction({
      title: 'Delete your account?',
      message:
        'This permanently removes your account, profile, meals, photos, and comments from our servers. It cannot be undone.',
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const auth = await import('@/services/supabase/auth');
      await auth.deleteAccount();
      resetAllStores();
      useAuthStore.getState().setUser(null);
      showToast('Account deleted');
      router.dismissAll();
      router.replace('/sign-in');
    } catch (err) {
      showToast((err as Error).message ?? 'Deletion failed — contact support.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmReset = async () => {
    const ok = await confirmAction({
      title: 'Reset Oliv?',
      message: 'This clears your profile, meals, follows, and demo data.',
      confirmLabel: 'Reset everything',
      destructive: true,
    });
    if (!ok) return;
    resetAllStores();
    if (router.canGoBack()) router.dismissAll();
    router.replace('/onboarding');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
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
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyBold}>AI meal analysis</Text>
            <Text style={type.tiny}>
              {aiDataConsentAt
                ? 'Allowed — meal inputs may be processed by our configured AI provider'
                : 'Not yet allowed — Oliv will ask before sending meal inputs'}
            </Text>
          </View>
          {aiDataConsentAt ? (
            <Button
              title="Revoke"
              variant="ghost"
              onPress={() => {
                revokeAiDataConsent();
                showToast('AI analysis permission revoked');
              }}
            />
          ) : null}
        </View>
      </Card>

      <ConnectAgent />

      <Card style={{ gap: spacing(2) }}>
        <Text style={type.heading}>Oliv Pro</Text>
        <Text style={type.small}>
          {subscriptionStatus === 'pro'
            ? 'Your subscription is active.'
            : 'Unlock the full texting coach, durable memory, and personalized follow-ups.'}
        </Text>
        <Button
          title={subscriptionStatus === 'pro' ? 'Manage subscription' : 'View plans'}
          variant="secondary"
          onPress={() =>
            subscriptionStatus === 'pro'
              ? Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {})
              : router.push('/paywall')
          }
        />
      </Card>

      <NotificationsSettings />

      <Card style={{ gap: spacing(1) }}>
        <Text style={type.heading}>About</Text>
        <Button title="Privacy Policy" variant="ghost" onPress={() => router.push('/legal/privacy')} />
        <Button title="Terms of Use" variant="ghost" onPress={() => router.push('/legal/terms')} />
        <Button
          title="Contact us"
          variant="ghost"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
        />
      </Card>

      {requiresAuth ? (
        <Button title="Sign out" variant="secondary" loading={signingOut} onPress={signOut} />
      ) : null}

      {requiresAuth ? (
        <Button title="Delete account" variant="danger" loading={deleting} onPress={deleteAccount} />
      ) : (
        <Button title="Reset all data" variant="danger" onPress={confirmReset} />
      )}
      <Text style={[type.tiny, { textAlign: 'center' }]}>
        Oliv v1 · Nutrition estimates are approximations, not medical advice
      </Text>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  cell: { flexBasis: '46%', flexGrow: 1 },
  label: { ...type.smallBold, color: colors.oliveDeep },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
