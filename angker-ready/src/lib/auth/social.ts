import { db } from "@/lib/db";

/** Picks a free username (3-20 chars, letters/digits/_) for accounts created through Telegram / Google. */
export async function freeUsername(preferred: string | undefined, fallback: string) {
  const base = (preferred ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
  const candidates = base.length >= 3 ? [base, ...Array.from({ length: 4 }, () => `${base}${Math.floor(100 + Math.random() * 900)}`)] : [];
  for (const c of candidates) {
    const t = await db.user.findFirst({ where: { username: { equals: c, mode: "insensitive" } }, select: { id: true } });
    if (!t) return c;
  }
  return fallback.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
}
