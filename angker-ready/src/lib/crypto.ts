import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
// PROVIDER_ENCRYPTION_KEY = 32 bytes, base64 (openssl rand -base64 32)
const key = () => {
  const k = Buffer.from(process.env.PROVIDER_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("PROVIDER_ENCRYPTION_KEY must be 32 bytes base64");
  return k;
};
export function encrypt(plain: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
export const maskKey = (k: string) => (k.length <= 8 ? "****" : `${k.slice(0, 3)}…${k.slice(-3)}`);
