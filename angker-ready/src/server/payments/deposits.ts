import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { aba } from "./abaKhqr";
import { applyLedger } from "../wallet/ledger";

async function setting<T>(key: string, fallback: T) { return ((await db.siteSetting.findUnique({ where: { key } }))?.value as T) ?? fallback; }

export async function createDeposit(user: { id: string; username: string }, amountIn: number) {
  const methods = await setting<string[]>("paymentMethods", ["aba"]);
  if (!methods.includes("aba")) throw new Error("PAYMENT_UNAVAILABLE");
  const [min, max] = [await setting("minDeposit", 1), await setting("maxDeposit", 500)];
  const amount = Math.round(amountIn * 100) / 100;
  if (!(amount >= min && amount <= max)) throw new Error("INVALID_AMOUNT");
  const qr = await aba.generateQr(user.username, amount);       // bills the merchant wallet per QR: callers rate-limit this
  if (qr.currency !== "USD" || Math.abs(qr.amount - amount) > 0.0001) throw new Error("PAYMENT_UNAVAILABLE");
  return db.deposit.create({ data: { userId: user.id, method: "ABA_KHQR", reference: qr.payment_id, amount, currency: "USD",
    qrString: qr.qr_string, cardImage: qr.card_image, payUrl: qr.pay_url, expiresAt: new Date(qr.expires_at) } });
}

/** Credits at most once: provider says PAID + amount/currency match OUR record + row lock + unique ledger key. */
export async function settleDeposit(depositId: string) {
  const d = await db.deposit.findUnique({ where: { id: depositId } });
  if (!d || d.status !== "PENDING") return d;
  const r = await aba.check(d.reference);
  if (r.status === "EXPIRED") return db.deposit.update({ where: { id: d.id }, data: { status: "EXPIRED" } });
  if (r.status !== "PAID" || r.paid !== true) return d;
  if (Math.abs(r.amount - Number(d.amount)) > 0.0001) {          // never credit on mismatch; alert admin once
    await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({ data: { depositId: d.id, eventId: `aba:${d.reference}:mismatch`, payloadHash: "mismatch", verified: false } });
      await tx.outboxEvent.create({ data: { kind: "admin.payment_alert", payload: { text: `⚠️ Deposit ${d.id}: provider amount ${r.amount} != expected ${d.amount}. Not credited.` } } });
    }).catch(() => {});
    return d;
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Deposit" WHERE id = ${d.id} FOR UPDATE`;
    const cur = await tx.deposit.findUniqueOrThrow({ where: { id: d.id } });
    if (cur.status !== "PENDING") return cur;                     // duplicate poll/cron lost the race
    const paid = await tx.deposit.update({ where: { id: d.id }, data: { status: "PAID", paidAt: new Date() } });
    await tx.paymentEvent.create({ data: { depositId: d.id, eventId: `aba:${d.reference}:paid`, payloadHash: createHash("sha256").update(JSON.stringify(r)).digest("hex"), verified: true } });
    await applyLedger(tx, { userId: d.userId, type: "DEPOSIT", amount: d.amount, reference: d.id, description: "ABA KHQR deposit" });
    await tx.outboxEvent.createMany({ data: [
      { kind: "aba.mark_credited", payload: { paymentId: d.reference } },
      { kind: "admin.payment_alert", payload: { text: `💰 Deposit ${d.amount} USD paid (${d.id}).` } } ] });
    await tx.notification.create({
      data: {
        userId: d.userId,
        audience: "user",
        kind: "deposit_success",
        body: `Your deposit of $${Number(d.amount).toFixed(2)} has been credited to your wallet.`,
      },
    });
    return paid;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

/** Cron safety net: users who closed the page still get credited. */
export async function reconcilePending(limit = 50) {
  const rows = await db.deposit.findMany({ where: { status: "PENDING", createdAt: { gt: new Date(Date.now() - 6 * 3600_000) } }, orderBy: { createdAt: "asc" }, take: limit });
  let settled = 0;
  for (const d of rows) { try { const r = await settleDeposit(d.id); if (r && r.status !== "PENDING") settled++; } catch { /* retry next run */ } }
  return settled;
}
