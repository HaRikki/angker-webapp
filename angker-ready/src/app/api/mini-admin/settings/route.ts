import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
export const dynamic = "force-dynamic";

const KEYS = ["siteName", "logoUrl", "description", "maintenance", "minDeposit", "maxDeposit"] as const;

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const rows = await db.siteSetting.findMany({
      where: { key: { in: [...KEYS] } },
    });
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    return NextResponse.json({
      siteName: (map.siteName as string) || "Angker SMM",
      logoUrl: (map.logoUrl as string) || "",
      description: (map.description as string) || "",
      maintenance: Boolean(map.maintenance),
      minDeposit: Number(map.minDeposit ?? 1),
      maxDeposit: Number(map.maxDeposit ?? 500),
    });
  });

const body = z.object({
  siteName: z.string().min(1).max(80).optional(),
  logoUrl: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
  maintenance: z.boolean().optional(),
  minDeposit: z.number().positive().optional(),
  maxDeposit: z.number().positive().optional(),
});

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const d = parse(body, await req.json().catch(() => null));
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      await db.siteSetting.upsert({
        where: { key: k },
        update: { value: v as any },
        create: { key: k, value: v as any },
      });
    }
    return NextResponse.json({ ok: true });
  });
