import { db } from '../db';
import { promoCodesTable } from '../db/schema';
import { type CreatePromoCodeInput, type PromoCode } from '../schema';
import { eq } from 'drizzle-orm';

export const createPromoCode = async (input: CreatePromoCodeInput): Promise<PromoCode> => {
  try {
    // Validate that either discount_percentage or discount_amount is provided (not both)
    if (input.discount_percentage && input.discount_amount) {
      throw new Error('Cannot specify both discount_percentage and discount_amount');
    }
    
    if (!input.discount_percentage && !input.discount_amount) {
      throw new Error('Must specify either discount_percentage or discount_amount');
    }

    // Validate date range
    if (input.valid_from >= input.valid_until) {
      throw new Error('valid_from must be before valid_until');
    }

    // Check if promo code already exists
    const existingCode = await db.select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.code, input.code))
      .execute();

    if (existingCode.length > 0) {
      throw new Error('Promo code already exists');
    }

    // Insert promo code record
    const result = await db.insert(promoCodesTable)
      .values({
        code: input.code,
        discount_percentage: input.discount_percentage?.toString() || null,
        discount_amount: input.discount_amount?.toString() || null,
        minimum_order_amount: input.minimum_order_amount?.toString() || null,
        max_uses: input.max_uses || null,
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        is_active: true,
        used_count: 0
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const promoCode = result[0];
    return {
      ...promoCode,
      discount_percentage: promoCode.discount_percentage ? parseFloat(promoCode.discount_percentage) : null,
      discount_amount: promoCode.discount_amount ? parseFloat(promoCode.discount_amount) : null,
      minimum_order_amount: promoCode.minimum_order_amount ? parseFloat(promoCode.minimum_order_amount) : null
    };
  } catch (error) {
    console.error('Promo code creation failed:', error);
    throw error;
  }
};