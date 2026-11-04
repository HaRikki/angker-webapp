"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle, LangSwitcher } from "./Controls";
import { useI18n } from "./Providers";

export function SiteHeader({ siteName, logoUrl, loggedIn }: { siteName: string; logoUrl: string; loggedIn: boolean }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  const links = [["/#features", t.nav.features], ["/#how", t.nav.how], ["/#faq", t.nav.faq], ["/#contact", t.nav.contact]];
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label={siteName}><Logo name={siteName} logoUrl={logoUrl} /></Link>
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">{links.map(([h, l]) => <a key={h} href={h} className="hover:text-fg">{l}</a>)}</nav>
        <div className="hidden items-center gap-2 md:flex">
          <LangSwitcher /><ThemeToggle />
          {loggedIn ? <Link href="/dashboard" className="btn-primary">{t.nav.dashboard}</Link> : <><Link href="/login" className="btn-ghost">{t.nav.login}</Link><Link href="/register" className="btn-primary">{t.nav.signup}</Link></>}
        </div>
        <button className="btn-ghost !px-3 !py-2 md:hidden" aria-label={t.common.menu} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line/60 px-4 py-4 md:hidden">
          {links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block text-sm">{l}</a>)}
          <div className="flex flex-wrap gap-2"><LangSwitcher /><ThemeToggle />
            {loggedIn ? <Link href="/dashboard" className="btn-primary">{t.nav.dashboard}</Link> : <><Link href="/login" className="btn-ghost">{t.nav.login}</Link><Link href="/register" className="btn-primary">{t.nav.signup}</Link></>}</div>
        </div>
      )}
    </header>
  );
}
