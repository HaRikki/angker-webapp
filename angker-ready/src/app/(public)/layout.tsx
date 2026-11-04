import { Maintenance } from "@/components/Maintenance";
import { publicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Public routes — Mini App only (no marketing header / login links). */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const s = await publicSettings();
  if (s.maintenance) return <Maintenance />;
  return <>{children}</>;
}
