import { db } from '../db';
import { ordersTable, customersTable, usersTable } from '../db/schema';
import { type OrderFilters, type Order } from '../schema';
import { eq, and, gte, lte, or, ilike, type SQL } from 'drizzle-orm';

export async function getOrders(filters?: OrderFilters): Promise<Order[]> {
  try {
    // Start with base query that includes joins for customer and user data
    const baseQuery = db.select({
      id: ordersTable.id,
      order_number: ordersTable.order_number,
      customer_id: ordersTable.customer_id,
      user_id: ordersTable.user_id,
      status: ordersTable.status,
      pickup_slot: ordersTable.pickup_slot,
      total_amount: ordersTable.total_amount,
      tax_amount: ordersTable.tax_amount,
      special_notes: ordersTable.special_notes,
      internal_notes: ordersTable.internal_notes,
      qr_code: ordersTable.qr_code,
      is_guest_order: ordersTable.is_guest_order,
      created_at: ordersTable.created_at,
      updated_at: ordersTable.updated_at,
      // Customer data (for guest orders)
      customer_first_name: customersTable.first_name,
      customer_last_name: customersTable.last_name,
      customer_email: customersTable.email,
      customer_phone: customersTable.phone,
      // User data (for registered user orders)
      user_first_name: usersTable.first_name,
      user_last_name: usersTable.last_name,
      user_email: usersTable.email,
      user_phone: usersTable.phone
    })
      .from(ordersTable)
      .leftJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .leftJoin(usersTable, eq(ordersTable.user_id, usersTable.id));

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    if (filters) {
      // Filter by status
      if (filters.status) {
        conditions.push(eq(ordersTable.status, filters.status));
      }

      // Filter by date range on created_at
      if (filters.date_from) {
        conditions.push(gte(ordersTable.created_at, filters.date_from));
      }

      if (filters.date_to) {
        conditions.push(lte(ordersTable.created_at, filters.date_to));
      }

      // Filter by pickup date (specific date format)
      if (filters.pickup_date) {
        const pickupDate = new Date(filters.pickup_date);
        const nextDay = new Date(pickupDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const dateRangeCondition = and(
          gte(ordersTable.pickup_slot, pickupDate),
          lte(ordersTable.pickup_slot, nextDay)
        );
        if (dateRangeCondition) {
          conditions.push(dateRangeCondition);
        }
      }

      // Filter by customer search (name, email, phone)
      if (filters.customer_search) {
        const searchTerm = `%${filters.customer_search}%`;
        const searchCondition = or(
          // Search in customer table
          ilike(customersTable.first_name, searchTerm),
          ilike(customersTable.last_name, searchTerm),
          ilike(customersTable.email, searchTerm),
          ilike(customersTable.phone, searchTerm),
          // Search in user table
          ilike(usersTable.first_name, searchTerm),
          ilike(usersTable.last_name, searchTerm),
          ilike(usersTable.email, searchTerm),
          ilike(usersTable.phone, searchTerm),
          // Search in order number
          ilike(ordersTable.order_number, searchTerm)
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }
    }

    // Execute query with or without conditions
    const results = conditions.length > 0
      ? await baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions)).execute()
      : await baseQuery.execute();

    // Transform results to match Order schema
    return results.map(result => ({
      id: result.id,
      order_number: result.order_number,
      customer_id: result.customer_id,
      user_id: result.user_id,
      status: result.status,
      pickup_slot: result.pickup_slot,
      total_amount: parseFloat(result.total_amount), // Convert numeric to number
      tax_amount: parseFloat(result.tax_amount), // Convert numeric to number
      special_notes: result.special_notes,
      internal_notes: result.internal_notes,
      qr_code: result.qr_code,
      is_guest_order: result.is_guest_order,
      created_at: result.created_at,
      updated_at: result.updated_at
    }));
  } catch (error) {
    console.error('Get orders failed:', error);
    throw error;
  }
}