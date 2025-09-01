import { serial, text, pgTable, timestamp, numeric, integer, boolean, pgEnum, json, date, time } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enums
export const dishStatusEnum = pgEnum('dish_status', ['available', 'unavailable', 'out_of_stock']);
export const orderStatusEnum = pgEnum('order_status', ['new', 'preparing', 'ready', 'picked_up', 'cancelled']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'employee']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'authorized', 'captured', 'refunded', 'failed']);
export const paymentMethodEnum = pgEnum('payment_method', ['on_site', 'online']);
export const allergenEnum = pgEnum('allergen', ['gluten', 'dairy', 'eggs', 'fish', 'shellfish', 'nuts', 'peanuts', 'soy', 'sesame']);
export const dishTagEnum = pgEnum('dish_tag', ['vegetarian', 'vegan', 'spicy', 'gluten_free', 'dairy_free']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  role: userRoleEnum('role').notNull().default('employee'),
  password_hash: text('password_hash'), // Nullable for guest users
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Customers table (for guest orders)
export const customersTable = pgTable('customers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Dishes table
export const dishesTable = pgTable('dishes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'), // Nullable
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  ingredients: text('ingredients'), // Nullable
  allergens: json('allergens').$type<string[]>().notNull().default([]), // Array of allergen strings
  photo_url: text('photo_url'), // Nullable
  status: dishStatusEnum('status').notNull().default('available'),
  tags: json('tags').$type<string[]>().notNull().default([]), // Array of tag strings
  preparation_time_minutes: integer('preparation_time_minutes').notNull().default(20),
  stock_quantity: integer('stock_quantity'), // Nullable - null means unlimited
  stock_threshold: integer('stock_threshold'), // Nullable - alert threshold
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Dish variants table (sizes, supplements)
export const dishVariantsTable = pgTable('dish_variants', {
  id: serial('id').primaryKey(),
  dish_id: integer('dish_id').notNull().references(() => dishesTable.id),
  name: text('name').notNull(), // e.g., "Large", "Extra cheese"
  price_modifier: numeric('price_modifier', { precision: 10, scale: 2 }).notNull().default('0.00'), // Can be negative
  is_default: boolean('is_default').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Orders table
export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  order_number: text('order_number').notNull().unique(),
  customer_id: integer('customer_id').references(() => customersTable.id), // Nullable for user orders
  user_id: integer('user_id').references(() => usersTable.id), // Nullable for guest orders
  status: orderStatusEnum('status').notNull().default('new'),
  pickup_slot: timestamp('pickup_slot').notNull(),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  tax_amount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull(),
  special_notes: text('special_notes'), // Customer notes
  internal_notes: text('internal_notes'), // Staff notes
  qr_code: text('qr_code'), // For pickup verification
  is_guest_order: boolean('is_guest_order').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Order items table
export const orderItemsTable = pgTable('order_items', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull().references(() => ordersTable.id),
  dish_id: integer('dish_id').notNull().references(() => dishesTable.id),
  variant_id: integer('variant_id').references(() => dishVariantsTable.id), // Nullable
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  total_price: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  special_requests: text('special_requests'), // Item-specific requests
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Payments table
export const paymentsTable = pgTable('payments', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull().references(() => ordersTable.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  tax_amount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull(),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  transaction_id: text('transaction_id'), // External payment processor ID
  processed_at: timestamp('processed_at'), // When payment was captured
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Promo codes table
export const promoCodesTable = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discount_percentage: numeric('discount_percentage', { precision: 5, scale: 2 }), // Nullable, 0-100%
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }), // Nullable, fixed amount
  minimum_order_amount: numeric('minimum_order_amount', { precision: 10, scale: 2 }), // Nullable
  max_uses: integer('max_uses'), // Nullable - unlimited if null
  used_count: integer('used_count').notNull().default(0),
  valid_from: timestamp('valid_from').notNull(),
  valid_until: timestamp('valid_until').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Order promo codes junction table
export const orderPromoCodesTable = pgTable('order_promo_codes', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull().references(() => ordersTable.id),
  promo_code_id: integer('promo_code_id').notNull().references(() => promoCodesTable.id),
  discount_applied: numeric('discount_applied', { precision: 10, scale: 2 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Time slots table for pickup scheduling
export const timeSlotsTable = pgTable('time_slots', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  max_capacity: integer('max_capacity').notNull(), // Max orders per slot
  current_bookings: integer('current_bookings').notNull().default(0),
  is_available: boolean('is_available').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Business settings table (for configuration)
export const businessSettingsTable = pgTable('business_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  orders: many(ordersTable)
}));

export const customersRelations = relations(customersTable, ({ many }) => ({
  orders: many(ordersTable)
}));

export const dishesRelations = relations(dishesTable, ({ many }) => ({
  variants: many(dishVariantsTable),
  orderItems: many(orderItemsTable)
}));

export const dishVariantsRelations = relations(dishVariantsTable, ({ one, many }) => ({
  dish: one(dishesTable, {
    fields: [dishVariantsTable.dish_id],
    references: [dishesTable.id]
  }),
  orderItems: many(orderItemsTable)
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  customer: one(customersTable, {
    fields: [ordersTable.customer_id],
    references: [customersTable.id]
  }),
  user: one(usersTable, {
    fields: [ordersTable.user_id],
    references: [usersTable.id]
  }),
  items: many(orderItemsTable),
  payments: many(paymentsTable),
  promoCodes: many(orderPromoCodesTable)
}));

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.order_id],
    references: [ordersTable.id]
  }),
  dish: one(dishesTable, {
    fields: [orderItemsTable.dish_id],
    references: [dishesTable.id]
  }),
  variant: one(dishVariantsTable, {
    fields: [orderItemsTable.variant_id],
    references: [dishVariantsTable.id]
  })
}));

export const paymentsRelations = relations(paymentsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [paymentsTable.order_id],
    references: [ordersTable.id]
  })
}));

