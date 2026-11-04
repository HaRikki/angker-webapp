import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isMiniAdminId } from "@/lib/auth/miniAdmin";
import { DigitalStoreAdminView } from "@/components/DigitalStoreAdminView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser().catch(() => null);
  if (!user || !isMiniAdminId(user.telegramId)) redirect("/services");
  return <DigitalStoreAdminView />;
}
