import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Divider, Field } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import type { OAuthProvider } from '@/services/supabase/auth';
import { useAuthStore } from '@/store/authStore';
import { useUserStore } from '@/store/userStore';

/**
 * Auth for backend mode: email/password plus OAuth (Google / Apple — the
 * providers must be enabled in the Supabase dashboard). On success we hydrate
 * the user's profile + meals and route to the app or onboarding.
 */
export default function SignInScreen() {
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const profile = useUserStore((state) => state.profile);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Adopt the live session, hydrate server state, and route into the app. */
  const finishSignIn = async () => {
    const auth = await import('@/services/supabase/auth');
    const user = await auth.currentUser();
    if (!user) {
      // Email-confirmation flows return no session until confirmed.
      setNotice('Check your email to confirm your account, then sign in.');
      setMode('in');
      return;
    }
    const { useAuthStore } = await import('@/store/authStore');
    useAuthStore.getState().setUser(user);
    const { hydrateForUser } = await import('@/services/sync');
    const { hasProfile } = await hydrateForUser(user.id);
    router.replace(hasProfile ? '/(tabs)' : '/onboarding');
  };

  const submitEmail = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password (6+ characters).');
      return;
    }
    setBusy('email');
    try {
      const auth = await import('@/services/supabase/auth');
      if (mode === 'up') {
        await auth.signUpEmail(email.trim(), password);
      } else {
        await auth.signInEmail(email.trim(), password);
      }
      await finishSignIn();
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const submitOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setNotice(null);
    setBusy(provider);
    try {
      const auth = await import('@/services/supabase/auth');
      await auth.signInWithProvider(provider);
      if (Platform.OS === 'web') return; // full-page redirect is taking over
      await finishSignIn();
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong.');
    } finally {
      if (Platform.OS !== 'web') setBusy(null);
    }
  };

  // Already signed in with nothing in flight (e.g. landing back here after the
  // web OAuth redirect, where the root layout restored the session): move on.
  if (authStatus === 'signedIn' && busy === null) {
    return <Redirect href={profile ? '/(tabs)' : '/onboarding'} />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={{ fontSize: 52 }}>🫒</Text>
          <Text style={styles.brand}>Oliv</Text>
          <Text style={type.small}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</Text>
        </View>

        <Card style={{ gap: spacing(3) }}>
          <Button
            title="Continue with Apple"
            variant="secondary"
            loading={busy === 'apple'}
            onPress={() => submitOAuth('apple')}
          />
          <Button
            title="Continue with Google"
            variant="secondary"
            loading={busy === 'google'}
            onPress={() => submitOAuth('google')}
          />

          <View style={styles.dividerRow}>
            <Divider style={{ flex: 1 }} />
            <Text style={type.tiny}>or use email</Text>
            <Divider style={{ flex: 1 }} />
          </View>

          <Field
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Field
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button
            title={mode === 'in' ? 'Sign in' : 'Create account'}
            loading={busy === 'email'}
            onPress={submitEmail}
          />
          <Button
            title={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            variant="ghost"
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
              setNotice(null);
            }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing(4), gap: spacing(5), paddingTop: spacing(16) },
  hero: { alignItems: 'center', gap: spacing(1) },
  brand: { fontSize: 40, fontWeight: '900', color: colors.oliveDeep, letterSpacing: -1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  notice: { color: colors.olive, fontSize: 13, fontWeight: '600' },
});