export const promoCodesRelations = relations(promoCodesTable, ({ many }) => ({
  orderPromoCodes: many(orderPromoCodesTable)
}));

export const orderPromoCodesRelations = relations(orderPromoCodesTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderPromoCodesTable.order_id],
    references: [ordersTable.id]
  }),
  promoCode: one(promoCodesTable, {
    fields: [orderPromoCodesTable.promo_code_id],
    references: [promoCodesTable.id]
  })
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  customers: customersTable,
  dishes: dishesTable,
  dishVariants: dishVariantsTable,
  orders: ordersTable,
  orderItems: orderItemsTable,
  payments: paymentsTable,
  promoCodes: promoCodesTable,
  orderPromoCodes: orderPromoCodesTable,
  timeSlots: timeSlotsTable,
  businessSettings: businessSettingsTable
};

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Customer = typeof customersTable.$inferSelect;
export type NewCustomer = typeof customersTable.$inferInsert;

export type Dish = typeof dishesTable.$inferSelect;
export type NewDish = typeof dishesTable.$inferInsert;

export type DishVariant = typeof dishVariantsTable.$inferSelect;
export type NewDishVariant = typeof dishVariantsTable.$inferInsert;

export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;

export type OrderItem = typeof orderItemsTable.$inferSelect;
export type NewOrderItem = typeof orderItemsTable.$inferInsert;

export type Payment = typeof paymentsTable.$inferSelect;
export type NewPayment = typeof paymentsTable.$inferInsert;

export type PromoCode = typeof promoCodesTable.$inferSelect;
export type NewPromoCode = typeof promoCodesTable.$inferInsert;

export type OrderPromoCode = typeof orderPromoCodesTable.$inferSelect;
export type NewOrderPromoCode = typeof orderPromoCodesTable.$inferInsert;

export type TimeSlot = typeof timeSlotsTable.$inferSelect;
export type NewTimeSlot = typeof timeSlotsTable.$inferInsert;

export type BusinessSettings = typeof businessSettingsTable.$inferSelect;
export type NewBusinessSettings = typeof businessSettingsTable.$inferInsert;