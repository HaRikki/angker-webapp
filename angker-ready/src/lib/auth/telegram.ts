import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TgAuth = { id: string; first_name?: string; last_name?: string; username?: string; photo_url?: string; auth_date: string; hash: string };
const MAX_AGE_S = 86_400; // login data older than 24h is rejected (replay protection)

/** Verifies the payload of the Telegram Login Widget (https://core.telegram.org/widgets/login#checking-authorization). */
export function verifyTelegramAuth(raw: unknown, botToken: string): TgAuth | null {
  if (!raw || typeof raw !== "object" || !botToken) return null;
  const d: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v !== undefined && v !== null && typeof v !== "object") d[k] = String(v);
  const { hash } = d;
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !/^\d{1,20}$/.test(d.id ?? "") || !/^\d{1,12}$/.test(d.auth_date ?? "")) return null;
  const check = Object.keys(d).filter((k) => k !== "hash").sort().map((k) => `${k}=${d[k]}`).join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const calc = createHmac("sha256", secret).update(check).digest();
  const got = Buffer.from(hash, "hex");
  if (got.length !== calc.length || !timingSafeEqual(got, calc)) return null;
  const age = Date.now() / 1000 - Number(d.auth_date);
  if (age > MAX_AGE_S || age < -300) return null;
  return d as unknown as TgAuth;
}

/**
 * Verifies Telegram Mini App / WebApp initData
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the parsed user fields in the same shape as TgAuth when valid.
 */
export function verifyTelegramWebAppInitData(initData: string, botToken: string): TgAuth | null {
  if (!initData || typeof initData !== "string" || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;

    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== "hash") pairs.push(`${key}=${value}`);
    });
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    // WebApp uses HMAC-SHA256 with secret_key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const calc = createHmac("sha256", secretKey).update(dataCheckString).digest();
    const got = Buffer.from(hash, "hex");
    if (got.length !== calc.length || !timingSafeEqual(got, calc)) return null;

    const authDate = params.get("auth_date") ?? "";
    if (!/^\d{1,12}$/.test(authDate)) return null;
    const age = Date.now() / 1000 - Number(authDate);
    if (age > MAX_AGE_S || age < -300) return null;

    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id?: number | string; first_name?: string; last_name?: string; username?: string; photo_url?: string };
    const id = String(user.id ?? "");
    if (!/^\d{1,20}$/.test(id)) return null;

    return {
      id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
      auth_date: authDate,
      hash,
    };
  } catch {
    return null;
  }
}
