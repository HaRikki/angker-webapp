import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { freeUsername } from "@/lib/auth/social";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/telegram";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

const json = (error: string, status: number) => NextResponse.json({ error }, { status });
const randomHash = async () => hashPassword(randomBytes(32).toString("hex"));

export async function POST(req: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    if (!clientId) return json("GOOGLE_UNAVAILABLE", 503);
    if (!(await hit(`googlelogin:ip:${clientIp(req)}`, 30, 900).catch(() => true))) return json("RATE_LIMITED", 429);
    const body = await req.json().catch(() => null);
    const g = await verifyGoogleIdToken(body?.credential, clientId);
    if (!g) return json("GOOGLE_INVALID", 401);

    let user = await db.user.findUnique({ where: { googleId: g.sub } });
    if (!user) {
      const byEmail = await db.user.findUnique({ where: { email: g.email } });
      if (byEmail) {
        // Same (Google-verified) email: link the accounts. If the site never verified that email, someone else may have
        // registered it first, so their password is rotated and their sessions ended before Google takes over the account.
        const unverified = !byEmail.emailVerifiedAt;
        if (unverified) await db.session.deleteMany({ where: { userId: byEmail.id } });
        user = await db.user.update({ where: { id: byEmail.id }, data: { googleId: g.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), ...(unverified ? { passwordHash: await randomHash() } : {}) } });
      }
    }
    if (user) {
      if (user.status !== "ACTIVE") return json("ACCOUNT_SUSPENDED", 403);
    } else {
      const reg = await db.siteSetting.findUnique({ where: { key: "registrationEnabled" } });
      if (reg && reg.value === false) return json("REGISTRATION_CLOSED", 403);
      const username = await freeUsername(g.email.split("@")[0], `g_${g.sub}`);
      user = await db.user.create({ data: { username, email: g.email, googleId: g.sub, emailVerifiedAt: new Date(), passwordHash: await randomHash(), wallet: { create: {} } } });
      const sent = await notifyAdmins(`👤 New user registered (Google)\nUsername: ${username}\nEmail: ${g.email}`).then(() => true, () => false);
      await db.outboxEvent.create({ data: { kind: "admin.new_user", payload: { userId: user.id }, processedAt: sent ? new Date() : null } }).catch(() => {});
    }
    await createSession(user.id, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json("SERVER_ERROR", 409);
    const { code, status } = classify(e);
    reportServerError("google-login", e, code);
    return json(code, status);
  }
}
