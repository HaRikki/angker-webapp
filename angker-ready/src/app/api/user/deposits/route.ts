import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, page, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createDeposit } from "@/server/payments/deposits";
import { hit } from "@/lib/rateLimit";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    const u = await requireUser(),
      pg = page(new URL(req.url).searchParams),
      where = { userId: u.id };
    const [total, deposits] = await Promise.all([
      db.deposit.count({ where }),
      db.deposit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pg.skip,
        take: pg.take,
        select: {
          id: true,
          method: true,
          reference: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          paidAt: true,
        },
      }),
    ]);
    return NextResponse.json({ deposits, total, page: pg.page, pageSize: pg.pageSize });
  });

export const POST = (req: Request) =>
  handle(async () => {
    const u = await requireUser();
    if (!(await hit(`dep:${u.id}`, 5, 600))) throw new Error("RATE_LIMITED");
    const { amount } = parse(
      z.object({ amount: z.number().positive().max(100000) }),
      await req.json().catch(() => null)
    );
    try {
      const d = await createDeposit(u, amount);
      return NextResponse.json(
        {
          deposit: {
            id: d.id,
            reference: d.reference,
            status: d.status,
            amount: d.amount,
            currency: d.currency,
            qrString: d.qrString,
            cardImage: d.cardImage,
            payUrl: d.payUrl,
            expiresAt: d.expiresAt,
          },
        },
        { status: 201 }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (
        msg === "PAYMENT_UNAVAILABLE" ||
        msg === "INVALID_AMOUNT" ||
        msg.startsWith("ABA_")
      ) {
        throw new Error(msg.startsWith("ABA_") ? "PAYMENT_UNAVAILABLE" : msg);
      }
      throw e;
    }
  });
