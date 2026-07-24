import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { AGENT_NUMBER, isBackendConfigured } from '@/config';
import { Button, Card } from '@/components/ui';
import { colors, spacing, type } from '@/components/theme';
import { fetchAgentLink, mintAgentLinkToken, revokeAgentLink, type AgentLink } from '@/services/agentLink';
import { confirmAction } from '@/services/confirm';
import { showToast } from '@/store/toastStore';
import { useUserStore } from '@/store/userStore';

/**
 * Settings card: link this account to the Oliv texting agent
 * (docs/AGENT_V0_SPEC.md §11). Shown only in backend mode with a configured
 * agent number. Flow: consent dialog → mint one-time code → open Messages
 * prefilled with "LINK <code>" → poll for the link landing.
 */
export function ConnectAgent() {
  const profile = useUserStore((state) => state.profile);
  const [link, setLink] = useState<AgentLink | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollUntil = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const current = await fetchAgentLink();
      setLink(current);
      if (current) setPendingCode(null);
    } catch {
      // transient — settings stays usable
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While a code is pending, poll for the gateway completing the link.
  useEffect(() => {
    if (!pendingCode) return;
    pollUntil.current = Date.now() + 2 * 60_000;
    const timer = setInterval(() => {
      if (Date.now() > pollUntil.current) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingCode, refresh]);

  if (!isBackendConfigured() || !AGENT_NUMBER || !profile) return null;

  const privacyLine = profile.defaultPrivate
    ? 'Meals you text will stay private unless you share them.'
    : 'Heads up: meals you text will post to your feed for followers (your "Private by default" setting is off).';

  const connect = async () => {
    const ok = await confirmAction({
      title: 'Connect Oliv over iMessage?',
      message:
        `Text meal photos to Oliv and they'll be logged to your account.\n\n${privacyLine}\n\n` +
        'Messages are processed by our texting provider (Sendblue) and our AI service to analyze meals. ' +
        'You must be 18 or older to use the texting agent. Disconnect anytime here.',
      confirmLabel: 'Connect',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const minted = await mintAgentLinkToken();
      setPendingCode(minted.token);
      const body = encodeURIComponent(`LINK ${minted.token}`);
      const url =
        Platform.OS === 'ios'
          ? `sms:${AGENT_NUMBER}&body=${body}`
          : `sms:${AGENT_NUMBER}?body=${body}`;
      await Linking.openURL(url).catch(() => {
        // No Messages app (web/simulator) — the manual instructions render below.
      });
    } catch (err) {
      showToast((err as Error).message ?? "Couldn't start linking — try again");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirmAction({
      title: 'Disconnect texting?',
      message: 'Oliv will stop logging meals from this phone number until you reconnect.',
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revokeAgentLink();
      setLink(null);
      showToast('Texting disconnected');
    } catch (err) {
      showToast((err as Error).message ?? "Couldn't disconnect — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing(3) }}>
      <Text style={type.heading}>Text your meals</Text>
      {link ? (
        <>
          <Text style={type.body}>
            Connected as <Text style={type.bodyBold}>{link.phone}</Text> 🫒{'\n'}
            Text a photo of any meal to {AGENT_NUMBER} and it lands in your log.
          </Text>
          <Button title="Disconnect" variant="secondary" loading={busy} onPress={disconnect} />
        </>
      ) : (
        <>
          <Text style={type.body}>
            Text Oliv a photo of your meal and it's logged before you finish eating — no app opening
            required.
          </Text>
          {pendingCode ? (
            <View style={styles.pendingBox}>
              <Text style={type.bodyBold}>Waiting for your text…</Text>
              <Text style={type.small}>
                If Messages didn't open, text{' '}
                <Text style={type.bodyBold}>LINK {pendingCode}</Text> to{' '}
                <Text style={type.bodyBold}>{AGENT_NUMBER}</Text>. Codes expire in 15 minutes.
              </Text>
            </View>
          ) : null}
          <Button
            title={pendingCode ? 'Open Messages again' : 'Connect over iMessage'}
            loading={busy}
            onPress={connect}
          />
          <Text style={type.tiny}>{privacyLine}</Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  pendingBox: {
    backgroundColor: colors.oliveSoft,
    borderRadius: 12,
    padding: spacing(3),
    gap: spacing(1),
  },
});
