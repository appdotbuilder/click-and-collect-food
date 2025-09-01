import { db } from '../db';
import { 
  ordersTable, 
  orderItemsTable, 
  customersTable, 
  dishesTable, 
  dishVariantsTable, 
  timeSlotsTable, 
  promoCodesTable,
  orderPromoCodesTable 
} from '../db/schema';
import { type CreateOrderInput, type Order } from '../schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

// Tax rate - could be configurable from business settings
const TAX_RATE = 0.08; // 8%

export const createOrder = async (input: CreateOrderInput): Promise<Order> => {
  try {
    return await db.transaction(async (tx) => {
      let customerId: number | null = null;

      // Handle customer creation for guest orders
      if (input.customer_info && !input.user_id) {
        const customerResult = await tx.insert(customersTable)
          .values({
            email: input.customer_info.email,
            phone: input.customer_info.phone,
            first_name: input.customer_info.first_name,
            last_name: input.customer_info.last_name
          })
          .returning()
          .execute();
        
        customerId = customerResult[0].id;
      }

      // Validate dishes and variants exist, calculate subtotal
      let subtotal = 0;
      const validatedItems = [];

      for (const item of input.items) {
        // Validate dish exists and is available
        const dishes = await tx.select()
          .from(dishesTable)
          .where(eq(dishesTable.id, item.dish_id))
          .execute();

        if (dishes.length === 0) {
          throw new Error(`Dish with ID ${item.dish_id} not found`);
        }

        const dish = dishes[0];
        if (dish.status !== 'available') {
          throw new Error(`Dish "${dish.name}" is not available`);
        }

        // Check stock if tracked
        if (dish.stock_quantity !== null && dish.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for dish "${dish.name}". Available: ${dish.stock_quantity}, requested: ${item.quantity}`);
        }

        let variantPriceModifier = 0;
        
        // Validate variant if provided
        if (item.variant_id) {
          const variants = await tx.select()
            .from(dishVariantsTable)
            .where(and(
              eq(dishVariantsTable.id, item.variant_id),
              eq(dishVariantsTable.dish_id, item.dish_id)
            ))
            .execute();

          if (variants.length === 0) {
            throw new Error(`Variant with ID ${item.variant_id} not found for dish ${item.dish_id}`);
          }

          variantPriceModifier = parseFloat(variants[0].price_modifier);
        }

        const basePrice = parseFloat(dish.price);
        const finalUnitPrice = basePrice + variantPriceModifier;
        const itemTotal = finalUnitPrice * item.quantity;
        
        subtotal += itemTotal;

        validatedItems.push({
          ...item,
          unit_price: finalUnitPrice,
          total_price: itemTotal,
          dish_name: dish.name
        });

        // Update stock quantity if tracked
        if (dish.stock_quantity !== null) {
          await tx.update(dishesTable)
            .set({ 
              stock_quantity: dish.stock_quantity - item.quantity,
              // Auto-update status if out of stock
              status: dish.stock_quantity - item.quantity <= 0 ? 'out_of_stock' : dish.status
            })
            .where(eq(dishesTable.id, item.dish_id))
            .execute();
        }
      }

      // Apply promo code if provided
      let discountAmount = 0;
      let promoCodeId: number | null = null;

      if (input.promo_code) {
        const promoCodes = await tx.select()
          .from(promoCodesTable)
          .where(eq(promoCodesTable.code, input.promo_code))
          .execute();

        if (promoCodes.length === 0) {
          throw new Error('Invalid promo code');
        }

        const promoCode = promoCodes[0];
        const now = new Date();

        // Validate promo code
        if (!promoCode.is_active) {
          throw new Error('Promo code is not active');
        }

        if (now < promoCode.valid_from || now > promoCode.valid_until) {
          throw new Error('Promo code is not valid at this time');
        }

        if (promoCode.max_uses !== null && promoCode.used_count >= promoCode.max_uses) {
          throw new Error('Promo code has reached its usage limit');
        }

        if (promoCode.minimum_order_amount !== null && subtotal < parseFloat(promoCode.minimum_order_amount)) {
          throw new Error(`Order must be at least $${promoCode.minimum_order_amount} to use this promo code`);
        }

        // Calculate discount
        if (promoCode.discount_percentage !== null) {
          discountAmount = subtotal * (parseFloat(promoCode.discount_percentage) / 100);
        } else if (promoCode.discount_amount !== null) {
          discountAmount = Math.min(parseFloat(promoCode.discount_amount), subtotal);
        }

        promoCodeId = promoCode.id;

        // Update promo code usage count
        await tx.update(promoCodesTable)
          .set({ used_count: promoCode.used_count + 1 })
          .where(eq(promoCodesTable.id, promoCode.id))
          .execute();
      }

      // Calculate final amounts
      const discountedSubtotal = subtotal - discountAmount;
      const taxAmount = discountedSubtotal * TAX_RATE;
      const totalAmount = discountedSubtotal + taxAmount;

      // Validate time slot availability
      const timeSlotDate = input.pickup_slot.toISOString().split('T')[0];
      const timeSlotTime = input.pickup_slot.toTimeString().split(' ')[0].substring(0, 5);

      const timeSlots = await tx.select()
        .from(timeSlotsTable)
        .where(and(
          eq(timeSlotsTable.date, timeSlotDate),
          lte(timeSlotsTable.start_time, timeSlotTime),
          gte(timeSlotsTable.end_time, timeSlotTime),
          eq(timeSlotsTable.is_available, true)
        ))
        .execute();

      if (timeSlots.length === 0) {
        throw new Error('No available time slot for the requested pickup time');
      }

      const timeSlot = timeSlots[0];
      if (timeSlot.current_bookings >= timeSlot.max_capacity) {
        throw new Error('Selected time slot is fully booked');
      }

      // Update time slot booking count
      await tx.update(timeSlotsTable)
        .set({ current_bookings: timeSlot.current_bookings + 1 })
        .where(eq(timeSlotsTable.id, timeSlot.id))
        .execute();

      // Generate unique order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const qrCode = `QR-${orderNumber}`;

      // Create the order
      const orderResult = await tx.insert(ordersTable)
        .values({
          order_number: orderNumber,
          customer_id: customerId,
          user_id: input.user_id || null,
          status: 'new',
          pickup_slot: input.pickup_slot,
          total_amount: totalAmount.toString(),
          tax_amount: taxAmount.toString(),
          special_notes: input.special_notes || null,
          internal_notes: null,
          qr_code: qrCode,
          is_guest_order: !input.user_id
        })
        .returning()
        .execute();

      const order = orderResult[0];

      // Create order items
      for (const item of validatedItems) {
        await tx.insert(orderItemsTable)
          .values({
            order_id: order.id,
            dish_id: item.dish_id,
            variant_id: item.variant_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price.toString(),
            total_price: item.total_price.toString(),
            special_requests: item.special_requests || null
          })
          .execute();
      }

      // Link promo code if used
      if (promoCodeId) {
        await tx.insert(orderPromoCodesTable)
          .values({
            order_id: order.id,
            promo_code_id: promoCodeId,
            discount_applied: discountAmount.toString()
          })
          .execute();
      }

      // Convert numeric fields back to numbers
      return {
        ...order,
        total_amount: parseFloat(order.total_amount),
        tax_amount: parseFloat(order.tax_amount)
      };
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    throw error;
  }
};