import { requireAdmin } from "@/lib/auth/adminSession";
import { db } from "@/lib/db";
import { ok, handleAdminError } from "@/lib/adminApi";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));
    const action = url.searchParams.get("action");
    const where: any = {};
    if (action) where.action = { contains: action };
    const [total, items] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit }),
    ]);
    return ok({ items, page, limit, total, pages: Math.ceil(total/limit) });
  } catch (e) { return handleAdminError(e); }
}
