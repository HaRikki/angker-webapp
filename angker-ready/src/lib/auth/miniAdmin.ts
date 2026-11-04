import { getSessionUser } from "@/lib/auth/session";

const ADMIN_TG_IDS = new Set(
  (process.env.TELEGRAM_ADMIN_IDS || "8325492974")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);

export async function requireMiniAdmin() {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  const tg = String(u.telegramId || "").trim();
  if (!ADMIN_TG_IDS.has(tg)) throw new Error("FORBIDDEN");
  return u;
}

export function isMiniAdminId(telegramId: string | null | undefined) {
  return ADMIN_TG_IDS.has(String(telegramId || "").trim());
}
