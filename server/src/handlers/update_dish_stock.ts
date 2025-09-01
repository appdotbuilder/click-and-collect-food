import { db } from '../db';
import { dishesTable } from '../db/schema';
import { type UpdateDishStockInput, type Dish } from '../schema';
import { eq, and } from 'drizzle-orm';

export const updateDishStock = async (input: UpdateDishStockInput): Promise<Dish> => {
  try {
    // First, get the current dish to check if it exists and get stock_threshold
    const existingDish = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, input.id))
      .execute();

    if (existingDish.length === 0) {
      throw new Error(`Dish with ID ${input.id} not found`);
    }

    const dish = existingDish[0];
    
    // Determine the status to set
    let statusToSet = input.status;
    
    // Auto-update status based on stock levels if no explicit status provided
    if (!statusToSet && input.stock_quantity !== undefined) {
      if (input.stock_quantity === 0) {
        statusToSet = 'out_of_stock';
      } else if (
        dish.stock_threshold !== null && 
        input.stock_quantity !== null &&
        input.stock_quantity <= dish.stock_threshold
      ) {
        // Stock is below threshold but not zero - keep current status or set to available
        // Only auto-change to out_of_stock when stock is actually 0
        statusToSet = dish.status === 'out_of_stock' ? 'available' : dish.status;
      } else {
        // Stock is above threshold, ensure it's available if it was previously out of stock
        statusToSet = dish.status === 'out_of_stock' ? 'available' : dish.status;
      }
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.stock_quantity !== undefined) {
      updateData.stock_quantity = input.stock_quantity;
    }

    if (statusToSet) {
      updateData.status = statusToSet;
    }

    // Update the dish
    const result = await db.update(dishesTable)
      .set(updateData)
      .where(eq(dishesTable.id, input.id))
      .returning()
      .execute();

    const updatedDish = result[0];

    // Convert numeric fields back to numbers before returning
    return {
      ...updatedDish,
      price: parseFloat(updatedDish.price),
      allergens: updatedDish.allergens as any, // Type assertion for allergens enum array
      tags: updatedDish.tags as any // Type assertion for tags enum array
    };
  } catch (error) {
    console.error('Dish stock update failed:', error);
    throw error;
  }
};