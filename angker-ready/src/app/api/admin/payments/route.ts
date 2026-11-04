import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, handleAdminError } from "@/lib/adminApi";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requireAdmin(["payments.view", "*"]);
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim();
    const where: Prisma.DepositWhereInput = {};
    if (status) where.status = status as any;
    if (q) where.OR = [{ reference: { contains: q, mode: "insensitive" } }, { user: { username: { contains: q, mode: "insensitive" } } }, { user: { email: { contains: q, mode: "insensitive" } } }, { userId: q }];
    const [total, items] = await Promise.all([
      db.deposit.count({ where }),
      db.deposit.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit, include: { user: { select: { id: true, username: true, email: true } }, events: { orderBy: { createdAt: "desc" }, take: 5 } } }),
    ]);
    return ok({ items: items.map(d => ({ id: d.id, userId: d.userId, username: d.user.username, email: d.user.email, method: d.method, reference: d.reference, amount: Number(d.amount), currency: d.currency, status: d.status, createdAt: d.createdAt, paidAt: d.paidAt, expiresAt: d.expiresAt, eventsCount: d.events.length })), page, limit, total, pages: Math.ceil(total/limit) });
  } catch (e) { return handleAdminError(e); }
}
