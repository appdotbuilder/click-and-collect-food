import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { dishesTable, dishVariantsTable } from '../db/schema';
import { type CreateDishVariantInput, type CreateDishInput } from '../schema';
import { createDishVariant } from '../handlers/create_dish_variant';
import { eq } from 'drizzle-orm';

// Create test dish first
const testDish: CreateDishInput = {
  name: 'Test Pizza',
  description: 'A pizza for testing',
  price: 12.99,
  ingredients: 'Cheese, Tomato',
  allergens: ['gluten', 'dairy'],
  photo_url: 'https://example.com/pizza.jpg',
  status: 'available',
  tags: ['vegetarian'],
  preparation_time_minutes: 15,
  stock_quantity: 50,
  stock_threshold: 10
};

const testVariantInput: CreateDishVariantInput = {
  dish_id: 1, // Will be set to actual dish ID in tests
  name: 'Large',
  price_modifier: 3.50,
  is_default: false
};

describe('createDishVariant', () => {
  let dishId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create a test dish first
    const dishResult = await db.insert(dishesTable)
      .values({
        name: testDish.name,
        description: testDish.description,
        price: testDish.price.toString(),
        ingredients: testDish.ingredients,
        allergens: testDish.allergens,
        photo_url: testDish.photo_url,
        status: testDish.status,
        tags: testDish.tags,
        preparation_time_minutes: testDish.preparation_time_minutes,
        stock_quantity: testDish.stock_quantity,
        stock_threshold: testDish.stock_threshold
      })
      .returning()
      .execute();

    dishId = dishResult[0].id;
  });

  afterEach(resetDB);

  it('should create a dish variant', async () => {
    const input = { ...testVariantInput, dish_id: dishId };
    const result = await createDishVariant(input);

    // Basic field validation
    expect(result.dish_id).toEqual(dishId);
    expect(result.name).toEqual('Large');
    expect(result.price_modifier).toEqual(3.50);
    expect(typeof result.price_modifier).toBe('number');
    expect(result.is_default).toEqual(false);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save dish variant to database', async () => {
    const input = { ...testVariantInput, dish_id: dishId };
    const result = await createDishVariant(input);

    // Query using proper drizzle syntax
    const variants = await db.select()
      .from(dishVariantsTable)
      .where(eq(dishVariantsTable.id, result.id))
      .execute();

    expect(variants).toHaveLength(1);
    expect(variants[0].dish_id).toEqual(dishId);
    expect(variants[0].name).toEqual('Large');
    expect(parseFloat(variants[0].price_modifier)).toEqual(3.50);
    expect(variants[0].is_default).toEqual(false);
    expect(variants[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle negative price modifiers', async () => {
    const input = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Small',
      price_modifier: -2.00
    };
    const result = await createDishVariant(input);

    expect(result.price_modifier).toEqual(-2.00);
    expect(typeof result.price_modifier).toBe('number');

    // Verify in database
    const variants = await db.select()
      .from(dishVariantsTable)
      .where(eq(dishVariantsTable.id, result.id))
      .execute();

    expect(parseFloat(variants[0].price_modifier)).toEqual(-2.00);
  });

  it('should handle default variant logic', async () => {
    // Create first variant as default
    const firstInput = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Medium',
      is_default: true
    };
    const firstResult = await createDishVariant(firstInput);

    // Verify it's marked as default
    expect(firstResult.is_default).toEqual(true);

    // Create second variant as default - should unset first one
    const secondInput = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Large',
      is_default: true
    };
    const secondResult = await createDishVariant(secondInput);

    // Verify second is now default
    expect(secondResult.is_default).toEqual(true);

    // Check first variant is no longer default
    const updatedFirstVariant = await db.select()
      .from(dishVariantsTable)
      .where(eq(dishVariantsTable.id, firstResult.id))
      .execute();

    expect(updatedFirstVariant[0].is_default).toEqual(false);
  });

  it('should allow multiple non-default variants', async () => {
    // Create multiple non-default variants
    const mediumInput = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Medium',
      price_modifier: 1.50,
      is_default: false
    };
    await createDishVariant(mediumInput);

    const largeInput = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Large',
      price_modifier: 3.50,
      is_default: false
    };
    await createDishVariant(largeInput);

    // Verify both exist and neither is default
    const variants = await db.select()
      .from(dishVariantsTable)
      .where(eq(dishVariantsTable.dish_id, dishId))
      .execute();

    expect(variants).toHaveLength(2);
    expect(variants.every(v => !v.is_default)).toBe(true);
  });

  it('should reject variant for non-existent dish', async () => {
    const input = { ...testVariantInput, dish_id: 99999 };

    await expect(createDishVariant(input)).rejects.toThrow(/Dish with id 99999 does not exist/i);
  });

  it('should handle zero price modifier', async () => {
    const input = { 
      ...testVariantInput, 
      dish_id: dishId,
      name: 'Standard',
      price_modifier: 0
    };
    const result = await createDishVariant(input);

    expect(result.price_modifier).toEqual(0);
    expect(typeof result.price_modifier).toBe('number');
  });
});