import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getProvider } from "./registry";

/** Preview: counts only, writes nothing. */
export async function previewSync(providerId: string) {
  const { client } = await getProvider(providerId);
  const remote = await client.services();
  const existing = await db.providerServiceMapping.findMany({ where: { providerId }, select: { providerServiceId: true } });
  const have = new Set(existing.map((e) => e.providerServiceId));
  return { found: remote.length, new: remote.filter((r) => !have.has(r.service)).length, existing: remote.filter((r) => have.has(r.service)).length };
}

/** Idempotent: keyed by (providerId, providerServiceId). Existing services keep their sellPrice/name/active.
 *  New services start DISABLED with sellPrice = cost * (1 + markup) so nothing goes live unreviewed. */
export async function syncServices(providerId: string, markup = 0.2) {
  const { client } = await getProvider(providerId);
  const remote = await client.services();
  let created = 0, updated = 0;
  for (const r of remote) {
    const cost = new Prisma.Decimal(r.rate);
    const map = await db.providerServiceMapping.findUnique({ where: { providerId_providerServiceId: { providerId, providerServiceId: r.service } } });
    if (map) {
      await db.service.update({ where: { id: map.serviceId }, data: { costPrice: cost, minQty: Number(r.min), maxQty: Number(r.max), refill: !!r.refill, cancel: !!r.cancel } });
      await db.providerServiceMapping.update({ where: { id: map.id }, data: { lastSyncAt: new Date() } });
      updated++;
    } else {
      const cat = await db.category.upsert({ where: { name: r.category }, update: {}, create: { name: r.category, active: false } });
      await db.service.create({ data: {
        categoryId: cat.id, name: r.name, minQty: Number(r.min), maxQty: Number(r.max), costPrice: cost,
        sellPrice: cost.mul(1 + markup).toDecimalPlaces(6), refill: !!r.refill, cancel: !!r.cancel, active: false,
        mapping: { create: { providerId, providerServiceId: r.service, lastSyncAt: new Date() } } } });
      created++;
    }
  }
  await db.provider.update({ where: { id: providerId }, data: { lastSyncAt: new Date() } });
  return { created, updated };
}
