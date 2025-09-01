import { db } from '../db';
import { timeSlotsTable } from '../db/schema';
import { type CreateTimeSlotInput, type TimeSlot } from '../schema';
import { and, eq, sql } from 'drizzle-orm';

export const createTimeSlot = async (input: CreateTimeSlotInput): Promise<TimeSlot> => {
  try {
    // Validate time range - end time must be after start time
    if (input.start_time >= input.end_time) {
      throw new Error('End time must be after start time');
    }

    // Check for overlapping time slots on the same date using SQL time comparison
    const overlappingSlots = await db.select()
      .from(timeSlotsTable)
      .where(
        and(
          eq(timeSlotsTable.date, input.date),
          sql`(
            (${input.start_time}::time >= ${timeSlotsTable.start_time} AND ${input.start_time}::time < ${timeSlotsTable.end_time}) OR
            (${input.end_time}::time > ${timeSlotsTable.start_time} AND ${input.end_time}::time <= ${timeSlotsTable.end_time}) OR
            (${input.start_time}::time <= ${timeSlotsTable.start_time} AND ${input.end_time}::time >= ${timeSlotsTable.end_time})
          )`
        )
      )
      .execute();

    if (overlappingSlots.length > 0) {
      throw new Error('Time slot overlaps with existing slot');
    }

    // Insert new time slot
    const result = await db.insert(timeSlotsTable)
      .values({
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        max_capacity: input.max_capacity,
        current_bookings: 0,
        is_available: input.is_available
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Time slot creation failed:', error);
    throw error;
  }
};