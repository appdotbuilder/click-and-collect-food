import { db } from '../db';
import { promoCodesTable } from '../db/schema';
import { type PromoCode } from '../schema';
import { eq } from 'drizzle-orm';

export async function validatePromoCode(code: string, orderAmount: number): Promise<{ valid: boolean; promoCode?: PromoCode; discount?: number; error?: string }> {
  try {
    // Find the promo code in the database
    const results = await db.select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.code, code))
      .execute();

    if (results.length === 0) {
      return {
        valid: false,
        error: 'Promo code not found'
      };
    }

    const promoCodeRecord = results[0];
    
    // Convert numeric fields from strings to numbers
    const promoCode: PromoCode = {
      ...promoCodeRecord,
      discount_percentage: promoCodeRecord.discount_percentage ? parseFloat(promoCodeRecord.discount_percentage) : null,
      discount_amount: promoCodeRecord.discount_amount ? parseFloat(promoCodeRecord.discount_amount) : null,
      minimum_order_amount: promoCodeRecord.minimum_order_amount ? parseFloat(promoCodeRecord.minimum_order_amount) : null
    };

    // Check if promo code is active
    if (!promoCode.is_active) {
      return {
        valid: false,
        promoCode,
        error: 'Promo code is not active'
      };
    }

    // Check validity dates
    const now = new Date();
    if (now < promoCode.valid_from) {
      return {
        valid: false,
        promoCode,
        error: 'Promo code is not yet valid'
      };
    }

    if (now > promoCode.valid_until) {
      return {
        valid: false,
        promoCode,
        error: 'Promo code has expired'
      };
    }

    // Check usage limits
    if (promoCode.max_uses !== null && promoCode.used_count >= promoCode.max_uses) {
      return {
        valid: false,
        promoCode,
        error: 'Promo code usage limit exceeded'
      };
    }

    // Check minimum order amount
    if (promoCode.minimum_order_amount !== null && orderAmount < promoCode.minimum_order_amount) {
      return {
        valid: false,
        promoCode,
        error: `Minimum order amount of $${promoCode.minimum_order_amount} required`
      };
    }

    // Calculate discount
    let discount = 0;
    if (promoCode.discount_percentage !== null) {
      discount = (orderAmount * promoCode.discount_percentage) / 100;
    } else if (promoCode.discount_amount !== null) {
      discount = promoCode.discount_amount;
    }

    // Ensure discount doesn't exceed order amount
    discount = Math.min(discount, orderAmount);

    return {
      valid: true,
      promoCode,
      discount
    };
  } catch (error) {
    console.error('Promo code validation failed:', error);
    throw error;
  }
}