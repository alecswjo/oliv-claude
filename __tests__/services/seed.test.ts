import { dayKeyFromIso } from '@/domain/dates';
import { buildSeedMeals } from '@/services/seed/seedMeals';
import {
  buildSeedUsers,
  isSeedUsernameTaken,
  SEED_FOLLOWER_IDS,
  SEED_USER_SPECS,
} from '@/services/seed/seedUsers';

const anchor = new Date(2026, 5, 10, 12, 0);

describe('seed users', () => {
  it('provides exactly 10 demo users with unique ids and usernames', () => {
    const users = buildSeedUsers(anchor.toISOString());
    expect(users).toHaveLength(10);
    expect(new Set(users.map((u) => u.id)).size).toBe(10);
    expect(new Set(users.map((u) => u.username)).size).toBe(10);
    for (const user of users) {
      expect(user.isDemo).toBe(true);
      expect(user.baselineFollowers).toBeGreaterThan(0);
    }
  });

  it('seeded follower ids reference real demo users', () => {
    const ids = new Set(SEED_USER_SPECS.map((s) => s.id));
    for (const id of SEED_FOLLOWER_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    expect(SEED_FOLLOWER_IDS).toHaveLength(3);
  });

  it('detects username collisions case-insensitively (spec F1.7)', () => {
    expect(isSeedUsernameTaken('maya_eats')).toBe(true);
    expect(isSeedUsernameTaken('  MAYA_EATS ')).toBe(true);
    expect(isSeedUsernameTaken('totally_new_person')).toBe(false);
  });
});

describe('seed meals', () => {
  const meals = buildSeedMeals(anchor);

  it('is deterministic for a fixed anchor', () => {
    const again = buildSeedMeals(anchor);
    expect(again).toEqual(meals);
  });

  it('generates meals for every demo user across ~14 days', () => {
    const byUser = new Map<string, number>();
    for (const meal of meals) {
      byUser.set(meal.userId, (byUser.get(meal.userId) ?? 0) + 1);
    }
    expect(byUser.size).toBe(10);
    for (const count of byUser.values()) {
      expect(count).toBeGreaterThanOrEqual(14); // at least ~1/day
    }

    const dayKeys = new Set(meals.map((meal) => dayKeyFromIso(meal.loggedAt)));
    expect(dayKeys.size).toBeGreaterThanOrEqual(13);
  });

  it('uses stable ids (interaction deltas depend on them)', () => {
    expect(meals[0].id).toMatch(/^seedmeal_demo_/);
    expect(new Set(meals.map((m) => m.id)).size).toBe(meals.length);
  });

  it('every seed meal passes domain validation invariants', () => {
    for (const meal of meals) {
      expect(meal.nutrition.calories).toBeGreaterThan(0);
      expect(meal.nutrition.calories).toBeLessThanOrEqual(5000);
      expect(meal.nutrition.fiberG).toBeLessThanOrEqual(meal.nutrition.carbsG);
      expect(meal.nutrition.saturatedFatG).toBeLessThanOrEqual(meal.nutrition.fatG);
      expect(meal.healthScore.value).toBeGreaterThanOrEqual(1);
      expect(meal.healthScore.value).toBeLessThanOrEqual(5);
      expect(meal.foodItems.length).toBeGreaterThan(0);
      expect(meal.emoji).toBeTruthy();
      expect(meal.isPrivate).toBe(false);
    }
  });

  it('seeded olives never include the meal owner and reference demo users', () => {
    const demoIds = new Set(SEED_USER_SPECS.map((s) => s.id));
    for (const meal of meals) {
      for (const oliveUser of meal.oliveUserIds) {
        expect(oliveUser).not.toBe(meal.userId);
        expect(demoIds.has(oliveUser)).toBe(true);
      }
    }
  });

  it('some meals carry seeded comments from demo users', () => {
    const withComments = meals.filter((meal) => meal.comments.length > 0);
    expect(withComments.length).toBeGreaterThan(10);
    for (const meal of withComments) {
      expect(meal.comments[0].text.length).toBeGreaterThan(0);
      expect(meal.comments[0].id).toContain(meal.id);
    }
  });

  it('meal scores skew by personality: clean eaters beat indulgent eaters', () => {
    const avg = (userId: string) => {
      const own = meals.filter((meal) => meal.userId === userId);
      return own.reduce((sum, meal) => sum + meal.healthScore.value, 0) / own.length;
    };
    expect(avg('demo_maya')).toBeGreaterThan(avg('demo_sam'));
    expect(avg('demo_elena')).toBeGreaterThan(avg('demo_tom'));
  });
});
