import { Wrench } from "lucide-react";
import { getDict } from "@/i18n";
import { getLang } from "@/i18n/server";
export function Maintenance() {
  const t = getDict(getLang()).app.maint;
  return <main className="grid min-h-screen place-items-center px-4"><div className="glass glow max-w-md p-8 text-center"><Wrench className="mx-auto mb-4 h-8 w-8 text-cyan" /><h1 className="text-2xl font-bold">{t.title}</h1><p className="mt-2 text-muted">{t.body}</p></div></main>;
}
