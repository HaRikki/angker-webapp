import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/telegram", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined), tgCall: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/server/providers/registry", () => ({ getProvider: vi.fn() }));
import { db } from "@/lib/db";
import { getProvider } from "@/server/providers/registry";
import { createOrder, refundOrder } from "@/server/orders/createOrder";
import { submitOrder } from "@/server/orders/submitOrder";
import { syncOrderStatuses } from "@/server/orders/syncStatus";
import { applyLedger } from "@/server/wallet/ledger";
import { balanceOf, ledgerSum, mkMapped, mkService, mkUser, resetDb } from "./helpers";

const useClient = (client: object) => vi.mocked(getProvider).mockResolvedValue({ row: {} as never, client: client as never });
const input = (userId: string, serviceId: string, o: Record<string, unknown> = {}) => ({ userId, serviceId, target: "https://t.test/x", quantity: 1000, idemKey: randomUUID(), ...o });
beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });

describe("order creation", () => {
  it("computes the price on the server, snapshots cost, debits once, queues submission", async () => {
    const u = await mkUser(10), s = await mkService();
    const o = await createOrder(input(u.id, s.id));
    expect(Number(o.sellPrice)).toBe(1); expect(Number(o.providerCost)).toBe(0.5); expect(o.serviceName).toBe("Test service");
    expect(await balanceOf(u.id)).toBe(9);
    expect(await db.walletTransaction.count({ where: { userId: u.id, type: "ORDER_DEBIT" } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { kind: "order.submit" } })).toBe(1);
  });
  it("insufficient balance: no order, no ledger row, idempotency key not burned", async () => {
    const u = await mkUser(0.5), s = await mkService(), key = randomUUID();
    await expect(createOrder(input(u.id, s.id, { idemKey: key }))).rejects.toThrow("INSUFFICIENT_BALANCE");
    expect(await db.order.count()).toBe(0);
    expect(await db.walletTransaction.count({ where: { type: "ORDER_DEBIT" } })).toBe(0);
    expect(await db.idempotencyKey.count()).toBe(0);
  });
  it("rejects disabled / archived services, bad quantity and suspended users", async () => {
    const u = await mkUser(10), off = await mkService({ active: false }), arch = await mkService({ archivedAt: new Date() }), ok = await mkService();
    await expect(createOrder(input(u.id, off.id))).rejects.toThrow("SERVICE_UNAVAILABLE");
    await expect(createOrder(input(u.id, arch.id))).rejects.toThrow("SERVICE_UNAVAILABLE");
    await expect(createOrder(input(u.id, ok.id, { quantity: 99 }))).rejects.toThrow("INVALID_QUANTITY");
    await expect(createOrder(input(u.id, ok.id, { quantity: 10001 }))).rejects.toThrow("INVALID_QUANTITY");
    const sus = await mkUser(10, "SUSPENDED");
    await expect(createOrder(input(sus.id, ok.id))).rejects.toThrow("FORBIDDEN");
    expect(await balanceOf(u.id)).toBe(10);
  });
  it("duplicate idempotency key creates one order, even when sent concurrently", async () => {
    const u = await mkUser(10), s = await mkService(), key = randomUUID();
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => createOrder(input(u.id, s.id, { idemKey: key }))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.order.count()).toBe(1); expect(await balanceOf(u.id)).toBe(9);
  });
  it("concurrent orders cannot overspend (10 orders of $1 with $3)", async () => {
    const u = await mkUser(3), s = await mkService();
    const r = await Promise.allSettled(Array.from({ length: 10 }, () => createOrder(input(u.id, s.id))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect(await balanceOf(u.id)).toBe(0); expect(await ledgerSum(u.id)).toBe(0);
  });
});

describe("provider submission", () => {
  const setup = async () => { const u = await mkUser(10), s = await mkService(); await mkMapped(s.id); return { u, o: await createOrder(input(u.id, s.id)) }; };
  it("stores the provider reference on success", async () => {
    const { o } = await setup(); useClient({ addOrder: vi.fn().mockResolvedValue({ order: 555 }) });
    expect(await submitOrder(o.id)).toBe("submitted");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).providerRef).toBe("555");
  });
  it("definite provider rejection refunds exactly once", async () => {
    const { u, o } = await setup(); useClient({ addOrder: vi.fn().mockRejectedValue(new Error("PROVIDER_ERROR")) });
    expect(await submitOrder(o.id)).toBe("refunded");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("FAILED");
    expect(await balanceOf(u.id)).toBe(10);
    await refundOrder(o.id, "again");
    expect(await db.walletTransaction.count({ where: { userId: u.id, type: "REFUND" } })).toBe(1);
    expect(await balanceOf(u.id)).toBe(10); expect(await ledgerSum(u.id)).toBe(10);
  });
  it("ambiguous failure (timeout/5xx): no refund, no retry, flagged for an admin", async () => {
    const { u, o } = await setup(); const addOrder = vi.fn().mockRejectedValue(new Error("PROVIDER_HTTP_502")); useClient({ addOrder });
    expect(await submitOrder(o.id)).toBe("uncertain");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PROCESSING");
    expect(await balanceOf(u.id)).toBe(9);
    expect(await db.orderEvent.count({ where: { orderId: o.id, kind: "submit_uncertain" } })).toBe(1);
    expect(await submitOrder(o.id)).toBe("skipped");
    expect(addOrder).toHaveBeenCalledTimes(1);
  });
});

describe("status sync refunds", () => {
  const live = async () => { const u = await mkUser(10), s = await mkService(); await mkMapped(s.id); const o = await createOrder(input(u.id, s.id)); await db.order.update({ where: { id: o.id }, data: { providerRef: "77", status: "PROCESSING" } }); return { u, o }; };
  it("cancelled order is refunded in full once; the ledger key blocks any repeat", async () => {
    const { u, o } = await live(); useClient({ status: vi.fn().mockResolvedValue({ status: "Canceled" }) });
    await syncOrderStatuses(); await syncOrderStatuses();
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CANCELLED");
    expect(await balanceOf(u.id)).toBe(10);
    await expect(db.$transaction((t) => applyLedger(t, { userId: u.id, type: "REFUND", amount: 1, reference: o.id }))).rejects.toThrow();
    expect(await balanceOf(u.id)).toBe(10);
  });
  it("partial order refunds the undelivered share", async () => {
    const { u, o } = await live(); useClient({ status: vi.fn().mockResolvedValue({ status: "Partial", remains: "250" }) });
    await syncOrderStatuses();
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PARTIAL");
    expect(await balanceOf(u.id)).toBe(9.25);
  });
});
