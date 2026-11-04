// Standard "SMM panel" v2 protocol: POST form {key, action, ...}
export class SmmProvider {
  constructor(private baseUrl: string, private apiKey: string) {}
  private async call<T>(params: Record<string, string>, timeoutMs = 15000): Promise<T> {
    const body = new URLSearchParams({ key: this.apiKey, ...params });
    const res = await fetch(this.baseUrl, { method: "POST", body, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`PROVIDER_HTTP_${res.status}`);
    const json = (await res.json()) as T & { error?: string };
    if ((json as { error?: string }).error) throw new Error("PROVIDER_ERROR"); // never echo raw text with secrets
    return json;
  }
  services() { return this.call<Array<{ service: string; name: string; category: string; rate: string; min: string; max: string; refill?: boolean; cancel?: boolean }>>({ action: "services" }); }
  balance() { return this.call<{ balance: string; currency: string }>({ action: "balance" }); }
  /** NOT auto-retried: a timeout may still have created the order upstream. */
  addOrder(serviceId: string, link: string, quantity: number) { return this.call<{ order: number }>({ action: "add", service: serviceId, link, quantity: String(quantity) }); }
  status(orderId: string) { return this.call<{ status: string; remains?: string }>({ action: "status", order: orderId }); }
}
export const mapProviderStatus = (s: string) =>
  ({ Pending: "PENDING", Processing: "PROCESSING", "In progress": "IN_PROGRESS", Completed: "COMPLETED",
     Partial: "PARTIAL", Canceled: "CANCELLED", Cancelled: "CANCELLED" } as const)[s] ?? "PROCESSING";
