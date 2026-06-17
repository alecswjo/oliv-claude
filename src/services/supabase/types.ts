import type {
  Comment,
  Confidence,
  Meal,
  MealSource,
  MealType,
  ProcessingLevel,
  UserProfile,
} from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';

/** Database row shapes (snake_case), mirroring supabase/migrations/0001_schema.sql. */

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: string;
  bio: string;
  goals: { dailyCalories: number; proteinG: number; carbsG: number; fatG: number };
  goals_are_default: boolean;
  body: UserProfile['body'] | null;
  default_private: boolean;
  created_at: string;
}

/** The world-readable projection (`public_profiles` view) — no health data. */
export interface PublicProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: string;
  bio: string;
  created_at: string;
}

export interface CommentRow {
  id: string;
  meal_id?: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface MealRow {
  id: string;
  user_id: string;
  /** Legacy single-photo column (read-only back-compat). */
  photo_path: string | null;
  photo_paths: string[];
  emoji: string | null;
  caption?: string | null;
  description: string;
  meal_type: MealType;
  logged_at: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  saturated_fat_g: number;
  food_items: string[];
  fruit_veg_servings: number;
  processing_level: ProcessingLevel;
  confidence: Confidence;
  health_score_value: number;
  health_score_factors: Meal['healthScore']['factors'];
  source: MealSource;
  is_private: boolean;
  /** Embedded via select: olives(user_id) */
  olives?: { user_id: string }[];
  /** Embedded via select: comments(...) */
  comments?: CommentRow[];
}

/* ----------------------------- row → domain ----------------------------- */

export function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    bio: row.bio,
    joinedAt: row.created_at,
    goals: row.goals,
    goalsAreDefault: row.goals_are_default,
    body: row.body ?? undefined,
    defaultPrivate: row.default_private,
    longestStreak: 0, // computed client-side from meal history
    isDemo: false,
  };
}

/** Other users' profiles: goals/body are private, so fill neutral defaults. */
export function rowToPublicProfile(row: PublicProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarEmoji: row.avatar_emoji,
    avatarColor: row.avatar_color,
    bio: row.bio,
    joinedAt: row.created_at,
    goals: DEFAULT_GOALS,
    goalsAreDefault: true,
    defaultPrivate: false,
    longestStreak: 0,
    isDemo: false,
  };
}

export function rowToComment(row: CommentRow): Comment {
  return { id: row.id, userId: row.user_id, text: row.text, createdAt: row.created_at };
}

export function rowToMeal(row: MealRow, photoUrl?: (path: string) => string): Meal {
  const paths = row.photo_paths?.length ? row.photo_paths : row.photo_path ? [row.photo_path] : [];
  return {
    id: row.id,
    userId: row.user_id,
    photoUris: paths.length && photoUrl ? paths.map(photoUrl) : undefined,
    emoji: row.emoji ?? undefined,
    caption: row.caption ?? undefined,
    description: row.description,
    mealType: row.meal_type,
    loggedAt: row.logged_at,
    nutrition: {
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      fiberG: row.fiber_g,
      sugarG: row.sugar_g,
      sodiumMg: row.sodium_mg,
      saturatedFatG: row.saturated_fat_g,
    },
    foodItems: row.food_items,
    fruitVegServings: row.fruit_veg_servings,
    processingLevel: row.processing_level,
    confidence: row.confidence,
    healthScore: { value: row.health_score_value, factors: row.health_score_factors ?? [] },
    source: row.source,
    isPrivate: row.is_private,
    oliveUserIds: (row.olives ?? []).map((o) => o.user_id),
    comments: (row.comments ?? []).map(rowToComment),
  };
}

/* ----------------------------- domain → row ----------------------------- */

/** Insert payload for a meal. `photo_paths` is set separately after upload. */
export function mealToInsert(meal: Meal): Omit<MealRow, 'olives' | 'comments'> {
  return {
    id: meal.id,
    user_id: meal.userId,
    photo_path: null,
    photo_paths: [],
    emoji: meal.emoji ?? null,
    caption: meal.caption ?? null,
    description: meal.description,
    meal_type: meal.mealType,
    logged_at: meal.loggedAt,
    calories: meal.nutrition.calories,
    protein_g: meal.nutrition.proteinG,
    carbs_g: meal.nutrition.carbsG,
    fat_g: meal.nutrition.fatG,
    fiber_g: meal.nutrition.fiberG,
    sugar_g: meal.nutrition.sugarG,
    sodium_mg: meal.nutrition.sodiumMg,
    saturated_fat_g: meal.nutrition.saturatedFatG,
    food_items: meal.foodItems,
    fruit_veg_servings: meal.fruitVegServings,
    processing_level: meal.processingLevel,
    confidence: meal.confidence,
    health_score_value: meal.healthScore.value,
    health_score_factors: meal.healthScore.factors,
    source: meal.source,
    is_private: meal.isPrivate,
  };
}

/** `created_at` is intentionally omitted — the DB default owns it; resending
 *  it would let the client forge its join date (and overwrite it on every save). */
export function profileToUpsert(profile: UserProfile): Omit<ProfileRow, 'created_at'> {
  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.displayName,
    avatar_emoji: profile.avatarEmoji,
    avatar_color: profile.avatarColor,
    bio: profile.bio,
    goals: profile.goals,
    goals_are_default: profile.goalsAreDefault,
    body: profile.body ?? null,
    default_private: profile.defaultPrivate,
  };
}
