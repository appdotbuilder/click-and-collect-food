import { z } from 'zod';

// Enums
export const dishStatusSchema = z.enum(['available', 'unavailable', 'out_of_stock']);
export type DishStatus = z.infer<typeof dishStatusSchema>;

export const orderStatusSchema = z.enum(['new', 'preparing', 'ready', 'picked_up', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const userRoleSchema = z.enum(['admin', 'manager', 'employee']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const paymentStatusSchema = z.enum(['pending', 'authorized', 'captured', 'refunded', 'failed']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentMethodSchema = z.enum(['on_site', 'online']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const allergenSchema = z.enum(['gluten', 'dairy', 'eggs', 'fish', 'shellfish', 'nuts', 'peanuts', 'soy', 'sesame']);
export type Allergen = z.infer<typeof allergenSchema>;

export const dishTagSchema = z.enum(['vegetarian', 'vegan', 'spicy', 'gluten_free', 'dairy_free']);
export type DishTag = z.infer<typeof dishTagSchema>;

// User schemas
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  phone: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: userRoleSchema,
  password_hash: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: userRoleSchema.default('employee'),
  password: z.string().min(6).optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Dish schemas
export const dishSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  ingredients: z.string().nullable(),
  allergens: z.array(allergenSchema),
  photo_url: z.string().nullable(),
  status: dishStatusSchema,
  tags: z.array(dishTagSchema),
  preparation_time_minutes: z.number().int(),
  stock_quantity: z.number().int().nullable(),
  stock_threshold: z.number().int().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Dish = z.infer<typeof dishSchema>;

export const createDishInputSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().positive(),
  ingredients: z.string().nullable(),
  allergens: z.array(allergenSchema).default([]),
  photo_url: z.string().url().nullable(),
  status: dishStatusSchema.default('available'),
  tags: z.array(dishTagSchema).default([]),
  preparation_time_minutes: z.number().int().positive().default(20),
  stock_quantity: z.number().int().nonnegative().nullable(),
  stock_threshold: z.number().int().nonnegative().nullable()
});

export type CreateDishInput = z.infer<typeof createDishInputSchema>;

// Dish variant schemas
export const dishVariantSchema = z.object({
  id: z.number(),
  dish_id: z.number(),
  name: z.string(),
  price_modifier: z.number(),
  is_default: z.boolean(),
  created_at: z.coerce.date()
});

export type DishVariant = z.infer<typeof dishVariantSchema>;

export const createDishVariantInputSchema = z.object({
  dish_id: z.number(),
  name: z.string(),
  price_modifier: z.number().default(0),
  is_default: z.boolean().default(false)
});

export type CreateDishVariantInput = z.infer<typeof createDishVariantInputSchema>;

// Customer schemas (for guest orders)
export const customerSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  phone: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  created_at: z.coerce.date()
});

export type Customer = z.infer<typeof customerSchema>;

export const createCustomerInputSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
  first_name: z.string(),
  last_name: z.string()
});

export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

// Order schemas
export const orderSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  customer_id: z.number().nullable(),
  user_id: z.number().nullable(),
  status: orderStatusSchema,
  pickup_slot: z.coerce.date(),
  total_amount: z.number(),
  tax_amount: z.number(),
  special_notes: z.string().nullable(),
  internal_notes: z.string().nullable(),
  qr_code: z.string().nullable(),
  is_guest_order: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Order = z.infer<typeof orderSchema>;

export const createOrderInputSchema = z.object({
  customer_info: createCustomerInputSchema.optional(),
  user_id: z.number().optional(),
  pickup_slot: z.coerce.date(),
  special_notes: z.string().nullable(),
  items: z.array(z.object({
    dish_id: z.number(),
    variant_id: z.number().nullable(),
    quantity: z.number().int().positive(),
    unit_price: z.number().positive(),
    special_requests: z.string().nullable()
  })),
  promo_code: z.string().optional()
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// Order item schemas
export const orderItemSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  dish_id: z.number(),
  variant_id: z.number().nullable(),
  quantity: z.number().int(),
  unit_price: z.number(),
  total_price: z.number(),
  special_requests: z.string().nullable(),
  created_at: z.coerce.date()
});

