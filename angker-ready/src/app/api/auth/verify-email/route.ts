import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeEmailVerifyToken } from "@/lib/auth/tokens";
import { z } from "zod";
import { classify, reportServerError } from "@/lib/dbError";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = z.object({ token: z.string().min(20).max(200) }).safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const userId = await consumeEmailVerifyToken(body.data.token);
    if (!userId) return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });

    await db.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { code, status } = classify(e);
    reportServerError("verify-email", e, code);
    return NextResponse.json({ error: code }, { status });
  }
}

/** GET for link clicks from email */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (token.length < 20) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    const userId = await consumeEmailVerifyToken(token);
    if (!userId) return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return NextResponse.redirect(new URL("/?verified=1", process.env.APP_URL || "http://localhost:3000"));
  } catch (e) {
    const { code, status } = classify(e);
    return NextResponse.json({ error: code }, { status });
  }
}
