import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { createPasswordResetToken } from "@/lib/auth/tokens";
import { hit, clientIp } from "@/lib/rateLimit";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

/** Always returns ok to avoid email enumeration. Token is stored; in production send via email. */
export async function POST(req: Request) {
  try {
    const allowed = await hit(`forgot:${clientIp(req)}`, 5, 900).catch(() => true);
    if (!allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

    const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    // Same response whether user exists or not
    if (user && user.status === "ACTIVE") {
      // Invalidate previous unused tokens for this user
      await db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const token = await createPasswordResetToken(user.id, 30);
      const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      // Best-effort: queue notification for admin/ops (no secrets beyond token URL which is single-use)
      await db.outboxEvent.create({
        data: {
          kind: "user.password_reset",
          payload: { userId: user.id, email: user.email, resetUrl },
        },
      }).catch(() => {});

      // In development, return the link so testing is possible without SMTP
      if (process.env.APP_ENV !== "production") {
        return NextResponse.json({ ok: true, resetUrl });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { code, status } = classify(e);
    reportServerError("forgot-password", e, code);
    return NextResponse.json({ error: code }, { status });
  }
}
