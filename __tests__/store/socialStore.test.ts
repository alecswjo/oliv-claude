import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Meal } from '@/domain/types';
import {
  canDeleteComment,
  followCountsFor,
  selectDiscoverUsers,
  selectSocialFeed,
  useSocialStore,
} from '@/store/socialStore';
import { useMealStore } from '@/store/mealStore';
import { flushPersistence } from '@/store/persist';

const anchor = new Date(2026, 5, 10, 12);

function resetStores() {
  useSocialStore.setState({
    seeded: false, demoUsers: [], demoMeals: [],
    followingIds: [], followerIds: [], hydrated: false,
  });
  useMealStore.setState({ meals: [], hydrated: false });
}

function ownMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: `own_${Math.random().toString(36).slice(2)}`,
    userId: 'me',
    description: 'my meal',
    mealType: 'lunch',
    loggedAt: new Date(2026, 5, 10, 13).toISOString(),
    nutrition: {
      calories: 500, proteinG: 30, carbsG: 50, fatG: 15,
      fiberG: 5, sugarG: 8, sodiumMg: 500, saturatedFatG: 4,
    },
    foodItems: ['bowl'], fruitVegServings: 1, processingLevel: 2,
    confidence: 'high', healthScore: { value: 4, factors: [] },
    source: 'ai', isPrivate: false, oliveUserIds: [], comments: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetStores();
});

describe('seeding', () => {
  it('seeds once and persists; second call is a no-op', async () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const firstMeals = useSocialStore.getState().demoMeals;
    expect(useSocialStore.getState().seeded).toBe(true);
    expect(useSocialStore.getState().demoUsers).toHaveLength(10);
    expect(firstMeals.length).toBeGreaterThan(100);
    expect(useSocialStore.getState().followerIds).toHaveLength(3);

    useSocialStore.getState().seedIfNeeded(new Date(2027, 0, 1));
    expect(useSocialStore.getState().demoMeals).toBe(firstMeals); // unchanged reference

    await flushPersistence();
    resetStores();
    await useSocialStore.getState().hydrate();
    expect(useSocialStore.getState().seeded).toBe(true);
    expect(useSocialStore.getState().demoMeals).toEqual(firstMeals);
  });
});

describe('follow / unfollow', () => {
  it('is idempotent and persists', async () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    useSocialStore.getState().follow('demo_maya');
    useSocialStore.getState().follow('demo_maya');
    expect(useSocialStore.getState().followingIds).toEqual(['demo_maya']);
    expect(useSocialStore.getState().isFollowing('demo_maya')).toBe(true);

    useSocialStore.getState().unfollow('demo_maya');
    expect(useSocialStore.getState().followingIds).toEqual([]);

    useSocialStore.getState().follow('demo_jake');
    await flushPersistence();
    resetStores();
    await useSocialStore.getState().hydrate();
    expect(useSocialStore.getState().followingIds).toEqual(['demo_jake']);
  });
});

describe('selectSocialFeed (spec F4.2)', () => {
  it('shows followed users public meals plus own public meals, newest first', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const { demoMeals, followingIds } = {
      demoMeals: useSocialStore.getState().demoMeals,
      followingIds: ['demo_maya'],
    };
    const mine = ownMeal();
    const feed = selectSocialFeed({ demoMeals, ownMeals: [mine], followingIds, meId: 'me' });

    expect(feed.some((meal) => meal.userId === 'demo_maya')).toBe(true);
    expect(feed.some((meal) => meal.userId === 'demo_jake')).toBe(false); // not followed
    expect(feed.some((meal) => meal.id === mine.id)).toBe(true);

    for (let i = 1; i < feed.length; i++) {
      expect(new Date(feed[i - 1].loggedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(feed[i].loggedAt).getTime(),
      );
    }
  });

  it('excludes private meals — own and demo (spec F4.7)', () => {
    const privateMine = ownMeal({ isPrivate: true });
    const publicMine = ownMeal();
    const feed = selectSocialFeed({
      demoMeals: [], ownMeals: [privateMine, publicMine], followingIds: [], meId: 'me',
    });
    expect(feed.map((meal) => meal.id)).toEqual([publicMine.id]);
  });

  it('is empty when nothing is followed and there are no own meals', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const feed = selectSocialFeed({
      demoMeals: useSocialStore.getState().demoMeals,
      ownMeals: [], followingIds: [], meId: 'me',
    });
    expect(feed).toEqual([]);
  });
});

