import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  ordersTable, 
  orderItemsTable, 
  dishesTable, 
  dishVariantsTable, 
  customersTable, 
  usersTable 
} from '../db/schema';
import { generateOrderReceipt } from '../handlers/generate_order_receipt';

describe('generateOrderReceipt', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should generate receipt for guest order with customer', async () => {
    // Create test dish
    const dishResult = await db.insert(dishesTable)
      .values({
        name: 'Test Pasta',
        description: 'Delicious pasta',
        price: '15.99',
        status: 'available',
        preparation_time_minutes: 20,
        allergens: ['gluten'],
        tags: ['vegetarian']
      })
      .returning()
      .execute();
    const dish = dishResult[0];

    // Create dish variant
    const variantResult = await db.insert(dishVariantsTable)
      .values({
        dish_id: dish.id,
        name: 'Large',
        price_modifier: '3.00',
        is_default: false
      })
      .returning()
      .execute();
    const variant = variantResult[0];

    // Create customer
    const customerResult = await db.insert(customersTable)
      .values({
        email: 'customer@test.com',
        phone: '+1234567890',
        first_name: 'John',
        last_name: 'Doe'
      })
      .returning()
      .execute();
    const customer = customerResult[0];

    // Create order
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-001',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-15T12:30:00Z'),
        total_amount: '20.58',
        tax_amount: '1.59',
        special_notes: 'No onions please',
        qr_code: 'QR123456',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orderResult[0];

    // Create order item
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        variant_id: variant.id,
        quantity: 1,
        unit_price: '18.99',
        total_price: '18.99',
        special_requests: 'Extra cheese'
      })
      .execute();

    const result = await generateOrderReceipt(order.id);

    // Verify receipt data structure
    expect(result.receiptData).toBeDefined();
    expect(result.printUrl).toBeDefined();
    expect(typeof result.printUrl).toBe('string');
    expect(result.printUrl).toContain('/print/receipt/');

    const receipt = result.receiptData;

    // Verify order information
    expect(receipt.orderId).toBe(order.id);
    expect(receipt.orderNumber).toBe('ORD-001');
    expect(receipt.isGuestOrder).toBe(true);
    expect(receipt.specialNotes).toBe('No onions please');
    expect(receipt.qrCode).toBe('QR123456');
    expect(receipt.pickupSlot).toBeInstanceOf(Date);
    expect(receipt.generatedAt).toBeInstanceOf(Date);

    // Verify customer information
    expect(receipt.customerInfo.first_name).toBe('John');
    expect(receipt.customerInfo.last_name).toBe('Doe');
    expect(receipt.customerInfo.phone).toBe('+1234567890');
    expect(receipt.customerInfo.email).toBe('customer@test.com');

    // Verify items
    expect(receipt.items).toHaveLength(1);
    const item = receipt.items[0];
    expect(item.dish_name).toBe('Test Pasta');
    expect(item.variant_name).toBe('Large');
    expect(item.quantity).toBe(1);
    expect(item.unit_price).toBe(18.99);
    expect(item.total_price).toBe(18.99);
    expect(item.special_requests).toBe('Extra cheese');

    // Verify pricing calculations
    expect(receipt.totalAmount).toBe(20.58);
    expect(receipt.taxAmount).toBe(1.59);
    expect(receipt.subtotal).toBe(18.99); // total - tax
  });

  it('should generate receipt for user order', async () => {
    // Create test dish
    const dishResult = await db.insert(dishesTable)
      .values({
        name: 'Pizza Margherita',
        description: 'Classic pizza',
        price: '12.50',
        status: 'available',
        preparation_time_minutes: 15,
        allergens: ['dairy', 'gluten'],
        tags: ['vegetarian']
      })
      .returning()
      .execute();
    const dish = dishResult[0];

    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        phone: '+9876543210',
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'employee',
        password_hash: 'hashed_password',
        is_active: true
      })
      .returning()
      .execute();
    const user = userResult[0];

    // Create order
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-002',
        user_id: user.id,
        status: 'preparing',
        pickup_slot: new Date('2024-01-15T14:00:00Z'),
        total_amount: '13.63',
        tax_amount: '1.13',
        is_guest_order: false
      })
      .returning()
      .execute();
    const order = orderResult[0];

    // Create order item (without variant)
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '12.50',
        total_price: '12.50'
      })
      .execute();

    const result = await generateOrderReceipt(order.id);
    const receipt = result.receiptData;

    // Verify user information is used
    expect(receipt.customerInfo.first_name).toBe('Jane');
    expect(receipt.customerInfo.last_name).toBe('Smith');
    expect(receipt.customerInfo.phone).toBe('+9876543210');
    expect(receipt.customerInfo.email).toBe('user@test.com');
    expect(receipt.isGuestOrder).toBe(false);

    // Verify item without variant
    const item = receipt.items[0];
    expect(item.dish_name).toBe('Pizza Margherita');
    expect(item.variant_name).toBeUndefined();
    expect(item.special_requests).toBeUndefined();
  });

  it('should generate receipt with multiple items', async () => {
    // Create test dishes
    const dish1Result = await db.insert(dishesTable)
      .values({
        name: 'Burger',
        price: '8.99',
        status: 'available',
        preparation_time_minutes: 10,
        allergens: [],
        tags: []
      })
      .returning()
      .execute();
    const dish1 = dish1Result[0];

    const dish2Result = await db.insert(dishesTable)
      .values({
        name: 'Fries',
        price: '3.99',
        status: 'available',
        preparation_time_minutes: 5,
        allergens: [],
        tags: []
      })
      .returning()
      .execute();
    const dish2 = dish2Result[0];

    // Create customer
    const customerResult = await db.insert(customersTable)
      .values({
        email: 'multi@test.com',
        phone: '+1111111111',
        first_name: 'Multi',
        last_name: 'Item'
      })
      .returning()
      .execute();
    const customer = customerResult[0];

    // Create order
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-003',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-15T13:00:00Z'),
        total_amount: '17.35',
        tax_amount: '1.37',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orderResult[0];

    // Create multiple order items
    await db.insert(orderItemsTable)
      .values([
        {
          order_id: order.id,
          dish_id: dish1.id,
          quantity: 2,
          unit_price: '8.99',
          total_price: '17.98'
        },
        {
          order_id: order.id,
          dish_id: dish2.id,
          quantity: 1,
          unit_price: '3.99',
          total_price: '3.99'
        }
      ])
      .execute();

    const result = await generateOrderReceipt(order.id);
    const receipt = result.receiptData;

    // Verify multiple items
    expect(receipt.items).toHaveLength(2);
    
    const burgerItem = receipt.items.find(item => item.dish_name === 'Burger');
    expect(burgerItem).toBeDefined();
    expect(burgerItem!.quantity).toBe(2);
    expect(burgerItem!.total_price).toBe(17.98);

    const friesItem = receipt.items.find(item => item.dish_name === 'Fries');
    expect(friesItem).toBeDefined();
    expect(friesItem!.quantity).toBe(1);
    expect(friesItem!.total_price).toBe(3.99);

    // Verify totals
    expect(receipt.totalAmount).toBe(17.35);
    expect(receipt.taxAmount).toBe(1.37);
    expect(receipt.subtotal).toBe(15.98); // total - tax
  });

  it('should handle order without customer or user (walk-in)', async () => {
    // Create test dish
    const dishResult = await db.insert(dishesTable)
      .values({
        name: 'Coffee',
        price: '2.50',
        status: 'available',
        preparation_time_minutes: 5,
        allergens: [],
        tags: []
      })
      .returning()
      .execute();
    const dish = dishResult[0];

    // Create order without customer_id or user_id
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-004',
        status: 'new',
        pickup_slot: new Date('2024-01-15T11:00:00Z'),
        total_amount: '2.72',
        tax_amount: '0.22',
        is_guest_order: true
      })
      .returning()
      .execute();
    const order = orderResult[0];

    // Create order item
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '2.50',
        total_price: '2.50'
      })
      .execute();

    const result = await generateOrderReceipt(order.id);
    const receipt = result.receiptData;

    // Verify walk-in customer defaults
    expect(receipt.customerInfo.first_name).toBe('Walk-in');
    expect(receipt.customerInfo.last_name).toBe('Customer');
    expect(receipt.customerInfo.phone).toBe('');
    expect(receipt.customerInfo.email).toBe('');
  });

  it('should throw error for non-existent order', async () => {
    await expect(generateOrderReceipt(99999)).rejects.toThrow(/Order with ID 99999 not found/i);
  });

  it('should handle order with optional fields as null', async () => {
    // Create test dish
    const dishResult = await db.insert(dishesTable)
      .values({
        name: 'Simple Dish',
        price: '5.00',
        status: 'available',
        preparation_time_minutes: 10,
        allergens: [],
        tags: []
      })
      .returning()
      .execute();
    const dish = dishResult[0];

    // Create customer
    const customerResult = await db.insert(customersTable)
      .values({
        email: 'minimal@test.com',
        phone: '+2222222222',
        first_name: 'Min',
        last_name: 'Imal'
      })
      .returning()
      .execute();
    const customer = customerResult[0];

    // Create order with minimal fields (nulls)
    const orderResult = await db.insert(ordersTable)
      .values({
        order_number: 'ORD-005',
        customer_id: customer.id,
        status: 'new',
        pickup_slot: new Date('2024-01-15T10:00:00Z'),
        total_amount: '5.45',
        tax_amount: '0.45',
        is_guest_order: true
        // special_notes and qr_code are null
      })
      .returning()
      .execute();
    const order = orderResult[0];

    // Create order item with minimal fields
    await db.insert(orderItemsTable)
      .values({
        order_id: order.id,
        dish_id: dish.id,
        quantity: 1,
        unit_price: '5.00',
        total_price: '5.00'
        // special_requests and variant_id are null
      })
      .execute();

    const result = await generateOrderReceipt(order.id);
    const receipt = result.receiptData;

    // Verify optional fields are undefined when null
    expect(receipt.specialNotes).toBeUndefined();
    expect(receipt.qrCode).toBeUndefined();
    
    const item = receipt.items[0];
    expect(item.variant_name).toBeUndefined();
    expect(item.special_requests).toBeUndefined();
  });
});