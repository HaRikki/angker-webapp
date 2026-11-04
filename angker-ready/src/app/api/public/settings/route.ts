import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
const PUBLIC = ["siteName", "logoUrl", "faviconUrl", "description", "contact", "supportLink", "defaultLanguage", "languages",
  "defaultTheme", "minDeposit", "maxDeposit", "paymentMethods", "maintenance", "registrationEnabled", "currency"];
export async function GET() {
  const rows = await db.siteSetting.findMany({ where: { key: { in: PUBLIC } } }); // whitelist only
  return NextResponse.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}
