import { db } from '../db';
import { dishesTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type Dish, type Allergen, type DishTag } from '../schema';

export const getDishes = async (): Promise<Dish[]> => {
  try {
    // Query available dishes only
    const results = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.status, 'available'))
      .execute();

    // Convert numeric fields back to numbers and ensure proper type conformance
    return results.map(dish => ({
      ...dish,
      price: parseFloat(dish.price), // Convert string to number
      allergens: (dish.allergens || []) as Allergen[], // Type cast for proper schema compliance
      tags: (dish.tags || []) as DishTag[], // Type cast for proper schema compliance
    }));
  } catch (error) {
    console.error('Failed to fetch dishes:', error);
    throw error;
  }
};