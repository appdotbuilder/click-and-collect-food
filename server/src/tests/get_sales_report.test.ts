import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable, customersTable } from '../db/schema';
import { type ReportQuery } from '../schema';
import { getSalesReport } from '../handlers/get_sales_report';

describe('getSalesReport', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  const createTestData = async () => {
    // Create customers
    const customers = await db.insert(customersTable)
      .values([
        {
          email: 'customer1@test.com',
          phone: '1234567890',
          first_name: 'John',
          last_name: 'Doe'
        },
        {
          email: 'customer2@test.com',
          phone: '1234567891',
          first_name: 'Jane',
          last_name: 'Smith'
        }
      ])
      .returning();

    // Create dishes
    const dishes = await db.insert(dishesTable)
      .values([
        {
          name: 'Burger',
          price: '15.99',
          description: 'Delicious burger',
          status: 'available'
        },
        {
          name: 'Pizza',
          price: '22.50',
          description: 'Tasty pizza',
          status: 'available'
        },
        {
          name: 'Salad',
          price: '12.00',
          description: 'Fresh salad',
          status: 'available'
        }
      ])
      .returning();

    // Create orders for different dates
    const today = new Date('2024-01-15T12:00:00Z');
    const yesterday = new Date('2024-01-14T10:00:00Z');
    const twoDaysAgo = new Date('2024-01-13T14:00:00Z');

    const orders = await db.insert(ordersTable)
      .values([
        // Today's orders
        {
          order_number: 'ORD001',
          customer_id: customers[0].id,
          status: 'ready',
          pickup_slot: today,
          total_amount: '31.98',
          tax_amount: '3.20',
          is_guest_order: true,
          created_at: today
        },
        {
          order_number: 'ORD002',
          customer_id: customers[1].id,
          status: 'picked_up',
          pickup_slot: today,
          total_amount: '22.50',
          tax_amount: '2.25',
          is_guest_order: true,
          created_at: today
        },
        // Yesterday's orders
        {
          order_number: 'ORD003',
          customer_id: customers[0].id,
          status: 'picked_up',
          pickup_slot: yesterday,
          total_amount: '15.99',
          tax_amount: '1.60',
          is_guest_order: true,
          created_at: yesterday
        },
        // Cancelled order (should be excluded)
        {
          order_number: 'ORD004',
          customer_id: customers[1].id,
          status: 'cancelled',
          pickup_slot: yesterday,
          total_amount: '50.00',
          tax_amount: '5.00',
          is_guest_order: true,
          created_at: yesterday
        },
        // Two days ago order
        {
          order_number: 'ORD005',
          customer_id: customers[0].id,
          status: 'ready',
          pickup_slot: twoDaysAgo,
          total_amount: '34.50',
          tax_amount: '3.45',
          is_guest_order: true,
          created_at: twoDaysAgo
        }
      ])
      .returning();

    // Create order items
    await db.insert(orderItemsTable)
      .values([
        // Order 1 items (today) - 2 burgers
        {
          order_id: orders[0].id,
          dish_id: dishes[0].id,
          quantity: 2,
          unit_price: '15.99',
          total_price: '31.98'
        },
        // Order 2 items (today) - 1 pizza
        {
          order_id: orders[1].id,
          dish_id: dishes[1].id,
          quantity: 1,
          unit_price: '22.50',
          total_price: '22.50'
        },
        // Order 3 items (yesterday) - 1 burger
        {
          order_id: orders[2].id,
          dish_id: dishes[0].id,
          quantity: 1,
          unit_price: '15.99',
          total_price: '15.99'
        },
        // Order 4 items (cancelled - should be excluded)
        {
          order_id: orders[3].id,
          dish_id: dishes[1].id,
          quantity: 2,
          unit_price: '25.00',
          total_price: '50.00'
        },
        // Order 5 items (two days ago) - 1 pizza + 1 salad
        {
          order_id: orders[4].id,
          dish_id: dishes[1].id,
          quantity: 1,
          unit_price: '22.50',
          total_price: '22.50'
        },
        {
          order_id: orders[4].id,
          dish_id: dishes[2].id,
          quantity: 1,
          unit_price: '12.00',
          total_price: '12.00'
        }
      ]);

    return { customers, dishes, orders };
  };

  it('should generate daily sales report', async () => {
    await createTestData();

    const query: ReportQuery = {
      date_from: '2024-01-13',
      date_to: '2024-01-15',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(3);

    // Check today's data (2024-01-15)
    const todayReport = result.find(r => r.date === '2024-01-15');
    expect(todayReport).toBeDefined();
    expect(todayReport!.total_orders).toBe(2);
    expect(todayReport!.total_revenue).toBe(54.48); // 31.98 + 22.50
    expect(todayReport!.total_tax).toBe(5.45); // 3.20 + 2.25
    expect(todayReport!.average_order_value).toBe(27.24); // 54.48 / 2
    expect(todayReport!.top_dishes).toHaveLength(2);
    
    // Check top dish for today (Burger with 2 quantity)
    const topDishToday = todayReport!.top_dishes[0];
    expect(topDishToday.dish_name).toBe('Burger');
    expect(topDishToday.quantity_sold).toBe(2);
    expect(topDishToday.revenue).toBe(31.98);

    // Check yesterday's data (2024-01-14)
    const yesterdayReport = result.find(r => r.date === '2024-01-14');
    expect(yesterdayReport).toBeDefined();
    expect(yesterdayReport!.total_orders).toBe(1); // Cancelled order excluded
    expect(yesterdayReport!.total_revenue).toBe(15.99);
    expect(yesterdayReport!.total_tax).toBe(1.60);
    expect(yesterdayReport!.average_order_value).toBe(15.99);

    // Check two days ago data (2024-01-13)
    const twoDaysAgoReport = result.find(r => r.date === '2024-01-13');
    expect(twoDaysAgoReport).toBeDefined();
    expect(twoDaysAgoReport!.total_orders).toBe(1);
    expect(twoDaysAgoReport!.total_revenue).toBe(34.50);
    expect(twoDaysAgoReport!.total_tax).toBe(3.45);
    expect(twoDaysAgoReport!.top_dishes).toHaveLength(2); // Pizza and Salad
  });

  it('should generate hourly sales report', async () => {
    await createTestData();

    const query: ReportQuery = {
      date_from: '2024-01-15',
      date_to: '2024-01-15',
      group_by: 'hour'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(1);
    
    const hourlyReport = result[0];
    expect(hourlyReport.date).toBe('2024-01-15 12:00:00'); // Both orders at 12:00
    expect(hourlyReport.total_orders).toBe(2);
    expect(hourlyReport.total_revenue).toBe(54.48);
    expect(hourlyReport.total_tax).toBe(5.45);
  });

  it('should handle date range with no orders', async () => {
    const query: ReportQuery = {
      date_from: '2024-01-01',
      date_to: '2024-01-02',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(0);
  });

  it('should exclude cancelled orders from report', async () => {
    const testData = await createTestData();

    const query: ReportQuery = {
      date_from: '2024-01-14',
      date_to: '2024-01-14',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(1);
    const report = result[0];
    
    // Should only include the non-cancelled order
    expect(report.total_orders).toBe(1);
    expect(report.total_revenue).toBe(15.99);
    expect(report.total_tax).toBe(1.60);
  });

  it('should calculate correct average order value', async () => {
    await createTestData();

    const query: ReportQuery = {
      date_from: '2024-01-15',
      date_to: '2024-01-15',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(1);
    const report = result[0];
    
    // Two orders: 31.98 + 22.50 = 54.48, average = 27.24
    expect(report.average_order_value).toBe(27.24);
  });

  it('should handle single date range', async () => {
    await createTestData();

    const query: ReportQuery = {
      date_from: '2024-01-15',
      date_to: '2024-01-15',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].total_orders).toBe(2);
  });

  it('should limit top dishes to 5 items', async () => {
    await createTestData();

    // Create additional dishes to test the limit
    const extraDishes = await db.insert(dishesTable)
      .values([
        { name: 'Dish4', price: '10.00', status: 'available' },
        { name: 'Dish5', price: '11.00', status: 'available' },
        { name: 'Dish6', price: '12.00', status: 'available' },
        { name: 'Dish7', price: '13.00', status: 'available' }
      ])
      .returning();

    // Create customer
    const customer = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '1234567890',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning();

    // Create order with many different dishes
    const order = await db.insert(ordersTable)
      .values({
        order_number: 'ORD_MANY',
        customer_id: customer[0].id,
        status: 'ready',
        pickup_slot: new Date('2024-01-15T15:00:00Z'),
        total_amount: '100.00',
        tax_amount: '10.00',
        is_guest_order: true,
        created_at: new Date('2024-01-15T15:00:00Z')
      })
      .returning();

    // Add items for all dishes
    await db.insert(orderItemsTable)
      .values([
        ...extraDishes.map(dish => ({
          order_id: order[0].id,
          dish_id: dish.id,
          quantity: 1,
          unit_price: dish.price,
          total_price: dish.price
        }))
      ]);

    const query: ReportQuery = {
      date_from: '2024-01-15',
      date_to: '2024-01-15',
      group_by: 'day'
    };

    const result = await getSalesReport(query);
    const report = result.find(r => r.date === '2024-01-15');
    
    expect(report!.top_dishes.length).toBeLessThanOrEqual(5);
  });

  it('should handle zero average when no orders', async () => {
    // Create an order that gets cancelled
    const customer = await db.insert(customersTable)
      .values({
        email: 'test@example.com',
        phone: '1234567890',
        first_name: 'Test',
        last_name: 'User'
      })
      .returning();

    await db.insert(ordersTable)
      .values({
        order_number: 'CANCELLED_ORDER',
        customer_id: customer[0].id,
        status: 'cancelled',
        pickup_slot: new Date('2024-01-15T12:00:00Z'),
        total_amount: '25.00',
        tax_amount: '2.50',
        is_guest_order: true,
        created_at: new Date('2024-01-15T12:00:00Z')
      });

    const query: ReportQuery = {
      date_from: '2024-01-15',
      date_to: '2024-01-15',
      group_by: 'day'
    };

    const result = await getSalesReport(query);

    // Should return empty result since all orders are cancelled
    expect(result).toHaveLength(0);
  });
});