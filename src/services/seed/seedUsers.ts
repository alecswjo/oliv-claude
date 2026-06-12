import type { UserProfile } from '@/domain/types';
import { DEFAULT_GOALS } from '@/domain/types';

/** The 10 demo accounts — spec §F4.1. IDs are stable (interaction deltas key on them). */

interface SeedUserSpec {
  id: string;
  username: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  bio: string;
  baselineFollowers: number;
  baselineFollowing: number;
  /** Eating personality drives meal generation in seedMeals.ts. */
  style: 'clean' | 'balanced' | 'indulgent' | 'highProtein' | 'plantBased';
}

export const SEED_USER_SPECS: readonly SeedUserSpec[] = [
  { id: 'demo_maya', username: 'maya_eats', displayName: 'Maya Chen', avatarEmoji: '🥑', avatarColor: '#708238', bio: 'Marathon training, mostly plants. Meal prep Sundays.', baselineFollowers: 412, baselineFollowing: 188, style: 'clean' },
  { id: 'demo_jake', username: 'jakelifts', displayName: 'Jake Torres', avatarEmoji: '🍗', avatarColor: '#C96F4A', bio: 'Powerlifter. Chasing 180g protein a day.', baselineFollowers: 951, baselineFollowing: 203, style: 'highProtein' },
  { id: 'demo_priya', username: 'priya.balance', displayName: 'Priya Sharma', avatarEmoji: '🫒', avatarColor: '#3D4A1F', bio: 'Everything in moderation, including moderation.', baselineFollowers: 287, baselineFollowing: 301, style: 'balanced' },
  { id: 'demo_sam', username: 'sam_snacks', displayName: 'Sam Okafor', avatarEmoji: '🌮', avatarColor: '#B8860B', bio: 'Food first, macros second. Taco scientist.', baselineFollowers: 1204, baselineFollowing: 87, style: 'indulgent' },
  { id: 'demo_elena', username: 'elenagreen', displayName: 'Elena Petrova', avatarEmoji: '🥬', avatarColor: '#4F7942', bio: 'Plant-based 6 years. Soup season is every season.', baselineFollowers: 668, baselineFollowing: 412, style: 'plantBased' },
  { id: 'demo_marcus', username: 'marcusmeals', displayName: 'Marcus Lee', avatarEmoji: '🍳', avatarColor: '#8B6F47', bio: 'Breakfast evangelist. Eggs are a love language.', baselineFollowers: 159, baselineFollowing: 240, style: 'balanced' },
  { id: 'demo_aisha', username: 'aisha.fuel', displayName: 'Aisha Mohammed', avatarEmoji: '🏃‍♀️', avatarColor: '#6B8E23', bio: 'Fueling 10ks and a toddler. Coffee counts as a meal.', baselineFollowers: 534, baselineFollowing: 156, style: 'clean' },
  { id: 'demo_tom', username: 'tommy_t', displayName: 'Tom Nguyen', avatarEmoji: '🍜', avatarColor: '#A0522D', bio: 'Ramen reviews and gym redemption arcs.', baselineFollowers: 89, baselineFollowing: 145, style: 'indulgent' },
  { id: 'demo_grace', username: 'gracenotes', displayName: 'Grace Kim', avatarEmoji: '🍱', avatarColor: '#556B2F', bio: 'Bento boxes & balance. RD student.', baselineFollowers: 2310, baselineFollowing: 95, style: 'clean' },
  { id: 'demo_leo', username: 'leo.eats.all', displayName: 'Leo Martins', avatarEmoji: '🍕', avatarColor: '#9B5E3C', bio: 'Eat big, lift big, nap big.', baselineFollowers: 47, baselineFollowing: 52, style: 'highProtein' },
] as const;

export type { SeedUserSpec };

export function buildSeedUsers(joinedAtIso: string): UserProfile[] {
  return SEED_USER_SPECS.map((spec) => ({
    id: spec.id,
    username: spec.username,
    displayName: spec.displayName,
    avatarEmoji: spec.avatarEmoji,
    avatarColor: spec.avatarColor,
    bio: spec.bio,
    joinedAt: joinedAtIso,
    goals: DEFAULT_GOALS,
    goalsAreDefault: true,
    defaultPrivate: false,
    longestStreak: 0,
    isDemo: true,
    baselineFollowers: spec.baselineFollowers,
    baselineFollowing: spec.baselineFollowing,
  }));
}

/** Demo users that follow the current user at first run — spec §F4.6. */
export const SEED_FOLLOWER_IDS = ['demo_maya', 'demo_priya', 'demo_marcus'] as const;

export function isSeedUsernameTaken(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return SEED_USER_SPECS.some((spec) => spec.username.toLowerCase() === normalized);
}
