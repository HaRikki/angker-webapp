import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const items = await db.digitalCategory.findMany({
      orderBy: { sort: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        active: c.active,
        sort: c.sort,
        products: c._count.products,
      })),
    });
  });

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(
      z.object({
        name: z.string().min(1).max(120),
        active: z.boolean().optional(),
        sort: z.number().int().optional(),
      }),
      await req.json().catch(() => null)
    );
    const c = await db.digitalCategory.create({
      data: { name: d.name, active: d.active ?? true, sort: d.sort ?? 0 },
    });
    return NextResponse.json({ ok: true, id: c.id });
  });

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        active: z.boolean().optional(),
        sort: z.number().int().optional(),
      }),
      await req.json().catch(() => null)
    );
    const { id, ...rest } = d;
    await db.digitalCategory.update({ where: { id }, data: rest });
    return NextResponse.json({ ok: true, id });
  });

export const DELETE = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("INVALID_INPUT");
    await db.digitalCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  });
