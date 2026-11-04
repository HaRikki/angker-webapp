import { PrismaClient, AdminRoleName } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const db = new PrismaClient();
const perms: Record<AdminRoleName, string[]> = {
  OWNER: ["*"],
  FINANCE: ["payments.view", "wallet.adjust", "reports.view"],
  SUPPORT: ["tickets.manage", "users.view"],
  SERVICE_MANAGER: ["services.manage", "providers.manage", "orders.manage"],
};

async function main() {
  for (const name of Object.keys(perms) as AdminRoleName[]) {
    const role = await db.adminRole.upsert({ where: { name }, update: {}, create: { name } });
    for (const permission of perms[name])
      await db.adminPermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        update: {},
        create: { roleId: role.id, permission },
      });
  }
  for (const name of ["TikTok", "Facebook", "Telegram", "Instagram", "YouTube"])
    await db.category.upsert({ where: { name }, update: {}, create: { name } });

  const owners = (process.env.TELEGRAM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ownerRole = await db.adminRole.findUniqueOrThrow({ where: { name: "OWNER" } });
  for (const telegramId of owners)
    await db.admin.upsert({ where: { telegramId }, update: {}, create: { telegramId, roleId: ownerRole.id } });

  // Web admin: created/updated from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD (.env is the source of truth).
  const aUser = process.env.ADMIN_USERNAME?.trim(), aEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase(), aPass = process.env.ADMIN_PASSWORD ?? "";
  if (aUser && aEmail && aPass.length >= 12) {
    const passwordHash = await hashPassword(aPass);
    const ex = await db.admin.findFirst({ where: { OR: [{ username: aUser }, { email: aEmail }] } });
    if (ex) await db.admin.update({ where: { id: ex.id }, data: { username: aUser, email: aEmail, passwordHash, active: true, roleId: ownerRole.id } });
    else await db.admin.create({ data: { username: aUser, email: aEmail, displayName: "Owner", passwordHash, roleId: ownerRole.id, active: true } });
    // the old built-in admin / Admin@12345 account must never stay usable
    await db.admin.updateMany({ where: { username: { in: ["admin", "angker_owner"] }, NOT: { username: aUser } }, data: { active: false } });
    console.log(`[seed] web admin ready: ${aUser} / ${aEmail}`);
  } else console.warn("[seed] !! ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD (min 12 chars) not set: no web admin was created");

  // Deposits: make sure ABA KHQR is enabled once it is configured (never leave the page on "Payments unavailable")
  if (process.env.ABA_MERCHANT_ID && process.env.ABA_API_KEY) {
    const pm = await db.siteSetting.findUnique({ where: { key: "paymentMethods" } });
    if (!Array.isArray(pm?.value) || !(pm!.value as string[]).includes("aba"))
      await db.siteSetting.upsert({ where: { key: "paymentMethods" }, update: { value: ["aba"] }, create: { key: "paymentMethods", value: ["aba"] } });
  }


  // Digital catalog seed (skip if any exist)
  try {
    const digCount = await db.digitalProduct.count();
    if (digCount === 0) {
      const seedProducts = [
        { name: "Gemini Pro 3 Months", price: 3.5, emoji: "✨", stock: 91, description: "Trial — only works on accounts with no previous/active plans\n5TB cloud storage included\nPayment method required for redeem\nWarranty after activation 7 days\nMust be redeemed within 7 days of purchase" },
        { name: "Gemini 18 Months", price: 2.0, emoji: "🌟", stock: 0, description: "Long-term plan\nAccount delivered after payment\nWarranty 7 days after activation" },
        { name: "ChatGPT Plus 1 Month", price: 5.0, emoji: "🤖", stock: 40, description: "Official-style invite / account access\nWarranty 3 days after delivery\nDo not change recovery email for 24h" },
        { name: "CapCut Pro 1 Year", price: 4.0, emoji: "🎬", stock: 25, description: "Pro features unlocked\nDelivered as login or redeem code\nWarranty 7 days" },
        { name: "Canva Pro 1 Year", price: 6.0, emoji: "🎨", stock: 15, description: "Team or personal seat\nInstant delivery after wallet charge\nWarranty 7 days" },
        { name: "Spotify Premium 3 Months", price: 3.0, emoji: "🎵", stock: 50, description: "Individual plan\nRedeem within 7 days\nWarranty after activation 3 days" },
      ];
      for (const sp of seedProducts) {
        await db.digitalProduct.create({ data: { ...sp, delivery: "Instant", active: true } });
      }
      console.log(`[seed] digital products: ${seedProducts.length}`);
    }
  } catch (e) {
    console.warn("[seed] digital products skipped:", e);
  }

  if (process.env.APP_ENV === "production") {      // the demo account has a known password: never allow it in production
    await db.user.updateMany({ where: { username: "testuser", email: "test@angker.local" }, data: { status: "SUSPENDED" } });
  } else {
    const testHash = "scrypt$16384$8$1$gz1ZSxswfHNg8rHtvCa7jg==$ebdvANrab5LZ836lnct4yhG3b5sq8f8pGxAFwKELGWi2cTZOziXlQehgy3yyUaqkmBM6gZUfMvpmfPnjDw93Nw==";
    await db.user.upsert({
      where: { username: "testuser" },
      update: {},
      create: { username: "testuser", email: "test@angker.local", passwordHash: testHash, wallet: { create: { balance: 10 } } },
    });
  }
}
main().finally(() => db.$disconnect());
