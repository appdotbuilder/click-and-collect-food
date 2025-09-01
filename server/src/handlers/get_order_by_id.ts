import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable, dishVariantsTable, customersTable, usersTable, paymentsTable } from '../db/schema';
import { type Order } from '../schema';
import { eq, SQL } from 'drizzle-orm';

export const getOrderById = async (id: number): Promise<Order | null> => {
  try {
    // Build the query with all necessary joins
    const results = await db.select({
      // Order fields
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
      // Order items
      order_items: {
        id: orderItemsTable.id,
        dish_id: orderItemsTable.dish_id,
        variant_id: orderItemsTable.variant_id,
        quantity: orderItemsTable.quantity,
        unit_price: orderItemsTable.unit_price,
        total_price: orderItemsTable.total_price,
        special_requests: orderItemsTable.special_requests,
        created_at: orderItemsTable.created_at
      },
      // Dish information
      dish: {
        id: dishesTable.id,
        name: dishesTable.name,
        description: dishesTable.description,
        price: dishesTable.price,
        photo_url: dishesTable.photo_url
      },
      // Dish variant information (nullable)
      variant: {
        id: dishVariantsTable.id,
        name: dishVariantsTable.name,
        price_modifier: dishVariantsTable.price_modifier
      },
      // Customer information (nullable)
      customer: {
        id: customersTable.id,
        email: customersTable.email,
        phone: customersTable.phone,
        first_name: customersTable.first_name,
        last_name: customersTable.last_name
      },
      // User information (nullable)
      user: {
        id: usersTable.id,
        email: usersTable.email,
        phone: usersTable.phone,
        first_name: usersTable.first_name,
        last_name: usersTable.last_name
      },
      // Payment information
      payment: {
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        tax_amount: paymentsTable.tax_amount,
        method: paymentsTable.method,
        status: paymentsTable.status,
        transaction_id: paymentsTable.transaction_id,
        processed_at: paymentsTable.processed_at,
        created_at: paymentsTable.created_at
      }
    })
    .from(ordersTable)
    .leftJoin(orderItemsTable, eq(ordersTable.id, orderItemsTable.order_id))
    .leftJoin(dishesTable, eq(orderItemsTable.dish_id, dishesTable.id))
    .leftJoin(dishVariantsTable, eq(orderItemsTable.variant_id, dishVariantsTable.id))
    .leftJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(usersTable, eq(ordersTable.user_id, usersTable.id))
    .leftJoin(paymentsTable, eq(ordersTable.id, paymentsTable.order_id))
    .where(eq(ordersTable.id, id))
    .execute();

    if (results.length === 0) {
      return null;
    }

    // Process the joined results to construct the order object
    const firstResult = results[0];
    
    // Build the order object with numeric conversions
    const order: Order = {
      id: firstResult.id,
      order_number: firstResult.order_number,
      customer_id: firstResult.customer_id,
      user_id: firstResult.user_id,
      status: firstResult.status,
      pickup_slot: firstResult.pickup_slot,
      total_amount: parseFloat(firstResult.total_amount),
      tax_amount: parseFloat(firstResult.tax_amount),
      special_notes: firstResult.special_notes,
      internal_notes: firstResult.internal_notes,
      qr_code: firstResult.qr_code,
      is_guest_order: firstResult.is_guest_order,
      created_at: firstResult.created_at,
      updated_at: firstResult.updated_at
    };

    return order;
  } catch (error) {
    console.error('Failed to fetch order by id:', error);
    throw error;
  }
};