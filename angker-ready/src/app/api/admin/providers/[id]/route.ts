import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { encrypt, decrypt } from "@/lib/crypto";
import { SmmProvider } from "@/server/providers/smmAdapter";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(["providers.manage", "*"]);
    const p = await db.provider.findUnique({ where: { id: params.id }, include: { _count: { select: { mappings: true } } } });
    if (!p) return fail("Not found", 404);
    return ok({ id: p.id, name: p.name, baseUrl: p.baseUrl, enabled: p.enabled, priority: p.priority, isDefault: p.isDefault, lastSyncAt: p.lastSyncAt, importedServices: p._count.mappings });
  } catch (e) { return handleAdminError(e); }
}

const updateSchema = z.object({ name: z.string().min(1).max(100).optional(), baseUrl: z.string().url().optional(), apiKey: z.string().min(4).max(500).optional(), enabled: z.boolean().optional(), priority: z.number().int().optional(), isDefault: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["providers.manage", "*"]);
    const body = updateSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const data: any = { ...body.data }; delete data.apiKey;
    if (body.data.apiKey) data.apiKeyEnc = encrypt(body.data.apiKey);
    if (body.data.isDefault) await db.provider.updateMany({ data: { isDefault: false } });
    const p = await db.provider.update({ where: { id: params.id }, data });
    await audit({ adminId: admin.id, action: "provider.update", entityType: "Provider", entityId: p.id, result: "ok", cid: correlationId });
    return ok({ id: p.id });
  } catch (e) { return handleAdminError(e); }
}

const actionSchema = z.object({ action: z.enum(["test", "balance", "fetch_services", "disable", "enable", "remove"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["providers.manage", "*"]);
    const body = actionSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid action", 400);
    const p = await db.provider.findUnique({ where: { id: params.id } });
    if (!p) return fail("Not found", 404);
    if (body.data.action === "disable" || body.data.action === "enable") {
      await db.provider.update({ where: { id: p.id }, data: { enabled: body.data.action === "enable" } });
      await audit({ adminId: admin.id, action: `provider.${body.data.action}`, entityType: "Provider", entityId: p.id, result: "ok", cid: correlationId });
      return ok({ enabled: body.data.action === "enable" });
    }
    if (body.data.action === "remove") {
      const mappingCount = await db.providerServiceMapping.count({ where: { providerId: p.id } });
      if (mappingCount > 0) return fail(`Cannot remove: ${mappingCount} services linked. Disable or reassign first.`, 400);
      await db.provider.delete({ where: { id: p.id } });
      await audit({ adminId: admin.id, action: "provider.remove", entityType: "Provider", entityId: p.id, result: "ok", cid: correlationId });
      return ok({ removed: true });
    }
    let apiKey: string;
    try { apiKey = decrypt(p.apiKeyEnc); } catch { return fail("Cannot decrypt API key", 500); }
    const client = new SmmProvider(p.baseUrl, apiKey);
    if (body.data.action === "test" || body.data.action === "balance") {
      try {
        const bal = await client.balance();
        await audit({ adminId: admin.id, action: "provider.test", entityType: "Provider", entityId: p.id, result: "ok", cid: correlationId });
        return ok({ connected: true, balance: bal.balance, currency: bal.currency });
      } catch {
        await audit({ adminId: admin.id, action: "provider.test", entityType: "Provider", entityId: p.id, result: "error", reason: "connection failed", cid: correlationId });
        return fail("Connection failed or invalid API key", 400);
      }
    }
    if (body.data.action === "fetch_services") {
      try {
        const services = await client.services();
        await db.provider.update({ where: { id: p.id }, data: { lastSyncAt: new Date() } });
        await audit({ adminId: admin.id, action: "provider.fetch_services", entityType: "Provider", entityId: p.id, reason: `count=${services.length}`, result: "ok", cid: correlationId });
        return ok({ services: services.map(s => ({ providerServiceId: String(s.service), name: s.name, category: s.category, rate: s.rate, min: Number(s.min), max: Number(s.max), refill: !!s.refill, cancel: !!s.cancel })) });
      } catch { return fail("Failed to fetch services from provider", 400); }
    }
    return fail("Unknown action", 400);
  } catch (e) { return handleAdminError(e); }
}
