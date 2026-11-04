import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { verifyTelegramWebAppInitData } from "@/lib/auth/telegram";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/telegram";
import { freeUsername } from "@/lib/auth/social";
import { classify, reportServerError } from "@/lib/dbError";

export const dynamic = "force-dynamic";

const json = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Telegram Mini App (WebApp) authentication via initData. Auto-creates user if needed. */
export async function POST(req: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!token) return json("TELEGRAM_UNAVAILABLE", 503);
    if (!(await hit(`tgwebapp:ip:${clientIp(req)}`, 60, 900).catch(() => true))) return json("RATE_LIMITED", 429);

    const body = await req.json().catch(() => null) as { initData?: string } | null;
    const initData = typeof body?.initData === "string" ? body.initData : "";
    const tg = verifyTelegramWebAppInitData(initData, token);
    if (!tg) return json("TELEGRAM_INVALID", 401);

    let user = await db.user.findUnique({ where: { telegramId: tg.id } });
    if (user) {
      if (user.status !== "ACTIVE") return json("ACCOUNT_SUSPENDED", 403);
      // keep telegramChatId in sync for notifications
      if (!user.telegramChatId) {
        await db.user.update({ where: { id: user.id }, data: { telegramChatId: tg.id } }).catch(() => {});
      }
    } else {
      const reg = await db.siteSetting.findUnique({ where: { key: "registrationEnabled" } });
      if (reg && reg.value === false) return json("REGISTRATION_CLOSED", 403);
      const username = await freeUsername(tg.username, `tg_${tg.id}`);
      user = await db.user.create({
        data: {
          username,
          email: `tg${tg.id}@telegram.invalid`,
          telegramId: tg.id,
          telegramChatId: tg.id,
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
          wallet: { create: {} },
        },
      });
      const sent = await notifyAdmins(`👤 New Mini App user\nUsername: ${username}\nTelegram ID: ${tg.id}`).then(() => true, () => false);
      await db.outboxEvent.create({ data: { kind: "admin.new_user", payload: { userId: user.id }, processedAt: sent ? new Date() : null } }).catch(() => {});
    }

    await createSession(user.id, true);
    return NextResponse.json({ ok: true, username: user.username });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json("SERVER_ERROR", 409);
    const { code, status } = classify(e);
    reportServerError("webapp-login", e, code);
    return json(code, status);
  }
}

/** Check whether the current browser already has a session (used by WebApp bootstrap). */
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, username: user.username });
}
