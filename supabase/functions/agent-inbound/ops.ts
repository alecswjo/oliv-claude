// Shared IO operations for the gateway: analysis calls, meal building/commit,
// photo upload. Used by both the deterministic photo path (index.ts) and the
// chat tools (agent.ts).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { validateAnalysis } from '../../../src/domain/nutritionValidation.ts';
import { computeHealthScore } from '../../../src/domain/healthScore.ts';
import type { MealAnalysis, MealType } from '../../../src/domain/types.ts';

export interface AnalyzePhotoInput {
  base64: string;
  mediaType: string;
}

export interface CorrectionInput {
  previousAnalysis: unknown;
  previousDescription: string;
  instruction: string;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Local day key (YYYY-MM-DD) for an instant in an IANA timezone. */
export function dayKeyInTz(iso: string, timezone: string | null): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone ?? 'UTC' });
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

/** Call agent-analyze (shares the analyze prompt/key/quota server-side). */
export async function callAgentAnalyze(args: {
  userId: string;
  photos?: AnalyzePhotoInput[];
  description?: string;
  mealType: MealType;
  correction?: CorrectionInput;
}): Promise<{ ok: true; analysis: Partial<MealAnalysis> } | { ok: false; status: number; error: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-analyze`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-secret': Deno.env.get('AGENT_SECRET') ?? '',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: String(body?.error ?? 'analysis failed') };
  }
  return { ok: true, analysis: body.analysis as Partial<MealAnalysis> };
}

export interface CommitMealArgs {
  admin: SupabaseClient;
  runId: string | null;
  mealId: string;
  userId: string;
  ingestionKey: string;
  description: string;
  caption?: string;
  mealType: MealType;
  loggedAt: string;
  isPrivate: boolean;
  photoPaths: string[];
  analysis: Partial<MealAnalysis>;
}

/**
 * Validate → score → exactly-once insert via the commit_agent_meal RPC.
 * Returns the validated analysis + score for reply formatting.
 */
export async function commitMeal(args: CommitMealArgs) {
  const validated = validateAnalysis(args.analysis);
  const score = computeHealthScore(validated);
  const row = {
    id: args.mealId,
    user_id: args.userId,
    ingestion_key: args.ingestionKey,
    via: 'imessage',
    photo_paths: args.photoPaths,
    caption: args.caption ?? '',
    description: args.description,
    meal_type: args.mealType,
    logged_at: args.loggedAt,
    calories: validated.calories,
    protein_g: validated.proteinG,
    carbs_g: validated.carbsG,
    fat_g: validated.fatG,
    fiber_g: validated.fiberG,
    sugar_g: validated.sugarG,
    sodium_mg: validated.sodiumMg,
    saturated_fat_g: validated.saturatedFatG,
    food_items: validated.foodItems,
    fruit_veg_servings: validated.fruitVegServings,
    processing_level: validated.processingLevel,
    confidence: validated.confidence,
    health_score_value: score.value,
    health_score_factors: score.factors,
    source: 'ai',
    is_private: args.isPrivate,
  };
  const { data, error } = await args.admin.rpc('commit_agent_meal', {
    p_run_id: args.runId,
    p_meal: row,
  });
  if (error) throw new Error(`commit_agent_meal failed: ${error.message}`);
  return { validated, score, mealId: (data as { mealId: string }).mealId };
}

/** Idempotent photo upload at the app's exact path convention. */
export async function uploadPhoto(
  admin: SupabaseClient,
  userId: string,
  mealId: string,
  index: number,
  bytes: Uint8Array,
): Promise<string> {
  const path = `${userId}/${mealId}-${index}.jpg`;
  const { error } = await admin.storage
    .from('meal-photos')
    .upload(path, bytes.slice().buffer as ArrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return path;
}
