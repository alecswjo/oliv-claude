import { getSupabase } from './client';

export interface AdminSummary {
  users: number;
  mealsToday: number;
  messages24h: number;
  failedRuns24h: number;
  activeTextLinks: number;
  activePro: number;
  analysesToday: number;
}

export interface AdminAgentRun {
  id: string;
  user_id: string;
  state: string;
  kind: string;
  media_count: number;
  retry_count: number;
  last_error: string | null;
  opened_at: string;
  updated_at: string;
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  created_at: string;
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('is_app_admin');
  if (error) return false;
  return data === true;
}

export async function fetchAdminDashboard(): Promise<{
  summary: AdminSummary;
  runs: AdminAgentRun[];
  reports: AdminReport[];
}> {
  const supabase = client();
  const [summaryResult, runsResult, reportsResult] = await Promise.all([
    supabase.rpc('admin_dashboard_summary'),
    supabase.rpc('admin_recent_agent_runs', { p_limit: 50 }),
    supabase.rpc('admin_recent_reports', { p_limit: 50 }),
  ]);
  const error = summaryResult.error ?? runsResult.error ?? reportsResult.error;
  if (error) throw error;
  return {
    summary: summaryResult.data as unknown as AdminSummary,
    runs: (runsResult.data ?? []) as unknown as AdminAgentRun[],
    reports: (reportsResult.data ?? []) as unknown as AdminReport[],
  };
}
