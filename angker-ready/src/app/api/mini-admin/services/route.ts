import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const q = new URL(req.url).searchParams.get("q")?.trim();
    const where: any = { archivedAt: null };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { id: q },
      ];
      const num = Number(q);
      if (!isNaN(num)) where.OR.push({ num });
    }
    const items = await db.service.findMany({
      where,
      take: 80,
      orderBy: { num: "asc" },
      include: {
        category: { select: { id: true, name: true } },
        mapping: { select: { providerId: true, providerServiceId: true } },
      },
    });
    return NextResponse.json({
      items: items.map((s) => ({
        id: s.id,
        num: s.num,
        name: s.name,
        description: s.description,
        categoryId: s.categoryId,
        category: s.category.name,
        sellPrice: Number(s.sellPrice),
        costPrice: Number(s.costPrice),
        minQty: s.minQty,
        maxQty: s.maxQty,
        refill: s.refill,
        cancel: s.cancel,
        active: s.active,
        manual: (s as any).manual ?? false,
        startTime: (s as any).startTime ?? "0-1 hour",
        avgTime: (s as any).avgTime ?? "24 hours",
        providerId: s.mapping?.providerId ?? null,
        providerServiceId: s.mapping?.providerServiceId ?? null,
      })),
    });
  });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.string().min(1),
  costPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1),
  refill: z.boolean().optional(),
  cancel: z.boolean().optional(),
  active: z.boolean().optional(),
  manual: z.boolean().optional(),
  startTime: z.string().max(40).optional(),
  avgTime: z.string().max(40).optional(),
  providerId: z.string().optional(),
  providerServiceId: z.string().optional(),
});

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(createSchema, await req.json().catch(() => null));
    if (d.maxQty < d.minQty) throw new Error("INVALID_INPUT");
    const service = await db.$transaction(async (tx) => {
      const s = await tx.service.create({
        data: {
          name: d.name,
          description: d.description ?? "",
          categoryId: d.categoryId,
          costPrice: d.costPrice,
          sellPrice: d.sellPrice,
          minQty: d.minQty,
          maxQty: d.maxQty,
          refill: d.refill ?? false,
          cancel: d.cancel ?? false,
          active: d.active ?? true,
          manual: d.manual ?? !d.providerId,
          startTime: d.startTime ?? "0-1 hour",
          avgTime: d.avgTime ?? "24 hours",
        } as any,
      });
      if (d.providerId && d.providerServiceId) {
        await tx.providerServiceMapping.create({
          data: {
            serviceId: s.id,
            providerId: d.providerId,
            providerServiceId: d.providerServiceId,
          },
        });
      }
      return s;
    });
    return NextResponse.json({ ok: true, id: service.id, num: service.num });
  });

const patchSchema = createSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(patchSchema, await req.json().catch(() => null));
    const { id, providerId, providerServiceId, ...rest } = b;
    const data: any = {};
    for (const k of Object.keys(rest) as (keyof typeof rest)[]) {
      if (rest[k] !== undefined) data[k] = rest[k];
    }
    await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.service.update({ where: { id }, data });
      }
      if (providerId && providerServiceId) {
        await tx.providerServiceMapping.upsert({
          where: { serviceId: id },
          create: { serviceId: id, providerId, providerServiceId },
          update: { providerId, providerServiceId },
        });
      }
    });
    return NextResponse.json({ ok: true, id });
  });

export const DELETE = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("INVALID_INPUT");
    await db.service.update({
      where: { id },
      data: { archivedAt: new Date(), active: false },
    });
    return NextResponse.json({ ok: true, id });
  });
