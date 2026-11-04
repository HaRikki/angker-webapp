"use client";
import { Moon, Sun, Languages } from "lucide-react";
import { useI18n } from "./Providers";

export function ThemeToggle() {
  const { t } = useI18n();
  const toggle = () => {
    const el = document.documentElement, dark = !el.classList.contains("dark");
    el.classList.toggle("dark", dark);
    document.cookie = `theme=${dark ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
  };
  return (
    <button onClick={toggle} aria-label={t.common.theme} className="btn-ghost !px-3 !py-2">
      <Moon className="hidden h-4 w-4 dark:block" /><Sun className="h-4 w-4 dark:hidden" />
    </button>
  );
}
export function LangSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <button onClick={() => setLang(lang === "km" ? "en" : "km")} aria-label={t.common.language} className="btn-ghost !px-3 !py-2">
      <Languages className="h-4 w-4" /><span className="text-xs">{lang === "km" ? "EN" : "ខ្មែរ"}</span>
    </button>
  );
}
