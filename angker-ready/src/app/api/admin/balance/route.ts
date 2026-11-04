import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { applyLedger } from "@/server/wallet/ledger";
import { z } from "zod";
import { randomBytes } from "node:crypto";

export async function GET(req: Request) {
  try {
    await requireAdmin(["wallet.adjust", "users.view", "*"]);
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return fail("Search query required", 400);
    const users = await db.user.findMany({
      where: { OR: [{ id: q }, { username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
      take: 20, include: { wallet: true, deposits: { where: { status: "PAID" }, select: { amount: true } } },
    });
    const result = await Promise.all(users.map(async (u) => {
      const spent = await db.walletTransaction.aggregate({ where: { userId: u.id, type: "ORDER_DEBIT" }, _sum: { amount: true } });
      const recent = await db.walletTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 10 });
      return {
        id: u.id, username: u.username, email: u.email, status: u.status,
        balance: Number(u.wallet?.balance ?? 0), currency: u.wallet?.currency ?? "USD",
        totalDeposits: u.deposits.reduce((s, d) => s + Number(d.amount), 0),
        totalSpent: Math.abs(Number(spent._sum.amount ?? 0)),
        recentTransactions: recent.map(t => ({ id: t.id, type: t.type, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), reference: t.reference, description: t.description, createdAt: t.createdAt })),
      };
    }));
    return ok({ users: result });
  } catch (e) { return handleAdminError(e); }
}

const adjustSchema = z.object({
  userId: z.string().min(1), amount: z.number().positive().max(1_000_000),
  reason: z.string().min(3).max(500), reference: z.string().max(100).optional(),
  direction: z.enum(["add", "deduct"]),
});

export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["wallet.adjust", "*"]);
    const body = adjustSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input: " + body.error.message, 400);
    const { userId, amount, reason, direction } = body.data;
    const ref = body.data.reference?.trim() || `ADM-${direction.toUpperCase()}-${randomBytes(6).toString("hex")}`;
    const signed = direction === "add" ? amount : -amount;
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (!user.wallet) await tx.wallet.create({ data: { userId, balance: 0 } });
      return applyLedger(tx, { userId, type: "ADJUSTMENT", amount: signed, reference: ref, description: `[Admin] ${reason}` });
    });
    await audit({ adminId: admin.id, action: direction === "add" ? "wallet.add" : "wallet.deduct", entityType: "User", entityId: userId, reason: `${reason} | amount=${amount} | ref=${ref}`, result: "ok", cid: correlationId });
    return ok({ transactionId: result.id, reference: result.reference, amount: Number(result.amount), balanceAfter: Number(result.balanceAfter), type: result.type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "USER_NOT_FOUND") return fail("User not found", 404);
    if (msg.includes("Unique") || msg.includes("unique")) return fail("Duplicate reference — adjustment already applied", 409);
    return handleAdminError(e);
  }
}
