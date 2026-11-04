import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { applyLedger } from "@/server/wallet/ledger";
import { createSession } from "@/lib/auth/session";

import { cookieJar } from "./jar";
export { cookieJar };
export async function resetDb() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  cookieJar.clear();
}
export async function mkUser(balance = 0, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const id = randomUUID().slice(0, 8);
  const u = await db.user.create({ data: { username: `u_${id}`, email: `u_${id}@t.test`, passwordHash: "x", status, wallet: { create: {} } } });
  if (balance > 0) await db.$transaction((tx) => applyLedger(tx, { userId: u.id, type: "DEPOSIT", amount: balance, reference: `seed-${u.id}` }));
  return u;
}
export async function mkService(over: Record<string, unknown> = {}) {
  const cat = await db.category.upsert({ where: { name: "TikTok" }, update: {}, create: { name: "TikTok" } });
  return db.service.create({ data: { categoryId: cat.id, name: "Test service", minQty: 100, maxQty: 10000, costPrice: "0.5", sellPrice: "1", active: true, ...over } });
}
export async function mkMapped(serviceId: string) {
  const p = await db.provider.create({ data: { name: `p_${randomUUID().slice(0, 6)}`, baseUrl: "https://p.test/api", apiKeyEnc: "x" } });
  await db.providerServiceMapping.create({ data: { serviceId, providerId: p.id, providerServiceId: "1" } });
  return p;
}
export const balanceOf = async (userId: string) => Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance);
export const ledgerSum = async (userId: string) => Number((await db.walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount ?? 0);
export const loginAs = async (userId: string) => { cookieJar.clear(); await createSession(userId, false); };
export const req = (url: string, body?: unknown, method = body === undefined ? "GET" : "POST", ip = randomUUID()) =>
  new Request(`http://t${url}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: body === undefined ? undefined : JSON.stringify(body) });
