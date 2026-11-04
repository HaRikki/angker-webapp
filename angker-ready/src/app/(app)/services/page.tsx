import { Suspense } from "react";
import { NewOrderView } from "@/components/NewOrderView";
export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
      <NewOrderView />
    </Suspense>
  );
}
