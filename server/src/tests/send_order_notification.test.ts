import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { sendOrderNotification } from '../handlers/send_order_notification';
import { type Order } from '../schema';

// Test order data
const baseOrder: Order = {
  id: 1,
  order_number: 'ORD-2024-001',
  customer_id: 1,
  user_id: null,
  status: 'new',
  pickup_slot: new Date('2024-01-15T12:00:00Z'),
  total_amount: 25.50,
  tax_amount: 2.30,
  special_notes: 'Extra spicy',
  internal_notes: null,
  qr_code: 'QR123456789',
  is_guest_order: false,
  created_at: new Date('2024-01-15T10:00:00Z'),
  updated_at: new Date('2024-01-15T10:00:00Z')
};

const orderWithoutQR: Order = {
  ...baseOrder,
  id: 2,
  order_number: 'ORD-2024-002',
  qr_code: null
};

const failTestOrder: Order = {
  ...baseOrder,
  id: 3,
  order_number: 'FAIL-TEST'
};

describe('sendOrderNotification', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('confirmation notifications', () => {
    it('should send confirmation notification successfully', async () => {
      const result = await sendOrderNotification(baseOrder, 'confirmation');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should work without QR code for confirmation', async () => {
      const result = await sendOrderNotification(orderWithoutQR, 'confirmation');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('ready notifications', () => {
    it('should send ready notification with QR code', async () => {
      const result = await sendOrderNotification(baseOrder, 'ready');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail ready notification without QR code', async () => {
      const result = await sendOrderNotification(orderWithoutQR, 'ready');

      expect(result.success).toBe(false);
      expect(result.error).toBe('QR code required for pickup notifications');
    });
  });

  describe('cancelled notifications', () => {
    it('should send cancelled notification successfully', async () => {
      const result = await sendOrderNotification(baseOrder, 'cancelled');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should work without QR code for cancellation', async () => {
      const result = await sendOrderNotification(orderWithoutQR, 'cancelled');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('should fail with null order', async () => {
      const result = await sendOrderNotification(null as any, 'confirmation');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order is required');
    });

    it('should fail with order missing id', async () => {
      const invalidOrder = { ...baseOrder, id: 0 };
      const result = await sendOrderNotification(invalidOrder, 'confirmation');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order must have valid id and order number');
    });

    it('should fail with order missing order_number', async () => {
      const invalidOrder = { ...baseOrder, order_number: '' };
      const result = await sendOrderNotification(invalidOrder, 'confirmation');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order must have valid id and order number');
    });

    it('should fail with empty notification type', async () => {
      const result = await sendOrderNotification(baseOrder, '' as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification type is required');
    });

    it('should fail with null notification type', async () => {
      const result = await sendOrderNotification(baseOrder, null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification type is required');
    });
  });

  describe('error handling', () => {
    it('should handle simulated service failure', async () => {
      const result = await sendOrderNotification(failTestOrder, 'confirmation');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Simulated notification service failure');
    });

    it('should handle all notification types for failure case', async () => {
      const confirmResult = await sendOrderNotification(failTestOrder, 'confirmation');
      const readyResult = await sendOrderNotification(failTestOrder, 'ready');
      const cancelResult = await sendOrderNotification(failTestOrder, 'cancelled');

      expect(confirmResult.success).toBe(false);
      expect(readyResult.success).toBe(false);
      expect(cancelResult.success).toBe(false);
    });
  });

  describe('different order scenarios', () => {
    it('should handle guest order', async () => {
      const guestOrder: Order = {
        ...baseOrder,
        id: 4,
        order_number: 'GUEST-001',
        customer_id: 1,
        user_id: null,
        is_guest_order: true
      };

      const result = await sendOrderNotification(guestOrder, 'confirmation');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle user order', async () => {
      const userOrder: Order = {
        ...baseOrder,
        id: 5,
        order_number: 'USER-001',
        customer_id: null,
        user_id: 123,
        is_guest_order: false
      };

      const result = await sendOrderNotification(userOrder, 'confirmation');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle order with special notes', async () => {
      const orderWithNotes: Order = {
        ...baseOrder,
        id: 6,
        order_number: 'NOTES-001',
        special_notes: 'Please call when ready',
        internal_notes: 'Customer prefers phone contact'
      };

      const result = await sendOrderNotification(orderWithNotes, 'ready');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle order with high amount', async () => {
      const highValueOrder: Order = {
        ...baseOrder,
        id: 7,
        order_number: 'HIGH-001',
        total_amount: 199.99,
        tax_amount: 18.00
      };

      const result = await sendOrderNotification(highValueOrder, 'confirmation');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('concurrent notifications', () => {
    it('should handle multiple notifications simultaneously', async () => {
      const orders = [
        { ...baseOrder, id: 10, order_number: 'BULK-001' },
        { ...baseOrder, id: 11, order_number: 'BULK-002' },
        { ...baseOrder, id: 12, order_number: 'BULK-003' }
      ];

      const promises = orders.map(order => 
        sendOrderNotification(order, 'confirmation')
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should handle mixed success and failure cases', async () => {
      const orders = [
        { ...baseOrder, id: 13, order_number: 'MIX-001' },
        { ...baseOrder, id: 14, order_number: 'FAIL-TEST' },
        { ...baseOrder, id: 15, order_number: 'MIX-003' }
      ];

      const promises = orders.map(order => 
        sendOrderNotification(order, 'confirmation')
      );

      const results = await Promise.all(promises);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });
});