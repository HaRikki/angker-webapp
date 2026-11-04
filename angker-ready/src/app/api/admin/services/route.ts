import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requireAdmin(["services.manage", "*"]);
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));
    const q = url.searchParams.get("q")?.trim();
    const active = url.searchParams.get("active");
    const where: Prisma.ServiceWhereInput = { archivedAt: null };
    if (q) { where.OR = [{ name: { contains: q, mode: "insensitive" } }, { id: q }]; const num = Number(q); if (!isNaN(num)) where.OR.push({ num }); }
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;
    const [total, items, categories, providers] = await Promise.all([
      db.service.count({ where }),
      db.service.findMany({ where, orderBy: [{ active: "desc" }, { num: "asc" }], skip: (page-1)*limit, take: limit, include: { category: true, mapping: { include: { provider: { select: { id: true, name: true } } } } } }),
      db.category.findMany({ where: { archivedAt: null }, orderBy: { sort: "asc" } }),
      db.provider.findMany({ select: { id: true, name: true, enabled: true } }),
    ]);
    return ok({ items: items.map(s => ({ id: s.id, num: s.num, name: s.name, description: s.description, categoryId: s.categoryId, categoryName: s.category.name, providerId: s.mapping?.providerId ?? null, providerName: s.mapping?.provider.name ?? null, providerServiceId: s.mapping?.providerServiceId ?? null, costPrice: Number(s.costPrice), sellPrice: Number(s.sellPrice), minQty: s.minQty, maxQty: s.maxQty, active: s.active, refill: s.refill, cancel: s.cancel })), categories, providers, page, limit, total, pages: Math.ceil(total/limit) });
  } catch (e) { return handleAdminError(e); }
}

const createSchema = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), categoryId: z.string().min(1), providerId: z.string().optional(), providerServiceId: z.string().optional(), costPrice: z.number().min(0), sellPrice: z.number().min(0), minQty: z.number().int().min(1), maxQty: z.number().int().min(1), active: z.boolean().optional(), refill: z.boolean().optional(), cancel: z.boolean().optional() });

export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input: " + body.error.message, 400);
    if (body.data.maxQty < body.data.minQty) return fail("maxQty must be >= minQty", 400);
    const service = await db.$transaction(async (tx) => {
      const s = await tx.service.create({ data: { name: body.data.name, description: body.data.description ?? "", categoryId: body.data.categoryId, costPrice: body.data.costPrice, sellPrice: body.data.sellPrice, minQty: body.data.minQty, maxQty: body.data.maxQty, active: body.data.active ?? true, refill: body.data.refill ?? false, cancel: body.data.cancel ?? false } });
      if (body.data.providerId && body.data.providerServiceId) await tx.providerServiceMapping.create({ data: { serviceId: s.id, providerId: body.data.providerId, providerServiceId: body.data.providerServiceId } });
      return s;
    });
    await audit({ adminId: admin.id, action: "service.create", entityType: "Service", entityId: service.id, reason: service.name, result: "ok", cid: correlationId });
    return ok({ id: service.id, num: service.num });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) return fail("Provider service mapping already exists", 409);
    return handleAdminError(e);
  }
}
