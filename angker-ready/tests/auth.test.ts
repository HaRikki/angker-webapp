import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as dashboard } from "@/app/api/user/dashboard/route";
import { GET as orders, POST as placeOrder } from "@/app/api/user/orders/route";
import { GET as orderOne } from "@/app/api/user/orders/[id]/route";
import { GET as txs } from "@/app/api/user/transactions/route";
import { GET as ticketOne } from "@/app/api/user/tickets/[id]/route";
import { POST as ticketReply } from "@/app/api/user/tickets/[id]/replies/route";
import { PATCH as patchProfile } from "@/app/api/user/profile/route";
import { createOrder } from "@/server/orders/createOrder";
import { balanceOf, cookieJar, loginAs, mkService, mkUser, req, resetDb } from "./helpers";
import { hashPassword } from "@/lib/auth/password";

const good = { username: "alice_1", email: "Alice@Test.com", password: "Passw0rdX", confirmPassword: "Passw0rdX", acceptTerms: true };
beforeEach(resetDb);

describe("registration and login", () => {
  it("registers: scrypt hash, wallet created, email normalized", async () => {
    const r = await register(req("/api/auth/register", good));
    expect(r.status).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { username: "alice_1" }, include: { wallet: true } });
    expect(u.passwordHash.startsWith("scrypt$")).toBe(true); expect(u.wallet).not.toBeNull(); expect(u.email).toBe("alice@test.com");
  });
  it("rejects duplicates, weak passwords, mismatches and missing terms", async () => {
    await register(req("/api/auth/register", good));
    expect((await register(req("/api/auth/register", { ...good, username: "other_1" }))).status).toBe(409);
    expect((await register(req("/api/auth/register", { ...good, username: "b_1", email: "b@t.test", password: "weak", confirmPassword: "weak" }))).status).toBe(400);
    expect((await register(req("/api/auth/register", { ...good, username: "c_1", email: "c@t.test", confirmPassword: "Different1" }))).status).toBe(400);
    expect((await register(req("/api/auth/register", { ...good, username: "d_1", email: "d@t.test", acceptTerms: false }))).status).toBe(400);
  });
  it("login: same error for wrong password and unknown user; suspended blocked; brute force limited", async () => {
    await db.user.create({ data: { username: "bob_1", email: "bob@t.test", passwordHash: await hashPassword("Passw0rdX"), wallet: { create: {} } } });
    expect((await login(req("/api/auth/login", { identifier: "bob@t.test", password: "Passw0rdX" }))).status).toBe(200);
    expect(cookieJar.get("angker_session")).toBeTruthy();
    const wrong = await login(req("/api/auth/login", { identifier: "bob_1", password: "nope" })), ghost = await login(req("/api/auth/login", { identifier: "nobody", password: "nope" }));
    expect(wrong.status).toBe(401); expect(await wrong.json()).toEqual(await ghost.json());
    await db.user.update({ where: { username: "bob_1" }, data: { status: "SUSPENDED" } });
    expect((await login(req("/api/auth/login", { identifier: "bob_1", password: "Passw0rdX" }))).status).toBe(403);
    let last = 0; for (let i = 0; i < 10; i++) last = (await login(req("/api/auth/login", { identifier: "victim_x", password: "x" }))).status;
    expect(last).toBe(429);
  });
});

describe("authorization and data isolation", () => {
  it("requires a session", async () => { cookieJar.clear(); expect((await dashboard()).status).toBe(401); });
  it("a suspended user's existing session stops working", async () => { const u = await mkUser(0); await loginAs(u.id); await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } }); expect((await dashboard()).status).toBe(401); });
  it("users never see each other's balance, orders or transactions", async () => {
    const a = await mkUser(3), b = await mkUser(50), s = await mkService();
    const ob = await createOrder({ userId: b.id, serviceId: s.id, target: "@x_user", quantity: 1000, idemKey: "k-b-1234" });
    await loginAs(a.id);
    expect((await (await dashboard()).json()).balance).toBe("3");
    expect((await orderOne(req(`/api/user/orders/${ob.id}`), { params: { id: ob.id } })).status).toBe(404);
    expect((await (await orders(req("/api/user/orders"))).json()).total).toBe(0);
    expect((await (await txs(req("/api/user/transactions"))).json()).total).toBe(1);   // only A's own seed deposit
    await loginAs(b.id);
    expect((await orderOne(req(`/api/user/orders/${ob.id}`), { params: { id: ob.id } })).status).toBe(200);
  });
  it("ignores client-supplied prices and honours maintenance mode and idempotency", async () => {
    const u = await mkUser(10), s = await mkService(); await loginAs(u.id);
    const body = { serviceId: s.id, target: "https://t.test/p", quantity: 1000, idempotencyKey: "idem-key-0001", sellPrice: 0, price: 0 };
    expect((await placeOrder(req("/api/user/orders", body))).status).toBe(201);
    expect(Number((await db.order.findFirstOrThrow()).sellPrice)).toBe(1); expect(await balanceOf(u.id)).toBe(9);
    expect((await placeOrder(req("/api/user/orders", body))).status).toBe(409);
    await db.siteSetting.create({ data: { key: "maintenance", value: true } });
    expect((await placeOrder(req("/api/user/orders", { ...body, idempotencyKey: "idem-key-0002" }))).status).toBe(503);
  });
  it("support tickets: owner-only access, closed tickets refuse replies", async () => {
    const a = await mkUser(0), b = await mkUser(0);
    const open = await db.supportTicket.create({ data: { userId: b.id, category: "other", subject: "s1", messages: { create: { body: "hi" } } } });
    const closed = await db.supportTicket.create({ data: { userId: b.id, category: "other", subject: "s2", status: "CLOSED", messages: { create: { body: "hi" } } } });
    await loginAs(a.id);
    expect((await ticketOne(req(`/api/user/tickets/${open.id}`), { params: { id: open.id } })).status).toBe(404);
    expect((await ticketReply(req(`/api/user/tickets/${open.id}/replies`, { message: "x" }), { params: { id: open.id } })).status).toBe(404);
    await loginAs(b.id);
    expect((await ticketReply(req(`/api/user/tickets/${closed.id}/replies`, { message: "x" }), { params: { id: closed.id } })).status).toBe(403);
    expect((await ticketReply(req(`/api/user/tickets/${open.id}/replies`, { message: "more" }), { params: { id: open.id } })).status).toBe(201);
  });
  it("password change needs the current password", async () => {
    const u = await db.user.create({ data: { username: "pw_1", email: "pw@t.test", passwordHash: await hashPassword("Passw0rdX"), wallet: { create: {} } } }); await loginAs(u.id);
    expect((await patchProfile(req("/api/user/profile", { currentPassword: "wrong", newPassword: "NewPassw0rd" }, "PATCH"))).status).toBe(403);
    expect((await patchProfile(req("/api/user/profile", { currentPassword: "Passw0rdX", newPassword: "NewPassw0rd" }, "PATCH"))).status).toBe(200);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });
});
