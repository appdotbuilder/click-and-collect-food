import { db } from '../db';
import { paymentsTable } from '../db/schema';
import { type Payment } from '../schema';
import { eq } from 'drizzle-orm';

export const processPayment = async (paymentId: number): Promise<Payment> => {
  try {
    // First, get the payment record to validate it exists and check its status
    const existingPayments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .execute();

    if (existingPayments.length === 0) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }

    const payment = existingPayments[0];

    // Check if payment is in a valid state for processing
    if (payment.status !== 'authorized' && payment.status !== 'pending') {
      throw new Error(`Cannot process payment with status: ${payment.status}`);
    }

    // Simulate payment processing (in real implementation, this would integrate with payment gateway)
    const transactionId = `txn_${Date.now()}_${paymentId}`;
    const processedAt = new Date();
    
    // Simulate a small chance of payment failure for testing edge cases
    const shouldSimulateFailure = false; // In real implementation, this would be based on actual payment processor response

    const newStatus = shouldSimulateFailure ? 'failed' : 'captured';

    // Update the payment record
    const result = await db.update(paymentsTable)
      .set({
        status: newStatus,
        transaction_id: transactionId,
        processed_at: processedAt
      })
      .where(eq(paymentsTable.id, paymentId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Failed to update payment record');
    }

    // Convert numeric fields back to numbers before returning
    const updatedPayment = result[0];
    return {
      ...updatedPayment,
      amount: parseFloat(updatedPayment.amount),
      tax_amount: parseFloat(updatedPayment.tax_amount)
    };
  } catch (error) {
    console.error('Payment processing failed:', error);
    throw error;
  }
};