import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/telegram/webhook/route";
import { balanceOf, mkUser, resetDb } from "./helpers";

const fetchMock = vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);
let uid = 1000;
const hook = (update: object, secret: string | null = "test-webhook-secret") =>
  POST(new Request("http://t/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) }, body: JSON.stringify(update) }) as never);
const msg = (from: number, text: string, extra: object = {}) => ({ update_id: ++uid, message: { message_id: 1, from: { id: from, username: "admin" }, chat: { id: from }, text }, ...extra });
const cb = (from: number, data: string) => ({ update_id: ++uid, callback_query: { id: `cb${uid}`, from: { id: from }, data, message: { message_id: 5, chat: { id: from } } } });
const sent = () => fetchMock.mock.calls.map((c) => ({ url: String(c[0]), body: JSON.parse(String((c[1] as RequestInit)?.body ?? "{}")) }));
const texts = () => sent().filter((c) => /sendMessage|editMessageText/.test(c.url)).map((c) => String(c.body.text));
beforeEach(async () => { await resetDb(); fetchMock.mockClear(); });

describe("webhook security", () => {
  it("rejects a missing or wrong secret token", async () => {
    expect((await hook(msg(111, "/start"), null)).status).toBe(401); expect((await hook(msg(111, "/start"), "wrong")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("stays silent for unauthorized users, even with an admin-looking username, and logs the attempt", async () => {
    expect((await hook(msg(999, "/start"))).status).toBe(200);
    expect(texts()).toHaveLength(0);
    expect(await db.auditLog.count({ where: { action: "unauthorized_attempt", adminTelegramId: "999" } })).toBe(1);
  });
  it("shows the dashboard to an allowlisted admin and ignores a replayed update", async () => {
    const u = msg(111, "/start"); await hook(u); await hook(u);
    expect(texts()).toHaveLength(1); expect(texts()[0]).toContain("ANGKER");
  });
  it("ignores malformed callback data", async () => {
    await hook(cb(111, "x;drop table")); await hook(cb(111, "../../etc"));
    expect(texts()).toHaveLength(0);
  });
});

describe("role permissions", () => {
  const support = async () => { const r = await db.adminRole.create({ data: { name: "SUPPORT", permissions: { create: [{ permission: "tickets.manage" }, { permission: "users.view" }] } } }); await db.admin.create({ data: { telegramId: "222", roleId: r.id } }); };
  it("denies a support admin the provider menu and audits it", async () => {
    await support(); await hook(cb(222, "prv"));
    expect(texts().join(" ")).toContain("Not permitted"); expect(await db.auditLog.count({ where: { adminTelegramId: "222", result: "denied" } })).toBe(1);
  });
  it("support cannot adjust balances", async () => {
    await support(); const u = await mkUser(0);
    await hook(cb(222, `usr:ad:${u.id}`)); await hook(msg(222, "credit 5.00 sneaky"));
    expect(await balanceOf(u.id)).toBe(0); expect(JSON.stringify((await db.botSession.findUnique({ where: { adminTelegramId: "222" } }))?.state ?? {})).not.toContain("confirm");
  });
});

describe("balance adjustment (owner)", () => {
  const confirmToken = async () => ((await db.botSession.findUniqueOrThrow({ where: { adminTelegramId: "111" } })).state as unknown as { confirm: { token: string } }).confirm.token;
  it("needs explicit confirmation, writes ledger + audit with reason, and a repeated confirm does nothing", async () => {
    const u = await mkUser(0);
    await hook(cb(111, `usr:ad:${u.id}`)); await hook(msg(111, "credit 5.00 goodwill gesture"));
    expect(await balanceOf(u.id)).toBe(0);                          // nothing happens before Confirm
    const t = await confirmToken(); await hook(cb(111, `cf:${t}`)); await hook(cb(111, `cf:${t}`));
    expect(await balanceOf(u.id)).toBe(5);
    expect(await db.walletTransaction.count({ where: { userId: u.id, type: "ADJUSTMENT" } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "usr.adjust" } });
    expect(log.result).toBe("ok"); expect(log.reason).toContain("goodwill"); expect(log.adminTelegramId).toBe("111");
  });
  it("a debit larger than the balance fails and is audited as an error", async () => {
    const u = await mkUser(1);
    await hook(cb(111, `usr:ad:${u.id}`)); await hook(msg(111, "debit 50 too much")); await hook(cb(111, `cf:${await confirmToken()}`));
    expect(await balanceOf(u.id)).toBe(1); expect((await db.auditLog.findFirstOrThrow({ where: { action: "usr.adjust" } })).result).toBe("error");
  });
});
