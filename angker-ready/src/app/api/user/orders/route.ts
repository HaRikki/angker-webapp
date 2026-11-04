import { NextResponse } from "next/server";
import { Prisma, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, page, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createOrder } from "@/server/orders/createOrder";
import { hit } from "@/lib/rateLimit";
import { isMaintenance } from "@/lib/settings";
export const dynamic = "force-dynamic";

const LIST = {
  id: true, serviceName: true, target: true, quantity: true, sellPrice: true,
  currency: true, status: true, providerRef: true, createdAt: true, updatedAt: true,
} as const;

export const GET = (req: Request) => handle(async () => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams, pg = page(sp);
  const st = sp.get("status"), q = sp.get("q"), from = sp.get("from"), to = sp.get("to");
  const where: Prisma.OrderWhereInput = {
    userId: u.id,
    ...(st && st in OrderStatus ? { status: st as OrderStatus } : {}),
    ...(q ? {
      OR: [
        { id: { contains: q.slice(0, 40) } },
        { serviceName: { contains: q.slice(0, 80), mode: "insensitive" } },
        { target: { contains: q.slice(0, 100), mode: "insensitive" } },
      ],
    } : {}),
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take, select: LIST }),
  ]);
  return NextResponse.json({ orders, total, page: pg.page, pageSize: pg.pageSize });
});

const target = z.string().trim().min(3).max(300).refine(
  (v) => /^@?[A-Za-z0-9._]{2,64}$/.test(v) || /^https?:\/\/[^\s]+$/i.test(v),
  "INVALID_TARGET"
);
const body = z.object({
  serviceId: z.string().min(1).max(40),
  target,
  quantity: z.number().int().positive().max(100_000_000),
  idempotencyKey: z.string().min(8).max(80),
  couponCode: z.string().max(40).optional(),
});

export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  if (await isMaintenance()) throw new Error("MAINTENANCE");
  if (!(await hit(`order:${u.id}`, 30, 60))) throw new Error("RATE_LIMITED");
  const b = parse(body, await req.json().catch(() => null));
  const o = await createOrder({
    userId: u.id,
    serviceId: b.serviceId,
    target: b.target,
    quantity: b.quantity,
    idemKey: b.idempotencyKey,
    couponCode: b.couponCode,
  });
  return NextResponse.json({
    order: { id: o.id, status: o.status, sellPrice: o.sellPrice, quantity: o.quantity },
  }, { status: 201 });
});
