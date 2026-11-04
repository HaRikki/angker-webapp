import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { SmmProvider } from "./smmAdapter";
export async function getProvider(providerId: string) {
  const p = await db.provider.findUnique({ where: { id: providerId } });
  if (!p || !p.enabled) throw new Error("PROVIDER_UNAVAILABLE");
  return { row: p, client: new SmmProvider(p.baseUrl, decrypt(p.apiKeyEnc)) };
}
