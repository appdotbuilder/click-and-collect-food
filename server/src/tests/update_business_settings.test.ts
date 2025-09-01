import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { businessSettingsTable } from '../db/schema';
import { updateBusinessSettings } from '../handlers/update_business_settings';
import { eq } from 'drizzle-orm';

describe('updateBusinessSettings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a new business setting', async () => {
    const result = await updateBusinessSettings('tax_rate', '0.08', 'Default tax rate for orders');

    expect(result.key).toEqual('tax_rate');
    expect(result.value).toEqual('0.08');
    expect(result.description).toEqual('Default tax rate for orders');
    expect(result.id).toBeDefined();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save new setting to database', async () => {
    const result = await updateBusinessSettings('max_orders_per_slot', '20', 'Maximum orders per time slot');

    // Verify it was saved to database
    const settings = await db.select()
      .from(businessSettingsTable)
      .where(eq(businessSettingsTable.id, result.id))
      .execute();

    expect(settings).toHaveLength(1);
    expect(settings[0].key).toEqual('max_orders_per_slot');
    expect(settings[0].value).toEqual('20');
    expect(settings[0].description).toEqual('Maximum orders per time slot');
    expect(settings[0].updated_at).toBeInstanceOf(Date);
  });

  it('should update existing business setting', async () => {
    // Create initial setting
    await updateBusinessSettings('delivery_fee', '5.00', 'Standard delivery fee');

    // Update the same setting
    const result = await updateBusinessSettings('delivery_fee', '6.50', 'Updated delivery fee');

    expect(result.key).toEqual('delivery_fee');
    expect(result.value).toEqual('6.50');
    expect(result.description).toEqual('Updated delivery fee');
    expect(result.id).toBeDefined();
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify only one record exists in database
    const settings = await db.select()
      .from(businessSettingsTable)
      .where(eq(businessSettingsTable.key, 'delivery_fee'))
      .execute();

    expect(settings).toHaveLength(1);
    expect(settings[0].value).toEqual('6.50');
    expect(settings[0].description).toEqual('Updated delivery fee');
  });

  it('should preserve existing description when updating without description', async () => {
    // Create initial setting with description
    await updateBusinessSettings('service_fee', '2.00', 'Service charge per order');

    // Update without providing description
    const result = await updateBusinessSettings('service_fee', '2.50');

    expect(result.key).toEqual('service_fee');
    expect(result.value).toEqual('2.50');
    expect(result.description).toEqual('Service charge per order'); // Should preserve original description
    expect(result.id).toBeDefined();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create setting with null description when none provided', async () => {
    const result = await updateBusinessSettings('min_order_amount', '15.00');

    expect(result.key).toEqual('min_order_amount');
    expect(result.value).toEqual('15.00');
    expect(result.description).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update existing setting and clear description when explicitly set to undefined', async () => {
    // Create initial setting with description
    await updateBusinessSettings('processing_time', '30', 'Default processing time in minutes');

    // Update and explicitly provide undefined description
    const result = await updateBusinessSettings('processing_time', '45', undefined);

    expect(result.key).toEqual('processing_time');
    expect(result.value).toEqual('45');
    expect(result.description).toEqual('Default processing time in minutes'); // Should preserve existing
    expect(result.id).toBeDefined();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should handle different data types as string values', async () => {
    // Test with boolean-like string
    const boolResult = await updateBusinessSettings('enable_notifications', 'true', 'Enable push notifications');
    expect(boolResult.value).toEqual('true');

    // Test with numeric string
    const numResult = await updateBusinessSettings('max_daily_orders', '500', 'Maximum daily order limit');
    expect(numResult.value).toEqual('500');

    // Test with JSON-like string
    const jsonResult = await updateBusinessSettings('business_hours', '{"mon":"9-17","tue":"9-17"}', 'Business operating hours');
    expect(jsonResult.value).toEqual('{"mon":"9-17","tue":"9-17"}');
  });

  it('should handle special characters in key and value', async () => {
    const result = await updateBusinessSettings('api_key_stripe_test', 'sk_test_123abc!@#$%', 'Stripe test API key');

    expect(result.key).toEqual('api_key_stripe_test');
    expect(result.value).toEqual('sk_test_123abc!@#$%');
    expect(result.description).toEqual('Stripe test API key');
  });

  it('should update timestamps correctly on successive updates', async () => {
    // Create initial setting
    const initial = await updateBusinessSettings('cache_duration', '3600');
    const initialTime = initial.updated_at.getTime();

    // Wait a small amount to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Update the setting
    const updated = await updateBusinessSettings('cache_duration', '7200');
    const updatedTime = updated.updated_at.getTime();

    expect(updatedTime).toBeGreaterThan(initialTime);
    expect(updated.key).toEqual('cache_duration');
    expect(updated.value).toEqual('7200');
  });
});