import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { timeSlotsTable } from '../db/schema';
import { type AvailableTimeSlotsQuery } from '../schema';
import { getAvailableTimeSlots } from '../handlers/get_available_time_slots';

describe('getAvailableTimeSlots', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const createTestTimeSlots = async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterDayAfterTomorrow = new Date(today);
    dayAfterDayAfterTomorrow.setDate(dayAfterDayAfterTomorrow.getDate() + 3);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];
    const dayAfterDayAfterTomorrowStr = dayAfterDayAfterTomorrow.toISOString().split('T')[0];

    // Create various time slots for testing
    await db.insert(timeSlotsTable).values([
      // Today's slots
      {
        date: todayStr,
        start_time: '10:00',
        end_time: '10:30',
        max_capacity: 5,
        current_bookings: 2,
        is_available: true
      },
      {
        date: todayStr,
        start_time: '11:00',
        end_time: '11:30',
        max_capacity: 5,
        current_bookings: 5, // Fully booked
        is_available: true
      },
      {
        date: todayStr,
        start_time: '12:00',
        end_time: '12:30',
        max_capacity: 10,
        current_bookings: 3,
        is_available: false // Not available
      },
      // Tomorrow's slots
      {
        date: tomorrowStr,
        start_time: '09:00',
        end_time: '09:30',
        max_capacity: 8,
        current_bookings: 4,
        is_available: true
      },
      {
        date: tomorrowStr,
        start_time: '10:00',
        end_time: '10:30',
        max_capacity: 6,
        current_bookings: 1,
        is_available: true
      },
      // Day after tomorrow's slots
      {
        date: dayAfterTomorrowStr,
        start_time: '14:00',
        end_time: '14:30',
        max_capacity: 12,
        current_bookings: 0,
        is_available: true
      },
      // Slot beyond J+2 range
      {
        date: dayAfterDayAfterTomorrowStr,
        start_time: '15:00',
        end_time: '15:30',
        max_capacity: 5,
        current_bookings: 0,
        is_available: true
      }
    ]).execute();

    return {
      todayStr,
      tomorrowStr,
      dayAfterTomorrowStr,
      dayAfterDayAfterTomorrowStr
    };
  };

  it('should return available time slots within date range', async () => {
    const { todayStr, dayAfterTomorrowStr } = await createTestTimeSlots();

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      date_to: dayAfterTomorrowStr,
      preparation_time_minutes: 30
    };

    const result = await getAvailableTimeSlots(query);

    // Should include available slots that aren't fully booked
    expect(result.length).toBeGreaterThan(0);
    
    result.forEach(slot => {
      expect(slot.is_available).toBe(true);
      expect(slot.current_bookings).toBeLessThan(slot.max_capacity);
      expect(slot.date >= todayStr).toBe(true);
      expect(slot.date <= dayAfterTomorrowStr).toBe(true);
    });
  });

  it('should exclude fully booked slots', async () => {
    await createTestTimeSlots();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 0 // No preparation time for this test
    };

    const result = await getAvailableTimeSlots(query);

    // Check that no slot has current_bookings >= max_capacity
    result.forEach(slot => {
      expect(slot.current_bookings).toBeLessThan(slot.max_capacity);
    });
  });

  it('should exclude unavailable slots', async () => {
    await createTestTimeSlots();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 0
    };

    const result = await getAvailableTimeSlots(query);

    // All returned slots should be available
    result.forEach(slot => {
      expect(slot.is_available).toBe(true);
    });
  });

  it('should default date_to to date_from + 2 days when not provided', async () => {
    const { todayStr, dayAfterTomorrowStr } = await createTestTimeSlots();

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 0
    };

    const result = await getAvailableTimeSlots(query);

    // Should include slots up to J+2
    const hasJ2Slots = result.some(slot => slot.date === dayAfterTomorrowStr);
    expect(hasJ2Slots).toBe(true);

    // Should not include slots beyond J+2
    const today = new Date(todayStr);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 2);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    result.forEach(slot => {
      expect(slot.date <= maxDateStr).toBe(true);
    });
  });

  it('should exclude slots within preparation time from now', async () => {
    const now = new Date();
    
    // Create a slot that should be excluded due to preparation time
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Create a slot 15 minutes from now
    const futureTime = new Date(now.getTime() + 15 * 60 * 1000);
    const futureTimeStr = futureTime.toTimeString().slice(0, 5);

    await db.insert(timeSlotsTable).values({
      date: todayStr,
      start_time: futureTimeStr,
      end_time: '23:59',
      max_capacity: 5,
      current_bookings: 0,
      is_available: true
    }).execute();

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 30 // 30 minutes preparation time
    };

    const result = await getAvailableTimeSlots(query);

    // The slot 15 minutes from now should be excluded due to 30 minutes preparation time
    const excludedSlot = result.find(slot => 
      slot.date === todayStr && slot.start_time === futureTimeStr
    );
    expect(excludedSlot).toBeUndefined();
  });

  it('should return empty array when no slots match criteria', async () => {
    // Create only unavailable or fully booked slots
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    await db.insert(timeSlotsTable).values([
      {
        date: todayStr,
        start_time: '10:00',
        end_time: '10:30',
        max_capacity: 5,
        current_bookings: 5, // Fully booked
        is_available: true
      },
      {
        date: todayStr,
        start_time: '11:00',
        end_time: '11:30',
        max_capacity: 5,
        current_bookings: 0,
        is_available: false // Not available
      }
    ]).execute();

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 0
    };

    const result = await getAvailableTimeSlots(query);
    expect(result).toHaveLength(0);
  });

  it('should handle date range queries correctly', async () => {
    const { tomorrowStr, dayAfterTomorrowStr } = await createTestTimeSlots();

    const query: AvailableTimeSlotsQuery = {
      date_from: tomorrowStr,
      date_to: tomorrowStr, // Single day query
      preparation_time_minutes: 0
    };

    const result = await getAvailableTimeSlots(query);

    // Should only include tomorrow's slots
    result.forEach(slot => {
      expect(slot.date).toBe(tomorrowStr);
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it('should return slots with correct data types and structure', async () => {
    await createTestTimeSlots();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const query: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 0
    };

    const result = await getAvailableTimeSlots(query);

    if (result.length > 0) {
      const slot = result[0];
      
      expect(typeof slot.id).toBe('number');
      expect(typeof slot.date).toBe('string');
      expect(typeof slot.start_time).toBe('string');
      expect(typeof slot.end_time).toBe('string');
      expect(typeof slot.max_capacity).toBe('number');
      expect(typeof slot.current_bookings).toBe('number');
      expect(typeof slot.is_available).toBe('boolean');
      expect(slot.created_at).toBeInstanceOf(Date);
      
      // Verify date format (YYYY-MM-DD)
      expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Verify time format (HH:MM)
      expect(slot.start_time).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.end_time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('should apply default preparation_time_minutes from schema', async () => {
    await createTestTimeSlots();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Test with query that uses default preparation_time_minutes (20)
    const queryWithDefaults: AvailableTimeSlotsQuery = {
      date_from: todayStr,
      preparation_time_minutes: 20 // Schema default
    };

    const result = await getAvailableTimeSlots(queryWithDefaults);

    // Should work without errors and filter appropriately
    expect(Array.isArray(result)).toBe(true);
    
    result.forEach(slot => {
      expect(slot.is_available).toBe(true);
      expect(slot.current_bookings).toBeLessThan(slot.max_capacity);
    });
  });
});