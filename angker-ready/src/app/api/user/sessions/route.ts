import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

const COOKIE = "angker_session";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const GET = () => handle(async () => {
  const u = await requireUser();
  const currentToken = cookies().get(COOKIE)?.value;
  const currentHash = currentToken ? sha(currentToken) : null;
  const sessions = await db.session.findMany({
    where: { userId: u.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true, tokenHash: true },
  });
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.tokenHash === currentHash,
    })),
  });
});

/** Revoke one session or all others */
export const DELETE = (req: Request) => handle(async () => {
  const u = await requireUser();
  const body = await req.json().catch(() => ({})) as { sessionId?: string; allOthers?: boolean };
  const currentToken = cookies().get(COOKIE)?.value;
  const currentHash = currentToken ? sha(currentToken) : null;

  if (body.allOthers) {
    await db.session.deleteMany({
      where: {
        userId: u.id,
        ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}),
      },
    });
    return NextResponse.json({ ok: true, revoked: "others" });
  }

  if (body.sessionId) {
    // Never allow deleting current session this way — use logout
    const s = await db.session.findFirst({ where: { id: body.sessionId, userId: u.id } });
    if (!s) throw new Error("NOT_FOUND");
    if (s.tokenHash === currentHash) throw new Error("FORBIDDEN");
    await db.session.delete({ where: { id: s.id } });
    return NextResponse.json({ ok: true, revoked: body.sessionId });
  }

  throw new Error("INVALID_INPUT");
});
