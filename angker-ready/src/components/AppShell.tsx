"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useI18n } from "./Providers";
import { money } from "@/lib/format";
import { PremiumIcon, type IconName } from "./PremiumIcon";
import { Moon, Sun } from "lucide-react";

const ADMIN_TG_IDS = new Set(["8325492974"]);

const BOTTOM: {
  href: string;
  key: string;
  icon: IconName;
  labelEn: string;
  labelKm: string;
}[] = [
  { href: "/services", key: "smm", icon: "smm", labelEn: "SMM", labelKm: "SMM" },
  { href: "/digital", key: "digital", icon: "digital", labelEn: "Digital", labelKm: "Digital" },
  { href: "/orders", key: "orders", icon: "orders", labelEn: "Orders", labelKm: "Orders" },
  { href: "/add-funds", key: "wallet", icon: "wallet", labelEn: "Wallet", labelKm: "Wallet" },
  { href: "/profile", key: "profile", icon: "profile", labelEn: "Profile", labelKm: "Profile" },
];

export function AppShell({
  siteName,
  logoUrl,
  username,
  balance,
  telegramId = "",
  children,
}: {
  siteName: string;
  logoUrl: string;
  username: string;
  balance: string;
  telegramId?: string;
  children: ReactNode;
}) {
  const { t, lang, setLang } = useI18n() as {
    t: { app: { nav: Record<string, string>; balance?: string } };
    lang: string;
    setLang?: (l: string) => void;
  };
  const path = usePathname();
  const [dark, setDark] = useState(false);
  const isAdmin = ADMIN_TG_IDS.has(String(telegramId || "").trim());

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark") {
        document.documentElement.classList.add("dark");
        setDark(true);
      } else if (saved === "light") {
        document.documentElement.classList.remove("dark");
        setDark(false);
      } else {
        setDark(document.documentElement.classList.contains("dark"));
      }
    } catch {
      setDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    if (next) root.classList.add("dark");
    else root.classList.remove("dark");
    setDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
      document.cookie = `theme=${next ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
    } catch {}
    // Clear Telegram inline CSS vars so our .dark / :root palette applies
    for (const v of ["--bg", "--surface", "--fg", "--muted", "--line", "--cyan", "--button-text", "--destructive"]) {
      root.style.removeProperty(v);
    }
    try {
      const wa = (window as Window & { Telegram?: { WebApp?: { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } } }).Telegram?.WebApp;
      const bg = next ? "#0f121c" : "#f2f6fc";
      wa?.setHeaderColor?.(bg);
      wa?.setBackgroundColor?.(bg);
    } catch {}
  };

  const toggleLang = () => {
    if (typeof setLang === "function") setLang(lang === "km" ? "en" : "km");
  };

  const items = isAdmin
    ? [
        ...BOTTOM,
        {
          href: "/mini-admin",
          key: "admin",
          icon: "admin" as IconName,
          labelEn: "Admin",
          labelKm: "Admin",
        },
      ]
    : BOTTOM;

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-bg">
      <header
        className="shrink-0 z-30 border-b border-line/40 bg-surface/90 backdrop-blur-xl"
        style={{ paddingTop: "max(6px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/bot-logo"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-2xl object-cover ring-2 ring-cyan/20"
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold leading-tight tracking-tight">
                {siteName}
              </div>
              <div className="truncate text-[11px] text-muted">@{username}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleLang}
            className="grid h-9 w-9 place-items-center rounded-full bg-line/40 text-[13px] font-bold active:scale-90"
            aria-label="Language"
          >
            {lang === "km" ? "ខ្មែរ" : "EN"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="grid h-9 w-9 place-items-center rounded-full bg-line/40 text-muted active:scale-90"
            aria-label="Theme"
          >
            {dark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link href="/add-funds" className="store-balance-pill">
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              {lang === "km" ? "សមតុល្យ" : "Balance"}
            </span>
            <span className="tabular-nums">{money(balance)}</span>
          </Link>
        </div>
      </header>

      <main className="tg-main min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pt-3">
        {children}
      </main>

      <nav
        className="tg-nav fixed inset-x-0 bottom-0 z-40 border-t border-line/50 bg-surface/95 backdrop-blur-xl"
        aria-label="Main"
      >
        <div className="mx-auto flex h-[58px] max-w-md items-stretch justify-between px-0.5">
          {items.map((item) => {
            const active =
              path === item.href ||
              path.startsWith(item.href + "/") ||
              (item.href === "/services" &&
                (path === "/dashboard" || path.startsWith("/new-order")));
            const label = lang === "km" ? item.labelKm : item.labelEn;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-semibold transition ${
                  active ? "text-cyan" : "text-muted"
                }`}
              >
                <PremiumIcon name={item.icon} active={active} size={active ? 22 : 20} />
                <span className="max-w-full truncate leading-none">{label}</span>
                {active && <span className="mt-0.5 h-1 w-1 rounded-full bg-cyan" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function AppMoreLinks() {
  return null;
}
