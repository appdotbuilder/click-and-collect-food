import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { timeSlotsTable } from '../db/schema';
import { type CreateTimeSlotInput } from '../schema';
import { createTimeSlot } from '../handlers/create_time_slot';
import { eq, and } from 'drizzle-orm';

const testInput: CreateTimeSlotInput = {
  date: '2024-01-15',
  start_time: '10:00',
  end_time: '11:00',
  max_capacity: 10,
  is_available: true
};

describe('createTimeSlot', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a time slot', async () => {
    const result = await createTimeSlot(testInput);

    expect(result.date).toEqual('2024-01-15');
    expect(result.start_time).toEqual('10:00:00');
    expect(result.end_time).toEqual('11:00:00');
    expect(result.max_capacity).toEqual(10);
    expect(result.current_bookings).toEqual(0);
    expect(result.is_available).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save time slot to database', async () => {
    const result = await createTimeSlot(testInput);

    const slots = await db.select()
      .from(timeSlotsTable)
      .where(eq(timeSlotsTable.id, result.id))
      .execute();

    expect(slots).toHaveLength(1);
    expect(slots[0].date).toEqual('2024-01-15');
    expect(slots[0].start_time).toEqual('10:00:00');
    expect(slots[0].end_time).toEqual('11:00:00');
    expect(slots[0].max_capacity).toEqual(10);
    expect(slots[0].current_bookings).toEqual(0);
    expect(slots[0].is_available).toEqual(true);
    expect(slots[0].created_at).toBeInstanceOf(Date);
  });

  it('should create time slot with default availability', async () => {
    const inputWithoutAvailability: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '14:00',
      end_time: '15:00',
      max_capacity: 5,
      is_available: true
    };

    const result = await createTimeSlot(inputWithoutAvailability);

    expect(result.is_available).toEqual(true);
  });

  it('should reject time slot with end time before start time', async () => {
    const invalidInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '15:00',
      end_time: '14:00',
      max_capacity: 10,
      is_available: true
    };

    expect(createTimeSlot(invalidInput)).rejects.toThrow(/end time must be after start time/i);
  });

  it('should reject time slot with same start and end time', async () => {
    const invalidInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '10:00',
      end_time: '10:00',
      max_capacity: 10,
      is_available: true
    };

    expect(createTimeSlot(invalidInput)).rejects.toThrow(/end time must be after start time/i);
  });

  it('should reject overlapping time slots - new slot starts during existing', async () => {
    // Create first slot
    await createTimeSlot(testInput);

    // Try to create overlapping slot that starts during existing slot
    const overlappingInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '10:30',
      end_time: '11:30',
      max_capacity: 5,
      is_available: true
    };

    expect(createTimeSlot(overlappingInput)).rejects.toThrow(/time slot overlaps with existing slot/i);
  });

  it('should reject overlapping time slots - new slot ends during existing', async () => {
    // Create first slot
    await createTimeSlot(testInput);

    // Try to create overlapping slot that ends during existing slot
    const overlappingInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '09:30',
      end_time: '10:30',
      max_capacity: 5,
      is_available: true
    };

    expect(createTimeSlot(overlappingInput)).rejects.toThrow(/time slot overlaps with existing slot/i);
  });

  it('should reject overlapping time slots - new slot encompasses existing', async () => {
    // Create first slot
    await createTimeSlot(testInput);

    // Try to create overlapping slot that completely encompasses existing slot
    const overlappingInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '09:00',
      end_time: '12:00',
      max_capacity: 20,
      is_available: true
    };

    expect(createTimeSlot(overlappingInput)).rejects.toThrow(/time slot overlaps with existing slot/i);
  });

  it('should allow non-overlapping time slots on same date', async () => {
    // Create first slot
    await createTimeSlot(testInput);

    // Create adjacent slot
    const adjacentInput: CreateTimeSlotInput = {
      date: '2024-01-15',
      start_time: '11:00',
      end_time: '12:00',
      max_capacity: 8,
      is_available: true
    };

    const result = await createTimeSlot(adjacentInput);

    expect(result.date).toEqual('2024-01-15');
    expect(result.start_time).toEqual('11:00:00');
    expect(result.end_time).toEqual('12:00:00');
    expect(result.max_capacity).toEqual(8);
  });

  it('should allow overlapping time slots on different dates', async () => {
    // Create first slot
    await createTimeSlot(testInput);

    // Create slot with same times on different date
    const differentDateInput: CreateTimeSlotInput = {
      date: '2024-01-16',
      start_time: '10:00',
      end_time: '11:00',
      max_capacity: 15,
      is_available: false
    };

    const result = await createTimeSlot(differentDateInput);

    expect(result.date).toEqual('2024-01-16');
    expect(result.start_time).toEqual('10:00:00');
    expect(result.end_time).toEqual('11:00:00');
    expect(result.max_capacity).toEqual(15);
    expect(result.is_available).toEqual(false);
  });

  it('should create multiple non-overlapping slots on same date', async () => {
    const slots: CreateTimeSlotInput[] = [
      {
        date: '2024-01-15',
        start_time: '09:00',
        end_time: '10:00',
        max_capacity: 5,
        is_available: true
      },
      {
        date: '2024-01-15',
        start_time: '10:00',
        end_time: '11:00',
        max_capacity: 8,
        is_available: true
      },
      {
        date: '2024-01-15',
        start_time: '11:00',
        end_time: '12:00',
        max_capacity: 10,
        is_available: false
      }
    ];

    const results = await Promise.all(slots.map(slot => createTimeSlot(slot)));

    expect(results).toHaveLength(3);
    
    // Verify all slots were saved
    const savedSlots = await db.select()
      .from(timeSlotsTable)
      .where(eq(timeSlotsTable.date, '2024-01-15'))
      .execute();

    expect(savedSlots).toHaveLength(3);
    
    // Verify different capacities and availability
    const slot1 = savedSlots.find(s => s.start_time === '09:00:00');
    const slot2 = savedSlots.find(s => s.start_time === '10:00:00');
    const slot3 = savedSlots.find(s => s.start_time === '11:00:00');
    
    expect(slot1?.max_capacity).toEqual(5);
    expect(slot1?.is_available).toEqual(true);
    expect(slot2?.max_capacity).toEqual(8);
    expect(slot2?.is_available).toEqual(true);
    expect(slot3?.max_capacity).toEqual(10);
    expect(slot3?.is_available).toEqual(false);
  });
});