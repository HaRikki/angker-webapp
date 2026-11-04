import { db } from "@/lib/db";
export type AdminCtx = { telegramId: string; perms: Set<string> };
const envIds = () => new Set((process.env.TELEGRAM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

/** Telegram user ID only (never username). DB row wins; env IDs are always Owners, even if the database
 *  is unreachable, so the admin can still open the bot and see what is wrong. Everybody else: null (no reply). */
export async function loadAdmin(tid: string): Promise<AdminCtx | null> {
  const a = await db.admin.findUnique({ where: { telegramId: tid }, include: { role: { include: { permissions: true } } } }).catch(() => null);
  if (a) return a.active ? { telegramId: tid, perms: new Set(a.role.permissions.map((p) => p.permission)) } : null;
  return envIds().has(tid) ? { telegramId: tid, perms: new Set(["*"]) } : null;
}
export const can = (a: AdminCtx, perm: string) => a.perms.has("*") || a.perms.has(perm);
