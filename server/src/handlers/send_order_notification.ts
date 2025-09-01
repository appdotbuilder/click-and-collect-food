import { type Order } from '../schema';

export async function sendOrderNotification(
  order: Order, 
  notificationType: 'confirmation' | 'ready' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate inputs
    if (!order) {
      return {
        success: false,
        error: 'Order is required'
      };
    }

    if (!order.id || !order.order_number) {
      return {
        success: false,
        error: 'Order must have valid id and order number'
      };
    }

    if (!notificationType) {
      return {
        success: false,
        error: 'Notification type is required'
      };
    }

    // Generate notification content based on type
    const notificationContent = generateNotificationContent(order, notificationType);

    // Simulate notification service logic
    // In a real implementation, this would:
    // 1. Determine customer contact method (email from customer/user data)
    // 2. Format message templates for email/SMS/push
    // 3. Send via external service (SendGrid, Twilio, etc.)
    // 4. Handle retry logic and fallback methods
    // 5. Log delivery status

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 50));

    // Simulate occasional failures for realistic testing
    if (order.order_number === 'FAIL-TEST') {
      return {
        success: false,
        error: 'Simulated notification service failure'
      };
    }

    // For QR code notifications, ensure QR code exists
    if (notificationType === 'ready' && !order.qr_code) {
      return {
        success: false,
        error: 'QR code required for pickup notifications'
      };
    }

    console.log(`Notification sent successfully:`, {
      orderId: order.id,
      orderNumber: order.order_number,
      type: notificationType,
      content: notificationContent
    });

    return {
      success: true
    };

  } catch (error) {
    console.error('Notification sending failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown notification error'
    };
  }
}

function generateNotificationContent(order: Order, type: 'confirmation' | 'ready' | 'cancelled') {
  const baseInfo = {
    orderNumber: order.order_number,
    totalAmount: order.total_amount,
    pickupSlot: order.pickup_slot
  };

  switch (type) {
    case 'confirmation':
      return {
        ...baseInfo,
        subject: `Order Confirmed - #${order.order_number}`,
        message: `Your order has been confirmed and will be ready for pickup at ${order.pickup_slot.toLocaleString()}.`,
        includeQR: false
      };

    case 'ready':
      return {
        ...baseInfo,
        subject: `Order Ready for Pickup - #${order.order_number}`,
        message: `Your order is ready for pickup! Please show the QR code when collecting.`,
        includeQR: true,
        qrCode: order.qr_code
      };

    case 'cancelled':
      return {
        ...baseInfo,
        subject: `Order Cancelled - #${order.order_number}`,
        message: `Your order has been cancelled. Any payments will be refunded within 3-5 business days.`,
        includeQR: false
      };

    default:
      return baseInfo;
  }
}