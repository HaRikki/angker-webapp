import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

export const GET = () => handle(async () => {
  const u = await requireUser();
  const [wallet, byStatus, sums, recentOrders, latestTx, announcements, notifications, sessions] = await Promise.all([
    db.wallet.findUnique({ where: { userId: u.id } }),
    db.order.groupBy({ by: ["status"], where: { userId: u.id }, _count: true }),
    db.walletTransaction.groupBy({ by: ["type"], where: { userId: u.id }, _sum: { amount: true } }),
    db.order.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, serviceName: true, quantity: true, sellPrice: true, status: true, target: true, createdAt: true },
    }),
    db.walletTransaction.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, type: true, amount: true, currency: true, description: true, reference: true, createdAt: true },
    }),
    db.announcement.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, createdAt: true },
    }),
    db.notification.findMany({
      where: { OR: [{ userId: u.id }, { audience: "all" }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, kind: true, body: true, createdAt: true },
    }),
    db.session.count({ where: { userId: u.id, expiresAt: { gt: new Date() } } }),
  ]);

  const n = (statuses: string[]) =>
    byStatus.filter((x) => statuses.includes(x.status)).reduce((a, x) => a + x._count, 0);
  const sum = (t: string) => Number(sums.find((x) => x.type === t)?._sum.amount ?? 0);

  return NextResponse.json({
    balance: wallet?.balance ?? "0",
    currency: wallet?.currency ?? "USD",
    totalOrders: byStatus.reduce((a, x) => a + x._count, 0),
    pendingOrders: n(["PENDING", "PROCESSING", "IN_PROGRESS"]),
    completedOrders: n(["COMPLETED"]),
    failedOrders: n(["FAILED", "CANCELLED"]),
    partialOrders: n(["PARTIAL"]),
    totalDeposits: sum("DEPOSIT"),
    totalSpending: Math.abs(sum("ORDER_DEBIT")),
    totalRefunds: sum("REFUND"),
    recentOrders,
    latestTransactions: latestTx,
    announcements,
    notifications,
    account: {
      id: u.id,
      username: u.username,
      email: u.email,
      emailVerified: !!u.emailVerifiedAt,
      status: u.status,
      createdAt: u.createdAt,
      activeSessions: sessions,
    },
  });
});
