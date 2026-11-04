"use client";
import { useEffect, useState } from "react";

const ENDPOINTS: Record<string, string> = {
  payments: "/api/admin/payments?limit=50",
  providers: "/api/admin/providers",
  services: "/api/admin/services?limit=50",
  packages: "/api/admin/packages?limit=50",
  audit: "/api/admin/audit?limit=50",
};

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const title = "packages".charAt(0).toUpperCase() + "packages".slice(1);

  useEffect(() => {
    fetch(ENDPOINTS["packages"])
      .then((r) => r.json())
      .then((j) => { if (!j.ok) setErr(j.error); else setData(j.data); })
      .catch(() => setErr("Failed to load"));
  }, []);

  if (err) return <div className="text-red-400">{err}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        <p className="text-sm text-slate-400">Live data from Admin API · Full CRUD available via API</p>
      </div>
      <pre className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs overflow-auto max-h-[75vh] text-slate-300 whitespace-pre-wrap">
        {data ? JSON.stringify(data, null, 2) : "Loading…"}
      </pre>
    </div>
  );
}
