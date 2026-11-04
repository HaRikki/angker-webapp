import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";

const importSchema = z.object({ services: z.array(z.object({
  providerServiceId: z.string(), name: z.string(), category: z.string().optional(),
  rate: z.union([z.string(), z.number()]), min: z.number().int(), max: z.number().int(),
  sellPrice: z.number().min(0), categoryId: z.string().optional(), active: z.boolean().optional(),
})).min(1).max(200) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "providers.manage", "*"]);
    const provider = await db.provider.findUnique({ where: { id: params.id } });
    if (!provider) return fail("Provider not found", 404);
    const body = importSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    let created = 0, updated = 0, skipped = 0;
    for (const item of body.data.services) {
      const existing = await db.providerServiceMapping.findUnique({
        where: { providerId_providerServiceId: { providerId: provider.id, providerServiceId: item.providerServiceId } },
        include: { service: true },
      });
      let categoryId = item.categoryId;
      if (!categoryId && item.category) {
        const cat = await db.category.upsert({ where: { name: item.category }, update: {}, create: { name: item.category } });
        categoryId = cat.id;
      }
      if (!categoryId) {
        const first = await db.category.findFirst({ where: { archivedAt: null } });
        if (!first) { skipped++; continue; }
        categoryId = first.id;
      }
      const costPrice = Number(item.rate);
      if (existing) {
        await db.service.update({ where: { id: existing.serviceId }, data: { name: item.name, costPrice, sellPrice: item.sellPrice, minQty: item.min, maxQty: item.max, categoryId } });
        updated++;
      } else {
        await db.$transaction(async (tx) => {
          const s = await tx.service.create({ data: { name: item.name, categoryId: categoryId!, costPrice, sellPrice: item.sellPrice, minQty: item.min, maxQty: item.max, active: item.active ?? true } });
          await tx.providerServiceMapping.create({ data: { serviceId: s.id, providerId: provider.id, providerServiceId: item.providerServiceId } });
        });
        created++;
      }
    }
    await db.provider.update({ where: { id: provider.id }, data: { lastSyncAt: new Date() } });
    await audit({ adminId: admin.id, action: "provider.import_services", entityType: "Provider", entityId: provider.id, reason: `created=${created} updated=${updated} skipped=${skipped}`, result: "ok", cid: correlationId });
    return ok({ created, updated, skipped });
  } catch (e) { return handleAdminError(e); }
}
