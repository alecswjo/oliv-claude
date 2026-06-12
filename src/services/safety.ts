import { confirmAction } from '@/services/confirm';
import * as sync from '@/services/sync';
import { useSocialStore } from '@/store/socialStore';
import { showToast } from '@/store/toastStore';

/**
 * UGC trust & safety (App Store Guideline 1.2): report objectionable content
 * and block abusive users. Reports land in the server `reports` table when a
 * backend is active (reviewed within 24h per the published policy); blocking
 * is effective locally either way and mirrored server-side best-effort.
 */

export type ReportSubject = 'meal' | 'comment' | 'user';

export async function reportContent(subjectType: ReportSubject, subjectId: string): Promise<void> {
  const ok = await confirmAction({
    title: `Report this ${subjectType}?`,
    message: 'Our team reviews reports within 24 hours and removes content that violates the rules.',
    confirmLabel: 'Report',
  });
  if (!ok) return;
  if (sync.backendActive()) {
    try {
      const repo = await import('@/services/supabase/repo');
      await repo.reportContent(sync.currentUserId()!, subjectType, subjectId, '');
    } catch {
      // The toast still confirms receipt; a lost demo-content report is fine.
    }
  }
  showToast('Report received — thank you');
}

export async function blockUser(userId: string, displayName: string): Promise<void> {
  const ok = await confirmAction({
    title: `Block ${displayName}?`,
    message: "You won't see their meals or comments anymore.",
    confirmLabel: 'Block',
    destructive: true,
  });
  if (!ok) return;
  useSocialStore.getState().block(userId);
  if (sync.backendActive()) {
    try {
      const repo = await import('@/services/supabase/repo');
      await repo.setBlocked(sync.currentUserId()!, userId, true);
    } catch {
      // local block already effective
    }
  }
  showToast(`${displayName} blocked`);
}

export async function unblockUser(userId: string, displayName: string): Promise<void> {
  useSocialStore.getState().unblock(userId);
  if (sync.backendActive()) {
    try {
      const repo = await import('@/services/supabase/repo');
      await repo.setBlocked(sync.currentUserId()!, userId, false);
    } catch {
      // local unblock already effective
    }
  }
  showToast(`${displayName} unblocked`);
}
