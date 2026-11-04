import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be >= 32 chars"),
  APP_URL: z.string().url(),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
});
export function env() {
  const r = schema.safeParse(process.env);
  if (!r.success) throw new Error("Invalid env: " + r.error.issues.map((i) => i.path.join(".")).join(", ")); // names only, never values
  return r.data;
}
