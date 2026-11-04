/**
 * Create (or reset) the demo login account.
 * Usage:  node scripts/create-test-user.mjs
 * Needs DATABASE_URL in the environment (or in .env).
 *
 * Login:  username = testuser
 *         password = Test1234
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Set it in .env or the environment.");
  process.exit(1);
}

const db = new PrismaClient();
const testHash =
  "scrypt$16384$8$1$gz1ZSxswfHNg8rHtvCa7jg==$ebdvANrab5LZ836lnct4yhG3b5sq8f8pGxAFwKELGWi2cTZOziXlQehgy3yyUaqkmBM6gZUfMvpmfPnjDw93Nw==";

async function main() {
  const user = await db.user.upsert({
    where: { username: "testuser" },
    update: { passwordHash: testHash, email: "test@angker.local", status: "ACTIVE" },
    create: {
      username: "testuser",
      email: "test@angker.local",
      passwordHash: testHash,
      wallet: { create: { balance: 10 } },
    },
    include: { wallet: true },
  });
  if (!user.wallet) {
    await db.wallet.create({ data: { userId: user.id, balance: 10 } });
  }
  console.log("✅ Test account ready");
  console.log("   Username : testuser");
  console.log("   Email    : test@angker.local");
  console.log("   Password : Test1234");
  console.log("   Balance  : $10 (or existing wallet balance)");
}

main()
  .catch((e) => {
    console.error("Failed:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
