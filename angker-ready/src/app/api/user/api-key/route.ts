import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { cleanIps, newApiKey } from "@/lib/auth/apiKey";
import { hit } from "@/lib/rateLimit";
export const dynamic = "force-dynamic";

const view = (k: { prefix: string; enabled: boolean; ipWhitelist: string[]; lastUsedAt: Date | null; createdAt: Date } | null) =>
  k ? { prefix: k.prefix, enabled: k.enabled, ipWhitelist: k.ipWhitelist, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt } : null;

export const GET = () => handle(async () => {
  const u = await requireUser();
  return NextResponse.json({ key: view(await db.apiKey.findUnique({ where: { userId: u.id } })) });
});

/** Create or regenerate. Needs the account password; the plain key is returned exactly once. */
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  if (!(await hit(`apikey-gen:${u.id}`, 5, 900))) throw new Error("RATE_LIMITED");
  const b = parse(z.object({ password: z.string().min(1).max(128) }), await req.json().catch(() => null));
  if (!(await verifyPassword(u.passwordHash, b.password))) throw new Error("FORBIDDEN");
  const k = newApiKey();
  const row = await db.apiKey.upsert({ where: { userId: u.id },
    create: { userId: u.id, keyHash: k.keyHash, prefix: k.prefix }, update: { keyHash: k.keyHash, prefix: k.prefix, enabled: true, lastUsedAt: null } });
  return NextResponse.json({ apiKey: k.key, key: view(row) }, { status: 201 });
});

export const PATCH = (req: Request) => handle(async () => {
  const u = await requireUser();
  const b = parse(z.object({ enabled: z.boolean().optional(), ipWhitelist: z.array(z.string().max(64)).max(10).optional() }), await req.json().catch(() => null));
  const ips = b.ipWhitelist === undefined ? undefined : cleanIps(b.ipWhitelist);
  if (ips === null) throw new Error("INVALID_INPUT");
  const row = await db.apiKey.update({ where: { userId: u.id }, data: { ...(b.enabled === undefined ? {} : { enabled: b.enabled }), ...(ips === undefined ? {} : { ipWhitelist: ips }) } }).catch(() => null);
  if (!row) throw new Error("NOT_FOUND");
  return NextResponse.json({ key: view(row) });
});

export const DELETE = () => handle(async () => {
  const u = await requireUser();
  await db.apiKey.deleteMany({ where: { userId: u.id } });
  return NextResponse.json({ ok: true });
});
