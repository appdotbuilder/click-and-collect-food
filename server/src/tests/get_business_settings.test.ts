import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { businessSettingsTable } from '../db/schema';
import { getBusinessSettings } from '../handlers/get_business_settings';

describe('getBusinessSettings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no settings exist', async () => {
    const result = await getBusinessSettings();

    expect(result).toHaveLength(0);
  });

  it('should return all business settings when no key is provided', async () => {
    // Create test business settings
    await db.insert(businessSettingsTable)
      .values([
        {
          key: 'tax_rate',
          value: '8.5',
          description: 'Default tax rate percentage'
        },
        {
          key: 'preparation_time',
          value: '20',
          description: 'Default preparation time in minutes'
        },
        {
          key: 'max_capacity',
          value: '50',
          description: 'Maximum orders per time slot'
        }
      ])
      .execute();

    const result = await getBusinessSettings();

    expect(result).toHaveLength(3);
    
    // Verify all settings are returned
    const keys = result.map(setting => setting.key);
    expect(keys).toContain('tax_rate');
    expect(keys).toContain('preparation_time');
    expect(keys).toContain('max_capacity');

    // Check specific setting details
    const taxRateSetting = result.find(s => s.key === 'tax_rate');
    expect(taxRateSetting?.value).toEqual('8.5');
    expect(taxRateSetting?.description).toEqual('Default tax rate percentage');
    expect(taxRateSetting?.id).toBeDefined();
    expect(taxRateSetting?.updated_at).toBeInstanceOf(Date);
  });

  it('should return specific setting when key is provided', async () => {
    // Create multiple test business settings
    await db.insert(businessSettingsTable)
      .values([
        {
          key: 'tax_rate',
          value: '8.5',
          description: 'Default tax rate percentage'
        },
        {
          key: 'preparation_time',
          value: '20',
          description: 'Default preparation time in minutes'
        }
      ])
      .execute();

    const result = await getBusinessSettings('tax_rate');

    expect(result).toHaveLength(1);
    expect(result[0].key).toEqual('tax_rate');
    expect(result[0].value).toEqual('8.5');
    expect(result[0].description).toEqual('Default tax rate percentage');
    expect(result[0].id).toBeDefined();
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should return empty array when key does not exist', async () => {
    // Create a test setting
    await db.insert(businessSettingsTable)
      .values({
        key: 'existing_setting',
        value: 'some_value',
        description: 'An existing setting'
      })
      .execute();

    const result = await getBusinessSettings('non_existent_key');

    expect(result).toHaveLength(0);
  });

  it('should return settings with null description', async () => {
    // Create setting with null description
    await db.insert(businessSettingsTable)
      .values({
        key: 'minimal_setting',
        value: 'minimal_value',
        description: null
      })
      .execute();

    const result = await getBusinessSettings('minimal_setting');

    expect(result).toHaveLength(1);
    expect(result[0].key).toEqual('minimal_setting');
    expect(result[0].value).toEqual('minimal_value');
    expect(result[0].description).toBeNull();
    expect(result[0].id).toBeDefined();
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle case-sensitive key matching', async () => {
    // Create test setting
    await db.insert(businessSettingsTable)
      .values({
        key: 'CamelCaseKey',
        value: 'test_value',
        description: 'Test case sensitivity'
      })
      .execute();

    // Should find exact match
    const exactResult = await getBusinessSettings('CamelCaseKey');
    expect(exactResult).toHaveLength(1);

    // Should not find case-mismatched key
    const mismatchedResult = await getBusinessSettings('camelcasekey');
    expect(mismatchedResult).toHaveLength(0);
  });

  it('should return settings ordered by creation (insertion order)', async () => {
    // Create settings in specific order
    await db.insert(businessSettingsTable)
      .values({
        key: 'first_setting',
        value: 'first_value',
        description: 'First setting'
      })
      .execute();

    await db.insert(businessSettingsTable)
      .values({
        key: 'second_setting',
        value: 'second_value',
        description: 'Second setting'
      })
      .execute();

    await db.insert(businessSettingsTable)
      .values({
        key: 'third_setting',
        value: 'third_value',
        description: 'Third setting'
      })
      .execute();

    const result = await getBusinessSettings();

    expect(result).toHaveLength(3);
    // Verify order by checking IDs are ascending
    expect(result[0].id < result[1].id).toBe(true);
    expect(result[1].id < result[2].id).toBe(true);
  });
});