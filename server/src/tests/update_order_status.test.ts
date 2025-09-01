import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ordersTable, customersTable, paymentsTable, timeSlotsTable } from '../db/schema';
import { type UpdateOrderStatusInput } from '../schema';
import { updateOrderStatus } from '../handlers/update_order_status';
import { eq, and } from 'drizzle-orm';

describe('updateOrderStatus', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const createTestCustomer = async () => {
    const customers = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '+1234567890',
        first_name: 'Test',
        last_name: 'Customer'
      })
      .returning()
      .execute();
    return customers[0];
  };

  const createTestOrder = async (customerId: number, status: any = 'new') => {
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orders = await db.insert(ordersTable)
      .values({
        order_number: orderNumber,
        customer_id: customerId,
        status: status,
        pickup_slot: new Date('2024-01-15T12:00:00Z'),
        total_amount: '25.99',
        tax_amount: '2.08',
        is_guest_order: true
      })
      .returning()
      .execute();
    return orders[0];
  };

  const createTestPayment = async (orderId: number, status: any = 'pending') => {
    const payments = await db.insert(paymentsTable)
      .values({
        order_id: orderId,
        amount: '25.99',
        tax_amount: '2.08',
        method: 'online',
        status: status
      })
      .returning()
      .execute();
    return payments[0];
  };

  const createTestTimeSlot = async () => {
    const timeSlots = await db.insert(timeSlotsTable)
      .values({
        date: '2024-01-15',
        start_time: '12:00',
        end_time: '13:00',
        max_capacity: 10,
        current_bookings: 1
      })
      .returning()
      .execute();
    return timeSlots[0];
  };

  it('should update order status successfully', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id);

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'preparing'
    };

    const result = await updateOrderStatus(input);

    expect(result.id).toEqual(order.id);
    expect(result.status).toEqual('preparing');
    expect(result.total_amount).toEqual(25.99);
    expect(result.tax_amount).toEqual(2.08);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update internal notes when provided', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id);

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'preparing',
      internal_notes: 'Customer requested extra spice'
    };

    const result = await updateOrderStatus(input);

    expect(result.internal_notes).toEqual('Customer requested extra spice');
  });

  it('should capture payments when status changes to ready', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id, 'preparing');
    const payment = await createTestPayment(order.id, 'pending');

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'ready'
    };

    await updateOrderStatus(input);

    // Verify payment was captured
    const updatedPayments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id))
      .execute();

    expect(updatedPayments[0].status).toEqual('captured');
    expect(updatedPayments[0].processed_at).toBeInstanceOf(Date);
  });

  it('should refund payments and release time slot when cancelled', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id, 'ready');
    const payment = await createTestPayment(order.id, 'captured');
    const timeSlot = await createTestTimeSlot();

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'cancelled'
    };

    await updateOrderStatus(input);

    // Verify payment was refunded
    const updatedPayments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id))
      .execute();

    expect(updatedPayments[0].status).toEqual('refunded');
    expect(updatedPayments[0].processed_at).toBeInstanceOf(Date);

    // Verify time slot booking was decremented
    const updatedTimeSlots = await db.select()
      .from(timeSlotsTable)
      .where(eq(timeSlotsTable.id, timeSlot.id))
      .execute();

    expect(updatedTimeSlots[0].current_bookings).toEqual(0);
  });

  it('should save updated order to database', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id);

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'preparing',
      internal_notes: 'Test notes'
    };

    await updateOrderStatus(input);

    // Verify order was updated in database
    const updatedOrders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, order.id))
      .execute();

    expect(updatedOrders).toHaveLength(1);
    expect(updatedOrders[0].status).toEqual('preparing');
    expect(updatedOrders[0].internal_notes).toEqual('Test notes');
    expect(updatedOrders[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error for non-existent order', async () => {
    const input: UpdateOrderStatusInput = {
      id: 99999,
      status: 'preparing'
    };

    await expect(updateOrderStatus(input)).rejects.toThrow(/Order with id 99999 not found/i);
  });

  it('should validate status transitions', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id, 'picked_up');

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'preparing'
    };

    await expect(updateOrderStatus(input)).rejects.toThrow(/Invalid status transition/i);
  });

  it('should allow valid status transitions', async () => {
    const customer = await createTestCustomer();
    
    // Test new -> preparing
    const order1 = await createTestOrder(customer.id, 'new');
    await updateOrderStatus({ id: order1.id, status: 'preparing' });
    
    // Test preparing -> ready
    const order2 = await createTestOrder(customer.id, 'preparing');
    await updateOrderStatus({ id: order2.id, status: 'ready' });
    
    // Test ready -> picked_up
    const order3 = await createTestOrder(customer.id, 'ready');
    await updateOrderStatus({ id: order3.id, status: 'picked_up' });
    
    // Test new -> cancelled
    const order4 = await createTestOrder(customer.id, 'new');
    await updateOrderStatus({ id: order4.id, status: 'cancelled' });

    // Verify all updates were successful (no errors thrown)
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.customer_id, customer.id))
      .execute();

    expect(orders).toHaveLength(4);
    expect(orders.find(o => o.id === order1.id)?.status).toEqual('preparing');
    expect(orders.find(o => o.id === order2.id)?.status).toEqual('ready');
    expect(orders.find(o => o.id === order3.id)?.status).toEqual('picked_up');
    expect(orders.find(o => o.id === order4.id)?.status).toEqual('cancelled');
  });

  it('should handle multiple payments correctly when capturing', async () => {
    const customer = await createTestCustomer();
    const order = await createTestOrder(customer.id, 'preparing');
    
    // Create multiple payments
    await createTestPayment(order.id, 'pending');
    await createTestPayment(order.id, 'pending');
    await createTestPayment(order.id, 'authorized'); // This should not be affected

    const input: UpdateOrderStatusInput = {
      id: order.id,
      status: 'ready'
    };

    await updateOrderStatus(input);

    // Verify only pending payments were captured
    const payments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.order_id, order.id))
      .execute();

    const capturedPayments = payments.filter(p => p.status === 'captured');
    const authorizedPayments = payments.filter(p => p.status === 'authorized');
    
    expect(capturedPayments).toHaveLength(2);
    expect(authorizedPayments).toHaveLength(1);
  });
});