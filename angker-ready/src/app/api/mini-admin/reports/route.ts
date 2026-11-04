import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const since = new Date(Date.now() - 30 * 86400_000);
    const orders = await db.order.findMany({
      where: { createdAt: { gte: since } },
      select: {
        sellPrice: true,
        providerCost: true,
        status: true,
        createdAt: true,
      },
    });
    const byDay: Record<string, { revenue: number; cost: number; count: number }> = {};
    for (const o of orders) {
      const day = o.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { revenue: 0, cost: 0, count: 0 };
      byDay[day].revenue += Number(o.sellPrice);
      byDay[day].cost += Number(o.providerCost);
      byDay[day].count += 1;
    }
    const days = Object.entries(byDay)
      .map(([date, v]) => ({
        date,
        revenue: v.revenue,
        cost: v.cost,
        profit: v.revenue - v.cost,
        orders: v.count,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const totalRev = days.reduce((s, d) => s + d.revenue, 0);
    const totalCost = days.reduce((s, d) => s + d.cost, 0);
    return NextResponse.json({
      days,
      totalRevenue: totalRev,
      totalCost,
      totalProfit: totalRev - totalCost,
      orderCount: orders.length,
    });
  });
