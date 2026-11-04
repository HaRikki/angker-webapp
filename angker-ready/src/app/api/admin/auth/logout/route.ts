import { destroyAdminSession, getAdminSession } from "@/lib/auth/adminSession";
import { ok, handleAdminError, cid } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
export async function POST() {
  try {
    const admin = await getAdminSession();
    await destroyAdminSession();
    if (admin) await audit({ adminId: admin.id, action: "admin.logout", entityType: "Admin", entityId: admin.id, result: "ok", cid: cid() });
    return ok({ loggedOut: true });
  } catch (e) { return handleAdminError(e); }
}
