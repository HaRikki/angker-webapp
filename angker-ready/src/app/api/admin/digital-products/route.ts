import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    await requireAdmin(["services.manage", "*"]);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const where: any = {};
    if (q) where.name = { contains: q, mode: "insensitive" };
    const items = await db.digitalProduct.findMany({
      where,
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { codes: true, orders: true } } },
    });
    return ok({
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        emoji: p.emoji,
        stock: p.stock,
        delivery: p.delivery,
        description: p.description,
        active: p.active,
        sort: p.sort,
        codesTotal: p._count.codes,
        ordersTotal: p._count.orders,
        createdAt: p.createdAt,
      })),
    });
  } catch (e) {
    return handleAdminError(e);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  emoji: z.string().max(8).optional(),
  stock: z.number().int().min(0).optional(),
  delivery: z.string().max(40).optional(),
  description: z.string().max(5000).optional(),
  active: z.boolean().optional(),
  sort: z.number().int().optional(),
  codes: z.string().max(100_000).optional(), // newline-separated inventory
});

export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input: " + body.error.message, 400);
    const d = body.data;
    const product = await db.$transaction(async (tx) => {
      const p = await tx.digitalProduct.create({
        data: {
          name: d.name,
          price: d.price,
          emoji: d.emoji || "💎",
          stock: d.stock ?? 0,
          delivery: d.delivery || "Instant",
          description: d.description || "",
          active: d.active ?? true,
          sort: d.sort ?? 0,
        },
      });
      const lines = (d.codes || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) {
        await tx.digitalCode.createMany({
          data: lines.map((code) => ({ productId: p.id, code })),
        });
        if ((d.stock ?? 0) === 0) {
          await tx.digitalProduct.update({
            where: { id: p.id },
            data: { stock: lines.length },
          });
        }
      }
      return p;
    });
    await audit({
      adminId: admin.id,
      action: "digital.create",
      entityType: "DigitalProduct",
      entityId: product.id,
      reason: product.name,
      result: "ok",
      cid: correlationId,
    });
    return ok({ id: product.id });
  } catch (e) {
    return handleAdminError(e);
  }
}

const patchSchema = createSchema.partial().extend({ id: z.string().min(1) });

export async function PATCH(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const body = patchSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const { id, codes, ...rest } = body.data;
    const data: any = {};
    for (const k of ["name", "price", "emoji", "stock", "delivery", "description", "active", "sort"] as const) {
      if ((rest as any)[k] !== undefined) data[k] = (rest as any)[k];
    }
    await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.digitalProduct.update({ where: { id }, data });
      }
      if (codes) {
        const lines = codes
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (lines.length) {
          await tx.digitalCode.createMany({
            data: lines.map((code) => ({ productId: id, code })),
          });
          await tx.digitalProduct.update({
            where: { id },
            data: { stock: { increment: lines.length } },
          });
        }
      }
    });
    await audit({
      adminId: admin.id,
      action: "digital.update",
      entityType: "DigitalProduct",
      entityId: id,
      reason: id,
      result: "ok",
      cid: correlationId,
    });
    return ok({ id });
  } catch (e) {
    return handleAdminError(e);
  }
}

export async function DELETE(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["services.manage", "*"]);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("id required", 400);
    await db.digitalProduct.delete({ where: { id } });
    await audit({
      adminId: admin.id,
      action: "digital.delete",
      entityType: "DigitalProduct",
      entityId: id,
      reason: id,
      result: "ok",
      cid: correlationId,
    });
    return ok({ id });
  } catch (e) {
    return handleAdminError(e);
  }
}
