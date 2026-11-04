import { NextResponse } from "next/server";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const status = new URL(req.url).searchParams.get("status") || "";
    const where: any = {};
    if (status && status in OrderStatus) where.status = status;
    const orders = await db.order.findMany({
      where,
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        num: true,
        serviceName: true,
        quantity: true,
        sellPrice: true,
        providerCost: true,
        status: true,
        target: true,
        providerRef: true,
        createdAt: true,
        user: { select: { username: true, telegramId: true } },
        service: { select: { manual: true } },
      },
    });
    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        num: o.num,
        serviceName: o.serviceName,
        quantity: o.quantity,
        sellPrice: Number(o.sellPrice),
        providerCost: Number(o.providerCost),
        status: o.status,
        target: o.target,
        providerRef: o.providerRef,
        username: o.user.username,
        telegramId: o.user.telegramId,
        manual: (o.service as any)?.manual ?? false,
        createdAt: o.createdAt,
      })),
    });
  });

const patch = z.object({
  id: z.string().min(1),
  status: z.enum([
    "PENDING",
    "PROCESSING",
    "IN_PROGRESS",
    "COMPLETED",
    "PARTIAL",
    "CANCELLED",
    "FAILED",
  ]),
});

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(patch, await req.json().catch(() => null));
    const o = await db.order.update({
      where: { id: b.id },
      data: { status: b.status as OrderStatus },
    });
    await db.orderEvent.create({
      data: {
        orderId: o.id,
        kind: "admin.status",
        detail: { status: b.status, via: "mini-admin" },
      },
    });
    return NextResponse.json({ ok: true, id: o.id, status: o.status });
  });
