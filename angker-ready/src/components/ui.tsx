"use client";
import { useState, InputHTMLAttributes } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useI18n } from "./Providers";

export function Field({ label, error, hint, type, ...p }: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n(), [show, setShow] = useState(false), pw = type === "password", id = p.name;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input id={id} type={pw && show ? "text" : type} className={`input ${pw ? "pr-11" : ""} ${error ? "!border-red-500" : ""}`} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} {...p} />
        {pw && <button type="button" onClick={() => setShow(!show)} aria-label={show ? t.auth.hide : t.auth.show} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
      </div>
      {error ? <p id={`${id}-e`} className="mt-1 text-xs text-red-500">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={loading} className="btn-primary w-full">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}
