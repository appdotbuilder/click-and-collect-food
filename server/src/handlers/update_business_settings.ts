import { db } from '../db';
import { businessSettingsTable } from '../db/schema';
import { type BusinessSettings } from '../schema';
import { eq } from 'drizzle-orm';

export async function updateBusinessSettings(key: string, value: string, description?: string): Promise<BusinessSettings> {
  try {
    // Check if setting already exists
    const existing = await db.select()
      .from(businessSettingsTable)
      .where(eq(businessSettingsTable.key, key))
      .execute();

    if (existing.length > 0) {
      // Update existing setting
      const result = await db.update(businessSettingsTable)
        .set({
          value: value,
          description: description || existing[0].description,
          updated_at: new Date()
        })
        .where(eq(businessSettingsTable.key, key))
        .returning()
        .execute();

      return result[0];
    } else {
      // Create new setting
      const result = await db.insert(businessSettingsTable)
        .values({
          key: key,
          value: value,
          description: description || null
        })
        .returning()
        .execute();

      return result[0];
    }
  } catch (error) {
    console.error('Business settings update failed:', error);
    throw error;
  }
}