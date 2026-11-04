import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const [
      users,
      orders,
      pendingOrders,
      digital,
      depositsPending,
      depositsPaid,
      revenue,
      cost,
      providers,
    ] = await Promise.all([
      db.user.count(),
      db.order.count(),
      db.order.count({
        where: { status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS"] } },
      }),
      db.digitalProduct.count({ where: { active: true } }),
      db.deposit.count({ where: { status: { in: ["PENDING", "VERIFYING"] } } }),
      db.deposit.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
        _count: true,
      }),
      db.order.aggregate({
        where: { status: { in: ["COMPLETED", "PARTIAL", "PROCESSING", "IN_PROGRESS", "PENDING"] } },
        _sum: { sellPrice: true },
      }),
      db.order.aggregate({
        where: { status: { in: ["COMPLETED", "PARTIAL"] } },
        _sum: { providerCost: true },
      }),
      db.provider.findMany({
        select: { id: true, name: true, enabled: true, lastSyncAt: true },
      }),
    ]);
    const rev = Number(revenue._sum.sellPrice ?? 0);
    const cst = Number(cost._sum.providerCost ?? 0);
    return NextResponse.json({
      users,
      orders,
      pendingOrders,
      digitalProducts: digital,
      pendingPayments: depositsPending,
      depositsPaid: Number(depositsPaid._sum.amount ?? 0),
      depositsCount: depositsPaid._count,
      revenue: rev,
      cost: cst,
      profit: rev - cst,
      providers,
    });
  });
