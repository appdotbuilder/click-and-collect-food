import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { promoCodesTable } from '../db/schema';
import { type CreatePromoCodeInput } from '../schema';
import { validatePromoCode } from '../handlers/validate_promo_code';
import { eq } from 'drizzle-orm';

describe('validatePromoCode', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper to create promo codes
  const createPromoCode = async (input: Partial<CreatePromoCodeInput> = {}) => {
    const now = new Date();
    const validFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Yesterday
    const validUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Next year
    
    const defaultInput: CreatePromoCodeInput = {
      code: 'TEST10',
      discount_percentage: 10,
      discount_amount: null,
      minimum_order_amount: null,
      max_uses: null,
      valid_from: validFrom,
      valid_until: validUntil,
      ...input
    };

    const results = await db.insert(promoCodesTable)
      .values({
        code: defaultInput.code,
        discount_percentage: defaultInput.discount_percentage?.toString() || null,
        discount_amount: defaultInput.discount_amount?.toString() || null,
        minimum_order_amount: defaultInput.minimum_order_amount?.toString() || null,
        max_uses: defaultInput.max_uses,
        used_count: 0,
        valid_from: defaultInput.valid_from,
        valid_until: defaultInput.valid_until,
        is_active: true
      })
      .returning()
      .execute();

    return results[0];
  };

  it('should validate a valid percentage-based promo code', async () => {
    await createPromoCode({
      code: 'SAVE10',
      discount_percentage: 10,
      discount_amount: null
    });

    const result = await validatePromoCode('SAVE10', 100);

    expect(result.valid).toBe(true);
    expect(result.promoCode).toBeDefined();
    expect(result.promoCode!.code).toEqual('SAVE10');
    expect(result.promoCode!.discount_percentage).toEqual(10);
    expect(result.discount).toEqual(10); // 10% of 100
    expect(result.error).toBeUndefined();
  });

  it('should validate a valid fixed amount promo code', async () => {
    await createPromoCode({
      code: 'SAVE15',
      discount_percentage: null,
      discount_amount: 15
    });

    const result = await validatePromoCode('SAVE15', 100);

    expect(result.valid).toBe(true);
    expect(result.promoCode).toBeDefined();
    expect(result.promoCode!.code).toEqual('SAVE15');
    expect(result.promoCode!.discount_amount).toEqual(15);
    expect(result.discount).toEqual(15);
    expect(result.error).toBeUndefined();
  });

  it('should return error for non-existent promo code', async () => {
    const result = await validatePromoCode('INVALID', 100);

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeUndefined();
    expect(result.discount).toBeUndefined();
    expect(result.error).toEqual('Promo code not found');
  });

  it('should return error for inactive promo code', async () => {
    const promoCode = await createPromoCode({ code: 'INACTIVE' });
    
    // Make it inactive
    await db.update(promoCodesTable)
      .set({ is_active: false })
      .where(eq(promoCodesTable.id, promoCode.id))
      .execute();

    const result = await validatePromoCode('INACTIVE', 100);

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeDefined();
    expect(result.error).toEqual('Promo code is not active');
  });

  it('should return error for expired promo code', async () => {
    await createPromoCode({
      code: 'EXPIRED',
      valid_from: new Date('2023-01-01'),
      valid_until: new Date('2023-12-31') // Past date
    });

    const result = await validatePromoCode('EXPIRED', 100);

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeDefined();
    expect(result.error).toEqual('Promo code has expired');
  });

  it('should return error for not yet valid promo code', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    await createPromoCode({
      code: 'FUTURE',
      valid_from: futureDate,
      valid_until: new Date(futureDate.getTime() + 365 * 24 * 60 * 60 * 1000)
    });

    const result = await validatePromoCode('FUTURE', 100);

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeDefined();
    expect(result.error).toEqual('Promo code is not yet valid');
  });

  it('should return error when usage limit is exceeded', async () => {
    const promoCode = await createPromoCode({
      code: 'LIMITED',
      max_uses: 5
    });

    // Set used count to max
    await db.update(promoCodesTable)
      .set({ used_count: 5 })
      .where(eq(promoCodesTable.id, promoCode.id))
      .execute();

    const result = await validatePromoCode('LIMITED', 100);

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeDefined();
    expect(result.error).toEqual('Promo code usage limit exceeded');
  });

  it('should return error when minimum order amount not met', async () => {
    await createPromoCode({
      code: 'MINIMUM50',
      minimum_order_amount: 50
    });

    const result = await validatePromoCode('MINIMUM50', 25); // Below minimum

    expect(result.valid).toBe(false);
    expect(result.promoCode).toBeDefined();
    expect(result.error).toEqual('Minimum order amount of $50 required');
  });

  it('should validate when minimum order amount is met', async () => {
    await createPromoCode({
      code: 'MINIMUM50',
      minimum_order_amount: 50,
      discount_percentage: 20
    });

    const result = await validatePromoCode('MINIMUM50', 75); // Above minimum

    expect(result.valid).toBe(true);
    expect(result.promoCode).toBeDefined();
    expect(result.discount).toEqual(15); // 20% of 75
    expect(result.error).toBeUndefined();
  });

  it('should not allow discount to exceed order amount', async () => {
    await createPromoCode({
      code: 'BIGDISCOUNT',
      discount_percentage: null, // Clear default percentage
      discount_amount: 150 // More than order amount
    });

    const result = await validatePromoCode('BIGDISCOUNT', 100);

    expect(result.valid).toBe(true);
    expect(result.discount).toEqual(100); // Capped at order amount
    expect(result.error).toBeUndefined();
  });

  it('should handle percentage discount exceeding order amount', async () => {
    await createPromoCode({
      code: 'PERCENT150',
      discount_percentage: 150 // 150%
    });

    const result = await validatePromoCode('PERCENT150', 50);

    expect(result.valid).toBe(true);
    expect(result.discount).toEqual(50); // Capped at order amount (150% of 50 = 75, capped to 50)
    expect(result.error).toBeUndefined();
  });

  it('should work with usage limit not yet reached', async () => {
    const promoCode = await createPromoCode({
      code: 'USAGE5',
      max_uses: 5,
      discount_percentage: 15
    });

    // Set used count below max
    await db.update(promoCodesTable)
      .set({ used_count: 3 })
      .where(eq(promoCodesTable.id, promoCode.id))
      .execute();

    const result = await validatePromoCode('USAGE5', 100);

    expect(result.valid).toBe(true);
    expect(result.promoCode).toBeDefined();
    expect(result.discount).toEqual(15); // 15% of 100
    expect(result.error).toBeUndefined();
  });

  it('should handle promo code with both percentage and amount (percentage takes precedence)', async () => {
    await createPromoCode({
      code: 'BOTH',
      discount_percentage: 20,
      discount_amount: 10 // Should be ignored when percentage is present
    });

    const result = await validatePromoCode('BOTH', 100);

    expect(result.valid).toBe(true);
    expect(result.discount).toEqual(20); // Uses percentage (20%), not fixed amount
    expect(result.error).toBeUndefined();
  });

  it('should handle zero order amount', async () => {
    await createPromoCode({
      code: 'ZERODISCOUNT',
      discount_percentage: 10
    });

    const result = await validatePromoCode('ZERODISCOUNT', 0);

    expect(result.valid).toBe(true);
    expect(result.discount).toEqual(0); // 10% of 0
    expect(result.error).toBeUndefined();
  });
});