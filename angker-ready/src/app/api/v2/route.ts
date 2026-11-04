import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hit } from "@/lib/rateLimit";
import { isMaintenance } from "@/lib/settings";
import { createOrder } from "@/server/orders/createOrder";
import { ApiAuthError, authenticateApiKey } from "@/lib/auth/apiKey";
export const dynamic = "force-dynamic";

/** Reseller API, same shape as the common SMM-panel "v2" API: POST key + action (+ params).
 *  actions: services · add · status (order | orders) · balance · refill · cancel */
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const STATUS: Record<string, string> = { PENDING: "Pending", PROCESSING: "Processing", IN_PROGRESS: "In progress", COMPLETED: "Completed", PARTIAL: "Partial", CANCELLED: "Canceled", FAILED: "Canceled" };
const link = z.string().trim().min(3).max(300).refine((v) => /^@?[A-Za-z0-9._]{2,64}$/.test(v) || /^https?:\/\/[^\s]+$/i.test(v));
const fmt = (d: { toFixed(n: number): string }) => d.toFixed(4);

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) { const j = await req.json().catch(() => null); return j && typeof j === "object" ? (j as Record<string, unknown>) : {}; }
  const f = await req.formData().catch(() => null);
  const out: Record<string, unknown> = {};
  f?.forEach((v, k) => { if (typeof v === "string") out[k] = v; });
  return out;
}

export const GET = () => err("Use POST with key and action", 405);

export async function POST(req: Request) {
  try {
    const b = await readBody(req);
    const { userId, keyId } = await authenticateApiKey(req, b.key);
    switch (String(b.action ?? "")) {
      case "services": {
        const rows = await db.service.findMany({ where: { active: true, archivedAt: null, category: { active: true } }, orderBy: { num: "asc" },
          select: { num: true, name: true, minQty: true, maxQty: true, sellPrice: true, category: { select: { name: true } } } });
        return NextResponse.json(rows.map((s) => ({ service: s.num, name: s.name, type: "Default", category: s.category.name,
          rate: fmt(s.sellPrice), min: String(s.minQty), max: String(s.maxQty), refill: false, cancel: false })));
      }
      case "balance": {
        const w = await db.wallet.findUnique({ where: { userId } });
        return NextResponse.json({ balance: fmt(w?.balance ?? { toFixed: () => "0.0000" }), currency: "USD" });
      }
      case "add": {
        if (await isMaintenance()) return err("Service is under maintenance", 503);
        if (!(await hit(`api-add:${keyId}`, 30, 60))) return err("Too many orders, slow down", 429);
        const num = Number(b.service), qty = Number(b.quantity), target = link.safeParse(b.link);
        if (!Number.isInteger(num) || num < 1) return err("Incorrect service ID");
        if (!target.success) return err("Incorrect link");
        if (!Number.isInteger(qty) || qty < 1 || qty > 100_000_000) return err("Incorrect quantity");
        const svc = await db.service.findUnique({ where: { num }, select: { id: true } });
        if (!svc) return err("Incorrect service ID");
        const o = await createOrder({ userId, serviceId: svc.id, target: target.data, quantity: qty, idemKey: `api:${randomUUID()}` });
        return NextResponse.json({ order: o.num });
      }
      case "status": {
        const raw = b.orders ?? b.order;
        const ids = [...new Set(String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
        if (!ids.length) return err("Incorrect order ID");
        if (ids.length > 100) return err("Too many orders (max 100)");
        const nums = ids.map((s) => (/^\d{1,9}$/.test(s) ? Number(s) : NaN));
        const rows = await db.order.findMany({ where: { userId, num: { in: nums.filter((n) => !Number.isNaN(n)) } }, select: { num: true, sellPrice: true, status: true, currency: true } });
        const one = (n: number) => {
          const o = rows.find((r) => r.num === n);
          return o ? { charge: fmt(o.sellPrice), start_count: "0", status: STATUS[o.status] ?? "Processing", remains: "0", currency: o.currency } : { error: "Incorrect order ID" };
        };
        if (b.orders === undefined) { const n = nums[0]; return Number.isNaN(n) ? err("Incorrect order ID") : NextResponse.json(one(n)); }
        return NextResponse.json(Object.fromEntries(ids.map((id, i) => [id, Number.isNaN(nums[i]) ? { error: "Incorrect order ID" } : one(nums[i])])));
      }
      case "refill": case "cancel": return err("Not supported", 400);
      default: return err("Incorrect action");
    }
  } catch (e) {
    if (e instanceof ApiAuthError) return err(e.message, e.status);
    const m = e instanceof Error ? e.message : "";
    const known: Record<string, [string, number]> = { INSUFFICIENT_BALANCE: ["Not enough funds on balance", 402], SERVICE_UNAVAILABLE: ["Service is not available", 400],
      INVALID_QUANTITY: ["Quantity is out of the allowed range for this service", 400], FORBIDDEN: ["Forbidden", 403] };
    if (known[m]) return err(known[m][0], known[m][1]);
    const cid = randomUUID(); console.error("[api/v2]", cid, e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Internal error", correlationId: cid }, { status: 500 });
  }
}
