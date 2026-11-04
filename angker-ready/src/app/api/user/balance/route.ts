import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export const GET = () => handle(async () => {
  const u = await requireUser();
  const w = await db.wallet.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ balance: Number(w?.balance ?? 0), currency: w?.currency ?? "USD" });
});