describe('selectDiscoverUsers (spec F4.3)', () => {
  it('lists only not-yet-followed demo users', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const users = useSocialStore.getState().demoUsers;
    const discover = selectDiscoverUsers(users, ['demo_maya', 'demo_jake']);
    expect(discover).toHaveLength(8);
    expect(discover.some((user) => user.id === 'demo_maya')).toBe(false);
  });
});

describe('followCountsFor (spec F4.6)', () => {
  it('demo users get baseline counts +1 when followed', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const maya = useSocialStore.getState().demoUsers.find((u) => u.id === 'demo_maya')!;
    const before = followCountsFor(maya, { followingIds: [], followerIds: [] });
    expect(before.followers).toBe(maya.baselineFollowers);

    const after = followCountsFor(maya, { followingIds: ['demo_maya'], followerIds: [] });
    expect(after.followers).toBe((maya.baselineFollowers ?? 0) + 1);
  });

  it('current user counts come from the live follow state', () => {
    const me = { isDemo: false } as never;
    const counts = followCountsFor(me, {
      followingIds: ['demo_a', 'demo_b'],
      followerIds: ['demo_maya', 'demo_priya', 'demo_marcus'],
    });
    expect(counts).toEqual({ followers: 3, following: 2 });
  });
});

describe('olives & comments routing', () => {
  it('toggles olives on demo meals and persists', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const target = useSocialStore.getState().demoMeals[0];
    useSocialStore.getState().toggleOlive(target.id, 'me');
    const updated = useSocialStore.getState().demoMeals.find((m) => m.id === target.id)!;
    expect(updated.oliveUserIds).toContain('me');

    useSocialStore.getState().toggleOlive(target.id, 'me');
    const reverted = useSocialStore.getState().demoMeals.find((m) => m.id === target.id)!;
    expect(reverted.oliveUserIds).not.toContain('me');
  });

  it('routes olives/comments on own meals to the meal store', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const mine = ownMeal();
    useMealStore.getState().addMeal(mine);

    useSocialStore.getState().toggleOlive(mine.id, 'demo_maya');
    expect(useMealStore.getState().meals[0].oliveUserIds).toEqual(['demo_maya']);

    useSocialStore.getState().addComment(mine.id, {
      id: 'c9', userId: 'me', text: 'note to self', createdAt: anchor.toISOString(),
    });
    expect(useMealStore.getState().meals[0].comments.map((c) => c.id)).toContain('c9');

    useSocialStore.getState().deleteComment(mine.id, 'c9');
    expect(useMealStore.getState().meals[0].comments.map((c) => c.id)).not.toContain('c9');
  });

  it('adds comments to demo meals', () => {
    useSocialStore.getState().seedIfNeeded(anchor);
    const target = useSocialStore.getState().demoMeals[0];
    useSocialStore.getState().addComment(target.id, {
      id: 'c2', userId: 'me', text: 'looks great', createdAt: anchor.toISOString(),
    });
    const updated = useSocialStore.getState().demoMeals.find((m) => m.id === target.id)!;
    expect(updated.comments.map((c) => c.id)).toContain('c2');
  });
});

describe('canDeleteComment (spec F4.5)', () => {
  const comment = { id: 'c', userId: 'demo_maya', text: 'hi', createdAt: '' };

  it('allows deleting own comments anywhere', () => {
    expect(canDeleteComment({ comment: { ...comment, userId: 'me' }, mealOwnerId: 'demo_maya', meId: 'me' })).toBe(true);
  });

  it('allows the meal owner to moderate any comment', () => {
    expect(canDeleteComment({ comment, mealOwnerId: 'me', meId: 'me' })).toBe(true);
  });

  it('denies deleting others comments on others meals', () => {
    expect(canDeleteComment({ comment, mealOwnerId: 'demo_jake', meId: 'me' })).toBe(false);
  });
});
