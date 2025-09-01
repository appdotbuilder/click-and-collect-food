import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable, paymentsTable, timeSlotsTable } from '../db/schema';
import { type Order } from '../schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

export const cancelOrder = async (orderId: number, reason?: string): Promise<Order> => {
  try {
    // Start a transaction to ensure all operations complete or fail together
    const result = await db.transaction(async (tx) => {
      // 1. Get the order and verify it exists and can be cancelled
      const orders = await tx.select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .execute();

      if (orders.length === 0) {
        throw new Error(`Order with id ${orderId} not found`);
      }

      const order = orders[0];

      // Check if order can be cancelled (only new, preparing, or ready orders)
      if (order.status === 'cancelled') {
        throw new Error('Order is already cancelled');
      }
      
      if (order.status === 'picked_up') {
        throw new Error('Cannot cancel an order that has already been picked up');
      }

      // 2. Get order items to restore stock quantities
      const orderItems = await tx.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, orderId))
        .execute();

      // 3. Restore stock quantities for dishes that track stock
      for (const item of orderItems) {
        await tx.update(dishesTable)
          .set({
            stock_quantity: sql`${dishesTable.stock_quantity} + ${item.quantity}`,
            updated_at: new Date()
          })
          .where(and(
            eq(dishesTable.id, item.dish_id),
            sql`${dishesTable.stock_quantity} IS NOT NULL`
          ))
          .execute();
      }

      // 4. Release time slot capacity
      const pickupDate = new Date(order.pickup_slot);
      const dateStr = pickupDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const timeStr = pickupDate.toTimeString().split(' ')[0].substring(0, 5); // HH:MM format

      // Find and update the time slot to decrease current bookings
      await tx.update(timeSlotsTable)
        .set({
          current_bookings: sql`${timeSlotsTable.current_bookings} - 1`
        })
        .where(and(
          eq(timeSlotsTable.date, dateStr),
          eq(timeSlotsTable.start_time, timeStr)
        ))
        .execute();

      // 5. Process refund if payment exists and is not already refunded
      const payments = await tx.select()
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.order_id, orderId),
          sql`${paymentsTable.status} IN ('authorized', 'captured')`
        ))
        .execute();

      // Update payment status to refunded for eligible payments
      for (const payment of payments) {
        await tx.update(paymentsTable)
          .set({
            status: 'refunded',
            processed_at: new Date()
          })
          .where(eq(paymentsTable.id, payment.id))
          .execute();
      }

      // 6. Update order status to cancelled
      const cancelledOrders = await tx.update(ordersTable)
        .set({
          status: 'cancelled',
          internal_notes: reason ? `Cancelled: ${reason}` : 'Order cancelled',
          updated_at: new Date()
        })
        .where(eq(ordersTable.id, orderId))
        .returning()
        .execute();

      const cancelledOrder = cancelledOrders[0];

      // Convert numeric fields back to numbers
      return {
        ...cancelledOrder,
        total_amount: parseFloat(cancelledOrder.total_amount),
        tax_amount: parseFloat(cancelledOrder.tax_amount)
      };
    });

    return result;
  } catch (error) {
    console.error('Order cancellation failed:', error);
    throw error;
  }
};