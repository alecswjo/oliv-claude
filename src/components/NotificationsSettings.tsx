import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Chip } from './ui';
import { colors, spacing, type } from './theme';
import { useNotificationStore, type NotifPrefs } from '@/store/notificationStore';
import { showToast } from '@/store/toastStore';

const TYPE_ROWS: { key: keyof NotifPrefs; label: string; hint: string }[] = [
  { key: 'olives', label: 'Olives', hint: 'When someone gives your meal an olive' },
  { key: 'comments', label: 'Comments', hint: 'When someone comments on your meal' },
  { key: 'follows', label: 'New followers', hint: 'When someone follows you' },
  { key: 'newPosts', label: 'Posts from people you follow', hint: "When someone you follow logs a meal" },
];

const REMINDER_TIMES: { label: string; hour: number }[] = [
  { label: 'Morning', hour: 8 },
  { label: 'Midday', hour: 12 },
  { label: 'Evening', hour: 18 },
  { label: 'Night', hour: 21 },
];

/** Notifications preferences — Settings card. Handles the permission prompt. */
export function NotificationsSettings() {
  const permission = useNotificationStore((s) => s.permission);
  const prefs = useNotificationStore((s) => s.prefs);
  const reminder = useNotificationStore((s) => s.reminder);
  const enable = useNotificationStore((s) => s.enable);
  const setPref = useNotificationStore((s) => s.setPref);
  const setReminderEnabled = useNotificationStore((s) => s.setReminderEnabled);
  const setReminderTime = useNotificationStore((s) => s.setReminderTime);
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    try {
      const granted = await enable();
      showToast(granted ? 'Notifications on' : 'Notifications are off in Settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing(3) }}>
      <Text style={type.heading}>Notifications</Text>

      {permission !== 'granted' ? (
        <>
          <Text style={type.small}>
            Get a nudge when someone reacts to your meals, follows you, or posts — plus an optional
            daily reminder to log.
          </Text>
          {permission === 'denied' ? (
            <>
              <Text style={[type.small, { color: colors.terracotta }]}>
                Notifications are turned off for Oliv in your device Settings.
              </Text>
              {Platform.OS !== 'web' ? (
                <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
              ) : null}
            </>
          ) : (
            <Button title="Turn on notifications" loading={busy} onPress={turnOn} />
          )}
        </>
      ) : (
        <>
          {TYPE_ROWS.map((row) => (
            <View key={row.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyBold}>{row.label}</Text>
                <Text style={type.tiny}>{row.hint}</Text>
              </View>
              <Switch
                accessibilityLabel={row.label}
                value={prefs[row.key]}
                onValueChange={(v) => setPref(row.key, v)}
                trackColor={{ true: colors.olive, false: colors.line }}
              />
            </View>
          ))}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyBold}>Daily reminder</Text>
              <Text style={type.tiny}>A nudge to log your meals</Text>
            </View>
            <Switch
              accessibilityLabel="Daily reminder"
              value={reminder.enabled}
              onValueChange={(v) => setReminderEnabled(v)}
              trackColor={{ true: colors.olive, false: colors.line }}
            />
          </View>

          {reminder.enabled ? (
            <View style={styles.chipRow}>
              {REMINDER_TIMES.map((t) => (
                <Chip
                  key={t.hour}
                  label={t.label}
                  selected={reminder.hour === t.hour}
                  onPress={() => setReminderTime(t.hour, 0)}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
});
