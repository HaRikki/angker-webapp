import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifyAdmins } from "@/lib/telegram";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

const json = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  try {
    const parsed = registerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json("INVALID_INPUT", 400, { fields: Array.from(new Set(parsed.error.issues.map((i) => i.path[0]))) });
    // rate limiting must never be able to break registration (e.g. table missing): fail open
    const allowed = await hit(`reg:${clientIp(req)}`, 20, 3600).catch(() => true);
    if (!allowed) return json("RATE_LIMITED", 429);
    const reg = await db.siteSetting.findUnique({ where: { key: "registrationEnabled" } });
    if (reg && reg.value === false) return json("REGISTRATION_CLOSED", 403);

    const { username, email, password } = parsed.data;
    const taken = await db.user.findFirst({ where: { OR: [{ email }, { username: { equals: username, mode: "insensitive" } }] }, select: { id: true } });
    if (taken) return json("ACCOUNT_EXISTS", 409);

    const user = await db.user.create({ data: { username, email, passwordHash: await hashPassword(password), wallet: { create: {} } } });
    await createSession(user.id, false);
    // Tell the admin right away (best effort); the outbox row is the fallback when the scheduler runs.
    const sent = await notifyAdmins(`👤 New user registered\nUsername: ${username}\nEmail: ${email}`).then(() => true, () => false);
    await db.outboxEvent.create({ data: { kind: "admin.new_user", payload: { userId: user.id }, processedAt: sent ? new Date() : null } }).catch(() => {});
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json("ACCOUNT_EXISTS", 409);
    const { code, status } = classify(e);
    reportServerError("register", e, code);
    return json(code, status);
  }
}
