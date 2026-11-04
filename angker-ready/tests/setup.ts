import { vi } from "vitest";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL to a dedicated, empty test database (see README).");
if (!/test/i.test(new URL(url).pathname)) throw new Error("Refusing to run: the TEST_DATABASE_URL database name must contain 'test' (tests TRUNCATE all tables).");
Object.assign(process.env, {
  DATABASE_URL: url, DIRECT_URL: url, APP_ENV: "test", SESSION_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000",
  TELEGRAM_BOT_TOKEN: "000:test-token", TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret", TELEGRAM_ADMIN_IDS: "111",
  PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});
// next/headers cookies() only exists inside a Next request: replace it with an in-memory jar.
vi.mock("next/headers", async () => {
  const { cookieJar: j } = await import("./jar");
  return { cookies: () => ({ get: (n: string) => (j.has(n) ? { value: j.get(n)! } : undefined), set: (n: string, v: string) => { j.set(n, v); }, delete: (n: string) => { j.delete(n); } }) };
});
