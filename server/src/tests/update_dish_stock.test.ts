import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { dishesTable } from '../db/schema';
import { type UpdateDishStockInput, type CreateDishInput } from '../schema';
import { updateDishStock } from '../handlers/update_dish_stock';
import { eq } from 'drizzle-orm';

// Helper function to create a test dish
const createTestDish = async (overrides: Partial<CreateDishInput> = {}) => {
  const defaultDish: CreateDishInput = {
    name: 'Test Dish',
    description: 'A dish for testing',
    price: 15.99,
    ingredients: 'Test ingredients',
    allergens: ['gluten'],
    photo_url: 'https://example.com/photo.jpg',
    status: 'available',
    tags: ['vegetarian'],
    preparation_time_minutes: 25,
    stock_quantity: 50,
    stock_threshold: 10
  };

  const dishInput = { ...defaultDish, ...overrides };
  
  const result = await db.insert(dishesTable)
    .values({
      name: dishInput.name,
      description: dishInput.description,
      price: dishInput.price.toString(),
      ingredients: dishInput.ingredients,
      allergens: dishInput.allergens,
      photo_url: dishInput.photo_url,
      status: dishInput.status,
      tags: dishInput.tags,
      preparation_time_minutes: dishInput.preparation_time_minutes,
      stock_quantity: dishInput.stock_quantity,
      stock_threshold: dishInput.stock_threshold
    })
    .returning()
    .execute();

  return result[0];
};

describe('updateDishStock', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update dish stock quantity', async () => {
    const dish = await createTestDish();
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 25
    };

    const result = await updateDishStock(input);

    expect(result.id).toEqual(dish.id);
    expect(result.stock_quantity).toEqual(25);
    expect(result.status).toEqual('available'); // Should remain available
    expect(typeof result.price).toEqual('number');
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update dish status explicitly', async () => {
    const dish = await createTestDish();
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 15,
      status: 'unavailable'
    };

    const result = await updateDishStock(input);

    expect(result.id).toEqual(dish.id);
    expect(result.stock_quantity).toEqual(15);
    expect(result.status).toEqual('unavailable');
  });

  it('should auto-set status to out_of_stock when stock is zero', async () => {
    const dish = await createTestDish({ stock_quantity: 10 });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 0
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(0);
    expect(result.status).toEqual('out_of_stock');
  });

  it('should change from out_of_stock to available when stock is replenished', async () => {
    const dish = await createTestDish({ 
      stock_quantity: 0, 
      status: 'out_of_stock' 
    });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 15
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(15);
    expect(result.status).toEqual('available');
  });

  it('should handle stock below threshold without changing status unnecessarily', async () => {
    const dish = await createTestDish({ 
      stock_quantity: 20,
      stock_threshold: 10,
      status: 'available'
    });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 5 // Below threshold but not zero
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(5);
    expect(result.status).toEqual('available'); // Should remain available
  });

  it('should handle dishes with no stock threshold', async () => {
    const dish = await createTestDish({ 
      stock_quantity: 20,
      stock_threshold: null
    });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 1
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(1);
    expect(result.status).toEqual('available');
  });

  it('should handle unlimited stock (null stock_quantity)', async () => {
    const dish = await createTestDish({ stock_quantity: null });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 100
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(100);
    expect(result.status).toEqual('available');
  });

  it('should save changes to database', async () => {
    const dish = await createTestDish();
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 30,
      status: 'unavailable'
    };

    const result = await updateDishStock(input);

    // Verify changes were saved to database
    const savedDish = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, result.id))
      .execute();

    expect(savedDish).toHaveLength(1);
    expect(savedDish[0].stock_quantity).toEqual(30);
    expect(savedDish[0].status).toEqual('unavailable');
    expect(savedDish[0].updated_at).toBeInstanceOf(Date);
  });

  it('should only update stock_quantity if status is not provided', async () => {
    const dish = await createTestDish({ status: 'unavailable' });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 40
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toEqual(40);
    expect(result.status).toEqual('unavailable'); // Should preserve existing status
  });

  it('should throw error when dish does not exist', async () => {
    const input: UpdateDishStockInput = {
      id: 99999,
      stock_quantity: 10
    };

    await expect(updateDishStock(input)).rejects.toThrow(/not found/i);
  });

  it('should handle setting stock to null (unlimited)', async () => {
    const dish = await createTestDish({ stock_quantity: 50 });
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: null
    };

    const result = await updateDishStock(input);

    expect(result.stock_quantity).toBeNull();
    expect(result.status).toEqual('available');
  });

  it('should update updated_at timestamp', async () => {
    const dish = await createTestDish();
    const originalUpdatedAt = dish.updated_at;
    
    // Wait a tiny bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const input: UpdateDishStockInput = {
      id: dish.id,
      stock_quantity: 35
    };

    const result = await updateDishStock(input);

    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });
});