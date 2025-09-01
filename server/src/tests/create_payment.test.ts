import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { paymentsTable, ordersTable, customersTable } from '../db/schema';
import { type CreatePaymentInput } from '../schema';
import { createPayment } from '../handlers/create_payment';
import { eq } from 'drizzle-orm';

describe('createPayment', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testOrderId: number;

  // Setup a test order for payment tests
  beforeEach(async () => {
    // Create a customer first
    const customerResult = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '1234567890',
        first_name: 'Test',
        last_name: 'Customer'
      })
      .returning()
      .execute();

    // Create an order
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-001',
        customer_id: customerResult[0].id,
        status: 'new',
        pickup_slot: new Date('2024-01-15T12:00:00Z'),
        total_amount: '25.99',
        tax_amount: '2.60',
        is_guest_order: true
      })
      .returning()
      .execute();

    testOrderId = orderResult[0].id;
  });

  it('should create an on-site payment with pending status', async () => {
    const input: CreatePaymentInput = {
      order_id: testOrderId,
      amount: 25.99,
      tax_amount: 2.60,
      method: 'on_site'
    };

    const result = await createPayment(input);

    // Basic field validation
    expect(result.order_id).toEqual(testOrderId);
    expect(result.amount).toEqual(25.99);
    expect(typeof result.amount).toBe('number');
    expect(result.tax_amount).toEqual(2.60);
    expect(typeof result.tax_amount).toBe('number');
    expect(result.method).toEqual('on_site');
    expect(result.status).toEqual('pending');
    expect(result.transaction_id).toBeNull();
    expect(result.processed_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create an online payment with authorized status', async () => {
    const input: CreatePaymentInput = {
      order_id: testOrderId,
      amount: 25.99,
      tax_amount: 2.60,
      method: 'online',
      transaction_id: 'txn_12345'
    };

    const result = await createPayment(input);

    // Basic field validation
    expect(result.order_id).toEqual(testOrderId);
    expect(result.amount).toEqual(25.99);
    expect(result.tax_amount).toEqual(2.60);
    expect(result.method).toEqual('online');
    expect(result.status).toEqual('authorized');
    expect(result.transaction_id).toEqual('txn_12345');
    expect(result.processed_at).toBeInstanceOf(Date);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save payment to database', async () => {
    const input: CreatePaymentInput = {
      order_id: testOrderId,
      amount: 25.99,
      tax_amount: 2.60,
      method: 'on_site'
    };

    const result = await createPayment(input);

    // Query using proper drizzle syntax
    const payments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, result.id))
      .execute();

    expect(payments).toHaveLength(1);
    expect(payments[0].order_id).toEqual(testOrderId);
    expect(parseFloat(payments[0].amount)).toEqual(25.99);
    expect(parseFloat(payments[0].tax_amount)).toEqual(2.60);
    expect(payments[0].method).toEqual('on_site');
    expect(payments[0].status).toEqual('pending');
    expect(payments[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle online payment with transaction ID correctly', async () => {
    const input: CreatePaymentInput = {
      order_id: testOrderId,
      amount: 15.50,
      tax_amount: 1.55,
      method: 'online',
      transaction_id: 'stripe_12345'
    };

    const result = await createPayment(input);

    // Verify payment in database
    const payments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, result.id))
      .execute();

    expect(payments).toHaveLength(1);
    expect(payments[0].transaction_id).toEqual('stripe_12345');
    expect(payments[0].status).toEqual('authorized');
    expect(payments[0].processed_at).toBeInstanceOf(Date);
  });

  it('should throw error for non-existent order', async () => {
    const input: CreatePaymentInput = {
      order_id: 99999, // Non-existent order ID
      amount: 25.99,
      tax_amount: 2.60,
      method: 'on_site'
    };

    await expect(createPayment(input)).rejects.toThrow(/Order with ID 99999 does not exist/i);
  });

  it('should handle decimal amounts correctly', async () => {
    const input: CreatePaymentInput = {
      order_id: testOrderId,
      amount: 123.45,
      tax_amount: 12.35,
      method: 'online'
    };

    const result = await createPayment(input);

    expect(result.amount).toEqual(123.45);
    expect(result.tax_amount).toEqual(12.35);
    expect(typeof result.amount).toBe('number');
    expect(typeof result.tax_amount).toBe('number');

    // Verify in database
    const payments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, result.id))
      .execute();

    expect(parseFloat(payments[0].amount)).toEqual(123.45);
    expect(parseFloat(payments[0].tax_amount)).toEqual(12.35);
  });
});