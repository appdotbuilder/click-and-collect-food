import { db } from '../db';
import { ordersTable, orderItemsTable, dishesTable } from '../db/schema';
import { type ReportQuery, type SalesReport } from '../schema';
import { eq, gte, lte, and, desc, sql } from 'drizzle-orm';

export async function getSalesReport(query: ReportQuery): Promise<SalesReport[]> {
  try {
    const { date_from, date_to, group_by } = query;
    
    // Parse dates
    const startDate = new Date(`${date_from}T00:00:00.000Z`);
    const endDate = new Date(`${date_to}T23:59:59.999Z`);
    
    // Determine date truncation based on group_by
    const dateFormat = group_by === 'hour' 
      ? sql`TO_CHAR(${ordersTable.created_at}, 'YYYY-MM-DD HH24:00:00')`
      : sql`TO_CHAR(${ordersTable.created_at}, 'YYYY-MM-DD')`;

    // Main sales query with aggregations
    const salesData = await db
      .select({
        date: dateFormat,
        total_orders: sql<number>`COUNT(DISTINCT ${ordersTable.id})::integer`,
        total_revenue: sql<string>`SUM(${ordersTable.total_amount})`,
        total_tax: sql<string>`SUM(${ordersTable.tax_amount})`,
      })
      .from(ordersTable)
      .where(
        and(
          gte(ordersTable.created_at, startDate),
          lte(ordersTable.created_at, endDate),
          // Only include completed orders (not cancelled)
          sql`${ordersTable.status} != 'cancelled'`
        )
      )
      .groupBy(dateFormat)
      .orderBy(dateFormat);

    // Get top dishes for each date period
    const topDishesQuery = await db
      .select({
        date: dateFormat,
        dish_name: dishesTable.name,
        quantity_sold: sql<number>`SUM(${orderItemsTable.quantity})::integer`,
        revenue: sql<string>`SUM(${orderItemsTable.total_price})`,
      })
      .from(ordersTable)
      .innerJoin(orderItemsTable, eq(ordersTable.id, orderItemsTable.order_id))
      .innerJoin(dishesTable, eq(orderItemsTable.dish_id, dishesTable.id))
      .where(
        and(
          gte(ordersTable.created_at, startDate),
          lte(ordersTable.created_at, endDate),
          sql`${ordersTable.status} != 'cancelled'`
        )
      )
      .groupBy(dateFormat, dishesTable.id, dishesTable.name)
      .orderBy(dateFormat, desc(sql`SUM(${orderItemsTable.quantity})`));

    // Group top dishes by date
    const topDishesByDate = topDishesQuery.reduce((acc, dish) => {
      const date = dish.date as string;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push({
        dish_name: dish.dish_name,
        quantity_sold: dish.quantity_sold,
        revenue: parseFloat(dish.revenue)
      });
      return acc;
    }, {} as Record<string, Array<{ dish_name: string; quantity_sold: number; revenue: number }>>);

    // Build final report
    const report: SalesReport[] = salesData.map(data => {
      const date = data.date as string;
      const totalRevenue = parseFloat(data.total_revenue);
      const totalOrders = data.total_orders;
      
      return {
        date,
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_tax: parseFloat(data.total_tax),
        average_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        top_dishes: (topDishesByDate[date] || []).slice(0, 5) // Top 5 dishes
      };
    });

    return report;
  } catch (error) {
    console.error('Sales report generation failed:', error);
    throw error;
  }
}