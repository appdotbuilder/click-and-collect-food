import { db } from '../db';
import { ordersTable, paymentsTable, timeSlotsTable } from '../db/schema';
import { type UpdateOrderStatusInput, type Order } from '../schema';
import { eq, and } from 'drizzle-orm';

export const updateOrderStatus = async (input: UpdateOrderStatusInput): Promise<Order> => {
  try {
    // First, get the current order to validate the update
    const existingOrders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.id, input.id))
      .execute();

    if (existingOrders.length === 0) {
      throw new Error(`Order with id ${input.id} not found`);
    }

    const existingOrder = existingOrders[0];

    // Validate status transitions (basic business rules)
    const validTransitions: Record<string, string[]> = {
      'new': ['preparing', 'cancelled'],
      'preparing': ['ready', 'cancelled'],
      'ready': ['picked_up', 'cancelled'],
      'picked_up': [], // Final state
      'cancelled': [] // Final state
    };

    const allowedNextStatuses = validTransitions[existingOrder.status] || [];
    if (!allowedNextStatuses.includes(input.status)) {
      throw new Error(`Invalid status transition from ${existingOrder.status} to ${input.status}`);
    }

    // Handle special logic based on new status
    if (input.status === 'ready') {
      // When order is ready, capture any pending payments
      await db.update(paymentsTable)
        .set({ 
          status: 'captured',
          processed_at: new Date()
        })
        .where(and(
          eq(paymentsTable.order_id, input.id),
          eq(paymentsTable.status, 'pending')
        ))
        .execute();
    }

    if (input.status === 'cancelled') {
      // When order is cancelled, refund captured payments and release time slot
      await db.update(paymentsTable)
        .set({ 
          status: 'refunded',
          processed_at: new Date()
        })
        .where(and(
          eq(paymentsTable.order_id, input.id),
          eq(paymentsTable.status, 'captured')
        ))
        .execute();

      // Release the time slot capacity
      const orderDate = new Date(existingOrder.pickup_slot);
      const dateStr = orderDate.toISOString().split('T')[0];
      const timeStr = orderDate.toTimeString().split(' ')[0].substring(0, 5);

      // Get current bookings and decrement
      const timeSlots = await db.select()
        .from(timeSlotsTable)
        .where(and(
          eq(timeSlotsTable.date, dateStr),
          eq(timeSlotsTable.start_time, timeStr)
        ))
        .execute();

      if (timeSlots.length > 0) {
        const currentBookings = Math.max(0, timeSlots[0].current_bookings - 1);
        await db.update(timeSlotsTable)
          .set({ 
            current_bookings: currentBookings
          })
          .where(and(
            eq(timeSlotsTable.date, dateStr),
            eq(timeSlotsTable.start_time, timeStr)
          ))
          .execute();
      }
    }

    // Update the order with new status and internal notes
    const updateData: any = {
      status: input.status,
      updated_at: new Date()
    };

    if (input.internal_notes !== undefined) {
      updateData.internal_notes = input.internal_notes;
    }

    const updatedOrders = await db.update(ordersTable)
      .set(updateData)
      .where(eq(ordersTable.id, input.id))
      .returning()
      .execute();

    const updatedOrder = updatedOrders[0];

    // Convert numeric fields back to numbers
    return {
      ...updatedOrder,
      total_amount: parseFloat(updatedOrder.total_amount),
      tax_amount: parseFloat(updatedOrder.tax_amount)
    };
  } catch (error) {
    console.error('Order status update failed:', error);
    throw error;
  }
};