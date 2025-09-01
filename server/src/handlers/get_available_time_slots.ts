import { db } from '../db';
import { timeSlotsTable } from '../db/schema';
import { type AvailableTimeSlotsQuery, type TimeSlot } from '../schema';
import { and, gte, lte, eq, SQL } from 'drizzle-orm';

export const getAvailableTimeSlots = async (query: AvailableTimeSlotsQuery): Promise<TimeSlot[]> => {
  try {
    const { date_from, date_to, preparation_time_minutes } = query;
    
    // Calculate the effective date range
    const dateFrom = date_from;
    let dateTo = date_to;
    
    // If date_to is not provided, default to date_from + 2 days
    if (!dateTo) {
      const fromDate = new Date(dateFrom);
      fromDate.setDate(fromDate.getDate() + 2);
      dateTo = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    // Calculate minimum pickup time (now + preparation time)
    const now = new Date();
    const minPickupTime = new Date(now.getTime() + preparation_time_minutes * 60 * 1000);
    const minPickupDate = minPickupTime.toISOString().split('T')[0];
    const minPickupTimeStr = minPickupTime.toTimeString().slice(0, 5); // HH:MM format
    
    // Build base query
    let baseQuery = db.select().from(timeSlotsTable);
    
    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Date range filter
    conditions.push(gte(timeSlotsTable.date, dateFrom));
    conditions.push(lte(timeSlotsTable.date, dateTo));
    
    // Only available slots
    conditions.push(eq(timeSlotsTable.is_available, true));
    
    // Apply all conditions
    const query1 = baseQuery.where(and(...conditions));
    
    const results = await query1.execute();
    
    // Filter out slots that are within preparation time from now
    // and slots that are fully booked
    const filteredSlots = results.filter(slot => {
      // Check if slot has capacity
      if (slot.current_bookings >= slot.max_capacity) {
        return false;
      }
      
      // Check if slot is after minimum pickup time
      if (slot.date < minPickupDate) {
        return false;
      }
      
      // For slots on the same date as minimum pickup, check time
      // Convert slot start_time (HH:MM:SS) to HH:MM for comparison
      const slotStartTime = slot.start_time.slice(0, 5); // Take only HH:MM part
      if (slot.date === minPickupDate && slotStartTime < minPickupTimeStr) {
        return false;
      }
      
      return true;
    });
    
    // Convert numeric fields and ensure proper type structure
    return filteredSlots.map(slot => ({
      id: slot.id,
      date: slot.date,
      start_time: slot.start_time.slice(0, 5), // Convert HH:MM:SS to HH:MM
      end_time: slot.end_time.slice(0, 5), // Convert HH:MM:SS to HH:MM
      max_capacity: slot.max_capacity,
      current_bookings: slot.current_bookings,
      is_available: slot.is_available,
      created_at: slot.created_at
    }));
  } catch (error) {
    console.error('Getting available time slots failed:', error);
    throw error;
  }
};