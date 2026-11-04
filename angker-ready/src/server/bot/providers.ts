import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt, decrypt, maskKey } from "@/lib/crypto";
import { getProvider } from "../providers/registry";
import { previewSync, syncServices } from "../providers/syncServices";
import { Ctx, show, esc, back, Btn } from "./ui";

export async function listProviders(c: Ctx) {
  const ps = await db.provider.findMany({ orderBy: [{ priority: "desc" }, { name: "asc" }] });
  const rows: Btn[][] = ps.map((p) => [{ text: `${p.enabled ? "🟢" : "⚪"} ${p.name}${p.isDefault ? " ⭐" : ""}`, callback_data: `prv:v:${p.id}` }]);
  rows.push([{ text: "➕ Add Provider", callback_data: "prv:add" }], back());
  await show(c, `<b>🔌 Provider API</b>\n${ps.length} provider(s)`, rows);
}
export async function viewProvider(c: Ctx, id: string) {
  const p = await db.provider.findUnique({ where: { id } });
  if (!p) return show(c, "Provider not found.", [back("prv")]);
  const text = `<b>${esc(p.name)}</b>${p.isDefault ? " ⭐ default" : ""}\nURL: ${esc(p.baseUrl)}\nAPI key: <code>${esc(maskKey(decrypt(p.apiKeyEnc)))}</code>\nStatus: ${p.enabled ? "enabled" : "disabled"}\nLast sync: ${p.lastSyncAt?.toISOString() ?? "never"}`;
  await show(c, text, [
    [{ text: "🧪 Test / Balance", callback_data: `prv:t:${id}` }, { text: "👁 Preview Sync", callback_data: `prv:pv:${id}` }],
    [{ text: p.enabled ? "⏸ Disable" : "▶️ Enable", callback_data: `prv:tg:${id}` }, { text: "⭐ Set Default", callback_data: `prv:df:${id}` }],
    [{ text: "⬇️ Fetch Services", callback_data: `prv:sy:${id}` }], back("prv")]);
}
export async function testProvider(c: Ctx, id: string) {
  try { const b = await (await getProvider(id)).client.balance(); await show(c, `✅ Connected\nBalance: <b>${esc(b.balance)} ${esc(b.currency)}</b>`, [back(`prv:v:${id}`)]); }
  catch (e) { await show(c, `❌ Connection failed (${esc(e instanceof Error ? e.message : "error")})`, [back(`prv:v:${id}`)]); }
}
export async function previewProvider(c: Ctx, id: string) {
  try { const r = await previewSync(id); await show(c, `<b>Preview</b>\nFound: ${r.found}\nNew: ${r.new}\nExisting (will update cost/limits only): ${r.existing}\n\nNew services are imported <b>disabled</b>.`, [[{ text: "✅ Import / Update", callback_data: `prv:sy:${id}` }], back(`prv:v:${id}`)]); }
  catch (e) { await show(c, `❌ ${esc(e instanceof Error ? e.message : "error")}`, [back(`prv:v:${id}`)]); }
}
const addSchema = z.object({ name: z.string().min(2).max(40), url: z.string().url().startsWith("https://"), key: z.string().min(8).max(200) });
/** Input: name|https://api.url|apikey */
export async function addProvider(text: string) {
  const [name, url, key] = text.split("|").map((s) => s.trim());
  const r = addSchema.safeParse({ name, url, key });
  if (!r.success) throw new Error("INVALID_INPUT");
  const p = await db.provider.create({ data: { name: r.data.name, baseUrl: r.data.url, apiKeyEnc: encrypt(r.data.key) } });
  return p.id;
}
export async function runProviderAction(k: string, id: string) {
  if (k === "prv.toggle") { const p = await db.provider.findUniqueOrThrow({ where: { id } }); await db.provider.update({ where: { id }, data: { enabled: !p.enabled } }); return `Provider ${p.enabled ? "disabled" : "enabled"}.`; }
  if (k === "prv.def") { await db.$transaction([db.provider.updateMany({ data: { isDefault: false } }), db.provider.update({ where: { id }, data: { isDefault: true } })]); return "Default provider set."; }
  if (k === "prv.sync") { const r = await syncServices(id); return `Sync done: ${r.created} created (disabled), ${r.updated} updated.`; }
  throw new Error("UNKNOWN_ACTION");
}
