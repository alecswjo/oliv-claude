import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SUPPORT_EMAIL } from '@/config';
import { colors, spacing, type } from '@/components/theme';

/** In-app terms of use — required for UGC apps (App Store Guideline 1.2). */
export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.title}>Terms of Use</Text>
      <Text style={type.tiny}>Last updated: June 2026</Text>

      <Text style={styles.h}>Not medical advice</Text>
      <Text style={styles.p}>
        Oliv's nutrition estimates and Health Scores are approximations for
        general wellness, not medical or dietary advice. Consult a qualified
        professional before making significant changes to your diet, especially
        if you have a medical condition or a history of disordered eating.
      </Text>

      <Text style={styles.h}>Your content & conduct</Text>
      <Text style={styles.p}>
        You own the content you post and grant us the license needed to display
        it inside the app. We have zero tolerance for objectionable content or
        abusive behavior: no harassment, hate, nudity, spam, or content that
        promotes self-harm or eating disorders. You can report any meal,
        comment, or user from inside the app, and block any user; we review
        reports and remove violating content within 24 hours, and may suspend
        accounts that violate these terms.
      </Text>

      <Text style={styles.h}>Eligibility</Text>
      <Text style={styles.p}>You must be at least 13 years old to use Oliv.</Text>

      <Text style={styles.h}>Account</Text>
      <Text style={styles.p}>
        You're responsible for your account credentials. You can delete your
        account at any time in Settings, which permanently removes your data.
      </Text>

      <Text style={styles.h}>Oliv Pro subscriptions</Text>
      <Text style={styles.p}>
        Oliv Pro is an auto-renewing subscription billed through your App Store
        account. The price, billing period, and any trial or introductory offer
        are shown before purchase. Unless you cancel at least 24 hours before
        the current period ends, the subscription renews and your account is
        charged. Manage or cancel it in your App Store subscription settings.
        Eligibility for trials and offer codes is determined by Apple. You can
        restore purchases from the Oliv Pro screen.
      </Text>

      <Text style={styles.h}>Service</Text>
      <Text style={styles.p}>
        Oliv is provided "as is" without warranties. We may modify or
        discontinue features. We're not liable for indirect damages to the
        maximum extent permitted by law.
      </Text>

      <Text style={styles.h}>Contact</Text>
      <Text style={styles.p}>{SUPPORT_EMAIL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), gap: spacing(2), paddingBottom: spacing(12) },
  h: { ...type.heading, marginTop: spacing(3) },
  p: { ...type.body, color: colors.ink70, lineHeight: 22 },
});
