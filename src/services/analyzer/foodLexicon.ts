import type { NutritionFacts, ProcessingLevel } from '@/domain/types';

/**
 * Keyword lexicon for the offline estimator. Values are typical single-serving
 * estimates (US portions) assembled from USDA-style reference data, rounded
 * for readability. Multi-word phrases must come before their single-word
 * prefixes is not required — matching is longest-phrase-first at runtime.
 */

export interface FoodTemplate extends NutritionFacts {
  /** Display name used in foodItems. */
  name: string;
  fruitVegServings: number;
  processingLevel: ProcessingLevel;
}

function food(
  name: string,
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG: number,
  sugarG: number,
  sodiumMg: number,
  saturatedFatG: number,
  fruitVegServings: number,
  processingLevel: ProcessingLevel,
): FoodTemplate {
  return {
    name, calories, proteinG, carbsG, fatG, fiberG, sugarG,
    sodiumMg, saturatedFatG, fruitVegServings, processingLevel,
  };
}

/** Phrase → template. Keys are lowercase; multi-word keys allowed. */
export const FOOD_LEXICON: Record<string, FoodTemplate> = {
  // Proteins
  'grilled chicken': food('Grilled chicken', 280, 38, 0, 13, 0, 0, 320, 3.5, 0, 1),
  'fried chicken': food('Fried chicken', 480, 34, 18, 30, 1, 0, 980, 7, 0, 3),
  chicken: food('Chicken', 320, 35, 2, 18, 0, 0, 420, 4.5, 0, 2),
  salmon: food('Salmon', 350, 34, 0, 22, 0, 0, 95, 4.5, 0, 1),
  tuna: food('Tuna', 200, 40, 0, 3, 0, 0, 320, 1, 0, 2),
  shrimp: food('Shrimp', 170, 30, 2, 4, 0, 0, 480, 0.5, 0, 1),
  steak: food('Steak', 420, 42, 0, 27, 0, 0, 380, 11, 0, 1),
  beef: food('Beef', 400, 35, 0, 28, 0, 0, 350, 11, 0, 2),
  bacon: food('Bacon', 160, 11, 1, 13, 0, 0, 580, 4.5, 0, 4),
  sausage: food('Sausage', 280, 14, 3, 24, 0, 1, 720, 8.5, 0, 4),
  tofu: food('Tofu', 180, 18, 4, 11, 2, 1, 15, 1.5, 0, 2),
  eggs: food('Eggs', 180, 13, 1, 13, 0, 0, 140, 4, 0, 1),
  egg: food('Egg', 90, 6.5, 0.5, 6.5, 0, 0, 70, 2, 0, 1),

  // Carbs & grains
  'brown rice': food('Brown rice', 220, 5, 46, 2, 3.5, 0, 10, 0.5, 0, 1),
  'white rice': food('White rice', 210, 4, 45, 0.5, 0.6, 0, 5, 0, 0, 2),
  rice: food('Rice', 210, 4, 45, 1, 1, 0, 5, 0, 0, 2),
  quinoa: food('Quinoa', 220, 8, 39, 3.5, 5, 1.5, 13, 0.5, 0, 1),
  pasta: food('Pasta', 360, 13, 70, 2, 4, 3, 250, 0.5, 0, 2),
  noodles: food('Noodles', 380, 11, 70, 6, 3, 3, 620, 1, 0, 2),
  bread: food('Bread', 160, 6, 30, 2, 2, 3, 290, 0.5, 0, 2),
  toast: food('Toast', 150, 5, 28, 2, 2, 3, 270, 0.5, 0, 2),
  bagel: food('Bagel', 290, 11, 56, 2, 2.5, 6, 430, 0.5, 0, 2),
  oatmeal: food('Oatmeal', 220, 8, 38, 4.5, 5.5, 1, 5, 1, 0, 1),
  potato: food('Potato', 180, 4, 41, 0, 4, 2, 12, 0, 0.5, 1),
  fries: food('Fries', 380, 4.5, 48, 19, 4.5, 0.5, 290, 3, 0, 3),
  tortilla: food('Tortilla', 140, 4, 24, 3.5, 1.5, 1, 320, 1.5, 0, 2),

  // Composed meals
  burger: food('Burger', 580, 30, 44, 31, 2.5, 9, 980, 11.5, 0.3, 3),
  cheeseburger: food('Cheeseburger', 650, 34, 45, 36, 2.5, 9, 1200, 15, 0.3, 3),
  pizza: food('Pizza (2 slices)', 570, 24, 60, 25, 3.5, 6, 1260, 10.5, 0.4, 3),
  burrito: food('Burrito', 620, 27, 74, 24, 9, 4, 1350, 9.5, 0.8, 2),
  taco: food('Taco', 210, 11, 18, 11, 2.5, 1, 380, 4, 0.3, 2),
  sandwich: food('Sandwich', 430, 22, 44, 18, 3, 5, 980, 5.5, 0.4, 2),
  wrap: food('Wrap', 420, 23, 42, 17, 4, 3, 880, 5, 0.6, 2),
  sushi: food('Sushi (8 pc)', 380, 16, 62, 7, 2.5, 8, 740, 1.5, 0.4, 2),
  ramen: food('Ramen', 550, 22, 72, 19, 4, 5, 1750, 7, 0.5, 3),
  curry: food('Curry', 480, 22, 42, 25, 5, 7, 880, 12, 1.2, 2),
  'stir fry': food('Stir fry', 420, 26, 36, 19, 5, 9, 920, 3.5, 1.8, 1),
  soup: food('Soup', 220, 10, 26, 8, 3.5, 4, 860, 2.5, 1, 2),
  chili: food('Chili', 380, 26, 34, 15, 9, 6, 920, 5.5, 1.2, 2),
  omelette: food('Omelette', 320, 20, 4, 25, 0.5, 2, 480, 9, 0.4, 1),
  pancakes: food('Pancakes', 480, 10, 78, 14, 2, 26, 760, 5.5, 0, 3),
  waffle: food('Waffle', 420, 9, 62, 15, 1.8, 20, 660, 5, 0, 3),
  cereal: food('Cereal with milk', 280, 9, 50, 5, 2.5, 18, 280, 2.5, 0, 4),

  // Salads & vegetables
  'caesar salad': food('Caesar salad', 380, 12, 16, 30, 3.5, 3, 740, 6.5, 1.8, 2),
  salad: food('Salad', 250, 8, 18, 16, 4.5, 5, 380, 3, 2.2, 1),
  bowl: food('Bowl', 520, 28, 56, 19, 8, 7, 760, 4, 1.6, 1),
  broccoli: food('Broccoli', 50, 4, 10, 0.5, 4, 2, 50, 0, 1.5, 1),
  spinach: food('Spinach', 25, 3, 4, 0, 2.5, 0.5, 75, 0, 1.5, 1),
  vegetables: food('Vegetables', 80, 4, 16, 0.5, 5.5, 6, 65, 0, 2, 1),
  veggies: food('Veggies', 80, 4, 16, 0.5, 5.5, 6, 65, 0, 2, 1),
  avocado: food('Avocado', 160, 2, 9, 15, 7, 0.5, 7, 2, 1, 1),

  // Fruit & snacks
  'greek yogurt': food('Greek yogurt', 150, 17, 9, 5, 0, 7, 60, 3, 0, 2),
  yogurt: food('Yogurt', 150, 9, 18, 4, 0, 16, 70, 2.5, 0, 2),
  banana: food('Banana', 105, 1.3, 27, 0.4, 3, 14, 1, 0.1, 1, 1),
  apple: food('Apple', 95, 0.5, 25, 0.3, 4.5, 19, 2, 0, 1, 1),
  berries: food('Berries', 70, 1, 17, 0.5, 4, 10, 1, 0, 1, 1),
  orange: food('Orange', 62, 1.2, 15, 0.2, 3, 12, 0, 0, 1, 1),
  fruit: food('Fruit', 90, 1, 23, 0.3, 3.5, 16, 2, 0, 1, 1),
  smoothie: food('Smoothie', 280, 8, 56, 4, 5, 38, 95, 1.5, 1.8, 2),
  'protein shake': food('Protein shake', 220, 30, 12, 5, 2, 6, 240, 1.5, 0, 4),
  nuts: food('Nuts', 180, 6, 6, 16, 3, 1.5, 90, 2, 0, 1),
  almonds: food('Almonds', 165, 6, 6, 14, 3.5, 1.2, 0, 1, 0, 1),
  'peanut butter': food('Peanut butter', 190, 8, 7, 16, 2, 3, 140, 3, 0, 2),
  hummus: food('Hummus', 140, 4, 12, 9, 3.5, 0.5, 220, 1.2, 0.3, 2),
  cheese: food('Cheese', 110, 7, 1, 9, 0, 0.5, 180, 5.5, 0, 2),
  chips: food('Chips', 160, 2, 15, 10, 1.2, 0.5, 170, 1.5, 0, 4),
  granola: food('Granola bar', 190, 4, 28, 8, 2.5, 11, 105, 1.5, 0, 4),

  // Treats & drinks
  donut: food('Donut', 300, 4, 35, 16, 1, 16, 260, 7, 0, 4),
  doughnut: food('Doughnut', 300, 4, 35, 16, 1, 16, 260, 7, 0, 4),
  cookie: food('Cookie', 200, 2.5, 27, 9.5, 0.8, 16, 140, 4.5, 0, 4),
  cake: food('Cake', 360, 4, 51, 16, 0.8, 36, 320, 6, 0, 4),
  'ice cream': food('Ice cream', 270, 4.5, 31, 14, 0.8, 27, 105, 9, 0, 4),
  chocolate: food('Chocolate', 230, 3, 25, 13, 2.5, 20, 30, 8, 0, 4),
  brownie: food('Brownie', 235, 3, 35, 10, 1.2, 22, 150, 3, 0, 4),
  croissant: food('Croissant', 270, 5.5, 31, 14, 1.6, 6.5, 310, 8, 0, 3),
  muffin: food('Muffin', 380, 6, 54, 16, 1.8, 30, 360, 3, 0, 4),
  soda: food('Soda', 150, 0, 39, 0, 0, 39, 30, 0, 0, 4),
  latte: food('Latte', 190, 10, 18, 9, 0, 17, 140, 5.5, 0, 2),
  coffee: food('Coffee', 5, 0.3, 0, 0, 0, 0, 5, 0, 0, 1),
  beer: food('Beer', 150, 1.5, 13, 0, 0, 0, 14, 0, 0, 2),
  wine: food('Wine', 125, 0, 4, 0, 0, 1, 6, 0, 0, 2),
};

/** Per-meal-type defaults used when nothing in the text matches. */
export const MEAL_TYPE_DEFAULTS: Record<string, FoodTemplate> = {
  breakfast: food('Breakfast', 420, 18, 52, 16, 4, 14, 520, 5, 0.4, 2),
  lunch: food('Lunch', 560, 28, 56, 24, 5, 8, 920, 7, 0.8, 2),
  dinner: food('Dinner', 640, 32, 60, 28, 6, 9, 1040, 8.5, 1, 2),
  snack: food('Snack', 220, 6, 28, 10, 2, 12, 220, 3, 0.2, 3),
};

/** Quantity / size modifiers applied multiplicatively to matched portions. */
export const QUANTITY_MODIFIERS: Record<string, number> = {
  two: 2, double: 2, three: 3, triple: 3, half: 0.5,
  small: 0.7, little: 0.7, large: 1.4, big: 1.4, huge: 1.8, 'extra large': 1.8,
};
