import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// scrypt is built into Node.js: no native module to compile, so it works on every host
// (Vercel, Railway, Render, VPS, Docker/Alpine …). Format: scrypt$N$r$p$salt$hash
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const derive = (pw: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const h = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${h.toString("base64")}`;
}
export async function verifyPassword(hash: string, password: string) {
  try {
    const [alg, n, r, p, salt, key] = hash.split("$");
    if (alg !== "scrypt" || !salt || !key) return false;
    const expected = Buffer.from(key, "base64");
    const got = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch { return false; }
}
let dummy: Promise<string> | undefined;
/** Used when the user doesn't exist so response time doesn't reveal it. */
export const dummyVerify = async (p: string) => { const d = (dummy ??= hashPassword("dummy-password-x")); await verifyPassword(await d, p); };
