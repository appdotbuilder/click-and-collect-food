import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ordersTable, customersTable, usersTable } from '../db/schema';
import { type OrderFilters, type CreateCustomerInput, type CreateUserInput } from '../schema';
import { getOrders } from '../handlers/get_orders';

// Test data
const testCustomer: CreateCustomerInput = {
  email: 'customer@test.com',
  phone: '+1234567890',
  first_name: 'John',
  last_name: 'Doe'
};

const testUser: CreateUserInput = {
  email: 'user@test.com',
  phone: '+1987654321',
  first_name: 'Jane',
  last_name: 'Smith',
  role: 'employee'
};

const testOrder1 = {
  order_number: 'ORD-001',
  status: 'new' as const,
  pickup_slot: new Date('2024-01-15T12:00:00Z'),
  total_amount: '25.50',
  tax_amount: '2.55',
  special_notes: 'Extra spicy',
  is_guest_order: true
};

const testOrder2 = {
  order_number: 'ORD-002',
  status: 'preparing' as const,
  pickup_slot: new Date('2024-01-16T13:00:00Z'),
  total_amount: '42.75',
  tax_amount: '4.28',
  special_notes: 'No onions',
  is_guest_order: false
};

describe('getOrders', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return all orders when no filters provided', async () => {
    // Create test customer and user
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        ...testUser,
        password_hash: 'hashed_password'
      })
      .returning()
      .execute();

    // Create test orders
    await db.insert(ordersTable)
      .values([
        {
          ...testOrder1,
          customer_id: customer.id
        },
        {
          ...testOrder2,
          user_id: user.id
        }
      ])
      .execute();

    const result = await getOrders();

    expect(result).toHaveLength(2);
    expect(result[0].order_number).toEqual('ORD-001');
    expect(result[0].status).toEqual('new');
    expect(result[0].total_amount).toEqual(25.50);
    expect(result[0].tax_amount).toEqual(2.55);
    expect(result[0].pickup_slot).toBeInstanceOf(Date);
    expect(result[0].is_guest_order).toEqual(true);
    expect(result[0].customer_id).toEqual(customer.id);

    expect(result[1].order_number).toEqual('ORD-002');
    expect(result[1].status).toEqual('preparing');
    expect(result[1].total_amount).toEqual(42.75);
    expect(result[1].tax_amount).toEqual(4.28);
    expect(result[1].is_guest_order).toEqual(false);
    expect(result[1].user_id).toEqual(user.id);
  });

  it('should filter orders by status', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    // Create orders with different statuses
    await db.insert(ordersTable)
      .values([
        {
          ...testOrder1,
          customer_id: customer.id,
          status: 'new'
        },
        {
          ...testOrder2,
          customer_id: customer.id,
          status: 'preparing'
        },
        {
          order_number: 'ORD-003',
          customer_id: customer.id,
          status: 'ready',
          pickup_slot: new Date('2024-01-17T14:00:00Z'),
          total_amount: '15.00',
          tax_amount: '1.50',
          is_guest_order: true
        }
      ])
      .execute();

    const filters: OrderFilters = {
      status: 'preparing'
    };

    const result = await getOrders(filters);

    expect(result).toHaveLength(1);
    expect(result[0].status).toEqual('preparing');
    expect(result[0].order_number).toEqual('ORD-002');
  });

  it('should filter orders by date range', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    // Create orders with different creation dates
    const oldDate = new Date('2024-01-10T10:00:00Z');
    const recentDate = new Date('2024-01-20T10:00:00Z');

    await db.insert(ordersTable)
      .values([
        {
          ...testOrder1,
          customer_id: customer.id,
          created_at: oldDate
        },
        {
          ...testOrder2,
          customer_id: customer.id,
          created_at: recentDate
        }
      ])
      .execute();

    const filters: OrderFilters = {
      date_from: new Date('2024-01-15T00:00:00Z'),
      date_to: new Date('2024-01-25T23:59:59Z')
    };

    const result = await getOrders(filters);

    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-002');
  });

  it('should filter orders by pickup date', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    // Create orders with different pickup dates
    await db.insert(ordersTable)
      .values([
        {
          ...testOrder1,
          customer_id: customer.id,
          pickup_slot: new Date('2024-01-15T12:00:00Z')
        },
        {
          ...testOrder2,
          customer_id: customer.id,
          pickup_slot: new Date('2024-01-16T13:00:00Z')
        }
      ])
      .execute();

    const filters: OrderFilters = {
      pickup_date: '2024-01-15'
    };

    const result = await getOrders(filters);

    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-001');
    expect(result[0].pickup_slot.toISOString().startsWith('2024-01-15')).toBe(true);
  });

  it('should filter orders by customer search', async () => {
    // Create test customer and user
    const [customer] = await db.insert(customersTable)
      .values({
        ...testCustomer,
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice.johnson@test.com'
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        ...testUser,
        first_name: 'Bob',
        last_name: 'Wilson',
        email: 'bob.wilson@test.com',
        password_hash: 'hashed_password'
      })
      .returning()
      .execute();

    // Create orders
    await db.insert(ordersTable)
      .values([
        {
          ...testOrder1,
          customer_id: customer.id,
          order_number: 'ORD-ALICE-001'
        },
        {
          ...testOrder2,
          user_id: user.id,
          order_number: 'ORD-BOB-002'
        }
      ])
      .execute();

    // Search by customer first name
    let filters: OrderFilters = {
      customer_search: 'Alice'
    };
    let result = await getOrders(filters);
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-ALICE-001');

    // Search by user email
    filters = {
      customer_search: 'bob.wilson'
    };
    result = await getOrders(filters);
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-BOB-002');

    // Search by order number
    filters = {
      customer_search: 'ALICE'
    };
    result = await getOrders(filters);
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-ALICE-001');
  });

  it('should handle multiple filters simultaneously', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values({
        ...testCustomer,
        first_name: 'Charlie',
        last_name: 'Brown'
      })
      .returning()
      .execute();

    // Create orders with various attributes
    await db.insert(ordersTable)
      .values([
        {
          order_number: 'ORD-001',
          customer_id: customer.id,
          status: 'new',
          pickup_slot: new Date('2024-01-15T12:00:00Z'),
          total_amount: '25.50',
          tax_amount: '2.55',
          is_guest_order: true,
          created_at: new Date('2024-01-14T10:00:00Z')
        },
        {
          order_number: 'ORD-002',
          customer_id: customer.id,
          status: 'preparing',
          pickup_slot: new Date('2024-01-15T13:00:00Z'),
          total_amount: '35.75',
          tax_amount: '3.58',
          is_guest_order: true,
          created_at: new Date('2024-01-14T11:00:00Z')
        },
        {
          order_number: 'ORD-003',
          customer_id: customer.id,
          status: 'new',
          pickup_slot: new Date('2024-01-16T12:00:00Z'),
          total_amount: '15.25',
          tax_amount: '1.53',
          is_guest_order: true,
          created_at: new Date('2024-01-14T12:00:00Z')
        }
      ])
      .execute();

    // Filter by status + pickup date + customer search
    const filters: OrderFilters = {
      status: 'new',
      pickup_date: '2024-01-15',
      customer_search: 'Charlie'
    };

    const result = await getOrders(filters);

    expect(result).toHaveLength(1);
    expect(result[0].order_number).toEqual('ORD-001');
    expect(result[0].status).toEqual('new');
    expect(result[0].pickup_slot.toISOString().startsWith('2024-01-15')).toBe(true);
  });

  it('should return empty array when no orders match filters', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    // Create an order
    await db.insert(ordersTable)
      .values({
        ...testOrder1,
        customer_id: customer.id,
        status: 'new'
      })
      .execute();

    // Filter for non-existent status
    const filters: OrderFilters = {
      status: 'cancelled'
    };

    const result = await getOrders(filters);
    expect(result).toHaveLength(0);
  });

  it('should handle numeric field conversions correctly', async () => {
    // Create test customer
    const [customer] = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();

    // Create order with specific numeric values
    await db.insert(ordersTable)
      .values({
        ...testOrder1,
        customer_id: customer.id,
        total_amount: '123.45',
        tax_amount: '12.35'
      })
      .execute();

    const result = await getOrders();

    expect(result).toHaveLength(1);
    expect(typeof result[0].total_amount).toEqual('number');
    expect(typeof result[0].tax_amount).toEqual('number');
    expect(result[0].total_amount).toEqual(123.45);
    expect(result[0].tax_amount).toEqual(12.35);
  });
});