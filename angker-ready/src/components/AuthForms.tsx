"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useI18n, useToast } from "./Providers";
import { Field, SubmitButton } from "./ui";
import { DEFAULT_LOGO } from "./Logo";

/** Telegram login: a styled button that opens Telegram's official auth popup (Telegram.Login.auth).
 *  The signed payload is still verified on the server (/api/auth/telegram). If the popup API is unavailable, the official widget is shown instead. */
type TgWin = { Telegram?: { Login?: { auth?: (o: { bot_id: number; request_access?: string }, cb: (u: unknown) => void) => void } } } & Record<string, unknown>;
function TelegramLogin() {
  const { t } = useI18n(), toast = useToast(), router = useRouter(), box = useRef<HTMLDivElement>(null);
  const [bot, setBot] = useState(""), [botId, setBotId] = useState(0), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [legacy, setLegacy] = useState(false);
  useEffect(() => { fetch("/api/public/telegram-login").then((r) => r.json()).then((d) => { setBot(d?.bot ?? ""); setBotId(Number(d?.id) || 0); }).catch(() => {}); }, []);
  // preload Telegram's script so the popup opens instantly on click (popup blockers allow it only inside the click)
  useEffect(() => {
    if (!bot || document.getElementById("tg-login-js")) return;
    const sc = document.createElement("script"); sc.id = "tg-login-js"; sc.src = "https://telegram.org/js/telegram-widget.js?22"; sc.async = true; document.head.appendChild(sc);
  }, [bot]);
  async function finish(user: unknown) {
    setErr(""); setBusy(true);
    const r = await post("/api/auth/telegram", user);
    if (r.ok) { router.replace("/dashboard"); router.refresh(); return; }
    setBusy(false);
    const m = (t.errors as Record<string, string>)[r.data.error ?? ""] ?? t.errors.generic; setErr(m); toast.push(m, "err");
  }
  function start() {
    const L = (window as unknown as TgWin).Telegram?.Login;
    if (!L?.auth || !botId) { setLegacy(true); return; }
    setErr(""); setBusy(true);
    L.auth({ bot_id: botId, request_access: "write" }, (user) => { if (!user) { setBusy(false); return; } void finish(user); });
  }
  useEffect(() => {   // fallback: official widget
    const el = box.current; if (!legacy || !bot || !el) return;
    (window as unknown as Record<string, unknown>).onTelegramAuth = (user: unknown) => { void finish(user); };
    const sc = document.createElement("script");
    sc.src = "https://telegram.org/js/telegram-widget.js?22"; sc.async = true;
    sc.setAttribute("data-telegram-login", bot); sc.setAttribute("data-size", "large"); sc.setAttribute("data-radius", "12");
    sc.setAttribute("data-request-access", "write"); sc.setAttribute("data-onauth", "onTelegramAuth(user)");
    el.innerHTML = ""; el.appendChild(sc);
    return () => { el.innerHTML = ""; };
  }, [legacy, bot]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bot) return null;
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t.auth.tgOr}<span className="h-px flex-1 bg-line" /></div>
      {legacy ? <div className="flex min-h-[44px] justify-center" ref={box} /> : (
        <button type="button" onClick={start} disabled={busy}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-[#2AABEE] to-[#229ED9] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(34,158,217,0.8)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#229ED9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70">
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            {busy
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
          </span>
          <span className="relative">{t.auth.tgTitle}</span>
        </button>
      )}
      <p className="mt-2 text-center text-xs text-muted">{t.auth.tgNote}</p>
      {err && <p role="alert" className="mt-2 text-center text-sm text-red-500">{err}</p>}
    </div>
  );
}

