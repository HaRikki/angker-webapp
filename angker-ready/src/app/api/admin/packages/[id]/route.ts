import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";

const updateSchema = z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), categoryId: z.string().nullable().optional(), serviceId: z.string().optional(), quantity: z.number().int().min(1).optional(), price: z.number().min(0).optional(), imageUrl: z.string().url().nullable().optional(), sort: z.number().int().optional(), active: z.boolean().optional(), archive: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = updateSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const existing = await db.package.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Not found", 404);
    if (body.data.serviceId) {
      const svc = await db.service.findUnique({ where: { id: body.data.serviceId } });
      if (!svc || svc.archivedAt) return fail("Linked service invalid", 400);
    }
    const { archive, ...rest } = body.data;
    await db.package.update({ where: { id: params.id }, data: { ...rest, ...(archive ? { archivedAt: new Date(), active: false } : {}) } });
    await audit({ adminId: admin.id, action: archive ? "package.archive" : "package.update", entityType: "Package", entityId: params.id, result: "ok", cid: correlationId });
    return ok({ updated: true });
  } catch (e) { return handleAdminError(e); }
}
