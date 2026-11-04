import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyLedger } from "../wallet/ledger";

export async function createOrder(i: {
  userId: string;
  serviceId: string;
  target: string;
  quantity: number;
  idemKey: string;
  couponCode?: string;
}) {
  return db.$transaction(async (tx) => {
    try {
      await tx.idempotencyKey.create({ data: { key: `order:${i.userId}:${i.idemKey}`, scope: "order" } });
    } catch {
      throw new Error("DUPLICATE_REQUEST");
    }

    const user = await tx.user.findUnique({ where: { id: i.userId } });
    if (!user || user.status !== "ACTIVE") throw new Error("FORBIDDEN");

    const svc = await tx.service.findUnique({ where: { id: i.serviceId } });
    if (!svc || !svc.active || svc.archivedAt) throw new Error("SERVICE_UNAVAILABLE");
    if (i.quantity < svc.minQty || i.quantity > svc.maxQty) throw new Error("INVALID_QUANTITY");

    // Server-side price (per 1000)
    let price = svc.sellPrice.mul(i.quantity).div(1000).toDecimalPlaces(4);
    const cost = svc.costPrice.mul(i.quantity).div(1000).toDecimalPlaces(4);

    let couponId: string | null = null;
    let discount = new Prisma.Decimal(0);

    if (i.couponCode) {
      const code = i.couponCode.trim().toUpperCase();
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.enabled) throw new Error("COUPON_INVALID");
      const now = new Date();
      if (coupon.startsAt && coupon.startsAt > now) throw new Error("COUPON_INVALID");
      if (coupon.expiresAt && coupon.expiresAt < now) throw new Error("COUPON_EXPIRED");

      const userUses = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId: i.userId } });
      if (userUses >= coupon.perUserLimit) throw new Error("COUPON_LIMIT");

      if (coupon.maxUses != null) {
        const totalUses = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
        if (totalUses >= coupon.maxUses) throw new Error("COUPON_LIMIT");
      }

      if (coupon.kind === "percent") {
        discount = price.mul(coupon.value).div(100).toDecimalPlaces(4);
      } else {
        // fixed amount off
        discount = Prisma.Decimal.min(coupon.value, price);
      }
      price = Prisma.Decimal.max(price.minus(discount), new Prisma.Decimal(0)).toDecimalPlaces(4);
      couponId = coupon.id;
    }

    const order = await tx.order.create({
      data: {
        userId: i.userId,
        serviceId: svc.id,
        serviceName: svc.name,
        target: i.target,
        quantity: i.quantity,
        currency: "USD",
        sellPrice: price,
        providerCost: cost,
      },
    });

    await applyLedger(tx, {
      userId: i.userId,
      type: "ORDER_DEBIT",
      amount: price.neg(),
      reference: order.id,
      description: couponId ? `${svc.name} (coupon)` : svc.name,
    });

    if (couponId) {
      await tx.couponRedemption.create({
        data: { couponId, userId: i.userId },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "created",
        detail: {
          quantity: i.quantity,
          price: price.toString(),
          discount: discount.toString(),
          couponId,
        },
      },
    });

    await tx.outboxEvent.create({
      data: { kind: "order.submit", payload: { orderId: order.id } },
    });

    return order;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

/** Called by the outbox worker. Refunds exactly once if provider definitively rejects. */
export async function refundOrder(orderId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status === "FAILED") return;
    await tx.order.update({ where: { id: orderId }, data: { status: "FAILED" } });
    await applyLedger(tx, {
      userId: o.userId,
      type: "REFUND",
      amount: o.sellPrice,
      reference: o.id,
      description: reason,
    });
    await tx.orderEvent.create({ data: { orderId, kind: "refunded", detail: { reason } } });
  });
}
