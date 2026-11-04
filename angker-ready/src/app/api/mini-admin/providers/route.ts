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
    const items = await db.provider.findMany({
      orderBy: { priority: "desc" },
      include: { _count: { select: { mappings: true } } },
    });
    return NextResponse.json({
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        enabled: p.enabled,
        priority: p.priority,
        isDefault: p.isDefault,
        lastSyncAt: p.lastSyncAt,
        mappings: p._count.mappings,
      })),
    });
  });

const create = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  apiKey: z.string().min(4).max(500),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(create, await req.json().catch(() => null));
    const p = await db.provider.create({
      data: {
        name: d.name,
        baseUrl: d.baseUrl,
        apiKeyEnc: encrypt(d.apiKey),
        enabled: d.enabled ?? true,
        priority: d.priority ?? 0,
      },
    });
    return NextResponse.json({ ok: true, id: p.id });
  });

const patch = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(4).max(500).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const PATCH = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(patch, await req.json().catch(() => null));
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.baseUrl !== undefined) data.baseUrl = b.baseUrl;
    if (b.apiKey !== undefined) data.apiKeyEnc = encrypt(b.apiKey);
    if (b.enabled !== undefined) data.enabled = b.enabled;
    if (b.priority !== undefined) data.priority = b.priority;
    await db.provider.update({ where: { id: b.id }, data });
    return NextResponse.json({ ok: true, id: b.id });
  });

export const DELETE = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("INVALID_INPUT");
    await db.provider.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  });
