import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable, dishVariantsTable, customersTable, usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';

interface ReceiptItem {
  dish_name: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  special_requests?: string;
}

interface ReceiptData {
  orderId: number;
  orderNumber: string;
  customerInfo: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  items: ReceiptItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  pickupSlot: Date;
  specialNotes?: string;
  qrCode?: string;
  generatedAt: Date;
  isGuestOrder: boolean;
}

export const generateOrderReceipt = async (orderId: number): Promise<{ receiptData: ReceiptData; printUrl?: string }> => {
  try {
    // Get order with customer/user information
    const orderResults = await db.select()
      .from(ordersTable)
      .leftJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .leftJoin(usersTable, eq(ordersTable.user_id, usersTable.id))
      .where(eq(ordersTable.id, orderId))
      .execute();

    if (orderResults.length === 0) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    const orderResult = orderResults[0];
    const order = orderResult.orders;
    const customer = orderResult.customers;
    const user = orderResult.users;

    // Get order items with dish and variant details
    const itemResults = await db.select()
      .from(orderItemsTable)
      .innerJoin(dishesTable, eq(orderItemsTable.dish_id, dishesTable.id))
      .leftJoin(dishVariantsTable, eq(orderItemsTable.variant_id, dishVariantsTable.id))
      .where(eq(orderItemsTable.order_id, orderId))
      .execute();

    // Transform order items for receipt
    const items: ReceiptItem[] = itemResults.map(result => ({
      dish_name: result.dishes.name,
      variant_name: result.dish_variants?.name || undefined,
      quantity: result.order_items.quantity,
      unit_price: parseFloat(result.order_items.unit_price),
      total_price: parseFloat(result.order_items.total_price),
      special_requests: result.order_items.special_requests || undefined
    }));

    // Calculate subtotal (total - tax)
    const totalAmount = parseFloat(order.total_amount);
    const taxAmount = parseFloat(order.tax_amount);
    const subtotal = totalAmount - taxAmount;

    // Get customer information (from customer or user)
    const customerInfo = customer ? {
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      email: customer.email
    } : user ? {
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email
    } : {
      first_name: 'Walk-in',
      last_name: 'Customer',
      phone: '',
      email: ''
    };

    const receiptData: ReceiptData = {
      orderId: order.id,
      orderNumber: order.order_number,
      customerInfo,
      items,
      subtotal,
      taxAmount,
      totalAmount,
      pickupSlot: order.pickup_slot,
      specialNotes: order.special_notes || undefined,
      qrCode: order.qr_code || undefined,
      generatedAt: new Date(),
      isGuestOrder: order.is_guest_order
    };

    // Generate print URL (simple hash-based URL for demonstration)
    const printUrl = `/print/receipt/${orderId}/${Buffer.from(order.order_number).toString('base64')}`;

    return {
      receiptData,
      printUrl
    };
  } catch (error) {
    console.error('Receipt generation failed:', error);
    throw error;
  }
};