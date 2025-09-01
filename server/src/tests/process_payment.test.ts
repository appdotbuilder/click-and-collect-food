import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ordersTable, paymentsTable, customersTable } from '../db/schema';
import { type CreatePaymentInput } from '../schema';
import { processPayment } from '../handlers/process_payment';
import { eq } from 'drizzle-orm';

describe('processPayment', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const createTestData = async () => {
    // Create a customer first
    const customerResult = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '+1234567890',
        first_name: 'Test',
        last_name: 'Customer'
      })
      .returning()
      .execute();

    const customer = customerResult[0];

    // Create an order
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-001',
        customer_id: customer.id,
        pickup_slot: new Date('2024-01-01T12:00:00Z'),
        total_amount: '29.99',
        tax_amount: '2.40',
        is_guest_order: true,
        status: 'new'
      })
      .returning()
      .execute();

    const order = orderResult[0];

    return { customer, order };
  };

  const createPayment = async (orderId: number, status: 'pending' | 'authorized' | 'captured' | 'failed' = 'authorized') => {
    const paymentInput: CreatePaymentInput = {
      order_id: orderId,
      amount: 29.99,
      tax_amount: 2.40,
      method: 'online'
    };

    const result = await db.insert(paymentsTable)
      .values({
        order_id: paymentInput.order_id,
        amount: paymentInput.amount.toString(),
        tax_amount: paymentInput.tax_amount.toString(),
        method: paymentInput.method,
        status: status
      })
      .returning()
      .execute();

    return result[0];
  };

  it('should process an authorized payment successfully', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'authorized');

    const result = await processPayment(payment.id);

    // Verify the returned payment data
    expect(result.id).toEqual(payment.id);
    expect(result.order_id).toEqual(order.id);
    expect(result.amount).toEqual(29.99);
    expect(result.tax_amount).toEqual(2.40);
    expect(result.method).toEqual('online');
    expect(result.status).toEqual('captured');
    expect(result.transaction_id).toMatch(/^txn_\d+_\d+$/);
    expect(result.processed_at).toBeInstanceOf(Date);
    expect(result.created_at).toBeInstanceOf(Date);

    // Verify the payment was updated in the database
    const updatedPayments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id))
      .execute();

    expect(updatedPayments).toHaveLength(1);
    const updatedPayment = updatedPayments[0];
    expect(updatedPayment.status).toEqual('captured');
    expect(updatedPayment.transaction_id).toMatch(/^txn_\d+_\d+$/);
    expect(updatedPayment.processed_at).toBeInstanceOf(Date);
  });

  it('should process a pending payment successfully', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'pending');

    const result = await processPayment(payment.id);

    expect(result.status).toEqual('captured');
    expect(result.transaction_id).toMatch(/^txn_\d+_\d+$/);
    expect(result.processed_at).toBeInstanceOf(Date);
  });

  it('should throw error when payment does not exist', async () => {
    const nonExistentPaymentId = 99999;

    await expect(processPayment(nonExistentPaymentId))
      .rejects.toThrow(/Payment with ID 99999 not found/i);
  });

  it('should throw error when payment is already captured', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'captured');

    await expect(processPayment(payment.id))
      .rejects.toThrow(/Cannot process payment with status: captured/i);
  });

  it('should throw error when payment is failed', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'failed');

    await expect(processPayment(payment.id))
      .rejects.toThrow(/Cannot process payment with status: failed/i);
  });

  it('should handle numeric field conversions correctly', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'authorized');

    const result = await processPayment(payment.id);

    // Verify numeric types are correct
    expect(typeof result.amount).toBe('number');
    expect(typeof result.tax_amount).toBe('number');
    expect(result.amount).toEqual(29.99);
    expect(result.tax_amount).toEqual(2.40);
  });

  it('should generate unique transaction IDs', async () => {
    const { order } = await createTestData();
    
    // Create two payments
    const payment1 = await createPayment(order.id, 'authorized');
    const payment2 = await createPayment(order.id, 'authorized');

    // Process both payments
    const result1 = await processPayment(payment1.id);
    const result2 = await processPayment(payment2.id);

    // Verify transaction IDs are unique
    expect(result1.transaction_id).toBeDefined();
    expect(result2.transaction_id).toBeDefined();
    expect(result1.transaction_id).not.toEqual(result2.transaction_id);
    expect(result1.transaction_id).toMatch(/^txn_\d+_\d+$/);
    expect(result2.transaction_id).toMatch(/^txn_\d+_\d+$/);
  });

  it('should preserve original payment data during processing', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'authorized');

    const result = await processPayment(payment.id);

    // Verify original data is preserved
    expect(result.order_id).toEqual(payment.order_id);
    expect(result.amount).toEqual(parseFloat(payment.amount));
    expect(result.tax_amount).toEqual(parseFloat(payment.tax_amount));
    expect(result.method).toEqual(payment.method);
    expect(result.created_at).toEqual(payment.created_at);
  });

  it('should set processed_at timestamp correctly', async () => {
    const { order } = await createTestData();
    const payment = await createPayment(order.id, 'authorized');

    const beforeProcessing = new Date();
    const result = await processPayment(payment.id);
    const afterProcessing = new Date();

    expect(result.processed_at).toBeInstanceOf(Date);
    expect(result.processed_at!.getTime()).toBeGreaterThanOrEqual(beforeProcessing.getTime());
    expect(result.processed_at!.getTime()).toBeLessThanOrEqual(afterProcessing.getTime());
  });
});