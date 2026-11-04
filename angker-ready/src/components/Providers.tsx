"use client";
import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { getDict, type Dict, type Lang } from "@/i18n";

const I18n = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>(null as never);
export const useI18n = () => useContext(I18n);
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const T = createContext<{ push: (msg: string, kind?: "ok" | "err") => void }>(null as never);
export const useToast = () => useContext(T);

export function Providers({ lang: initial, children }: { lang: Lang; children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const setLang = (l: Lang) => {
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = l;
    set(l);
  };
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4000);
  }, []);
  return (
    <I18n.Provider value={{ lang, t: getDict(lang), setLang }}>
      <T.Provider value={{ push }}>
        {children}
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
          role="status"
          aria-live="polite"
        >
          {toasts.map((x) => (
            <div
              key={x.id}
              className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-2xl border border-line/60 bg-surface px-3.5 py-3 text-[13px] shadow-lg"
            >
              {x.kind === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              )}
              <span className="flex-1 leading-snug">{x.msg}</span>
              <button
                aria-label="Close"
                onClick={() => setToasts((y) => y.filter((z) => z.id !== x.id))}
              >
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>
          ))}
        </div>
      </T.Provider>
    </I18n.Provider>
  );
}
