import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyLedger } from "@/server/wallet/ledger";
import { balanceOf, ledgerSum, mkUser, resetDb } from "./helpers";

beforeEach(resetDb);
const tx = (userId: string, amount: number, reference: string, type: "DEPOSIT" | "ORDER_DEBIT" = "ORDER_DEBIT") => db.$transaction((t) => applyLedger(t, { userId, type, amount, reference }));

describe("wallet ledger", () => {
  it("records every movement and keeps balance == sum(ledger)", async () => {
    const u = await mkUser(10);
    await tx(u.id, -3, "a"); await tx(u.id, 2, "b", "DEPOSIT");
    expect(await balanceOf(u.id)).toBe(9);
    expect(await ledgerSum(u.id)).toBe(9);
  });
  it("rejects a debit that would make the balance negative, writing nothing", async () => {
    const u = await mkUser(2);
    await expect(tx(u.id, -3, "x")).rejects.toThrow("INSUFFICIENT_BALANCE");
    expect(await balanceOf(u.id)).toBe(2);
    expect(await db.walletTransaction.count({ where: { userId: u.id, reference: "x" } })).toBe(0);
  });
  it("rejects a repeated (type, reference): no double credit", async () => {
    const u = await mkUser(0);
    await tx(u.id, 5, "dup", "DEPOSIT");
    await expect(tx(u.id, 5, "dup", "DEPOSIT")).rejects.toThrow();
    expect(await balanceOf(u.id)).toBe(5);
  });
  it("concurrent debits never overspend (10 x 3 against a balance of 10)", async () => {
    const u = await mkUser(10);
    const r = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => tx(u.id, -3, `c${i}`)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect(await balanceOf(u.id)).toBe(1);
    expect(await ledgerSum(u.id)).toBe(1);
  });
});
