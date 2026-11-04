import { getAdminSession } from "@/lib/auth/adminSession";
import { ok, fail, handleAdminError } from "@/lib/adminApi";
export async function GET() {
  try {
    const admin = await getAdminSession();
    if (!admin) return fail("Unauthorized", 401);
    return ok({ id: admin.id, username: admin.username, email: admin.email, displayName: admin.displayName, role: admin.role.name, permissions: admin.role.permissions.map(p => p.permission), lastLoginAt: admin.lastLoginAt });
  } catch (e) { return handleAdminError(e); }
}
