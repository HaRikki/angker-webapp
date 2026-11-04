import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(["services.manage", "*"]);
    const s = await db.service.findUnique({ where: { id: params.id }, include: { category: true, mapping: { include: { provider: true } } } });
    if (!s) return fail("Not found", 404);
    return ok({ ...s, costPrice: Number(s.costPrice), sellPrice: Number(s.sellPrice) });
  } catch (e) { return handleAdminError(e); }
}

const updateSchema = z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), categoryId: z.string().optional(), costPrice: z.number().min(0).optional(), sellPrice: z.number().min(0).optional(), minQty: z.number().int().min(1).optional(), maxQty: z.number().int().min(1).optional(), active: z.boolean().optional(), refill: z.boolean().optional(), cancel: z.boolean().optional(), providerId: z.string().nullable().optional(), providerServiceId: z.string().nullable().optional(), archive: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = updateSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const existing = await db.service.findUnique({ where: { id: params.id }, include: { mapping: true } });
    if (!existing) return fail("Not found", 404);
    const { providerId, providerServiceId, archive, ...rest } = body.data;
    await db.$transaction(async (tx) => {
      await tx.service.update({ where: { id: params.id }, data: { ...rest, ...(archive ? { archivedAt: new Date(), active: false } : {}) } });
      if (providerId !== undefined) {
        if (providerId && providerServiceId) {
          if (existing.mapping) await tx.providerServiceMapping.update({ where: { serviceId: params.id }, data: { providerId, providerServiceId } });
          else await tx.providerServiceMapping.create({ data: { serviceId: params.id, providerId, providerServiceId } });
        } else if (providerId === null && existing.mapping) await tx.providerServiceMapping.delete({ where: { serviceId: params.id } });
      }
    });
    await audit({ adminId: admin.id, action: archive ? "service.archive" : "service.update", entityType: "Service", entityId: params.id, result: "ok", cid: correlationId });
    return ok({ updated: true });
  } catch (e) { return handleAdminError(e); }
}
