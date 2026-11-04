import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const rawToken = () => randomBytes(32).toString("base64url");

/** Create a password-reset token. Returns the raw token (show once to user / email). */
export async function createPasswordResetToken(userId: string, ttlMinutes = 30) {
  const token = rawToken();
  await db.passwordResetToken.create({
    data: {
      tokenHash: sha(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
  return token;
}

export async function consumePasswordResetToken(token: string) {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}

export async function createEmailVerifyToken(userId: string, ttlHours = 24) {
  const token = rawToken();
  await db.emailVerificationToken.create({
    data: {
      tokenHash: sha(token),
      userId,
      expiresAt: new Date(Date.now() + ttlHours * 3600_000),
    },
  });
  return token;
}

export async function consumeEmailVerifyToken(token: string) {
  const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: sha(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await db.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}
