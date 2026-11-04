import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { verifyTelegramAuth } from "@/lib/auth/telegram";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/telegram";
import { freeUsername } from "@/lib/auth/social";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

const json = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!token) return json("TELEGRAM_UNAVAILABLE", 503);
    if (!(await hit(`tglogin:ip:${clientIp(req)}`, 30, 900).catch(() => true))) return json("RATE_LIMITED", 429);
    const tg = verifyTelegramAuth(await req.json().catch(() => null), token);
    if (!tg) return json("TELEGRAM_INVALID", 401);

    let user = await db.user.findUnique({ where: { telegramId: tg.id } });
    if (user) {
      if (user.status !== "ACTIVE") return json("ACCOUNT_SUSPENDED", 403);
    } else {
      const reg = await db.siteSetting.findUnique({ where: { key: "registrationEnabled" } });
      if (reg && reg.value === false) return json("REGISTRATION_CLOSED", 403);
      const username = await freeUsername(tg.username, `tg_${tg.id}`);
      user = await db.user.create({ data: {
        username, email: `tg${tg.id}@telegram.invalid`, telegramId: tg.id, telegramChatId: tg.id,
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),   // random: password login is impossible until the user sets one
        wallet: { create: {} } } });
      const sent = await notifyAdmins(`👤 New user registered (Telegram)\nUsername: ${username}\nTelegram ID: ${tg.id}`).then(() => true, () => false);
      await db.outboxEvent.create({ data: { kind: "admin.new_user", payload: { userId: user.id }, processedAt: sent ? new Date() : null } }).catch(() => {});
    }
    await createSession(user.id, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json("SERVER_ERROR", 409);
    const { code, status } = classify(e);
    reportServerError("telegram-login", e, code);
    return json(code, status);
  }
}
