import { db } from "@/lib/db";
/** Atomic Postgres counter (works on serverless; in-memory would not). */
export async function hit(key: string, limit: number, windowSec: number) {
  const r = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit"(key, count, "resetAt") VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}::double precision))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit".count + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}::double precision) ELSE "RateLimit"."resetAt" END
    RETURNING count`;
  return r[0].count <= limit;
}
/** Behind Cloudflare, cf-connecting-ip is set by Cloudflare and cannot be spoofed by the client
 *  (the first X-Forwarded-For entry can), so it is preferred. */
export const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-real-ip")?.trim() ||
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
