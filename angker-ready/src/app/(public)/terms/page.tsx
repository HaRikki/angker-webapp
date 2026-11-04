import { getDict } from "@/i18n";
import { getLang } from "@/i18n/server";
import { publicSettings } from "@/lib/settings";
export default async function Page() {
  const t = getDict(getLang()), s = await publicSettings();
  return <main className="mx-auto max-w-3xl px-4 py-12"><h1 className="mb-6 text-3xl font-bold">{t.terms.title}</h1>
    {s.terms ? <div className="glass whitespace-pre-wrap p-6 text-sm leading-relaxed">{s.terms}</div> : <p className="text-muted">{t.terms.none}</p>}</main>;
}