export type OrderItem = z.infer<typeof orderItemSchema>;

// Payment schemas
export const paymentSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  amount: z.number(),
  tax_amount: z.number(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  transaction_id: z.string().nullable(),
  processed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type Payment = z.infer<typeof paymentSchema>;

export const createPaymentInputSchema = z.object({
  order_id: z.number(),
  amount: z.number().positive(),
  tax_amount: z.number().nonnegative(),
  method: paymentMethodSchema,
  transaction_id: z.string().optional()
});

export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

// Promo code schemas
export const promoCodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  discount_percentage: z.number().nullable(),
  discount_amount: z.number().nullable(),
  minimum_order_amount: z.number().nullable(),
  max_uses: z.number().int().nullable(),
  used_count: z.number().int(),
  valid_from: z.coerce.date(),
  valid_until: z.coerce.date(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type PromoCode = z.infer<typeof promoCodeSchema>;

export const createPromoCodeInputSchema = z.object({
  code: z.string(),
  discount_percentage: z.number().min(0).max(100).nullable(),
  discount_amount: z.number().positive().nullable(),
  minimum_order_amount: z.number().nonnegative().nullable(),
  max_uses: z.number().int().positive().nullable(),
  valid_from: z.coerce.date(),
  valid_until: z.coerce.date()
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeInputSchema>;

// Time slot schemas
export const timeSlotSchema = z.object({
  id: z.number(),
  date: z.string(), // YYYY-MM-DD format
  start_time: z.string(), // HH:MM format
  end_time: z.string(), // HH:MM format
  max_capacity: z.number().int(),
  current_bookings: z.number().int(),
  is_available: z.boolean(),
  created_at: z.coerce.date()
});

export type TimeSlot = z.infer<typeof timeSlotSchema>;

export const createTimeSlotInputSchema = z.object({
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  max_capacity: z.number().int().positive(),
  is_available: z.boolean().default(true)
});

export type CreateTimeSlotInput = z.infer<typeof createTimeSlotInputSchema>;

// Business settings schemas
export const businessSettingsSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  updated_at: z.coerce.date()
});

export type BusinessSettings = z.infer<typeof businessSettingsSchema>;

// Update schemas
export const updateOrderStatusInputSchema = z.object({
  id: z.number(),
  status: orderStatusSchema,
  internal_notes: z.string().optional()
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;

export const updateDishStockInputSchema = z.object({
  id: z.number(),
  stock_quantity: z.number().int().nonnegative().nullable(),
  status: dishStatusSchema.optional()
});

export type UpdateDishStockInput = z.infer<typeof updateDishStockInputSchema>;

// Query schemas
export const orderFiltersSchema = z.object({
  status: orderStatusSchema.optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
  pickup_date: z.string().optional(), // YYYY-MM-DD format
  customer_search: z.string().optional()
});

export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export const availableTimeSlotsQuerySchema = z.object({
  date_from: z.string(), // YYYY-MM-DD format
  date_to: z.string().optional(), // YYYY-MM-DD format, defaults to date_from + 2 days
  preparation_time_minutes: z.number().int().default(20)
});

export type AvailableTimeSlotsQuery = z.infer<typeof availableTimeSlotsQuerySchema>;

// Reports schemas
export const salesReportSchema = z.object({
  date: z.string(),
  total_orders: z.number().int(),
  total_revenue: z.number(),
  total_tax: z.number(),
  average_order_value: z.number(),
  top_dishes: z.array(z.object({
    dish_name: z.string(),
    quantity_sold: z.number().int(),
    revenue: z.number()
  }))
});

export type SalesReport = z.infer<typeof salesReportSchema>;

export const reportQuerySchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  group_by: z.enum(['day', 'hour']).default('day')
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;