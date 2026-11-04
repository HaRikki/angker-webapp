import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { hit } from "@/lib/rateLimit";
import { isMaintenance } from "@/lib/settings";
import { applyLedger } from "@/server/wallet/ledger";
export const dynamic = "force-dynamic";

const body = z.object({
  productId: z.string().min(1).max(40),
  quantity: z.number().int().positive().max(20),
  promoCode: z.string().max(40).optional(),
});

export const GET = () =>
  handle(async () => {
    const u = await requireUser();
    const orders = await db.digitalOrder.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        productName: o.productName,
        quantity: o.quantity,
        totalPrice: Number(o.totalPrice),
        status: o.status,
        deliveryPayload: o.deliveryPayload,
        createdAt: o.createdAt,
      })),
    });
  });

export const POST = (req: Request) =>
  handle(async () => {
    const u = await requireUser();
    if (await isMaintenance()) throw new Error("MAINTENANCE");
    if (!(await hit(`digital:${u.id}`, 20, 60))) throw new Error("RATE_LIMITED");
    const b = parse(body, await req.json().catch(() => null));
    const ref = `dig:${u.id}:${b.productId}:${Date.now()}`;

    const result = await db.$transaction(async (tx) => {
      const product = await tx.digitalProduct.findFirst({
        where: { id: b.productId, active: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      if (product.stock < b.quantity) throw new Error("OUT_OF_STOCK");

      const unit = new Prisma.Decimal(product.price);
      const total = unit.mul(b.quantity);
      const costUnit = new Prisma.Decimal((product as any).costPrice ?? 0);
      const costTotal = costUnit.mul(b.quantity);
      const mode = ((product as any).deliveryMode as string) || "auto";

      await applyLedger(tx, {
        userId: u.id,
        type: "ORDER_DEBIT",
        amount: total.neg(),
        reference: ref,
        description: `Digital: ${product.name} ×${b.quantity}`,
      });

      let payload: string | null = null;
      let status = "PENDING";

      if (mode === "auto") {
        const codes = await tx.digitalCode.findMany({
          where: { productId: product.id, usedAt: null },
          take: b.quantity,
          orderBy: { createdAt: "asc" },
        });
        if (codes.length >= b.quantity) {
          payload = codes.map((c) => c.code).join("\n");
          status = "COMPLETED";
          await tx.digitalCode.updateMany({
            where: { id: { in: codes.map((c) => c.id) } },
            data: { usedAt: new Date() },
          });
        } else {
          // not enough codes — pending for admin
          status = "PENDING";
        }
      }

      const order = await tx.digitalOrder.create({
        data: {
          userId: u.id,
          productId: product.id,
          productName: product.name,
          quantity: b.quantity,
          unitPrice: unit,
          totalPrice: total,
          costTotal,
          status,
          deliveryPayload: payload,
          deliveryMode: mode,
        } as any,
      });

      if (payload) {
        await tx.digitalCode.updateMany({
          where: {
            productId: product.id,
            code: { in: payload.split("\n") },
            usedAt: { not: null },
          },
          data: { orderId: order.id },
        });
      }

      await tx.digitalProduct.update({
        where: { id: product.id },
        data: { stock: { decrement: b.quantity } },
      });

      const w = await tx.wallet.findUnique({ where: { userId: u.id } });
      return {
        id: order.id,
        total: Number(total),
        delivery: payload,
        status,
        balance: w ? Number(w.balance) : 0,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  });
