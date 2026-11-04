// Runs before `next build`: generates the Prisma client, creates/updates the database tables and seeds roles.
// A failing database step is reported loudly but does NOT stop the build, so the site still deploys.
import { execSync } from "node:child_process";
const run = (cmd, optional) => {
  console.log(`\n> ${cmd}`);
  try { execSync(cmd, { stdio: ["ignore", "inherit", "inherit"] }); return true; }
  catch { if (!optional) process.exit(1); console.warn(`\n!! "${cmd}" failed. Check DATABASE_URL, then run it manually: npm run db:setup\n`); return false; }
};
run("npx prisma generate");
if (process.env.DATABASE_URL) {
  // Neon/Supabase poolers (pgbouncer) can reject schema changes: prefer the direct URL when one is provided.
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  if (run("npx prisma db push --skip-generate", true)) run("npx prisma db seed", true);
} else console.warn("\n!! DATABASE_URL is not set: skipping database setup. Registration will not work until it is set.\n");
