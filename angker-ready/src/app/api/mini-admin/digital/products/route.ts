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
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        _count: { select: { codes: true, orders: true } },
      },
    });
    return NextResponse.json({
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        costPrice: Number((p as any).costPrice ?? 0),
        emoji: p.emoji,
        imageUrl: (p as any).imageUrl ?? "",
        stock: p.stock,
        delivery: p.delivery,
        deliveryMode: (p as any).deliveryMode ?? "auto",
        description: p.description,
        features: (p as any).features ?? "",
        active: p.active,
        sort: p.sort,
        categoryId: (p as any).categoryId ?? null,
        categoryName: p.category?.name ?? null,
        supplierId: (p as any).supplierId ?? null,
        supplierName: p.supplier?.name ?? null,
        codesTotal: p._count.codes,
        codesUnused: 0,
        ordersTotal: p._count.orders,
      })),
    });
  });

const schema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  emoji: z.string().max(8).optional(),
  imageUrl: z.string().max(500).optional(),
  stock: z.number().int().min(0).optional(),
  delivery: z.string().max(40).optional(),
  deliveryMode: z.enum(["auto", "manual"]).optional(),
  description: z.string().max(5000).optional(),
  features: z.string().max(5000).optional(),
  active: z.boolean().optional(),
  sort: z.number().int().optional(),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  codes: z.string().max(200_000).optional(),
});

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(schema, await req.json().catch(() => null));
    const product = await db.$transaction(async (tx) => {
      const p = await tx.digitalProduct.create({
        data: {
          name: d.name,
          price: d.price,
          costPrice: d.costPrice ?? 0,
          emoji: d.emoji || "💎",
          imageUrl: d.imageUrl || "",
          stock: d.stock ?? 0,
          delivery: d.delivery || "Instant",
          deliveryMode: d.deliveryMode || "auto",
          description: d.description || "",
          features: d.features || "",
          active: d.active ?? true,
          sort: d.sort ?? 0,
          categoryId: d.categoryId || null,
          supplierId: d.supplierId || null,
        } as any,
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

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const body = parse(schema.partial().extend({ id: z.string() }), await req.json().catch(() => null));
    const { id, codes, ...rest } = body;
    const data: any = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) data[k] = v;
    }
    await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.digitalProduct.update({ where: { id }, data });
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