async function post(url: string, body: unknown) {
  type Res = { ok: boolean; data: { error?: string; fields?: string[]; resetUrl?: string; verifyUrl?: string; ok?: boolean } };
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({ error: r.ok ? undefined : "SERVER_ERROR" }));
    return { ok: r.ok, data } as Res;
  } catch { return { ok: false, data: { error: "SERVER_ERROR" } } as Res; }
}
/** Google Identity Services button. ID token verified on server (/api/auth/google). Hidden when GOOGLE_CLIENT_ID is empty. */
function GoogleLogin() {
  const { t } = useI18n(), toast = useToast(), router = useRouter(), box = useRef<HTMLDivElement>(null);
  const [id, setId] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/public/google-login").then((r) => r.json()).then((d) => setId(d?.clientId ?? "")).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) return;
    const init = () => {
      const g = (window as unknown as { google?: { accounts: { id: { initialize: (o: unknown) => void; renderButton: (el: HTMLElement, o: unknown) => void } } } }).google;
      if (!g || !box.current) return;
      g.accounts.id.initialize({
        client_id: id,
        ux_mode: "popup",
        auto_select: false,
        callback: async (resp: { credential?: string }) => {
          if (!resp?.credential) return;
          setErr("");
          setBusy(true);
          const r = await post("/api/auth/google", { credential: resp.credential });
          setBusy(false);
          if (r.ok) { router.replace("/dashboard"); router.refresh(); return; }
          const code = r.data?.error ?? "";
          const m = (t.errors as Record<string, string>)[code] ?? t.errors.generic;
          setErr(m);
          toast.push(m, "err");
        },
      });
      box.current.innerHTML = "";
      g.accounts.id.renderButton(box.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        width: Math.min(320, box.current.clientWidth || 320),
      });
    };
    const SRC = "https://accounts.google.com/gsi/client";
    let sc = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (sc) { if ((window as unknown as { google?: unknown }).google) init(); else sc.addEventListener("load", init); }
    else { sc = document.createElement("script"); sc.src = SRC; sc.async = true; sc.addEventListener("load", init); document.head.appendChild(sc); }
    return () => sc?.removeEventListener("load", init);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        <span>{(t.auth as any).orContinueWith ?? "or continue with"}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className={`flex min-h-[44px] justify-center ${busy ? "pointer-events-none opacity-60" : ""}`} ref={box} />
      {busy && <p className="text-center text-xs text-muted">Signing in with Google…</p>}
      {err && <p role="alert" className="text-center text-sm text-red-500">{err}</p>}
    </div>
  );
}

function Shell({ title, children, foot }: { title: string; children: React.ReactNode; foot: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-12"><div className="glass glow p-6 sm:p-8"><img src={DEFAULT_LOGO} alt="AngKer" width={72} height={72} className="mx-auto mb-4 h-[72px] w-[72px] object-contain" /><h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>{children}<p className="mt-6 text-center text-sm text-muted">{foot}</p></div></div>;
}

export function LoginForm() {
  const { t } = useI18n(), toast = useToast(), router = useRouter(), [loading, setLoading] = useState(false), [err, setErr] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setLoading(true); setErr("");
    const r = await post("/api/auth/login", { identifier: f.get("identifier"), password: f.get("password"), remember: f.get("remember") === "on" });
    setLoading(false);
    if (r.ok) { router.replace("/dashboard"); router.refresh(); return; }
    const m = (t.errors as Record<string, string>)[r.data.error ?? ""] ?? t.errors.generic; setErr(m); toast.push(m, "err");
  }
  return (
    <Shell title={t.auth.loginTitle} foot={<>{t.auth.noAccount} <Link href="/register" className="font-semibold text-cyan">{t.auth.register}</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field name="identifier" label={t.auth.identifier} autoComplete="username" required maxLength={254} />
        <Field name="password" type="password" label={t.auth.password} autoComplete="current-password" required maxLength={128} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" className="h-4 w-4 accent-[rgb(var(--cyan))]" />{t.auth.remember}</label>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <div className="text-right text-sm"><Link href="/forgot-password" className="text-cyan hover:underline">{(t.auth as any).forgotPassword ?? "Forgot password?"}</Link></div>
        <SubmitButton loading={loading}>{t.auth.login}</SubmitButton>
      </form>
      <GoogleLogin />
      <TelegramLogin />
    </Shell>
  );
}

export function RegisterForm() {
  const { t } = useI18n(), toast = useToast(), router = useRouter(), [loading, setLoading] = useState(false), [errs, setErrs] = useState<Record<string, string>>({}), [top, setTop] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget), v = (k: string) => String(f.get(k) ?? ""), pw = v("password"), x: Record<string, string> = {};
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(v("username"))) x.username = t.errors.username;
    if (!/^\S+@\S+\.\S+$/.test(v("email"))) x.email = t.errors.email;
    if (!(pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw))) x.password = t.errors.password;
    if (pw !== v("confirmPassword")) x.confirmPassword = t.errors.mismatch;
    if (f.get("acceptTerms") !== "on") x.acceptTerms = t.errors.terms;
    setErrs(x); setTop(""); if (Object.keys(x).length) return;
    setLoading(true);
    const r = await post("/api/auth/register", { username: v("username"), email: v("email"), password: pw, confirmPassword: v("confirmPassword"), acceptTerms: true });
    setLoading(false);
    if (r.ok) { router.replace("/dashboard"); router.refresh(); return; }
    if (r.data.fields) setErrs(Object.fromEntries(r.data.fields.map((k) => [k, (t.errors as Record<string, string>)[k] ?? t.errors.INVALID_INPUT])));
    const m = (t.errors as Record<string, string>)[r.data.error ?? ""] ?? t.errors.generic; setTop(m); toast.push(m, "err");
  }
  return (
    <Shell title={t.auth.registerTitle} foot={<>{t.auth.haveAccount} <Link href="/login" className="font-semibold text-cyan">{t.auth.login}</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field name="username" label={t.auth.username} hint={t.auth.userHint} error={errs.username} autoComplete="username" required maxLength={20} />
        <Field name="email" type="email" label={t.auth.email} error={errs.email} autoComplete="email" required maxLength={254} />
        <Field name="password" type="password" label={t.auth.password} hint={t.auth.pwHint} error={errs.password} autoComplete="new-password" required maxLength={128} />
        <Field name="confirmPassword" type="password" label={t.auth.confirm} error={errs.confirmPassword} autoComplete="new-password" required maxLength={128} />
        <div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acceptTerms" className="h-4 w-4 accent-[rgb(var(--cyan))]" />{t.auth.terms}</label>
          <Link href="/terms" target="_blank" className="mt-1 inline-block text-xs text-cyan">{t.auth.termsLink}</Link>{errs.acceptTerms && <p className="text-xs text-red-500">{errs.acceptTerms}</p>}</div>
        {top && <p role="alert" className="text-sm text-red-500">{top}</p>}
        <SubmitButton loading={loading}>{t.auth.register}</SubmitButton>
      </form>
      <GoogleLogin />
      <TelegramLogin />
    </Shell>
  );
}


