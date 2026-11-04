import { createPublicKey, verify } from "node:crypto";

export type GoogleProfile = { sub: string; email: string; name?: string };
type Jwk = { kid: string; kty: string; n: string; e: string };
let keys: { at: number; list: Jwk[] } = { at: 0, list: [] };

async function googleKeys(force = false) {
  if (!force && keys.list.length && Date.now() - keys.at < 3_600_000) return keys.list;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("GOOGLE_KEYS_UNAVAILABLE");
  keys = { at: Date.now(), list: (await r.json()).keys ?? [] };
  return keys.list;
}
const b64 = (s: string) => Buffer.from(s, "base64url");

/** Verifies a Google Identity Services ID token (signature, issuer, audience, expiry, verified email). Returns null when invalid. */
export async function verifyGoogleIdToken(idToken: unknown, clientId: string): Promise<GoogleProfile | null> {
  if (typeof idToken !== "string" || !clientId || idToken.length > 4096) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64(parts[0]).toString()), payload = JSON.parse(b64(parts[1]).toString());
    if (header.alg !== "RS256") return null;
    let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), b64(parts[2]));
    if (!ok) return null;
    const now = Date.now() / 1000;
    if (payload.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) return null;
    if (!(payload.exp > now) || payload.iat > now + 300) return null;
    if (!payload.sub || !payload.email || payload.email_verified !== true) return null;
    return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: payload.name };
  } catch { return null; }
}
