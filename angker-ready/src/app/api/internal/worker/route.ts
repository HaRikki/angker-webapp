import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runOutbox } from "@/server/outbox/worker";
import { reconcilePending } from "@/server/payments/deposits";
import { syncOrderStatuses } from "@/server/orders/syncStatus";
export const dynamic = "force-dynamic";

export const maxDuration = 60;
export async function GET(req: Request) {
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`), got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(want, got)) return new NextResponse(null, { status: 401 });
  const outbox = await runOutbox();
  const synced = await syncOrderStatuses();
  const reconciled = await reconcilePending();
  return NextResponse.json({ outbox, synced, reconciled });
}
