import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
import { settleDeposit } from "@/server/payments/deposits";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    await requireMiniAdmin();
    const methods = await db.siteSetting.findUnique({
      where: { key: "paymentMethods" },
    });
    const deposits = await db.deposit.findMany({
      take: 40,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        method: true,
        amount: true,
        status: true,
        reference: true,
        createdAt: true,
        paidAt: true,
        user: { select: { username: true } },
      },
    });
    const enabled = Array.isArray(methods?.value)
      ? (methods!.value as string[]).includes("aba")
      : true;
    return NextResponse.json({
      abaEnabled: enabled,
      deposits: deposits.map((d) => ({
        id: d.id,
        method: d.method,
        amount: Number(d.amount),
        status: d.status,
        reference: d.reference,
        username: d.user.username,
        createdAt: d.createdAt,
        paidAt: d.paidAt,
      })),
    });
  });

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle_aba"), enabled: z.boolean() }),
  z.object({ action: z.literal("settle"), depositId: z.string().min(1) }),
]);

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(body, await req.json().catch(() => null));
    if (b.action === "toggle_aba") {
      await db.siteSetting.upsert({
        where: { key: "paymentMethods" },
        update: { value: b.enabled ? ["aba"] : [] },
        create: { key: "paymentMethods", value: b.enabled ? ["aba"] : [] },
      });
      return NextResponse.json({ ok: true, abaEnabled: b.enabled });
    }
    const d = await settleDeposit(b.depositId);
    return NextResponse.json({
      ok: true,
      status: d?.status ?? "UNKNOWN",
    });
  });
