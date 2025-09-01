import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { dishesTable } from '../db/schema';
import { type CreateDishInput } from '../schema';
import { getDishes } from '../handlers/get_dishes';

describe('getDishes', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no dishes exist', async () => {
    const result = await getDishes();
    expect(result).toEqual([]);
  });

  it('should fetch all available dishes', async () => {
    // Create test dishes
    const testDishInput: CreateDishInput = {
      name: 'Test Dish',
      description: 'A test dish',
      price: 19.99,
      ingredients: 'Test ingredients',
      allergens: ['gluten', 'dairy'],
      photo_url: 'https://example.com/photo.jpg',
      status: 'available',
      tags: ['vegetarian'],
      preparation_time_minutes: 25,
      stock_quantity: 50,
      stock_threshold: 10
    };

    await db.insert(dishesTable)
      .values({
        name: testDishInput.name,
        description: testDishInput.description,
        price: testDishInput.price.toString(),
        ingredients: testDishInput.ingredients,
        allergens: testDishInput.allergens,
        photo_url: testDishInput.photo_url,
        status: testDishInput.status,
        tags: testDishInput.tags,
        preparation_time_minutes: testDishInput.preparation_time_minutes,
        stock_quantity: testDishInput.stock_quantity,
        stock_threshold: testDishInput.stock_threshold
      })
      .execute();

    const result = await getDishes();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Test Dish');
    expect(result[0].description).toEqual('A test dish');
    expect(result[0].price).toEqual(19.99);
    expect(typeof result[0].price).toEqual('number');
    expect(result[0].ingredients).toEqual('Test ingredients');
    expect(result[0].allergens).toEqual(['gluten', 'dairy']);
    expect(result[0].tags).toEqual(['vegetarian']);
    expect(result[0].status).toEqual('available');
    expect(result[0].preparation_time_minutes).toEqual(25);
    expect(result[0].stock_quantity).toEqual(50);
    expect(result[0].stock_threshold).toEqual(10);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should filter out unavailable dishes', async () => {
    // Create available dish
    await db.insert(dishesTable)
      .values({
        name: 'Available Dish',
        description: 'This is available',
        price: '15.99',
        status: 'available',
        preparation_time_minutes: 20
      })
      .execute();

    // Create unavailable dish
    await db.insert(dishesTable)
      .values({
        name: 'Unavailable Dish',
        description: 'This is not available',
        price: '25.99',
        status: 'unavailable',
        preparation_time_minutes: 30
      })
      .execute();

    // Create out of stock dish
    await db.insert(dishesTable)
      .values({
        name: 'Out of Stock Dish',
        description: 'This is out of stock',
        price: '12.99',
        status: 'out_of_stock',
        preparation_time_minutes: 15
      })
      .execute();

    const result = await getDishes();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Available Dish');
    expect(result[0].status).toEqual('available');
  });

  it('should handle dishes with null values properly', async () => {
    // Create dish with minimal required fields
    await db.insert(dishesTable)
      .values({
        name: 'Minimal Dish',
        price: '10.50',
        status: 'available',
        preparation_time_minutes: 20,
        description: null,
        ingredients: null,
        photo_url: null,
        stock_quantity: null,
        stock_threshold: null
      })
      .execute();

    const result = await getDishes();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Minimal Dish');
    expect(result[0].price).toEqual(10.50);
    expect(typeof result[0].price).toEqual('number');
    expect(result[0].description).toBeNull();
    expect(result[0].ingredients).toBeNull();
    expect(result[0].photo_url).toBeNull();
    expect(result[0].stock_quantity).toBeNull();
    expect(result[0].stock_threshold).toBeNull();
    expect(result[0].allergens).toEqual([]);
    expect(result[0].tags).toEqual([]);
  });

  it('should handle multiple dishes and preserve order', async () => {
    const dishes = [
      { name: 'First Dish', price: '10.00' },
      { name: 'Second Dish', price: '15.50' },
      { name: 'Third Dish', price: '20.99' }
    ];

    // Insert dishes in order
    for (const dish of dishes) {
      await db.insert(dishesTable)
        .values({
          name: dish.name,
          price: dish.price,
          status: 'available',
          preparation_time_minutes: 20
        })
        .execute();
    }

    const result = await getDishes();

    expect(result).toHaveLength(3);
    expect(result[0].name).toEqual('First Dish');
    expect(result[0].price).toEqual(10.00);
    expect(result[1].name).toEqual('Second Dish');
    expect(result[1].price).toEqual(15.50);
    expect(result[2].name).toEqual('Third Dish');
    expect(result[2].price).toEqual(20.99);
    
    // Verify all prices are numbers
    result.forEach(dish => {
      expect(typeof dish.price).toEqual('number');
    });
  });

  it('should handle dishes with complex allergens and tags', async () => {
    await db.insert(dishesTable)
      .values({
        name: 'Complex Dish',
        price: '18.75',
        status: 'available',
        preparation_time_minutes: 35,
        allergens: ['gluten', 'dairy', 'nuts', 'eggs'],
        tags: ['vegetarian', 'spicy', 'gluten_free']
      })
      .execute();

    const result = await getDishes();

    expect(result).toHaveLength(1);
    expect(result[0].allergens).toEqual(['gluten', 'dairy', 'nuts', 'eggs']);
    expect(result[0].tags).toEqual(['vegetarian', 'spicy', 'gluten_free']);
  });
});