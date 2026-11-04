import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { settleDeposit } from "@/server/payments/deposits";
import { hit } from "@/lib/rateLimit";
export const dynamic = "force-dynamic";

export const GET = (_: Request, { params }: { params: { reference: string } }) => handle(async () => {
  const u = await requireUser();
  const d = await db.deposit.findFirst({ where: { reference: params.reference, userId: u.id } });
  if (!d) throw new Error("NOT_FOUND");
  let status = d.status;
  if (status === "PENDING") {
    if (!(await hit(`paycheck:${u.id}`, 60, 60))) throw new Error("RATE_LIMITED");
    status = (await settleDeposit(d.id))?.status ?? status;
  }
  if (status === "PAID") {                       // lets the success screen show the new balance without another request
    const w = await db.wallet.findUnique({ where: { userId: u.id } });
    return NextResponse.json({ status, balance: Number(w?.balance ?? 0) });
  }
  return NextResponse.json({ status });
});