export function ForgotPasswordForm() {
  const { t } = useI18n(), toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const r = await post("/api/auth/forgot-password", { email: f.get("email") });
    setLoading(false);
    if (!r.ok) {
      const m = (t.errors as Record<string, string>)[r.data.error ?? ""] ?? t.errors.generic;
      toast.push(m, "err");
      return;
    }
    setSent(true);
    if (r.data.resetUrl) setDevUrl(r.data.resetUrl);
    toast.push((t.auth as any).resetSent ?? "If that email exists, a reset link was sent.", "ok");
  }

  return (
    <Shell title={(t.auth as any).forgotTitle ?? "Forgot password"} foot={<>{(t.auth as any).rememberPassword ?? "Remember password?"} <Link href="/login" className="font-semibold text-cyan">{t.auth.login}</Link></>}>
      {sent ? (
        <div className="space-y-3 text-sm text-muted">
          <p>{(t.auth as any).resetSent ?? "If that email exists, a reset link was sent. Check your inbox."}</p>
          {devUrl && (
            <p className="break-all rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">
              Dev link: <a href={devUrl} className="underline">{devUrl}</a>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field name="email" type="email" label={(t.auth as any).email ?? "Email"} required autoComplete="email" />
          <SubmitButton loading={loading}>{(t.auth as any).sendReset ?? "Send reset link"}</SubmitButton>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n(), toast = useToast(), router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const r = await post("/api/auth/reset-password", {
      token,
      password: f.get("password"),
      confirmPassword: f.get("confirmPassword"),
    });
    setLoading(false);
    if (!r.ok) {
      const m = (t.errors as Record<string, string>)[r.data.error ?? ""] ?? t.errors.generic;
      toast.push(m, "err");
      return;
    }
    toast.push((t.auth as any).passwordChanged ?? "Password updated. Please log in.", "ok");
    router.replace("/login");
  }

  if (!token) {
    return (
      <Shell title={(t.auth as any).resetTitle ?? "Reset password"} foot={<Link href="/forgot-password" className="font-semibold text-cyan">{(t.auth as any).requestNew ?? "Request a new link"}</Link>}>
        <p className="text-sm text-red-400">{(t.auth as any).invalidToken ?? "Invalid or missing reset token."}</p>
      </Shell>
    );
  }

  return (
    <Shell title={(t.auth as any).resetTitle ?? "Reset password"} foot={<Link href="/login" className="font-semibold text-cyan">{t.auth.login}</Link>}>
      <form onSubmit={submit} className="space-y-3">
        <Field name="password" type="password" label={(t.auth as any).newPassword ?? "New password"} required autoComplete="new-password" />
        <Field name="confirmPassword" type="password" label={(t.auth as any).confirmPassword ?? "Confirm password"} required autoComplete="new-password" />
        <p className="text-xs text-muted">Min 8 chars, with upper, lower, and a digit.</p>
        <SubmitButton loading={loading}>{(t.auth as any).updatePassword ?? "Update password"}</SubmitButton>
      </form>
    </Shell>
  );
}
