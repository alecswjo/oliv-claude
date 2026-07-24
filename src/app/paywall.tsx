import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Button, Card } from '@/components/ui';
import { colors, radius, spacing, type } from '@/components/theme';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { showToast } from '@/store/toastStore';

const BENEFITS = [
  ['message-circle', 'Your nutrition coach in Messages'],
  ['camera', 'Log food from a photo or a sentence'],
  ['bookmark', 'A coach that remembers your preferences'],
  ['trending-up', 'Personal targets, trends, and course correction'],
] as const;

export default function PaywallScreen() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.userId);
  const status = useSubscriptionStore((state) => state.status);
  const plans = useSubscriptionStore((state) => state.plans);
  const busy = useSubscriptionStore((state) => state.busy);
  const error = useSubscriptionStore((state) => state.error);
  const initialize = useSubscriptionStore((state) => state.initialize);
  const purchase = useSubscriptionStore((state) => state.purchase);
  const restore = useSubscriptionStore((state) => state.restore);
  const redeem = useSubscriptionStore((state) => state.redeem);
  const plan = plans.find((candidate) => candidate.isMonthly) ?? plans[0];

  const buy = async () => {
    if (!plan) return;
    if (await purchase(plan.id, userId)) {
      showToast('Welcome to Oliv Pro');
      router.back();
    }
  };

  const restoreNow = async () => {
    const active = await restore(userId);
    showToast(active ? 'Oliv Pro restored' : 'No active subscription found');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Icon name="message-circle" color={colors.surface} size={30} />
        </View>
        <Text style={styles.eyebrow}>OLIV PRO</Text>
        <Text style={styles.title}>A nutrition coach{'\n'}who actually follows up.</Text>
        <Text style={styles.subtitle}>
          Text a photo, meal, correction, or question. Oliv keeps the thread and the app in sync.
        </Text>
      </View>

      <Card style={styles.benefits}>
        {BENEFITS.map(([icon, label]) => (
          <View key={label} style={styles.benefit}>
            <View style={styles.check}>
              <Icon name={icon} size={17} color={colors.olive} />
            </View>
            <Text style={styles.benefitText}>{label}</Text>
          </View>
        ))}
      </Card>

      {status === 'pro' ? (
        <Card style={styles.plan}>
          <Text style={type.heading}>You have Oliv Pro</Text>
          <Text style={type.small}>Your subscription is active on this App Store account.</Text>
        </Card>
      ) : status === 'unconfigured' ? (
        <Card style={styles.plan}>
          <Text style={type.heading}>Purchases are not configured in this build</Text>
          <Text style={type.small}>
            Add the RevenueCat public SDK key to the production build, then configure a monthly package.
          </Text>
          <Button title="Check again" variant="secondary" onPress={() => initialize(userId)} />
        </Card>
      ) : plan ? (
        <Card style={styles.plan}>
          <View style={styles.planRow}>
            <View style={{ flex: 1, gap: spacing(1) }}>
              <Text style={type.heading}>{plan.title}</Text>
              {plan.intro ? <Text style={styles.trial}>{plan.intro}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>{plan.price}</Text>
              <Text style={type.tiny}>per {plan.period.replace(/^1 /, '')}</Text>
            </View>
          </View>
          <Button
            title={plan.intro ? `Start ${plan.intro}` : 'Continue'}
            loading={busy}
            onPress={buy}
          />
          <Text style={styles.disclosure}>
            Payment is charged to your App Store account. Subscription renews automatically at {plan.price} per{' '}
            {plan.period.replace(/^1 /, '')} unless canceled at least 24 hours before the current period ends. Manage
            or cancel in App Store settings.
          </Text>
        </Card>
      ) : status === 'loading' ? (
        <Button title="Loading plans…" loading />
      ) : (
        <Card style={styles.plan}>
          <Text style={type.heading}>No subscription is available</Text>
          <Text style={type.small}>Check the current RevenueCat offering and App Store product configuration.</Text>
          <Button title="Try again" variant="secondary" onPress={() => initialize(userId)} />
        </Card>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button title="Restore purchases" variant="ghost" disabled={busy} onPress={restoreNow} />
        {Platform.OS === 'ios' ? (
          <Button
            title="Redeem a friend offer code"
            variant="ghost"
            disabled={busy || status === 'unconfigured'}
            onPress={() => void redeem()}
          />
        ) : null}
      </View>

      <View style={styles.legal}>
        <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>Terms of Use</Text>
        <Text style={type.tiny}>·</Text>
        <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: spacing(5),
    paddingBottom: spacing(14),
    gap: spacing(4),
  },
  hero: { alignItems: 'center', gap: spacing(2), paddingTop: spacing(5) },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.oliveDeep,
  },
  eyebrow: { ...type.micro, color: colors.olive, marginTop: spacing(1) },
  title: { ...type.display, textAlign: 'center', lineHeight: 39 },
  subtitle: { ...type.body, color: colors.ink70, textAlign: 'center', lineHeight: 22, maxWidth: 420 },
  benefits: { gap: spacing(3), padding: spacing(4) },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  check: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.oliveSoft,
  },
  benefitText: { ...type.bodyBold, flex: 1 },
  plan: { gap: spacing(3), padding: spacing(4), borderWidth: 1.5, borderColor: colors.olive },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  price: { ...type.stat, color: colors.oliveDeep },
  trial: { ...type.smallBold, color: colors.olive },
  disclosure: { ...type.tiny, lineHeight: 16, textAlign: 'center' },
  error: { ...type.small, color: colors.danger, textAlign: 'center' },
  actions: { gap: spacing(1) },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: spacing(2) },
  legalLink: { ...type.tiny, color: colors.olive, textDecorationLine: 'underline' },
});
