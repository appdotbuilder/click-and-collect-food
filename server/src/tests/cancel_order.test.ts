import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  customersTable, 
  dishesTable, 
  ordersTable, 
  orderItemsTable, 
  paymentsTable,
  timeSlotsTable
} from '../db/schema';
import { cancelOrder } from '../handlers/cancel_order';
import { eq, and } from 'drizzle-orm';

describe('cancelOrder', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should cancel a new order successfully', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create test dish with stock tracking
    const dishes = await db.insert(dishesTable)
      .values({
        name: 'Test Dish',
        description: 'A test dish',
        price: '19.99',
        status: 'available',
        preparation_time_minutes: 30,
        stock_quantity: 10,
        stock_threshold: 5
      })
      .returning()
      .execute();
    const dish = dishes[0];

    // Create time slot
    const timeSlots = await db.insert(timeSlotsTable)
      .values({
        date: '2024-01-15',
        start_time: '12:00',
        end_time: '12:30',
        max_capacity: 5,
        current_bookings: 1
      })
      .returning()
      .execute();

    // Create test order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-001',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: pickupTime,
        total_amount: '21.99',
        tax_amount: '2.00',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    // Create order item
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 2,
        unit_price: '19.99',
        total_price: '39.98'
      })
      .execute();

    // Cancel the order
    const result = await cancelOrder(order.id, 'Customer requested');

    // Verify order status changed
    expect(result.id).toBe(order.id);
    expect(result.status).toBe('cancelled');
    expect(result.internal_notes).toBe('Cancelled: Customer requested');
    expect(result.total_amount).toBe(21.99);
    expect(result.tax_amount).toBe(2.00);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify stock was restored
    const updatedDish = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish.id))
      .execute();
    expect(updatedDish[0].stock_quantity).toBe(12); // 10 + 2 restored

    // Verify time slot capacity was released
    const updatedTimeSlot = await db.select()
      .from(timeSlotsTable)
      .where(and(
        eq(timeSlotsTable.date, '2024-01-15'),
        eq(timeSlotsTable.start_time, '12:00')
      ))
      .execute();
    expect(updatedTimeSlot[0].current_bookings).toBe(0); // 1 - 1 released
  });

  it('should cancel order and process refund for authorized payment', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create test order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-002',
        customer_id: customer.id,
        status: 'preparing',
        pickup_slot: pickupTime,
        total_amount: '25.99',
        tax_amount: '2.50',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    // Create authorized payment
    await db.insert(paymentsTable)
      .values({
        order_id: order.id,
        amount: '25.99',
        tax_amount: '2.50',
        method: 'online',
        status: 'authorized',
        transaction_id: 'TXN-123'
      })
      .execute();

    // Cancel the order
    const result = await cancelOrder(order.id, 'Kitchen issue');

    // Verify order was cancelled
    expect(result.status).toBe('cancelled');
    expect(result.internal_notes).toBe('Cancelled: Kitchen issue');

    // Verify payment was refunded
    const payments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.order_id, order.id))
      .execute();
    expect(payments[0].status).toBe('refunded');
    expect(payments[0].processed_at).toBeInstanceOf(Date);
  });

  it('should cancel order without reason', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create test order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-003',
        customer_id: customer.id,
        status: 'ready',
        pickup_slot: pickupTime,
        total_amount: '15.99',
        tax_amount: '1.50',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    // Cancel the order without reason
    const result = await cancelOrder(order.id);

    // Verify order was cancelled with default message
    expect(result.status).toBe('cancelled');
    expect(result.internal_notes).toBe('Order cancelled');
  });

  it('should handle dishes without stock tracking', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create test dish without stock tracking (stock_quantity is null)
    const dishes = await db.insert(dishesTable)
      .values({
        name: 'Unlimited Dish',
        description: 'A dish with unlimited stock',
        price: '12.99',
        status: 'available',
        preparation_time_minutes: 15,
        stock_quantity: null // No stock tracking
      })
      .returning()
      .execute();
    const dish = dishes[0];

    // Create test order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-004',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: pickupTime,
        total_amount: '14.99',
        tax_amount: '2.00',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    // Create order item
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '12.99',
        total_price: '12.99'
      })
      .execute();

    // Cancel the order
    const result = await cancelOrder(order.id);

    // Verify order was cancelled successfully
    expect(result.status).toBe('cancelled');

    // Verify dish stock_quantity remains null (unchanged)
    const updatedDish = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish.id))
      .execute();
    expect(updatedDish[0].stock_quantity).toBe(null);
  });

  it('should throw error for non-existent order', async () => {
    await expect(cancelOrder(999)).rejects.toThrow(/Order with id 999 not found/i);
  });

  it('should throw error for already cancelled order', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create already cancelled order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-005',
        customer_id: customer.id,
        status: 'cancelled',
        pickup_slot: pickupTime,
        total_amount: '20.99',
        tax_amount: '2.00',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    await expect(cancelOrder(order.id)).rejects.toThrow(/Order is already cancelled/i);
  });

  it('should throw error for picked up order', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create picked up order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-006',
        customer_id: customer.id,
        status: 'picked_up',
        pickup_slot: pickupTime,
        total_amount: '18.99',
        tax_amount: '1.50',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    await expect(cancelOrder(order.id)).rejects.toThrow(/Cannot cancel an order that has already been picked up/i);
  });

  it('should handle multiple order items from different dishes', async () => {
    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '555-1234',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customers[0];

    // Create multiple dishes with stock
    const dish1 = (await db.insert(dishesTable)
      .values({
        name: 'Dish One',
        description: 'First dish',
        price: '10.00',
        status: 'available',
        preparation_time_minutes: 20,
        stock_quantity: 5
      })
      .returning()
      .execute())[0];

    const dish2 = (await db.insert(dishesTable)
      .values({
        name: 'Dish Two',
        description: 'Second dish',
        price: '15.00',
        status: 'available',
        preparation_time_minutes: 25,
        stock_quantity: 8
      })
      .returning()
      .execute())[0];

    // Create test order
    const pickupTime = new Date('2024-01-15T12:00:00');
    const orders = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-007',
        customer_id: customer.id,
        status: 'preparing',
        pickup_slot: pickupTime,
        total_amount: '40.00',
        tax_amount: '4.00',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orders[0];

    // Create multiple order items
    await db.insert(orderItemsTable)
      .values([
        {
          order_id: order.id,
          dish_id: dish1.id,
          quantity: 2,
          unit_price: '10.00',
          total_price: '20.00'
        },
        {
          order_id: order.id,
          dish_id: dish2.id,
          quantity: 1,
          unit_price: '15.00',
          total_price: '15.00'
        }
      ])
      .execute();

    // Cancel the order
    const result = await cancelOrder(order.id);

    // Verify order was cancelled
    expect(result.status).toBe('cancelled');

    // Verify stock was restored for both dishes
    const updatedDish1 = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish1.id))
      .execute();
    expect(updatedDish1[0].stock_quantity).toBe(7); // 5 + 2 restored

    const updatedDish2 = await db.select()
      .from(dishesTable)
      .where(eq(dishesTable.id, dish2.id))
      .execute();
    expect(updatedDish2[0].stock_quantity).toBe(9); // 8 + 1 restored
  });
});