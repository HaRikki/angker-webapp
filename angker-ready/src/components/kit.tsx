"use client";
import { useEffect, ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { useI18n } from "./Providers";

export const Skeleton = ({ className = "h-5 w-full" }: { className?: string }) => (
  <div className={`skeleton ${className}`} />
);

export function ErrorBox({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="glass flex flex-col items-center gap-3 p-8 text-center">
      <AlertCircle className="h-7 w-7 text-red-500" />
      <p className="text-[14px]">{t.app.err.load}</p>
      <button onClick={onRetry} className="btn-primary px-6">{t.app.err.retry}</button>
    </div>
  );
}

export const Empty = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-muted">
    <Inbox className="h-7 w-7 opacity-50" />
    {text}
  </div>
);

const COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-500",
  PAID: "bg-emerald-500/15 text-emerald-500",
  EXPIRED: "bg-line text-muted",
  FAILED: "bg-red-500/15 text-red-500",
  CANCELLED: "bg-red-500/15 text-red-500",
  PARTIAL: "bg-amber-500/15 text-amber-500",
  PENDING: "bg-line text-muted",
  PROCESSING: "bg-cyan/15 text-cyan",
  IN_PROGRESS: "bg-cyan/15 text-cyan",
};

export function StatusBadge({ s }: { s: string }) {
  const { t } = useI18n();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLORS[s] ?? "bg-line text-muted"}`}>
      {t.app.status[s] ?? s}
    </span>
  );
}

export function Pager({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  const last = Math.max(1, Math.ceil(total / size));
  if (last <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-[13px]">
      <button className="btn-ghost !py-2" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t.app.page.prev}</button>
      <span className="tabular-nums text-muted">{page} / {last}</span>
      <button className="btn-ghost !py-2" disabled={page >= last} onClick={() => onChange(page + 1)}>{t.app.page.next}</button>
    </div>
  );
}

/** Bottom-sheet style modal for Mini App */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
