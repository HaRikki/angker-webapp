import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, handleAdminError } from "@/lib/adminApi";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "30d";
    let since: Date | null = null;
    if (range === "today") { since = new Date(); since.setHours(0,0,0,0); }
    else if (range === "7d") since = new Date(Date.now() - 7*86400000);
    else if (range === "30d") since = new Date(Date.now() - 30*86400000);
    const depositWhere = since ? { createdAt: { gte: since } } : {};
    const orderWhere = since ? { createdAt: { gte: since } } : {};
    const [totalUsers, walletAgg, deposits, services, orders, recentAudit] = await Promise.all([
      db.user.count(),
      db.wallet.aggregate({ _sum: { balance: true } }),
      db.deposit.groupBy({ by: ["status"], where: depositWhere, _count: true, _sum: { amount: true } }),
      db.service.groupBy({ by: ["active"], _count: true }),
      db.order.groupBy({ by: ["status"], where: orderWhere, _count: true }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    ]);
    const depositMap: Record<string, { count: number; sum: number }> = {};
    for (const d of deposits) depositMap[d.status] = { count: d._count, sum: Number(d._sum.amount ?? 0) };
    const serviceMap: Record<string, number> = {};
    for (const s of services) serviceMap[String(s.active)] = s._count;
    const orderMap: Record<string, number> = {};
    for (const o of orders) orderMap[o.status] = o._count;
    return ok({
      totalUsers, totalWalletBalance: Number(walletAgg._sum.balance ?? 0),
      deposits: { pending: depositMap["PENDING"] ?? {count:0,sum:0}, verifying: depositMap["VERIFYING"] ?? {count:0,sum:0}, paid: depositMap["PAID"] ?? {count:0,sum:0}, failed: depositMap["FAILED"] ?? {count:0,sum:0}, expired: depositMap["EXPIRED"] ?? {count:0,sum:0}, review: depositMap["REVIEW_REQUIRED"] ?? {count:0,sum:0} },
      services: { total: Object.values(serviceMap).reduce((a,b)=>a+b,0), active: serviceMap["true"]??0, disabled: serviceMap["false"]??0 },
      orders: { total: Object.values(orderMap).reduce((a,b)=>a+b,0), pending: orderMap["PENDING"]??0, processing: (orderMap["PROCESSING"]??0)+(orderMap["IN_PROGRESS"]??0), completed: orderMap["COMPLETED"]??0, failed: (orderMap["FAILED"]??0)+(orderMap["CANCELLED"]??0) },
      recentActivities: recentAudit, range,
    });
  } catch (e) { return handleAdminError(e); }
}
