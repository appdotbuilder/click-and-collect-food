import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  dishesTable, 
  dishVariantsTable, 
  usersTable, 
  timeSlotsTable, 
  promoCodesTable,
  customersTable,
  ordersTable,
  orderItemsTable,
  orderPromoCodesTable
} from '../db/schema';
import { type CreateOrderInput } from '../schema';
import { createOrder } from '../handlers/create_order';
import { eq, and } from 'drizzle-orm';

describe('createOrder', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper to create test dishes
  const createTestDish = async (overrides = {}) => {
    const result = await db.insert(dishesTable)
      .values({
        name: 'Test Dish',
        description: 'A test dish',
        price: '19.99',
        ingredients: 'Test ingredients',
        allergens: [],
        status: 'available',
        tags: [],
        preparation_time_minutes: 20,
        stock_quantity: 10,
        ...overrides
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper to create test variant
  const createTestVariant = async (dishId: number, overrides = {}) => {
    const result = await db.insert(dishVariantsTable)
      .values({
        dish_id: dishId,
        name: 'Large',
        price_modifier: '5.00',
        is_default: false,
        ...overrides
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper to create test user
  const createTestUser = async () => {
    const result = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        phone: '1234567890',
        first_name: 'Test',
        last_name: 'User',
        role: 'employee',
        password_hash: 'hashed_password',
        is_active: true
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper to create test time slot
  const createTestTimeSlot = async (overrides = {}) => {
    const result = await db.insert(timeSlotsTable)
      .values({
        date: '2024-01-15',
        start_time: '12:00',
        end_time: '13:00',
        max_capacity: 10,
        current_bookings: 0,
        is_available: true,
        ...overrides
      })
      .returning()
      .execute();
    return result[0];
  };

  // Helper to create test promo code
  const createTestPromoCode = async (overrides = {}) => {
    const result = await db.insert(promoCodesTable)
      .values({
        code: 'TEST20',
        discount_percentage: '20.00',
        discount_amount: null,
        minimum_order_amount: null,
        max_uses: null,
        used_count: 0,
        valid_from: new Date('2020-01-01'),
        valid_until: new Date('2030-12-31'),
        is_active: true,
        ...overrides
      })
      .returning()
      .execute();
    return result[0];
  };

  it('should create a guest order successfully', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: 'Please make it spicy',
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: 'Extra sauce'
      }]
    };

    const result = await createOrder(input);

    expect(result.id).toBeDefined();
    expect(result.order_number).toMatch(/^ORD-\d+-[A-Z0-9]+$/);
    expect(result.customer_id).toBeDefined();
    expect(result.user_id).toBeNull();
    expect(result.status).toEqual('new');
    expect(result.pickup_slot).toEqual(input.pickup_slot);
    expect(result.total_amount).toBeCloseTo(43.18, 2); // (19.99 * 2) * 1.08 = 43.18
    expect(result.tax_amount).toBeCloseTo(3.20, 2); // (19.99 * 2) * 0.08 = 3.20
    expect(result.special_notes).toEqual('Please make it spicy');
    expect(result.qr_code).toMatch(/^QR-ORD-\d+-[A-Z0-9]+$/);
    expect(result.is_guest_order).toBe(true);
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a user order successfully', async () => {
    const dish = await createTestDish();
    const user = await createTestUser();
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      user_id: user.id,
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    const result = await createOrder(input);

    expect(result.customer_id).toBeNull();
    expect(result.user_id).toEqual(user.id);
    expect(result.is_guest_order).toBe(false);
    expect(result.total_amount).toBeCloseTo(21.59, 2); // 19.99 * 1.08 = 21.59
  });

  it('should handle dish variants correctly', async () => {
    const dish = await createTestDish();
    const variant = await createTestVariant(dish.id);
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: variant.id,
        quantity: 1,
        unit_price: 24.99, // base price + variant modifier
        special_requests: null
      }]
    };

    const result = await createOrder(input);

    expect(result.total_amount).toBeCloseTo(26.99, 2); // (19.99 + 5.00) * 1.08 = 26.99
  });

  it('should apply promo code with percentage discount', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    await createTestPromoCode();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'TEST20'
    };

    const result = await createOrder(input);

    // Subtotal: 39.98, Discount: 7.996 (20%), After discount: 31.984, Tax: 2.56, Total: 34.54
    expect(result.total_amount).toBeCloseTo(34.54, 2);
  });

  it('should apply promo code with fixed amount discount', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    await createTestPromoCode({
      code: 'SAVE5',
      discount_percentage: null,
      discount_amount: '5.00'
    });

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'SAVE5'
    };

    const result = await createOrder(input);

    // Subtotal: 39.98, Discount: 5.00, After discount: 34.98, Tax: 2.80, Total: 37.78
    expect(result.total_amount).toBeCloseTo(37.78, 2);
  });

  it('should update stock quantities correctly', async () => {
    const dish = await createTestDish({ stock_quantity: 5 });
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 3,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    await createOrder(input);

    // Check updated stock
    const updatedDishes = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish.id))
      .execute();

    expect(updatedDishes[0].stock_quantity).toEqual(2); // 5 - 3 = 2
    expect(updatedDishes[0].status).toEqual('available');
  });

  it('should update dish status to out_of_stock when stock reaches zero', async () => {
    const dish = await createTestDish({ stock_quantity: 2 });
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    await createOrder(input);

    // Check updated dish status
    const updatedDishes = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish.id))
      .execute();

    expect(updatedDishes[0].stock_quantity).toEqual(0);
    expect(updatedDishes[0].status).toEqual('out_of_stock');
  });

  it('should update time slot booking count', async () => {
    const dish = await createTestDish();
    const timeSlot = await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    await createOrder(input);

    // Check updated time slot
    const updatedTimeSlots = await db.select()
      .from(timeSlotsTable)
      .where(eq(timeSlotsTable.id, timeSlot.id))
      .execute();

    expect(updatedTimeSlots[0].current_bookings).toEqual(1);
  });

  it('should create order items and customer records in database', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: 'Extra spicy'
      }]
    };

    const result = await createOrder(input);

    // Check customer was created
    const customers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, result.customer_id!))
      .execute();

    expect(customers).toHaveLength(1);
    expect(customers[0].email).toEqual('guest@example.com');
    expect(customers[0].first_name).toEqual('Guest');

    // Check order items were created
    const orderItems = await db.select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.order_id, result.id))
      .execute();

    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].dish_id).toEqual(dish.id);
    expect(orderItems[0].quantity).toEqual(2);
    expect(parseFloat(orderItems[0].unit_price)).toEqual(19.99);
    expect(parseFloat(orderItems[0].total_price)).toEqual(39.98);
    expect(orderItems[0].special_requests).toEqual('Extra spicy');
  });

  it('should create promo code record when promo code is used', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    const promoCode = await createTestPromoCode();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 2,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'TEST20'
    };

    const result = await createOrder(input);

    // Check promo code usage was recorded
    const orderPromoCodes = await db.select()
      .from(orderPromoCodesTable)
      .where(eq(orderPromoCodesTable.order_id, result.id))
      .execute();

    expect(orderPromoCodes).toHaveLength(1);
    expect(orderPromoCodes[0].promo_code_id).toEqual(promoCode.id);
    expect(parseFloat(orderPromoCodes[0].discount_applied)).toBeCloseTo(7.996, 2); // 20% of 39.98

    // Check promo code usage count was updated
    const updatedPromoCodes = await db.select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.id, promoCode.id))
      .execute();

    expect(updatedPromoCodes[0].used_count).toEqual(1);
  });

  // Error cases
  it('should throw error for non-existent dish', async () => {
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: 999,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/dish with id 999 not found/i);
  });

  it('should throw error for unavailable dish', async () => {
    const dish = await createTestDish({ status: 'unavailable' });
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/not available/i);
  });

  it('should throw error for insufficient stock', async () => {
    const dish = await createTestDish({ stock_quantity: 2 });
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 5,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/insufficient stock/i);
  });

  it('should throw error for non-existent variant', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: 999,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/variant with id 999 not found/i);
  });

  it('should throw error for invalid promo code', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'INVALID'
    };

    expect(createOrder(input)).rejects.toThrow(/invalid promo code/i);
  });

  it('should throw error for expired promo code', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    await createTestPromoCode({
      valid_until: new Date('2020-01-01'), // Expired
      code: 'EXPIRED20'
    });

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'EXPIRED20'
    };

    expect(createOrder(input)).rejects.toThrow(/not valid at this time/i);
  });

  it('should throw error when promo code usage limit exceeded', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    await createTestPromoCode({
      max_uses: 1,
      used_count: 1, // Already at limit
      code: 'MAXED20'
    });

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'MAXED20'
    };

    expect(createOrder(input)).rejects.toThrow(/usage limit/i);
  });

  it('should throw error when minimum order amount not met', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot();
    await createTestPromoCode({
      minimum_order_amount: '50.00', // Higher than order total
      code: 'MIN50'
    });

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }],
      promo_code: 'MIN50'
    };

    expect(createOrder(input)).rejects.toThrow(/order must be at least/i);
  });

  it('should throw error for unavailable time slot', async () => {
    const dish = await createTestDish();

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/no available time slot/i);
  });

  it('should throw error when time slot is fully booked', async () => {
    const dish = await createTestDish();
    await createTestTimeSlot({
      max_capacity: 2,
      current_bookings: 2 // Fully booked
    });

    const input: CreateOrderInput = {
      customer_info: {
        email: 'guest@example.com',
        phone: '9876543210',
        first_name: 'Guest',
        last_name: 'Customer'
      },
      pickup_slot: new Date('2024-01-15T12:30:00Z'),
      special_notes: null,
      items: [{
        dish_id: dish.id,
        variant_id: null,
        quantity: 1,
        unit_price: 19.99,
        special_requests: null
      }]
    };

    expect(createOrder(input)).rejects.toThrow(/fully booked/i);
  });
});