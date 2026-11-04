import { db } from "@/lib/db";
import { getProvider } from "../providers/registry";
import { refundOrder } from "./createOrder";
import { notifyAdmins } from "@/lib/telegram";

/** Exactly-once submit guard: only the worker that flips PENDING->PROCESSING may call the provider.
 *  addOrder is never retried. An ambiguous failure (timeout/5xx) is left for an admin to reconcile,
 *  because the provider may already have created the order. */
export async function submitOrder(orderId: string) {
  const claimed = await db.order.updateMany({ where: { id: orderId, status: "PENDING", providerRef: null }, data: { status: "PROCESSING" } });
  if (claimed.count === 0) return "skipped";
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { service: { include: { mapping: true } } } });
  const m = order.service.mapping;
  if (!m) { await refundOrder(orderId, "no provider mapping"); return "refunded"; }
  try {
    const { client } = await getProvider(m.providerId);
    const res = await client.addOrder(m.providerServiceId, order.target, order.quantity);
    await db.order.update({ where: { id: orderId }, data: { providerRef: String(res.order) } });
    await db.orderEvent.create({ data: { orderId, kind: "submitted", detail: { providerRef: String(res.order) } } });
    return "submitted";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PROVIDER_ERROR" || msg === "PROVIDER_UNAVAILABLE") {   // definite rejection: provider has no order
      await refundOrder(orderId, "provider rejected order");
      await notifyAdmins(`⚠️ Order ${orderId} rejected by provider and refunded.`).catch(() => {});
      return "refunded";
    }
    await db.orderEvent.create({ data: { orderId, kind: "submit_uncertain", detail: { error: msg } } });
    await notifyAdmins(`❗ Order ${orderId}: submit result unknown. Check provider panel before retry/refund.`).catch(() => {});
    return "uncertain";
  }
}
