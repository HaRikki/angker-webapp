import { db } from "@/lib/db";
import { submitOrder } from "../orders/submitOrder";
import { aba } from "../payments/abaKhqr";
import { notifyAdmins } from "@/lib/telegram";

const handlers: Record<string, (p: any) => Promise<unknown>> = {
  "order.submit": (p) => submitOrder(p.orderId),
  "aba.mark_credited": (p) => aba.markCredited(p.paymentId),
  "admin.payment_alert": (p) => notifyAdmins(p.text),
  "admin.alert": (p) => notifyAdmins(p.text),
  "admin.new_user": async (p) => notifyAdmins(`👤 New user registered: ${p.userId}`),
};

export async function runOutbox(batch = 20) {
  // atomic claim: concurrent workers never get the same row
  const rows = await db.$queryRaw<{ id: string; kind: string; payload: unknown }[]>`
    UPDATE "OutboxEvent" SET attempts = attempts + 1 WHERE id IN (
      SELECT id FROM "OutboxEvent" WHERE "processedAt" IS NULL AND attempts < 8
      ORDER BY "createdAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED)
    RETURNING id, kind, payload`;
  let ok = 0;
  for (const r of rows) {
    try {
      const h = handlers[r.kind];
      if (h) await h(r.payload);
      await db.outboxEvent.update({ where: { id: r.id }, data: { processedAt: new Date() } });
      ok++;
    } catch { /* attempts already incremented; picked up again on next run */ }
  }
  return { claimed: rows.length, ok };
}
