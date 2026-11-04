import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { hit, clientIp } from "@/lib/rateLimit";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

const fail = () => NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
export async function POST(req: Request) {
  try {
    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const identifier = parsed.data.identifier.trim(), { password, remember } = parsed.data;
    const id = identifier.toLowerCase();
    const ok = (await hit(`login:ip:${clientIp(req)}`, 30, 900).catch(() => true)) && (await hit(`login:id:${id}`, 8, 900).catch(() => true));
    if (!ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

    const user = await db.user.findFirst({ where: { OR: [{ email: id }, { username: { equals: identifier, mode: "insensitive" } }] } });
    if (!user) { await dummyVerify(password); return fail(); }
    if (!(await verifyPassword(user.passwordHash, password))) return fail();
    if (user.status !== "ACTIVE") return NextResponse.json({ error: "ACCOUNT_SUSPENDED" }, { status: 403 });
    await createSession(user.id, remember);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { code, status } = classify(e);
    reportServerError("login", e, code);
    return NextResponse.json({ error: code }, { status });
  }
}
