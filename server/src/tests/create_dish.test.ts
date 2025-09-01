import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { dishesTable } from '../db/schema';
import { type CreateDishInput } from '../schema';
import { createDish } from '../handlers/create_dish';
import { eq } from 'drizzle-orm';

// Test input with all required fields and defaults
const testInput: CreateDishInput = {
  name: 'Margherita Pizza',
  description: 'Classic pizza with tomato sauce, mozzarella, and fresh basil',
  price: 12.99,
  ingredients: 'Tomato sauce, mozzarella cheese, fresh basil, olive oil',
  allergens: ['gluten', 'dairy'],
  photo_url: 'https://example.com/pizza.jpg',
  status: 'available',
  tags: ['vegetarian'],
  preparation_time_minutes: 25,
  stock_quantity: 50,
  stock_threshold: 10
};

describe('createDish', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a dish with all fields', async () => {
    const result = await createDish(testInput);

    // Basic field validation
    expect(result.name).toEqual('Margherita Pizza');
    expect(result.description).toEqual(testInput.description);
    expect(result.price).toEqual(12.99);
    expect(typeof result.price).toBe('number');
    expect(result.ingredients).toEqual(testInput.ingredients);
    expect(result.allergens).toEqual(['gluten', 'dairy']);
    expect(result.photo_url).toEqual('https://example.com/pizza.jpg');
    expect(result.status).toEqual('available');
    expect(result.tags).toEqual(['vegetarian']);
    expect(result.preparation_time_minutes).toEqual(25);
    expect(result.stock_quantity).toEqual(50);
    expect(result.stock_threshold).toEqual(10);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save dish to database', async () => {
    const result = await createDish(testInput);

    // Query using proper drizzle syntax
    const dishes = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, result.id))
      .execute();

    expect(dishes).toHaveLength(1);
    const savedDish = dishes[0];
    expect(savedDish.name).toEqual('Margherita Pizza');
    expect(savedDish.description).toEqual(testInput.description);
    expect(parseFloat(savedDish.price)).toEqual(12.99);
    expect(savedDish.ingredients).toEqual(testInput.ingredients);
    expect(savedDish.allergens).toEqual(['gluten', 'dairy']);
    expect(savedDish.photo_url).toEqual('https://example.com/pizza.jpg');
    expect(savedDish.status).toEqual('available');
    expect(savedDish.tags).toEqual(['vegetarian']);
    expect(savedDish.preparation_time_minutes).toEqual(25);
    expect(savedDish.stock_quantity).toEqual(50);
    expect(savedDish.stock_threshold).toEqual(10);
    expect(savedDish.created_at).toBeInstanceOf(Date);
    expect(savedDish.updated_at).toBeInstanceOf(Date);
  });

  it('should create dish with minimal fields and defaults', async () => {
    const minimalInput: CreateDishInput = {
      name: 'Simple Dish',
      description: null,
      price: 8.50,
      ingredients: null,
      allergens: [], // Default empty array
      photo_url: null,
      status: 'available', // Default
      tags: [], // Default empty array
      preparation_time_minutes: 20, // Default
      stock_quantity: null,
      stock_threshold: null
    };

    const result = await createDish(minimalInput);

    expect(result.name).toEqual('Simple Dish');
    expect(result.description).toBeNull();
    expect(result.price).toEqual(8.50);
    expect(typeof result.price).toBe('number');
    expect(result.ingredients).toBeNull();
    expect(result.allergens).toEqual([]);
    expect(result.photo_url).toBeNull();
    expect(result.status).toEqual('available');
    expect(result.tags).toEqual([]);
    expect(result.preparation_time_minutes).toEqual(20);
    expect(result.stock_quantity).toBeNull();
    expect(result.stock_threshold).toBeNull();
  });

  it('should handle multiple allergens and tags', async () => {
    const inputWithMultipleArrays: CreateDishInput = {
      name: 'Complex Dish',
      description: 'A dish with multiple allergens and tags',
      price: 15.75,
      ingredients: 'Various ingredients',
      allergens: ['gluten', 'dairy', 'nuts', 'eggs'],
      photo_url: 'https://example.com/complex.jpg',
      status: 'available',
      tags: ['vegetarian', 'spicy', 'gluten_free'],
      preparation_time_minutes: 30,
      stock_quantity: 25,
      stock_threshold: 5
    };

    const result = await createDish(inputWithMultipleArrays);

    expect(result.allergens).toEqual(['gluten', 'dairy', 'nuts', 'eggs']);
    expect(result.tags).toEqual(['vegetarian', 'spicy', 'gluten_free']);
    expect(result.preparation_time_minutes).toEqual(30);
  });

  it('should handle different dish statuses', async () => {
    const unavailableInput: CreateDishInput = {
      name: 'Unavailable Dish',
      description: 'Currently not available',
      price: 10.00,
      ingredients: null,
      allergens: [],
      photo_url: null,
      status: 'unavailable',
      tags: [],
      preparation_time_minutes: 15,
      stock_quantity: null,
      stock_threshold: null
    };

    const result = await createDish(unavailableInput);

    expect(result.status).toEqual('unavailable');
    expect(result.name).toEqual('Unavailable Dish');
    expect(result.price).toEqual(10.00);
  });

  it('should handle out of stock status with stock tracking', async () => {
    const outOfStockInput: CreateDishInput = {
      name: 'Out of Stock Dish',
      description: 'Currently out of stock',
      price: 22.50,
      ingredients: 'Premium ingredients',
      allergens: ['shellfish'],
      photo_url: 'https://example.com/premium.jpg',
      status: 'out_of_stock',
      tags: ['dairy_free'],
      preparation_time_minutes: 45,
      stock_quantity: 0,
      stock_threshold: 3
    };

    const result = await createDish(outOfStockInput);

    expect(result.status).toEqual('out_of_stock');
    expect(result.stock_quantity).toEqual(0);
    expect(result.stock_threshold).toEqual(3);
    expect(result.allergens).toEqual(['shellfish']);
    expect(result.tags).toEqual(['dairy_free']);
    expect(result.preparation_time_minutes).toEqual(45);
  });

  it('should handle decimal prices correctly', async () => {
    const decimalPriceInput: CreateDishInput = {
      name: 'Precise Price Dish',
      description: 'Testing decimal precision',
      price: 13.45, // Using 2 decimal places for precise numeric handling
      ingredients: null,
      allergens: [],
      photo_url: null,
      status: 'available',
      tags: [],
      preparation_time_minutes: 20,
      stock_quantity: null,
      stock_threshold: null
    };

    const result = await createDish(decimalPriceInput);

    expect(result.price).toEqual(13.45);
    expect(typeof result.price).toBe('number');

    // Verify in database
    const savedDishes = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, result.id))
      .execute();

    expect(parseFloat(savedDishes[0].price)).toEqual(13.45);
  });
});