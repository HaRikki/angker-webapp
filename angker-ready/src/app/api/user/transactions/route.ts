import { NextResponse } from "next/server";
import { TxType } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, page } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams, pg = page(sp), t = sp.get("type");
  const where = { userId: u.id, ...(t && t in TxType ? { type: t as TxType } : {}) };
  const [total, transactions] = await Promise.all([db.walletTransaction.count({ where }), db.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
    select: { id: true, type: true, amount: true, balanceAfter: true, currency: true, reference: true, description: true, createdAt: true } })]);
  return NextResponse.json({ transactions, total, page: pg.page, pageSize: pg.pageSize });
});
