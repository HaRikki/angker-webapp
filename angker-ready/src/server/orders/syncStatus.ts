import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getProvider } from "../providers/registry";
import { mapProviderStatus } from "../providers/smmAdapter";
import { applyLedger } from "../wallet/ledger";

const TERMINAL = ["COMPLETED", "PARTIAL", "CANCELLED", "FAILED"];
export async function syncOne(id: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { service: { include: { mapping: true } } } });
  if (!o.providerRef || !o.service.mapping) throw new Error("NO_PROVIDER_REF");
  if (TERMINAL.includes(o.status)) return o.status;
  const { client } = await getProvider(o.service.mapping.providerId);
  const s = await client.status(o.providerRef);
  const next = mapProviderStatus(s.status);
  if (next === o.status) return next;
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: o.id }, data: { status: next } });
    await tx.orderEvent.create({ data: { orderId: o.id, kind: "status", detail: { from: o.status, to: next, remains: s.remains ?? null } } });
    let refund: Prisma.Decimal | null = null;
    if (next === "CANCELLED") refund = o.sellPrice;
    if (next === "PARTIAL") refund = o.sellPrice.mul(Number(s.remains ?? 0)).div(o.quantity).toDecimalPlaces(4);
    if (refund && refund.gt(0)) // (REFUND, orderId) is unique: cannot refund twice
      await applyLedger(tx, { userId: o.userId, type: "REFUND", amount: refund, reference: o.id, description: `${next} refund` });
  });
  return next;
}
export async function syncOrderStatuses(limit = 50, orderId?: string) {
  const orders = await db.order.findMany({ where: { ...(orderId ? { id: orderId } : {}), providerRef: { not: null }, status: { in: ["PROCESSING", "IN_PROGRESS", "PENDING"] } }, orderBy: { updatedAt: "asc" }, take: limit, select: { id: true } });
  let changed = 0;
  for (const o of orders) { try { const before = await db.order.findUnique({ where: { id: o.id }, select: { status: true } }); if ((await syncOne(o.id)) !== before?.status) changed++; } catch { /* next run */ } }
  return changed;
}
