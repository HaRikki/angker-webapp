import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { createEmailVerifyToken } from "@/lib/auth/tokens";
import { hit } from "@/lib/rateLimit";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const u = await requireUser();
    if (u.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

    if (!(await hit(`verify-req:${u.id}`, 3, 3600).catch(() => true))) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    await db.emailVerificationToken.updateMany({
      where: { userId: u.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = await createEmailVerifyToken(u.id, 24);
    const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const verifyUrl = `${appUrl}/verify-email?token=${token}`;

    await db.outboxEvent.create({
      data: { kind: "user.email_verify", payload: { userId: u.id, email: u.email, verifyUrl } },
    }).catch(() => {});

    if (process.env.APP_ENV !== "production") {
      return NextResponse.json({ ok: true, verifyUrl });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const { code, status } = classify(e);
    reportServerError("request-verify", e, code);
    return NextResponse.json({ error: code }, { status });
  }
}
