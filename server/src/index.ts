import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import { z } from 'zod';
import { 
  createUserInputSchema,
  createDishInputSchema,
  createDishVariantInputSchema,
  createOrderInputSchema,
  createPaymentInputSchema,
  createPromoCodeInputSchema,
  createTimeSlotInputSchema,
  updateOrderStatusInputSchema,
  updateDishStockInputSchema,
  orderFiltersSchema,
  availableTimeSlotsQuerySchema,
  reportQuerySchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { getDishes } from './handlers/get_dishes';
import { createDish } from './handlers/create_dish';
import { updateDishStock } from './handlers/update_dish_stock';
import { createDishVariant } from './handlers/create_dish_variant';
import { getAvailableTimeSlots } from './handlers/get_available_time_slots';
import { createOrder } from './handlers/create_order';
import { getOrders } from './handlers/get_orders';
import { getOrderById } from './handlers/get_order_by_id';
import { updateOrderStatus } from './handlers/update_order_status';
import { createPayment } from './handlers/create_payment';
import { processPayment } from './handlers/process_payment';
import { validatePromoCode } from './handlers/validate_promo_code';
import { createPromoCode } from './handlers/create_promo_code';
import { getSalesReport } from './handlers/get_sales_report';
import { createTimeSlot } from './handlers/create_time_slot';
import { getBusinessSettings } from './handlers/get_business_settings';
import { updateBusinessSettings } from './handlers/update_business_settings';
import { sendOrderNotification } from './handlers/send_order_notification';
import { generateOrderReceipt } from './handlers/generate_order_receipt';
import { cancelOrder } from './handlers/cancel_order';
import { authenticateUser } from './handlers/authenticate_user';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management routes
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),
  
  authenticateUser: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string()
    }))
    .mutation(({ input }) => authenticateUser(input.email, input.password)),

  // Dish management routes
  getDishes: publicProcedure
    .query(() => getDishes()),
  
  createDish: publicProcedure
    .input(createDishInputSchema)
    .mutation(({ input }) => createDish(input)),
  
  updateDishStock: publicProcedure
    .input(updateDishStockInputSchema)
    .mutation(({ input }) => updateDishStock(input)),
  
  createDishVariant: publicProcedure
    .input(createDishVariantInputSchema)
    .mutation(({ input }) => createDishVariant(input)),

  // Time slot management routes
  getAvailableTimeSlots: publicProcedure
    .input(availableTimeSlotsQuerySchema)
    .query(({ input }) => getAvailableTimeSlots(input)),
  
  createTimeSlot: publicProcedure
    .input(createTimeSlotInputSchema)
    .mutation(({ input }) => createTimeSlot(input)),

  // Order management routes
  createOrder: publicProcedure
    .input(createOrderInputSchema)
    .mutation(({ input }) => createOrder(input)),
  
  getOrders: publicProcedure
    .input(orderFiltersSchema.optional())
    .query(({ input }) => getOrders(input)),
  
  getOrderById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getOrderById(input.id)),
  
  updateOrderStatus: publicProcedure
    .input(updateOrderStatusInputSchema)
    .mutation(({ input }) => updateOrderStatus(input)),
  
  cancelOrder: publicProcedure
    .input(z.object({ 
      id: z.number(), 
      reason: z.string().optional() 
    }))
    .mutation(({ input }) => cancelOrder(input.id, input.reason)),

  // Payment routes
  createPayment: publicProcedure
    .input(createPaymentInputSchema)
    .mutation(({ input }) => createPayment(input)),
  
  processPayment: publicProcedure
    .input(z.object({ paymentId: z.number() }))
    .mutation(({ input }) => processPayment(input.paymentId)),

  // Promo code routes
  validatePromoCode: publicProcedure
    .input(z.object({ 
      code: z.string(), 
      orderAmount: z.number().positive() 
    }))
    .query(({ input }) => validatePromoCode(input.code, input.orderAmount)),
  
  createPromoCode: publicProcedure
    .input(createPromoCodeInputSchema)
    .mutation(({ input }) => createPromoCode(input)),

  // Reporting routes
  getSalesReport: publicProcedure
    .input(reportQuerySchema)
    .query(({ input }) => getSalesReport(input)),

  // Business settings routes
  getBusinessSettings: publicProcedure
    .input(z.object({ key: z.string().optional() }))
    .query(({ input }) => getBusinessSettings(input.key)),
  
  updateBusinessSettings: publicProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
      description: z.string().optional()
    }))
    .mutation(({ input }) => updateBusinessSettings(input.key, input.value, input.description)),

  // Notification and receipt routes
  sendOrderNotification: publicProcedure
    .input(z.object({
      orderId: z.number(),
      notificationType: z.enum(['confirmation', 'ready', 'cancelled'])
    }))
    .mutation(async ({ input }) => {
      // First get the order, then send notification
      const order = await getOrderById(input.orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      return sendOrderNotification(order, input.notificationType);
    }),
  
  generateOrderReceipt: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .query(({ input }) => generateOrderReceipt(input.orderId))
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC Click & Collect server listening at port: ${port}`);
}

start();