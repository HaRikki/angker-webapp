import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
import { applyLedger } from "@/server/wallet/ledger";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const status = new URL(req.url).searchParams.get("status") || "";
    const where: any = {};
    if (status) where.status = status;
    const orders = await db.digitalOrder.findMany({
      where,
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true, telegramId: true } },
        product: { select: { deliveryMode: true, name: true } },
      },
    });
    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        productName: o.productName,
        quantity: o.quantity,
        totalPrice: Number(o.totalPrice),
        costTotal: Number((o as any).costTotal ?? 0),
        status: o.status,
        deliveryPayload: o.deliveryPayload,
        deliveryMode: (o as any).deliveryMode ?? o.product?.deliveryMode ?? "auto",
        adminNote: (o as any).adminNote ?? "",
        refunded: (o as any).refunded ?? false,
        username: o.user.username,
        telegramId: o.user.telegramId,
        createdAt: o.createdAt,
      })),
    });
  });

const patch = z.object({
  id: z.string(),
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  deliveryPayload: z.string().max(10000).optional(),
  adminNote: z.string().max(1000).optional(),
  action: z.enum(["refund"]).optional(),
});

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(patch, await req.json().catch(() => null));

    if (b.action === "refund") {
      const result = await db.$transaction(async (tx) => {
        const o = await tx.digitalOrder.findUnique({ where: { id: b.id } });
        if (!o) throw new Error("NOT_FOUND");
        if ((o as any).refunded) throw new Error("INVALID_INPUT");
        await applyLedger(tx, {
          userId: o.userId,
          type: "REFUND",
          amount: o.totalPrice,
          reference: `dig-refund-${o.id}`,
          description: `Digital refund: ${o.productName}`,
        });
        return tx.digitalOrder.update({
          where: { id: o.id },
          data: {
            refunded: true,
            status: "CANCELLED",
            adminNote: b.adminNote || "Refunded",
          } as any,
        });
      });
      return NextResponse.json({ ok: true, id: result.id, refunded: true });
    }

    const data: any = {};
    if (b.status) data.status = b.status;
    if (b.deliveryPayload !== undefined) data.deliveryPayload = b.deliveryPayload;
    if (b.adminNote !== undefined) data.adminNote = b.adminNote;
    const o = await db.digitalOrder.update({ where: { id: b.id }, data });
    return NextResponse.json({ ok: true, id: o.id, status: o.status });
  });
