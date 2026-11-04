import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { bootTasks } from "@/server/boot";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/internal/setup  with  Authorization: Bearer <CRON_SECRET>
 *  Re-registers the Telegram webhook, checks the database and sends the admin a status message. */
export async function GET(req: Request) {
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`), got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(want, got)) return new NextResponse(null, { status: 401 });
  return NextResponse.json(await bootTasks(true));
}
