import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Admin, AdminRole, AdminPermission } from "@prisma/client";

const COOKIE = "angker_admin_session";
const secureCookie = () => (process.env.APP_URL ?? "").startsWith("https://");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type AdminWithRole = Admin & {
  role: AdminRole & { permissions: AdminPermission[] };
};

export async function createAdminSession(adminId: string, meta?: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.adminSession.create({
    data: { tokenHash: sha(token), adminId, expiresAt, ip: meta?.ip, userAgent: meta?.userAgent },
  });
  cookies().set(COOKIE, token, {
    httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", expires: expiresAt,
  });
  await db.admin.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } });
  return token;
}

export async function getAdminSession(): Promise<AdminWithRole | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.adminSession.findUnique({
    where: { tokenHash: sha(token) },
    include: { admin: { include: { role: { include: { permissions: true } } } } },
  });
  if (!s || s.expiresAt < new Date() || !s.admin.active) return null;
  return s.admin;
}

export async function requireAdmin(permission?: string | string[]): Promise<AdminWithRole> {
  const admin = await getAdminSession();
  if (!admin) throw new Error("ADMIN_UNAUTHENTICATED");
  if (permission) {
    const needed = Array.isArray(permission) ? permission : [permission];
    const perms = admin.role.permissions.map((p) => p.permission);
    const isOwner = perms.includes("*") || admin.role.name === "OWNER";
    if (!isOwner && !needed.some((n) => perms.includes(n))) throw new Error("ADMIN_FORBIDDEN");
  }
  return admin;
}

export async function destroyAdminSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await db.adminSession.deleteMany({ where: { tokenHash: sha(token) } });
  cookies().delete(COOKIE);
}

export function hasPermission(admin: AdminWithRole, permission: string) {
  const perms = admin.role.permissions.map((p) => p.permission);
  return perms.includes("*") || admin.role.name === "OWNER" || perms.includes(permission);
}
