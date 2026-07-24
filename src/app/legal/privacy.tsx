import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SUPPORT_EMAIL } from '@/config';
import { colors, spacing, type } from '@/components/theme';

/** In-app privacy policy — App Store Guideline 5.1.1(i). */
export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.title}>Privacy Policy</Text>
      <Text style={type.tiny}>Last updated: July 2026</Text>

      <Text style={styles.h}>What we collect</Text>
      <Text style={styles.p}>
        • Account data: your email address and a user id, used to sign you in.{'\n'}
        • Profile data: username, display name, avatar choice, and bio.{'\n'}
        • Health & fitness data you choose to provide: sex, age, height, weight,
        activity level, and goal — used only to compute your daily targets.{'\n'}
        • Content you create: meal photos, descriptions, nutrition entries,
        comments, and reactions.{'\n'}
        • If you subscribe: purchase and entitlement status from the App Store,
        used to unlock Oliv Pro and restore access across devices.{'\n'}
        • If you connect texting: your phone number and the messages and photos
        you send to Oliv.{'\n'}
        • We do not collect your location, contacts, or advertising identifiers,
        and we do not track you across other apps or websites.
      </Text>

      <Text style={styles.h}>How it's used</Text>
      <Text style={styles.p}>
        Your data powers the app's features: syncing your meals across devices,
        computing nutrition estimates and Health Scores, and showing your public
        meals to people who follow you. Meal photos and descriptions you submit
        for analysis are processed by an AI provider under our server-side key;
        they are not used to train models.
      </Text>

      <Text style={styles.h}>What's visible to others</Text>
      <Text style={styles.p}>
        Your username, display name, avatar, bio, and meals you have NOT marked
        private are visible to other users. Your email, body measurements, and
        calorie goals are never visible to anyone but you.
      </Text>

      <Text style={styles.h}>Texting Oliv (optional)</Text>
      <Text style={styles.p}>
        If you connect the texting agent, your phone number, message content,
        photos you text, and Oliv's replies are processed by our messaging
        provider (Sendblue) to deliver messages, and by our AI provider to
        analyze meals and answer questions — never for advertising or unrelated
        model training. Meals logged by text follow your privacy default.
        Preferences Oliv remembers about you are visible in the app and
        deletable at any time. The texting agent is for adults 18+. Disconnect
        anytime (Settings → Text your meals); deleting your account removes
        your entire message history, linked number, and remembered preferences.
      </Text>

      <Text style={styles.h}>Storage & retention</Text>
      <Text style={styles.p}>
        Data is stored with Supabase (hosted on AWS, US East). Local copies stay
        on your device for offline use. We keep your data until you delete it or
        delete your account.
      </Text>

      <Text style={styles.h}>Deleting your data</Text>
      <Text style={styles.p}>
        You can delete individual meals at any time, or delete your entire
        account (Settings → Delete account), which permanently removes your
        account, profile, meals, photos, comments, and reactions from our
        servers.
      </Text>

      <Text style={styles.h}>Payments</Text>
      <Text style={styles.p}>
        Apple processes payments. RevenueCat helps Oliv verify your subscription
        and receives an app user id, product, purchase, trial, renewal, and
        expiration status. Oliv does not receive your full payment-card details.
      </Text>

      <Text style={styles.h}>Contact</Text>
      <Text style={styles.p}>
        Questions or requests: {SUPPORT_EMAIL}. We respond to reports of
        objectionable content within 24 hours.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing(4), gap: spacing(2), paddingBottom: spacing(12) },
  h: { ...type.heading, marginTop: spacing(3) },
  p: { ...type.body, color: colors.ink70, lineHeight: 22 },
});
