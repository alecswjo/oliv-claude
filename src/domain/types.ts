export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Confidence = 'high' | 'medium' | 'low';
export type MealSource = 'ai' | 'ai-adjusted' | 'manual';
export type ProcessingLevel = 1 | 2 | 3 | 4;
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type BodyGoal = 'lose' | 'maintain' | 'gain';
export type Sex = 'male' | 'female' | 'unspecified';

export interface NutritionFacts {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  saturatedFatG: number;
}

export interface MealAnalysis extends NutritionFacts {
  foodItems: string[];
  fruitVegServings: number;
  processingLevel: ProcessingLevel;
  confidence: Confidence;
}

export interface ScoreFactor {
  factor: string;
  label: string;
  delta: number;
}

export interface HealthScore {
  value: number;
  factors: ScoreFactor[];
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface Meal {
  id: string;
  userId: string;
  photoUri?: string;
  emoji?: string;
  description: string;
  mealType: MealType;
  loggedAt: string;
  nutrition: NutritionFacts;
  foodItems: string[];
  fruitVegServings: number;
  processingLevel: ProcessingLevel;
  confidence: Confidence;
  healthScore: HealthScore;
  source: MealSource;
  isPrivate: boolean;
  oliveUserIds: string[];
  comments: Comment[];
}

export interface Goals {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface BodyProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: BodyGoal;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  bio: string;
  joinedAt: string;
  goals: Goals;
  goalsAreDefault: boolean;
  body?: BodyProfile;
  defaultPrivate: boolean;
  /** Recomputed from meal history whenever meals change (spec F6.1). */
  longestStreak: number;
  isDemo: boolean;
  /** Demo users only: seeded display-only baseline counts (spec F4.6). */
  baselineFollowers?: number;
  baselineFollowing?: number;
}

/** Skip-flow defaults — F1.4 applied to 2,000 kcal at the 20% protein floor. */
export const DEFAULT_GOALS: Goals = {
  dailyCalories: 2000,
  proteinG: 100,
  carbsG: 263,
  fatG: 61,
};
