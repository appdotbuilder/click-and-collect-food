import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable, customersTable, usersTable, paymentsTable, dishVariantsTable } from '../db/schema';
import { getOrderById } from '../handlers/get_order_by_id';

describe('getOrderById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent order', async () => {
    const result = await getOrderById(999);
    expect(result).toBeNull();
  });

  it('should fetch order with all basic fields', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        email: 'customer@test.com',
        phone: '123-456-7890',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();

    const [dish] = await db.insert(dishesTable)
      .values({
        name: 'Test Dish',
        description: 'A test dish',
        price: '15.99',
        ingredients: 'Test ingredients',
        allergens: ['gluten'],
        status: 'available',
        tags: ['vegetarian'],
        preparation_time_minutes: 20
      })
      .returning()
      .execute();

    // Create order
    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-001',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-15T12:00:00Z'),
        total_amount: '15.99',
        tax_amount: '1.28',
        special_notes: 'Test special notes',
        internal_notes: 'Test internal notes',
        qr_code: 'QR123',
        is_guest_order: true
      })
      .returning()
      .execute();

    // Create order item
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '15.99',
        total_price: '15.99',
        special_requests: 'No onions'
      })
      .execute();

    // Create payment
    await db.insert(paymentsTable)
      .values({
        order_id: order.id,
        amount: '15.99',
        tax_amount: '1.28',
        method: 'online',
        status: 'captured',
        transaction_id: 'TXN123'
      })
      .execute();

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(order.id);
    expect(result!.order_number).toEqual('ORD-001');
    expect(result!.customer_id).toEqual(customer.id);
    expect(result!.user_id).toBeNull();
    expect(result!.status).toEqual('new');
    expect(result!.pickup_slot).toBeInstanceOf(Date);
    expect(result!.total_amount).toEqual(15.99);
    expect(typeof result!.total_amount).toBe('number');
    expect(result!.tax_amount).toEqual(1.28);
    expect(typeof result!.tax_amount).toBe('number');
    expect(result!.special_notes).toEqual('Test special notes');
    expect(result!.internal_notes).toEqual('Test internal notes');
    expect(result!.qr_code).toEqual('QR123');
    expect(result!.is_guest_order).toBe(true);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should fetch user order correctly', async () => {
    // Create user instead of customer
    const [user] = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        phone: '123-456-7890',
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'employee',
        password_hash: 'hashed_password',
        is_active: true
      })
      .returning()
      .execute();

    const [dish] = await db.insert(dishesTable)
      .values({
        name: 'User Dish',
        price: '12.50',
        status: 'available',
        preparation_time_minutes: 15
      })
      .returning()
      .execute();

    // Create user order (not guest order)
    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-002',
        user_id: user.id,
        status: 'preparing',
        pickup_slot: new Date('2024-01-16T14:00:00Z'),
        total_amount: '12.50',
        tax_amount: '1.00',
        is_guest_order: false
      })
      .returning()
      .execute();

    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '12.50',
        total_price: '12.50'
      })
      .execute();

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    expect(result!.user_id).toEqual(user.id);
    expect(result!.customer_id).toBeNull();
    expect(result!.is_guest_order).toBe(false);
    expect(result!.status).toEqual('preparing');
    expect(result!.total_amount).toEqual(12.50);
  });

  it('should fetch order with dish variants', async () => {
    const [customer] = await db.insert(customersTable)
      .values({
        email: 'variant@test.com',
        phone: '123-456-7890',
        first_name: 'Variant',
        last_name: 'Test'
      })
      .returning()
      .execute();

    const [dish] = await db.insert(dishesTable)
      .values({
        name: 'Pizza',
        price: '10.00',
        status: 'available',
        preparation_time_minutes: 25
      })
      .returning()
      .execute();

    // Create dish variant
    const [variant] = await db.insert(dishVariantsTable)
      .values({
        dish_id: dish.id,
        name: 'Large',
        price_modifier: '5.00',
        is_default: false
      })
      .returning()
      .execute();

    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-003',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-17T13:00:00Z'),
        total_amount: '15.00',
        tax_amount: '1.20',
        is_guest_order: true
      })
      .returning()
      .execute();

    // Create order item with variant
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        variant_id: variant.id,
        quantity: 1,
        unit_price: '15.00',
        total_price: '15.00',
        special_requests: 'Extra cheese'
      })
      .execute();

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    expect(result!.total_amount).toEqual(15.00);
    expect(result!.tax_amount).toEqual(1.20);
  });

  it('should handle orders with multiple payment records', async () => {
    const [customer] = await db.insert(customersTable)
      .values({
        email: 'multi@test.com',
        phone: '123-456-7890',
        first_name: 'Multi',
        last_name: 'Payment'
      })
      .returning()
      .execute();

    const [dish] = await db.insert(dishesTable)
      .values({
        name: 'Expensive Dish',
        price: '50.00',
        status: 'available',
        preparation_time_minutes: 30
      })
      .returning()
      .execute();

    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-004',
        customer_id: customer.id,
        status: 'ready',
        pickup_slot: new Date('2024-01-18T11:00:00Z'),
        total_amount: '50.00',
        tax_amount: '4.00',
        is_guest_order: true
      })
      .returning()
      .execute();

    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '50.00',
        total_price: '50.00'
      })
      .execute();

    // Create multiple payments
    await db.insert(paymentsTable)
      .values([
        {
          order_id: order.id,
          amount: '25.00',
          tax_amount: '2.00',
          method: 'online',
          status: 'captured',
          transaction_id: 'TXN001',
          processed_at: new Date('2024-01-18T10:00:00Z')
        },
        {
          order_id: order.id,
          amount: '25.00',
          tax_amount: '2.00',
          method: 'on_site',
          status: 'captured',
          transaction_id: 'TXN002',
          processed_at: new Date('2024-01-18T10:30:00Z')
        }
      ])
      .execute();

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('ready');
    expect(result!.total_amount).toEqual(50.00);
    expect(result!.tax_amount).toEqual(4.00);
  });

  it('should handle numeric conversions correctly', async () => {
    const [customer] = await db.insert(customersTable)
      .values({
        email: 'numeric@test.com',
        phone: '123-456-7890',
        first_name: 'Numeric',
        last_name: 'Test'
      })
      .returning()
      .execute();

    const [dish] = await db.insert(dishesTable)
      .values({
        name: 'Decimal Test',
        price: '19.99',
        status: 'available',
        preparation_time_minutes: 20
      })
      .returning()
      .execute();

    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-005',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-19T12:00:00Z'),
        total_amount: '19.99',
        tax_amount: '1.60',
        is_guest_order: true
      })
      .returning()
      .execute();

    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '19.99',
        total_price: '19.99'
      })
      .execute();

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    // Verify numeric types are correctly converted
    expect(typeof result!.total_amount).toBe('number');
    expect(typeof result!.tax_amount).toBe('number');
    expect(result!.total_amount).toEqual(19.99);
    expect(result!.tax_amount).toEqual(1.60);
  });

  it('should handle order with no items gracefully', async () => {
    const [customer] = await db.insert(customersTable)
      .values({
        email: 'empty@test.com',
        phone: '123-456-7890',
        first_name: 'Empty',
        last_name: 'Order'
      })
      .returning()
      .execute();

    const [order] = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-006',
        customer_id: customer.id,
        status: 'cancelled',
        pickup_slot: new Date('2024-01-20T12:00:00Z'),
        total_amount: '0.00',
        tax_amount: '0.00',
        is_guest_order: true
      })
      .returning()
      .execute();

    // No order items created

    const result = await getOrderById(order.id);

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('cancelled');
    expect(result!.total_amount).toEqual(0.00);
    expect(result!.tax_amount).toEqual(0.00);
  });
});