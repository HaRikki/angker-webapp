import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
import { encrypt } from "@/lib/crypto";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const items = await db.digitalSupplier.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json({
      items: items.map((s) => ({
        id: s.id,
        name: s.name,
        apiUrl: s.apiUrl,
        enabled: s.enabled,
        note: s.note,
        products: s._count.products,
        hasKey: Boolean(s.apiKeyEnc),
      })),
    });
  });

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(
      z.object({
        name: z.string().min(1).max(100),
        apiUrl: z.string().max(500).optional(),
        apiKey: z.string().max(500).optional(),
        note: z.string().max(500).optional(),
        enabled: z.boolean().optional(),
      }),
      await req.json().catch(() => null)
    );
    const s = await db.digitalSupplier.create({
      data: {
        name: d.name,
        apiUrl: d.apiUrl || "",
        apiKeyEnc: d.apiKey ? encrypt(d.apiKey) : "",
        note: d.note || "",
        enabled: d.enabled ?? true,
      },
    });
    return NextResponse.json({ ok: true, id: s.id });
  });

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        apiUrl: z.string().optional(),
        apiKey: z.string().optional(),
        note: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
      await req.json().catch(() => null)
    );
    const { id, apiKey, ...rest } = d;
    const data: any = { ...rest };
    if (apiKey) data.apiKeyEnc = encrypt(apiKey);
    await db.digitalSupplier.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id });
  });

export const DELETE = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("INVALID_INPUT");
    await db.digitalSupplier.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  });
