import { db } from '../db';
import { businessSettingsTable } from '../db/schema';
import { type BusinessSettings } from '../schema';
import { eq } from 'drizzle-orm';

export const getBusinessSettings = async (key?: string): Promise<BusinessSettings[]> => {
  try {
    // Build query conditionally
    if (key) {
      const results = await db.select()
        .from(businessSettingsTable)
        .where(eq(businessSettingsTable.key, key))
        .execute();
      
      return results;
    } else {
      const results = await db.select()
        .from(businessSettingsTable)
        .execute();
      
      return results;
    }
  } catch (error) {
    console.error('Business settings retrieval failed:', error);
    throw error;
  }
};