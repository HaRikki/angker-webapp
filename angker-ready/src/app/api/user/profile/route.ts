import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const u = await requireUser();
    const [wallet, orderCount] = await Promise.all([
      db.wallet.findUnique({ where: { userId: u.id } }),
      db.order.count({ where: { userId: u.id } }),
    ]);
    return NextResponse.json({
      id: u.id,
      username: u.username,
      email: u.email,
      telegramId: u.telegramId ?? null,
      balance: String(wallet?.balance ?? 0),
      totalOrders: orderCount,
      emailVerified: !!u.emailVerifiedAt,
      createdAt: u.createdAt,
      // nested shape for older clients
      profile: {
        id: u.id,
        username: u.username,
        email: u.email,
        emailVerified: !!u.emailVerifiedAt,
        createdAt: u.createdAt,
      },
    });
  });

const patch = z.object({
  currentPassword: z.string().max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const PATCH = (req: Request) =>
  handle(async () => {
    const u = await requireUser();
    const b = parse(patch, await req.json().catch(() => null));
    if (!(await verifyPassword(u.passwordHash, b.currentPassword))) throw new Error("FORBIDDEN");
    await db.$transaction([
      db.user.update({
        where: { id: u.id },
        data: { passwordHash: await hashPassword(b.newPassword) },
      }),
      db.session.deleteMany({ where: { userId: u.id } }),
    ]);
    return NextResponse.json({ ok: true });
  });
