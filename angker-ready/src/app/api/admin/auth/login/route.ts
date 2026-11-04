import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import { createAdminSession } from "@/lib/auth/adminSession";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { hit, clientIp } from "@/lib/rateLimit";

const schema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) });

export async function POST(req: NextRequest) {
  const correlationId = cid();
  try {
    const ip = clientIp(req);
    if (!(await hit(`admin-login:${ip}`, 10, 15 * 60))) return fail("Too many login attempts. Try again later.", 429);
    const body = schema.safeParse(await req.json());
    if (!body.success) return fail("Invalid credentials", 400);
    const admin = await db.admin.findFirst({
      where: { OR: [{ username: body.data.username }, { email: body.data.username }], active: true },
      include: { role: { include: { permissions: true } } },
    });
    if (!admin || !admin.passwordHash) {
      await dummyVerify(body.data.password);
      await audit({ action: "admin.login", entityType: "Admin", reason: `failed user=${body.data.username}`, result: "denied", cid: correlationId });
      return fail("Invalid credentials", 401);
    }
    if (!(await verifyPassword(admin.passwordHash, body.data.password))) {
      await audit({ adminId: admin.id, action: "admin.login", entityType: "Admin", entityId: admin.id, reason: "bad password", result: "denied", cid: correlationId });
      return fail("Invalid credentials", 401);
    }
    await createAdminSession(admin.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
    await audit({ adminId: admin.id, action: "admin.login", entityType: "Admin", entityId: admin.id, result: "ok", cid: correlationId });
    return ok({ id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role.name, permissions: admin.role.permissions.map(p => p.permission) });
  } catch (e) { return handleAdminError(e); }
}
