"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatedEmoji } from "./AnimatedEmoji";

type TgTheme = Record<string, string | undefined>;
type TgWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  MainButton?: { hide: () => void };
  BackButton?: { hide: () => void; show: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  themeParams?: TgTheme;
  colorScheme?: "light" | "dark";
  HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (s: string) => void };
  close?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

/** Convert #rrggbb → "r g b" for CSS variables */
function hexToRgbSpace(hex?: string): string | null {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex.replace("#", ""))) return null;
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function getUserTheme(): "light" | "dark" | null {
  try {
    const v = localStorage.getItem("theme");
    if (v === "dark" || v === "light") return v;
  } catch { /* ignore */ }
  return null;
}

function applyTelegramTheme(wa: TgWebApp) {
  const tp = wa.themeParams || {};
  const root = document.documentElement;
  const userTheme = getUserTheme();

  // User toggle wins over Telegram colorScheme
  if (userTheme === "dark") root.classList.add("dark");
  else if (userTheme === "light") root.classList.remove("dark");
  else if (wa.colorScheme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  // Only apply Telegram color tokens when user has NOT forced a theme
  // (forced theme uses our CSS .dark / :root variables)
  if (!userTheme) {
    const map: [string, string | undefined][] = [
      ["--bg", tp.bg_color],
      ["--surface", tp.secondary_bg_color || tp.bg_color],
      ["--fg", tp.text_color],
      ["--muted", tp.hint_color],
      ["--line", tp.section_separator_color || tp.hint_color],
      ["--cyan", tp.button_color || tp.link_color],
      ["--button-text", tp.button_text_color],
      ["--destructive", tp.destructive_text_color],
    ];
    for (const [cssVar, hex] of map) {
      const rgb = hexToRgbSpace(hex);
      if (rgb) root.style.setProperty(cssVar, rgb);
    }
  } else {
    // Clear inline TG overrides so CSS dark/light works
    for (const v of ["--bg", "--surface", "--fg", "--muted", "--line", "--cyan", "--button-text", "--destructive"]) {
      root.style.removeProperty(v);
    }
  }

  const isDark = root.classList.contains("dark");
  const bg = userTheme
    ? (isDark ? "#0f121c" : "#f2f6fc")
    : (tp.bg_color || (wa.colorScheme === "dark" ? "#181818" : "#f6f7f9"));
  try {
    wa.setHeaderColor?.(bg);
    wa.setBackgroundColor?.(bg);
  } catch { /* ignore */ }
}

/**
 * Telegram Mini App bootstrap:
 * theme sync + initData auth (no password login).
 */
export function TelegramWebAppAuth({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const hasChildren = !!children;
  const [status, setStatus] = useState<"boot" | "auth" | "ok" | "err">(hasChildren ? "ok" : "boot");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function ensureScript() {
      if (window.Telegram?.WebApp) return;
      await new Promise<void>((resolve) => {
        const existing = document.getElementById("tg-webapp-js");
        if (existing) {
          if (window.Telegram?.WebApp) return resolve();
          existing.addEventListener("load", () => resolve());
          setTimeout(() => resolve(), 2000);
          return;
        }
        const sc = document.createElement("script");
        sc.id = "tg-webapp-js";
        sc.src = "https://telegram.org/js/telegram-web-app.js";
        sc.async = true;
        sc.onload = () => resolve();
        sc.onerror = () => resolve();
        document.head.appendChild(sc);
        setTimeout(() => resolve(), 2000);
      });
    }

    async function run() {
      await ensureScript();
      const wa = window.Telegram?.WebApp;
      if (wa) {
        try {
          wa.ready();
          wa.expand();
          wa.MainButton?.hide();
          wa.BackButton?.hide();
          applyTelegramTheme(wa);
        } catch { /* ignore */ }
      }

      try {
        const s = await fetch("/api/auth/webapp", { credentials: "include" }).then((r) => r.json());
        if (s?.authenticated) {
          if (!cancelled) {
            setStatus("ok");
            if (!hasChildren && (path === "/" || path === "/login" || path === "/register")) {
              router.replace("/dashboard");
              router.refresh();
            }
          }
          return;
        }
      } catch { /* continue */ }

      const initData = wa?.initData || "";
      if (!initData) {
        if (hasChildren) return;
        if (!cancelled) {
          setStatus("err");
          setMessage("សូមបើក Mini App នេះពីក្នុង Telegram Bot ប៉ុណ្ណោះ។\nPlease open this Mini App from the Telegram Bot.");
        }
        return;
      }

      if (!cancelled) setStatus("auth");
      try {
        const r = await fetch("/api/auth/webapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (!cancelled) {
            setStatus("err");
            setMessage(
              data?.error === "ACCOUNT_SUSPENDED"
                ? "គណនីរបស់អ្នកត្រូវបានផ្អាក។ / Account suspended."
                : data?.error === "REGISTRATION_CLOSED"
                  ? "ការចុះឈ្មោះត្រូវបានបិទ។ / Registration closed."
                  : "Authentication failed. Please reopen the Mini App."
            );
          }
          return;
        }
        try { wa?.HapticFeedback?.notificationOccurred("success"); } catch { /* */ }
        if (!cancelled) {
          setStatus("ok");
          router.replace("/dashboard");
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          setStatus("err");
          setMessage("Network error. Please try again.");
        }
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [router, path, hasChildren]);

  if (status === "ok" && hasChildren) return <>{children}</>;
  if (status === "ok") return null;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      {status === "err" ? (
        <>
          <AnimatedEmoji emoji="📱" motion="float" size={56} />
          <p className="max-w-xs whitespace-pre-line text-[14px] text-muted leading-relaxed">{message}</p>
        </>
      ) : (
        <>
          <AnimatedEmoji emoji={status === "auth" ? "🔐" : "✨"} motion={status === "auth" ? "pulse" : "spin"} size={48} />
          <p className="text-[14px] text-muted">
            {status === "auth" ? "កំពុងចូល… / Signing in…" : "កំពុងផ្ទុក… / Loading…"}
          </p>
        </>
      )}
    </div>
  );
}
