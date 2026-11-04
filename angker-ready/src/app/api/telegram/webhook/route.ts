import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleUpdate } from "@/server/bot";

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || !safeEq(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return new NextResponse(null, { status: 401 });
  const u = await req.json().catch(() => null);
  if (!u || typeof u.update_id !== "number") return NextResponse.json({ ok: true });
  try { await db.idempotencyKey.create({ data: { key: `tg:${u.update_id}`, scope: "tg" } }); }
  catch (e) {
    // P2002 = replayed update -> ignore. Anything else (e.g. database not ready) must not block the admin: carry on.
    if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ ok: true });
  }
  await handleUpdate(u).catch((e) => console.error("[telegram webhook]", e instanceof Error ? e.message : e));               // always 200 so Telegram doesn't retry-storm
  return NextResponse.json({ ok: true });
}
