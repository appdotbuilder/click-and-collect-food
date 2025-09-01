import { db } from '../db';
import { paymentsTable, ordersTable } from '../db/schema';
import { type CreatePaymentInput, type Payment } from '../schema';
import { eq } from 'drizzle-orm';

export const createPayment = async (input: CreatePaymentInput): Promise<Payment> => {
  try {
    // Verify that the order exists
    const existingOrder = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, input.order_id))
      .execute();

    if (existingOrder.length === 0) {
      throw new Error(`Order with ID ${input.order_id} does not exist`);
    }

    // Determine initial status based on payment method
    let status: 'pending' | 'authorized' = 'pending';
    let processedAt: Date | null = null;

    // For online payments, simulate authorization
    if (input.method === 'online') {
      status = 'authorized';
      processedAt = new Date();
    }

    // Insert payment record
    const result = await db.insert(paymentsTable)
      .values({
        order_id: input.order_id,
        amount: input.amount.toString(), // Convert number to string for numeric column
        tax_amount: input.tax_amount.toString(), // Convert number to string for numeric column
        method: input.method,
        status: status,
        transaction_id: input.transaction_id || null,
        processed_at: processedAt
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const payment = result[0];
    return {
      ...payment,
      amount: parseFloat(payment.amount), // Convert string back to number
      tax_amount: parseFloat(payment.tax_amount) // Convert string back to number
    };
  } catch (error) {
    console.error('Payment creation failed:', error);
    throw error;
  }
};