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
    const where: Prisma.PackageWhereInput = { archivedAt: null };
    if (q) where.name = { contains: q, mode: "insensitive" };
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;
    const [total, items] = await Promise.all([
      db.package.count({ where }),
      db.package.findMany({ where, orderBy: [{ sort: "asc" }, { createdAt: "desc" }], skip: (page-1)*limit, take: limit, include: { service: { select: { id: true, name: true, num: true, active: true } }, category: { select: { id: true, name: true } } } }),
    ]);
    return ok({ items: items.map(p => ({ id: p.id, name: p.name, description: p.description, categoryId: p.categoryId, categoryName: p.category?.name ?? null, serviceId: p.serviceId, serviceName: p.service.name, serviceNum: p.service.num, quantity: p.quantity, price: Number(p.price), imageUrl: p.imageUrl, sort: p.sort, active: p.active })), page, limit, total, pages: Math.ceil(total/limit) });
  } catch (e) { return handleAdminError(e); }
}

const createSchema = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), categoryId: z.string().optional().nullable(), serviceId: z.string().min(1), quantity: z.number().int().min(1), price: z.number().min(0), imageUrl: z.string().url().optional().nullable(), sort: z.number().int().optional(), active: z.boolean().optional() });

export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const service = await db.service.findUnique({ where: { id: body.data.serviceId } });
    if (!service || service.archivedAt) return fail("Linked service not found or archived", 400);
    const pkg = await db.package.create({ data: { name: body.data.name, description: body.data.description ?? "", categoryId: body.data.categoryId || null, serviceId: body.data.serviceId, quantity: body.data.quantity, price: body.data.price, imageUrl: body.data.imageUrl || null, sort: body.data.sort ?? 0, active: body.data.active ?? true } });
    await audit({ adminId: admin.id, action: "package.create", entityType: "Package", entityId: pkg.id, reason: pkg.name, result: "ok", cid: correlationId });
    return ok({ id: pkg.id });
  } catch (e) { return handleAdminError(e); }
}
