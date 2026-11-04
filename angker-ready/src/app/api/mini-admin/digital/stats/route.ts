import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const [products, active, orders, revenue, cost, pending] = await Promise.all([
      db.digitalProduct.count(),
      db.digitalProduct.count({ where: { active: true } }),
      db.digitalOrder.count(),
      db.digitalOrder.aggregate({
        where: { status: "COMPLETED", refunded: false },
        _sum: { totalPrice: true },
      }),
      db.digitalOrder.aggregate({
        where: { status: "COMPLETED", refunded: false },
        _sum: { costTotal: true },
      }),
      db.digitalOrder.count({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
      }),
    ]);
    const rev = Number(revenue._sum.totalPrice ?? 0);
    const cst = Number(cost._sum.costTotal ?? 0);
    return NextResponse.json({
      products,
      activeProducts: active,
      orders,
      pendingOrders: pending,
      revenue: rev,
      cost: cst,
      profit: rev - cst,
    });
  });
