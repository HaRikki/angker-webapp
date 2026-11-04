import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireMiniAdmin } from "@/lib/auth/miniAdmin";
import { applyLedger } from "@/server/wallet/ledger";
export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const detail = url.searchParams.get("id");

    if (detail) {
      const u = await db.user.findUnique({
        where: { id: detail },
        include: { wallet: true },
      });
      if (!u) throw new Error("NOT_FOUND");
      const [orders, txs] = await Promise.all([
        db.order.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            serviceName: true,
            quantity: true,
            sellPrice: true,
            status: true,
            createdAt: true,
          },
        }),
        db.walletTransaction.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            description: true,
            createdAt: true,
          },
        }),
      ]);
      return NextResponse.json({
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          telegramId: u.telegramId,
          status: u.status,
          balance: Number(u.wallet?.balance ?? 0),
        },
        orders: orders.map((o) => ({
          ...o,
          sellPrice: Number(o.sellPrice),
        })),
        transactions: txs.map((t) => ({
          ...t,
          amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
        })),
      });
    }

    const where: any = q
      ? {
          OR: [
            { id: q },
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { telegramId: q },
          ],
        }
      : {};
    const users = await db.user.findMany({
      where,
      take: 30,
      orderBy: { createdAt: "desc" },
      include: { wallet: true },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        telegramId: u.telegramId,
        status: u.status,
        balance: Number(u.wallet?.balance ?? 0),
      })),
    });
  });

const postBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust"),
    userId: z.string().min(1),
    amount: z.number().positive().max(1_000_000),
    direction: z.enum(["add", "deduct"]),
    reason: z.string().min(2).max(500).default("Mini admin adjust"),
  }),
  z.object({
    action: z.literal("ban"),
    userId: z.string().min(1),
  }),
  z.object({
    action: z.literal("unban"),
    userId: z.string().min(1),
  }),
]);

export const POST = (req: Request) =>
  handle(async () => {
    await requireMiniAdmin();
    const b = parse(postBody, await req.json().catch(() => null));

    if (b.action === "ban" || b.action === "unban") {
      const status = b.action === "ban" ? "SUSPENDED" : "ACTIVE";
      await db.user.update({ where: { id: b.userId }, data: { status } });
      if (b.action === "ban") {
        await db.session.deleteMany({ where: { userId: b.userId } });
      }
      return NextResponse.json({ ok: true, status });
    }

    const ref = `MINI-${b.direction.toUpperCase()}-${randomBytes(6).toString("hex")}`;
    const signed = b.direction === "add" ? b.amount : -b.amount;
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: b.userId },
        include: { wallet: true },
      });
      if (!user) throw new Error("NOT_FOUND");
      if (!user.wallet) await tx.wallet.create({ data: { userId: b.userId, balance: 0 } });
      return applyLedger(tx, {
        userId: b.userId,
        type: "ADJUSTMENT",
        amount: signed,
        reference: ref,
        description: `[MiniAdmin] ${b.reason}`,
      });
    });
    return NextResponse.json({
      ok: true,
      balanceAfter: Number(result.balanceAfter),
      reference: result.reference,
    });
  });
