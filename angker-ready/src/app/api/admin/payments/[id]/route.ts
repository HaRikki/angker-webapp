import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(["payments.view", "*"]);
    const d = await db.deposit.findUnique({ where: { id: params.id }, include: { user: { select: { id: true, username: true, email: true, status: true } }, events: { orderBy: { createdAt: "desc" } } } });
    if (!d) return fail("Payment not found", 404);
    const walletTx = await db.walletTransaction.findFirst({ where: { reference: d.reference, type: "DEPOSIT" } });
    return ok({ ...d, amount: Number(d.amount), walletTransaction: walletTx ? { id: walletTx.id, amount: Number(walletTx.amount), balanceAfter: Number(walletTx.balanceAfter), createdAt: walletTx.createdAt } : null });
  } catch (e) { return handleAdminError(e); }
}

const actionSchema = z.object({ action: z.enum(["mark_review", "retry_verify", "reconcile"]), reason: z.string().min(3).max(500).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["payments.view", "*"]);
    const body = actionSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid action", 400);
    const d = await db.deposit.findUnique({ where: { id: params.id } });
    if (!d) return fail("Payment not found", 404);
    if (body.data.action === "mark_review") {
      if (!body.data.reason) return fail("Reason required for manual review", 400);
      await db.deposit.update({ where: { id: d.id }, data: { status: "REVIEW_REQUIRED" } });
      await audit({ adminId: admin.id, action: "payment.mark_review", entityType: "Deposit", entityId: d.id, reason: body.data.reason, result: "ok", cid: correlationId });
      return ok({ status: "REVIEW_REQUIRED" });
    }
    await audit({ adminId: admin.id, action: `payment.${body.data.action}`, entityType: "Deposit", entityId: d.id, reason: body.data.reason ?? "requested", result: "ok", cid: correlationId });
    return ok({ message: "Verification queued. Manual credit is not allowed without verified payment evidence.", status: d.status });
  } catch (e) { return handleAdminError(e); }
}
