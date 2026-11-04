import { redirect } from "next/navigation";

/** Login removed — Telegram Mini App uses WebApp auth only. */
export default function LoginPage() {
  redirect("/");
}
