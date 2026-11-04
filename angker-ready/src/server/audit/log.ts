import { db } from "@/lib/db";
export const audit = (a: {
  adminTelegramId?: string | null;
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  result: "ok" | "denied" | "error";
  cid: string;
}) =>
  db.auditLog.create({
    data: {
      adminTelegramId: a.adminTelegramId ?? null,
      adminId: a.adminId ?? null,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      reason: a.reason,
      result: a.result,
      correlationId: a.cid,
    },
  });
