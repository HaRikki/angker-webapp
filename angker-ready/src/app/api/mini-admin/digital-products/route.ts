import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const items = await db.digitalProduct.findMany({
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { codes: true, orders: true } } },
    });
    return NextResponse.json({
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        emoji: p.emoji,
        stock: p.stock,
        delivery: p.delivery,
        description: p.description,
        active: p.active,
        sort: p.sort,
        codesTotal: p._count.codes,
        ordersTotal: p._count.orders,
      })),
    });
  });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  emoji: z.string().max(8).optional(),
  stock: z.number().int().min(0).optional(),
  delivery: z.string().max(40).optional(),
  description: z.string().max(5000).optional(),
  active: z.boolean().optional(),
  sort: z.number().int().optional(),
  codes: z.string().max(100_000).optional(),
});

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(createSchema, await req.json().catch(() => null));
    const product = await db.$transaction(async (tx) => {
      const p = await tx.digitalProduct.create({
        data: {
          name: d.name,
          price: d.price,
          emoji: d.emoji || "💎",
          stock: d.stock ?? 0,
          delivery: d.delivery || "Instant",
          description: d.description || "",
          active: d.active ?? true,
          sort: d.sort ?? 0,
        },
      });
      const lines = (d.codes || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) {
        await tx.digitalCode.createMany({
          data: lines.map((code) => ({ productId: p.id, code })),
        });
        if ((d.stock ?? 0) === 0) {
          await tx.digitalProduct.update({
            where: { id: p.id },
            data: { stock: lines.length },
          });
        }
      }
      return p;
    });
    return NextResponse.json({ ok: true, id: product.id });
  });

const patchSchema = createSchema.partial().extend({ id: z.string().min(1) });

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const body = parse(patchSchema, await req.json().catch(() => null));
    const { id, codes, ...rest } = body;
    const data: Record<string, unknown> = {};
    for (const k of ["name", "price", "emoji", "stock", "delivery", "description", "active", "sort"] as const) {
      if ((rest as any)[k] !== undefined) data[k] = (rest as any)[k];
    }
    await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.digitalProduct.update({ where: { id }, data: data as any });
      }
      if (codes) {
        const lines = codes
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (lines.length) {
          await tx.digitalCode.createMany({
            data: lines.map((code) => ({ productId: id, code })),
          });
          await tx.digitalProduct.update({
            where: { id },
            data: { stock: { increment: lines.length } },
          });
        }
      }
    });
    return NextResponse.json({ ok: true, id });
  });

export const DELETE = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("INVALID_INPUT");
    await db.digitalProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  });
