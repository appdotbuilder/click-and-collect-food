import { db } from '../db';
import { dishesTable } from '../db/schema';
import { type CreateDishInput, type Dish } from '../schema';

export const createDish = async (input: CreateDishInput): Promise<Dish> => {
  try {
    // Insert dish record
    const result = await db.insert(dishesTable)
      .values({
        name: input.name,
        description: input.description,
        price: input.price.toString(), // Convert number to string for numeric column
        ingredients: input.ingredients,
        allergens: input.allergens, // JSON column - array of strings
        photo_url: input.photo_url,
        status: input.status,
        tags: input.tags, // JSON column - array of strings
        preparation_time_minutes: input.preparation_time_minutes, // Integer column - no conversion needed
        stock_quantity: input.stock_quantity,
        stock_threshold: input.stock_threshold
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const dish = result[0];
    return {
      ...dish,
      price: parseFloat(dish.price), // Convert string back to number
      allergens: dish.allergens as any, // Type assertion for enum arrays
      tags: dish.tags as any // Type assertion for enum arrays
    };
  } catch (error) {
    console.error('Dish creation failed:', error);
    throw error;
  }
};