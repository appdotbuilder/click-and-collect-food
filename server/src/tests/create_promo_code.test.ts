import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { promoCodesTable } from '../db/schema';
import { type CreatePromoCodeInput } from '../schema';
import { createPromoCode } from '../handlers/create_promo_code';
import { eq } from 'drizzle-orm';

// Test inputs
const percentageDiscountInput: CreatePromoCodeInput = {
  code: 'SAVE20',
  discount_percentage: 20,
  discount_amount: null,
  minimum_order_amount: 50,
  max_uses: 100,
  valid_from: new Date('2024-01-01'),
  valid_until: new Date('2024-12-31')
};

const amountDiscountInput: CreatePromoCodeInput = {
  code: 'SAVE10',
  discount_percentage: null,
  discount_amount: 10,
  minimum_order_amount: null,
  max_uses: null,
  valid_from: new Date('2024-06-01'),
  valid_until: new Date('2024-06-30')
};

describe('createPromoCode', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a promo code with percentage discount', async () => {
    const result = await createPromoCode(percentageDiscountInput);

    // Basic field validation
    expect(result.code).toEqual('SAVE20');
    expect(result.discount_percentage).toEqual(20);
    expect(result.discount_amount).toBeNull();
    expect(result.minimum_order_amount).toEqual(50);
    expect(result.max_uses).toEqual(100);
    expect(result.used_count).toEqual(0);
    expect(result.is_active).toBe(true);
    expect(result.valid_from).toEqual(new Date('2024-01-01'));
    expect(result.valid_until).toEqual(new Date('2024-12-31'));
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);

    // Verify numeric conversion
    expect(typeof result.discount_percentage).toBe('number');
    expect(typeof result.minimum_order_amount).toBe('number');
  });

  it('should create a promo code with amount discount', async () => {
    const result = await createPromoCode(amountDiscountInput);

    // Basic field validation
    expect(result.code).toEqual('SAVE10');
    expect(result.discount_percentage).toBeNull();
    expect(result.discount_amount).toEqual(10);
    expect(result.minimum_order_amount).toBeNull();
    expect(result.max_uses).toBeNull();
    expect(result.used_count).toEqual(0);
    expect(result.is_active).toBe(true);
    expect(result.valid_from).toEqual(new Date('2024-06-01'));
    expect(result.valid_until).toEqual(new Date('2024-06-30'));
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);

    // Verify numeric conversion
    expect(typeof result.discount_amount).toBe('number');
  });

  it('should save promo code to database', async () => {
    const result = await createPromoCode(percentageDiscountInput);

    // Query database directly to verify storage
    const promoCodes = await db.select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.id, result.id))
      .execute();

    expect(promoCodes).toHaveLength(1);
    const stored = promoCodes[0];
    expect(stored.code).toEqual('SAVE20');
    expect(parseFloat(stored.discount_percentage!)).toEqual(20);
    expect(stored.discount_amount).toBeNull();
    expect(parseFloat(stored.minimum_order_amount!)).toEqual(50);
    expect(stored.max_uses).toEqual(100);
    expect(stored.used_count).toEqual(0);
    expect(stored.is_active).toBe(true);
    expect(stored.created_at).toBeInstanceOf(Date);
  });

  it('should reject duplicate promo codes', async () => {
    // Create first promo code
    await createPromoCode(percentageDiscountInput);

    // Try to create duplicate
    await expect(createPromoCode(percentageDiscountInput))
      .rejects.toThrow(/promo code already exists/i);
  });

  it('should reject both discount types specified', async () => {
    const invalidInput: CreatePromoCodeInput = {
      code: 'INVALID',
      discount_percentage: 20,
      discount_amount: 10,
      minimum_order_amount: null,
      max_uses: null,
      valid_from: new Date('2024-01-01'),
      valid_until: new Date('2024-12-31')
    };

    await expect(createPromoCode(invalidInput))
      .rejects.toThrow(/cannot specify both/i);
  });

  it('should reject neither discount type specified', async () => {
    const invalidInput: CreatePromoCodeInput = {
      code: 'INVALID',
      discount_percentage: null,
      discount_amount: null,
      minimum_order_amount: null,
      max_uses: null,
      valid_from: new Date('2024-01-01'),
      valid_until: new Date('2024-12-31')
    };

    await expect(createPromoCode(invalidInput))
      .rejects.toThrow(/must specify either/i);
  });

  it('should reject invalid date range', async () => {
    const invalidInput: CreatePromoCodeInput = {
      code: 'INVALID',
      discount_percentage: 20,
      discount_amount: null,
      minimum_order_amount: null,
      max_uses: null,
      valid_from: new Date('2024-12-31'),
      valid_until: new Date('2024-01-01') // Invalid: end before start
    };

    await expect(createPromoCode(invalidInput))
      .rejects.toThrow(/valid_from must be before valid_until/i);
  });

  it('should handle edge case with equal dates', async () => {
    const sameDate = new Date('2024-06-01');
    const invalidInput: CreatePromoCodeInput = {
      code: 'INVALID',
      discount_percentage: 20,
      discount_amount: null,
      minimum_order_amount: null,
      max_uses: null,
      valid_from: sameDate,
      valid_until: sameDate
    };

    await expect(createPromoCode(invalidInput))
      .rejects.toThrow(/valid_from must be before valid_until/i);
  });

  it('should create multiple different promo codes', async () => {
    // Create first promo code
    const result1 = await createPromoCode(percentageDiscountInput);
    
    // Create second promo code
    const result2 = await createPromoCode(amountDiscountInput);

    // Verify both exist and have different IDs
    expect(result1.id).not.toEqual(result2.id);
    expect(result1.code).toEqual('SAVE20');
    expect(result2.code).toEqual('SAVE10');

    // Verify both are stored in database
    const allPromoCodes = await db.select()
      .from(promoCodesTable)
      .execute();

    expect(allPromoCodes).toHaveLength(2);
  });
});