import { db } from '../db';
import { dishesTable, dishVariantsTable } from '../db/schema';
import { type CreateDishVariantInput, type DishVariant } from '../schema';
import { eq } from 'drizzle-orm';

export const createDishVariant = async (input: CreateDishVariantInput): Promise<DishVariant> => {
  try {
    // Verify that the dish exists
    const existingDish = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, input.dish_id))
      .execute();

    if (existingDish.length === 0) {
      throw new Error(`Dish with id ${input.dish_id} does not exist`);
    }

    // If this variant should be the default, unset any existing default
    if (input.is_default) {
      await db.update(dishVariantsTable)
        .set({ is_default: false })
        .where(eq(dishVariantsTable.dish_id, input.dish_id))
        .execute();
    }

    // Insert the new dish variant
    const result = await db.insert(dishVariantsTable)
      .values({
        dish_id: input.dish_id,
        name: input.name,
        price_modifier: input.price_modifier.toString(), // Convert number to string for numeric column
        is_default: input.is_default
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const dishVariant = result[0];
    return {
      ...dishVariant,
      price_modifier: parseFloat(dishVariant.price_modifier) // Convert string back to number
    };
  } catch (error) {
    console.error('Dish variant creation failed:', error);
    throw error;
  }
};