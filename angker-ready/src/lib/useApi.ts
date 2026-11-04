"use client";
import { useEffect, useState } from "react";

function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { Telegram?: { WebApp?: unknown } };
  return Boolean(w.Telegram?.WebApp);
}

export function useApi<T>(url: string | null) {
  const [s, set] = useState<{ data: T | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: !!url,
  });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!url) {
      set({ data: null, error: false, loading: false });
      return;
    }
    let off = false;
    set((x) => ({ ...x, loading: true, error: false }));
    fetch(url)
      .then(async (r) => {
        if (r.status === 401) {
          // Inside Telegram Mini App: do not bounce to /login
          if (!isTelegramWebApp()) {
            location.href = "/";
          }
          throw new Error("UNAUTHENTICATED");
        }
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (!off) set({ data: d, error: false, loading: false });
      })
      .catch(() => {
        if (!off) set({ data: null, error: true, loading: false });
      });
    return () => {
      off = true;
    };
  }, [url, n]);

  return { ...s, reload: () => setN((x) => x + 1) };
}
