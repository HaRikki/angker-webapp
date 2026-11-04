import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { consumePasswordResetToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { hit, clientIp } from "@/lib/rateLimit";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const allowed = await hit(`reset:${clientIp(req)}`, 10, 900).catch(() => true);
    if (!allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

    const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const userId = await consumePasswordResetToken(parsed.data.token);
    if (!userId) return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });

    const passwordHash = await hashPassword(parsed.data.password);
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Force re-login everywhere
      db.session.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { code, status } = classify(e);
    reportServerError("reset-password", e, code);
    return NextResponse.json({ error: code }, { status });
  }
}
