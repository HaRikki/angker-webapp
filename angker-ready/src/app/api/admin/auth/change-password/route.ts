import { z } from "zod";
import { requireAdmin } from "@/lib/auth/adminSession";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin();
    const body = schema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    if (!admin.passwordHash) return fail("Password not set", 400);
    if (!(await verifyPassword(admin.passwordHash, body.data.currentPassword))) return fail("Current password incorrect", 400);
    await db.admin.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(body.data.newPassword) } });
    await audit({ adminId: admin.id, action: "admin.change_password", entityType: "Admin", entityId: admin.id, result: "ok", cid: correlationId });
    return ok({ changed: true });
  } catch (e) { return handleAdminError(e); }
}
