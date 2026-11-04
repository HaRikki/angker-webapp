import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, fail, cid, handleAdminError } from "@/lib/adminApi";
import { audit } from "@/server/audit/log";
import { encrypt, maskKey } from "@/lib/crypto";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin(["providers.manage", "*"]);
    const providers = await db.provider.findMany({ orderBy: { priority: "desc" }, include: { _count: { select: { mappings: true } } } });
    return ok({ items: providers.map(p => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, enabled: p.enabled, priority: p.priority, isDefault: p.isDefault, lastSyncAt: p.lastSyncAt, importedServices: p._count.mappings })) });
  } catch (e) { return handleAdminError(e); }
}

const createSchema = z.object({ name: z.string().min(1).max(100), baseUrl: z.string().url(), apiKey: z.string().min(4).max(500), enabled: z.boolean().optional(), priority: z.number().int().optional() });

export async function POST(req: Request) {
  const correlationId = cid();
  try {
    const admin = await requireAdmin(["providers.manage", "*"]);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return fail("Invalid input", 400);
    const p = await db.provider.create({ data: { name: body.data.name, baseUrl: body.data.baseUrl, apiKeyEnc: encrypt(body.data.apiKey), enabled: body.data.enabled ?? true, priority: body.data.priority ?? 0 } });
    await audit({ adminId: admin.id, action: "provider.create", entityType: "Provider", entityId: p.id, reason: body.data.name, result: "ok", cid: correlationId });
    return ok({ id: p.id, name: p.name });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) return fail("Provider name already exists", 409);
    return handleAdminError(e);
  }
}
