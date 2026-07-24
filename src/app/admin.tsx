import { Redirect, Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Pill } from '@/components/ui';
import { colors, fonts, radius, spacing, type } from '@/components/theme';
import type {
  AdminAgentRun,
  AdminReport,
  AdminSummary,
} from '@/services/supabase/admin';
import { useAuthStore } from '@/store/authStore';

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={type.micro}>{label}</Text>
    </Card>
  );
}

export default function AdminScreen() {
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [runs, setRuns] = useState<AdminAgentRun[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const admin = await import('@/services/supabase/admin');
      const allowed = await admin.isAdmin();
      setAuthorized(allowed);
      if (!allowed) return;
      const data = await admin.fetchAdminDashboard();
      setSummary(data.summary);
      setRuns(data.runs);
      setReports(data.reports);
    } catch (err) {
      setError((err as Error).message ?? 'Could not load admin data');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void load();
  }, [load, signedIn]);

  if (!signedIn) return <Redirect href="/sign-in" />;

  return (
    <>
      <Stack.Screen options={{ title: 'Oliv Admin' }} />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.olive} />}
        contentContainerStyle={styles.content}>
        {authorized === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.olive} />
          </View>
        ) : !authorized ? (
          <EmptyState
            icon="shield"
            title="Admin access required"
            body="This account is not listed in app_admins."
          />
        ) : (
          <>
            <View style={{ gap: spacing(1) }}>
              <Text style={type.display}>Operations</Text>
              <Text style={type.small}>Live product health and the newest agent failures.</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {summary ? (
              <View style={styles.metrics}>
                <Metric label="Users" value={summary.users} />
                <Metric label="Meals today" value={summary.mealsToday} />
                <Metric label="Messages · 24h" value={summary.messages24h} />
                <Metric label="Failed · 24h" value={summary.failedRuns24h} />
                <Metric label="Active links" value={summary.activeTextLinks} />
                <Metric label="Oliv Pro" value={summary.activePro} />
                <Metric label="Analyses today" value={summary.analysesToday} />
              </View>
            ) : null}

            <View style={{ gap: spacing(2.5) }}>
              <Text style={type.heading}>Recent agent runs</Text>
              {runs.length === 0 ? <Text style={type.small}>No runs yet.</Text> : null}
              {runs.map((run) => (
                <Card key={run.id} style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Pill
                      text={run.state}
                      color={run.state === 'failed' ? colors.ember : colors.oliveSoft}
                      dark={run.state !== 'failed'}
                    />
                    <Text style={type.tiny}>{new Date(run.updated_at).toLocaleString()}</Text>
                  </View>
                  <Text style={type.smallBold}>{run.kind} · {run.media_count} media · retry {run.retry_count}</Text>
                  {run.last_error ? <Text selectable style={styles.errorDetail}>{run.last_error}</Text> : null}
                  <Text selectable style={styles.id}>{run.id}</Text>
                </Card>
              ))}
            </View>

            <View style={{ gap: spacing(2.5) }}>
              <Text style={type.heading}>Moderation queue</Text>
              {reports.length === 0 ? <Text style={type.small}>No reports.</Text> : null}
              {reports.map((report) => (
                <Card key={report.id} style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Text style={type.smallBold}>{report.subject_type} · {report.reason || 'No reason provided'}</Text>
                    <Text style={type.tiny}>{new Date(report.created_at).toLocaleString()}</Text>
                  </View>
                  <Text selectable style={styles.id}>subject {report.subject_id}</Text>
                </Card>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    padding: spacing(5),
    gap: spacing(5),
    paddingBottom: spacing(16),
  },
  center: { paddingVertical: spacing(16), alignItems: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  metric: { minWidth: 150, flexBasis: '30%', flexGrow: 1, gap: spacing(1) },
  metricValue: { fontFamily: fonts.display, fontSize: 30, color: colors.oliveDeep, fontVariant: ['tabular-nums'] },
  rowCard: { gap: spacing(2.5), borderRadius: radius.md },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(2) },
  error: { ...type.smallBold, color: colors.danger },
  errorDetail: { ...type.small, color: colors.danger, lineHeight: 19 },
  id: { ...type.tiny, fontFamily: 'monospace' },
});
