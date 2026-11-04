import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/payments/abaKhqr", () => ({ aba: { generateQr: vi.fn(), check: vi.fn(), markCredited: vi.fn() } }));
import { db } from "@/lib/db";
import { aba } from "@/server/payments/abaKhqr";
import { createDeposit, settleDeposit } from "@/server/payments/deposits";
import { balanceOf, ledgerSum, mkUser, resetDb } from "./helpers";

let n = 0;
const qr = (amount = 5) => ({ payment_id: `pay_${++n}`, qr_string: "q", card_image: "https://x.test/c.png", pay_url: "https://x.test/p", amount, currency: "USD", expires_at: new Date(Date.now() + 180_000).toISOString() });
const mk = async (amount = 5) => { const u = await mkUser(0); vi.mocked(aba.generateQr).mockResolvedValue(qr(amount) as never); return { u, d: await createDeposit(u, amount) }; };
beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });

describe("deposit creation", () => {
  it("stores a PENDING deposit and credits nothing", async () => { const { u, d } = await mk(); expect(d.status).toBe("PENDING"); expect(await balanceOf(u.id)).toBe(0); });
  it("rejects amounts outside min/max before spending a QR", async () => {
    const u = await mkUser(0);
    await expect(createDeposit(u, 0.5)).rejects.toThrow("INVALID_AMOUNT"); await expect(createDeposit(u, 501)).rejects.toThrow("INVALID_AMOUNT");
    expect(aba.generateQr).not.toHaveBeenCalled();
  });
  it("is unavailable when the ABA method is disabled in settings", async () => {
    await db.siteSetting.create({ data: { key: "paymentMethods", value: [] } });
    await expect(createDeposit(await mkUser(0), 5)).rejects.toThrow("PAYMENT_UNAVAILABLE");
  });
});
describe("payment verification", () => {
  it("credits exactly once, even when polled concurrently", async () => {
    const { u, d } = await mk(5); vi.mocked(aba.check).mockResolvedValue({ status: "PAID", paid: true, amount: 5 } as never);
    await Promise.allSettled(Array.from({ length: 6 }, () => settleDeposit(d.id))); await settleDeposit(d.id);
    expect(await balanceOf(u.id)).toBe(5); expect(await ledgerSum(u.id)).toBe(5);
    expect(await db.walletTransaction.count({ where: { userId: u.id, type: "DEPOSIT" } })).toBe(1);
    expect((await db.deposit.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PAID");
    expect(await db.outboxEvent.count({ where: { kind: "aba.mark_credited" } })).toBe(1);
  });
  it("never credits when the provider amount differs; alerts an admin", async () => {
    const { u, d } = await mk(5); vi.mocked(aba.check).mockResolvedValue({ status: "PAID", paid: true, amount: 4.99 } as never);
    await settleDeposit(d.id);
    expect(await balanceOf(u.id)).toBe(0); expect((await db.deposit.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
    expect(await db.paymentEvent.count({ where: { depositId: d.id, verified: false } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { kind: "admin.payment_alert" } })).toBe(1);
  });
  it("ignores pending, paid:false and expired results", async () => {
    const { u, d } = await mk(5), check = vi.mocked(aba.check);
    check.mockResolvedValue({ status: "PENDING", paid: false, amount: 5 } as never); await settleDeposit(d.id);
    check.mockResolvedValue({ status: "PAID", paid: false, amount: 5 } as never); await settleDeposit(d.id);
    expect(await balanceOf(u.id)).toBe(0);
    check.mockResolvedValue({ status: "EXPIRED", paid: false, amount: 5 } as never); await settleDeposit(d.id);
    expect((await db.deposit.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("EXPIRED");
    check.mockResolvedValue({ status: "PAID", paid: true, amount: 5 } as never); await settleDeposit(d.id);   // a late "paid" on an expired record is not credited automatically
    expect(await balanceOf(u.id)).toBe(0);
  });
});
