import type { Comment, Meal, UserProfile } from '@/domain/types';
import type { MealEditPatch } from '@/store/mealStore';
import { getSupabase } from './client';
import {
  mealToInsert,
  profileToUpsert,
  rowToComment,
  rowToMeal,
  rowToProfile,
  rowToPublicProfile,
  type CommentRow,
  type MealRow,
  type ProfileRow,
  type PublicProfileRow,
} from './types';

const PHOTO_BUCKET = 'meal-photos';
const MEAL_SELECT = '*, olives(user_id), comments(id,user_id,text,created_at)';

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}

export function publicPhotoUrl(path: string): string {
  return client().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapMeal(row: MealRow): Meal {
  return rowToMeal(row, publicPhotoUrl);
}

/* ------------------------------- profiles ------------------------------- */

export async function fetchProfile(id: string): Promise<UserProfile | null> {
  const { data, error } = await client().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as ProfileRow) : null;
}

export async function upsertProfile(profile: UserProfile): Promise<void> {
  const { error } = await client().from('profiles').upsert(profileToUpsert(profile));
  if (error) throw error;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  // public_profiles, not profiles: profile rows are owner-only under RLS.
  const { data, error } = await client()
    .from('public_profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data == null;
}

/* --------------------------------- meals -------------------------------- */

export async function fetchOwnMeals(userId: string): Promise<Meal[]> {
  const { data, error } = await client()
    .from('meals')
    .select(MEAL_SELECT)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return (data as MealRow[]).map(mapMeal);
}

export async function insertMeal(meal: Meal): Promise<void> {
  const { error } = await client().from('meals').insert(mealToInsert(meal));
  if (error) throw error;
}

export async function setMealPhotoPaths(mealId: string, paths: string[]): Promise<void> {
  const { error } = await client().from('meals').update({ photo_paths: paths }).eq('id', mealId);
  if (error) throw error;
}

export async function updateMeal(id: string, patch: MealEditPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.mealType !== undefined) row.meal_type = patch.mealType;
  if (patch.foodItems !== undefined) row.food_items = patch.foodItems;
  if (patch.fruitVegServings !== undefined) row.fruit_veg_servings = patch.fruitVegServings;
  if (patch.processingLevel !== undefined) row.processing_level = patch.processingLevel;
  if (patch.isPrivate !== undefined) row.is_private = patch.isPrivate;
  if (patch.healthScore !== undefined) {
    row.health_score_value = patch.healthScore.value;
    row.health_score_factors = patch.healthScore.factors;
  }
  if (patch.nutrition !== undefined) {
    const n = patch.nutrition;
    Object.assign(row, {
      calories: n.calories, protein_g: n.proteinG, carbs_g: n.carbsG, fat_g: n.fatG,
      fiber_g: n.fiberG, sugar_g: n.sugarG, sodium_mg: n.sodiumMg, saturated_fat_g: n.saturatedFatG,
    });
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await client().from('meals').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteMeal(id: string): Promise<void> {
  const { error } = await client().from('meals').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------------- olives & comments ------------------------- */

export async function setOlive(mealId: string, userId: string, on: boolean): Promise<void> {
  const db = client();
  const { error } = on
    ? await db.from('olives').upsert({ meal_id: mealId, user_id: userId })
    : await db.from('olives').delete().eq('meal_id', mealId).eq('user_id', userId);
  if (error) throw error;
}

export async function addComment(mealId: string, userId: string, text: string): Promise<Comment> {
  const { data, error } = await client()
    .from('comments')
    .insert({ meal_id: mealId, user_id: userId, text })
    .select('id,user_id,text,created_at')
    .single();
  if (error) throw error;
  return rowToComment(data as CommentRow);
}

/** Insert a comment with a client-provided id (keeps local + server ids in sync). */
export async function insertComment(mealId: string, comment: Comment): Promise<void> {
  const { error } = await client().from('comments').insert({
    id: comment.id,
    meal_id: mealId,
    user_id: comment.userId,
    text: comment.text,
    created_at: comment.createdAt,
  });
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await client().from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

/* -------------------------------- social -------------------------------- */

export async function follow(followerId: string, followingId: string): Promise<void> {
  const { error } = await client()
    .from('follows')
    .upsert({ follower_id: followerId, following_id: followingId });
  if (error) throw error;
}

export async function unfollow(followerId: string, followingId: string): Promise<void> {
  const { error } = await client()
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw error;
}

export async function fetchFollowingIds(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data as { following_id: string }[]).map((r) => r.following_id);
}

/** Ids of everyone who follows `userId`. */
export async function fetchFollowerIds(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('follows')
    .select('follower_id')
    .eq('following_id', userId);
  if (error) throw error;
  return (data as { follower_id: string }[]).map((r) => r.follower_id);
}

/** Public meals from the given authors, newest first (the social feed source). */
export async function fetchFeed(authorIds: string[], limit = 100): Promise<Meal[]> {
  if (authorIds.length === 0) return [];
  const { data, error } = await client()
    .from('meals')
    .select(MEAL_SELECT)
    .in('user_id', authorIds)
    .eq('is_private', false)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as MealRow[]).map(mapMeal);
}

export async function fetchPublicMeals(userId: string): Promise<Meal[]> {
  const { data, error } = await client()
    .from('meals')
    .select(MEAL_SELECT)
    .eq('user_id', userId)
    .eq('is_private', false)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return (data as MealRow[]).map(mapMeal);
}

export interface ProfileStats {
  followers: number;
  following: number;
  mealCount: number;
  avgScore: number | null;
}

export async function fetchStats(profileId: string): Promise<ProfileStats> {
  const { data, error } = await client()
    .from('profile_stats')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as Partial<{ followers: number; following: number; meal_count: number; avg_score: number }>;
  return {
    followers: row.followers ?? 0,
    following: row.following ?? 0,
    mealCount: row.meal_count ?? 0,
    avgScore: row.avg_score ?? null,
  };
}

/** Suggested users to follow: recent joiners, excluding self + already-followed. */
export async function fetchDiscover(excludeIds: string[], limit = 25): Promise<UserProfile[]> {
  let query = client()
    .from('public_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (excludeIds.length > 0) {
    // Quote each id — unquoted values would corrupt the PostgREST filter list.
    query = query.not('id', 'in', `(${excludeIds.map((id) => `"${id}"`).join(',')})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as PublicProfileRow[]).map(rowToPublicProfile);
}

/** Search users by username or display name (case-insensitive substring). */
export async function searchProfiles(query: string, excludeId: string, limit = 25): Promise<UserProfile[]> {
  // Strip PostgREST/ilike metacharacters so the user can't corrupt the filter.
  const q = query.trim().replace(/[%*,()\\]/g, '');
  if (!q) return [];
  const pattern = `*${q}*`;
  const { data, error } = await client()
    .from('public_profiles')
    .select('*')
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as PublicProfileRow[]).map(rowToPublicProfile);
}

/** Fetch several public profiles by id (author resolution for the feed). */
export async function fetchProfilesByIds(ids: string[]): Promise<UserProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client().from('public_profiles').select('*').in('id', ids);
  if (error) throw error;
  return (data as PublicProfileRow[]).map(rowToPublicProfile);
}

/** Fetch another user's public profile (no goals/body — those are owner-only). */
export async function fetchPublicProfile(id: string): Promise<UserProfile | null> {
  const { data, error } = await client()
    .from('public_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPublicProfile(data as PublicProfileRow) : null;
}

/* ----------------------------- trust & safety ---------------------------- */

export async function reportContent(
  reporterId: string,
  subjectType: 'meal' | 'comment' | 'user',
  subjectId: string,
  reason: string,
): Promise<void> {
  const { error } = await client().from('reports').insert({
    reporter_id: reporterId,
    subject_type: subjectType,
    subject_id: subjectId,
    reason: reason.slice(0, 500),
  });
  if (error) throw error;
}

export async function setBlocked(blockerId: string, blockedId: string, on: boolean): Promise<void> {
  const db = client();
  const { error } = on
    ? await db.from('blocks').upsert({ blocker_id: blockerId, blocked_id: blockedId })
    : await db.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw error;
}
