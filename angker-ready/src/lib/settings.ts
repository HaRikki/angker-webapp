import { db } from "@/lib/db";
const KEYS = ["siteName", "logoUrl", "description", "contact", "supportLink", "maintenance", "terms"];
export async function publicSettings() {
  const rows = await db.siteSetting.findMany({ where: { key: { in: KEYS } } }).catch(() => []);
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");
  return { siteName: s("siteName") || "AngKer SMM", logoUrl: s("logoUrl"), description: s("description"), contact: s("contact"), supportLink: s("supportLink"), terms: s("terms"), maintenance: m.maintenance === true };
}

export const isMaintenance = async () => (await db.siteSetting.findUnique({ where: { key: "maintenance" } }).catch(() => null))?.value === true;
