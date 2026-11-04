import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE = "angker_session";
/** Secure cookies only work over https. Decide from APP_URL so a site served over plain http
 *  (or APP_ENV=production without SSL) can still log in instead of silently dropping the cookie. */
const secureCookie = () => (process.env.APP_URL ?? "").startsWith("https://");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, remember: boolean) {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = (remember ? 30 : 1) * 86_400_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.session.create({ data: { tokenHash: sha(token), userId, expiresAt } });
  // Telegram WebApp (iframe / in-app browser) needs SameSite=None + Secure over HTTPS
  const secure = secureCookie();
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    expires: remember ? expiresAt : undefined,
  });
}
export async function getSessionUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE") return null;
  return s.user;
}
export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
export async function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha(token) } });
  cookies().delete(COOKIE);
}
