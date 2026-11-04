// Client for the khmer-system.com ABA KHQR merchant API (third-party, polling-based, no webhook).
type Resp = { ok: boolean; error?: string; code?: string };
function cfg() {
  const base = process.env.ABA_API_BASE_URL, merchant_id = process.env.ABA_MERCHANT_ID, api_key = process.env.ABA_API_KEY;
  if (!base || !merchant_id || !api_key) throw new Error("PAYMENT_UNAVAILABLE"); // shown as "Payment unavailable" until configured
  return { base, merchant_id, api_key };
}
async function post<T>(path: string, body: Record<string, unknown>): Promise<T & Resp> {
  const c = cfg();
  const res = await fetch(`${c.base}/aba-api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: c.api_key, merchant_id: c.merchant_id, ...body }), signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({ ok: false }))) as T & Resp;
  if (!res.ok || !json.ok) throw new Error(`ABA_${json.code ?? res.status}`); // code only; never log key/body
  return json;
}
export const aba = {
  generateQr: (username: string, amount: number) =>
    post<{ payment_id: string; qr_string: string; card_image: string; pay_url: string; amount: number; currency: string; expires_at: string }>("generate-qr", { username, amount }),
  check: (paymentId: string) => post<{ status: "PENDING" | "PAID" | "EXPIRED"; paid: boolean; amount: number }>("check-payment", { payment_id: paymentId }),
  markCredited: (paymentId: string) => post<{ credited: boolean; already: boolean }>("mark-credited", { payment_id: paymentId }),
  transactions: (filter: { status?: string; username?: string; limit?: number }) =>
    post<{ count: number; transactions: Array<{ payment_id: string; username: string; amount: number; status: string; credited: boolean }> }>("transactions", filter),
};
