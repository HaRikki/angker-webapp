import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import { clientIp, hit } from "@/lib/rateLimit";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** 192 bits of randomness: "ak_" + 48 hex chars. Hashing with plain SHA-256 is safe for high-entropy secrets. */
export function newApiKey() {
  const key = `ak_${randomBytes(24).toString("hex")}`;
  return { key, keyHash: sha(key), prefix: key.slice(0, 11) };
}
export const MAX_IPS = 10;
/** Returns a cleaned list, or null if any entry is not a valid IPv4/IPv6 address. */
export function cleanIps(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out = [...new Set(input.map((v) => String(v).trim()).filter(Boolean))];
  if (out.length > MAX_IPS || out.some((ip) => !isIP(ip))) return null;
  return out;
}

export type ApiAuth = { keyId: string; userId: string };
export class ApiAuthError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Validates the key, the owner, the IP allow-list and the rate limits. Throws ApiAuthError. */
export async function authenticateApiKey(req: Request, key: unknown): Promise<ApiAuth> {
  const ip = clientIp(req);
  if (!(await hit(`apikey-ip:${ip}`, 120, 60))) throw new ApiAuthError(429, "Too many requests");
  if (typeof key !== "string" || !/^ak_[0-9a-f]{48}$/.test(key)) throw new ApiAuthError(401, "Incorrect API key");
  const row = await db.apiKey.findUnique({ where: { keyHash: sha(key) }, include: { user: { select: { id: true, status: true } } } });
  if (!row || row.user.status !== "ACTIVE") throw new ApiAuthError(401, "Incorrect API key");
  if (!row.enabled) throw new ApiAuthError(403, "API key is disabled");
  if (row.ipWhitelist.length && !row.ipWhitelist.includes(ip)) throw new ApiAuthError(403, "IP address is not allowed for this API key");
  if (!(await hit(`apikey:${row.id}`, 120, 60))) throw new ApiAuthError(429, "Too many requests");
  // best-effort, at most one write per minute
  db.apiKey.updateMany({ where: { id: row.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { keyId: row.id, userId: row.user.id };
}
