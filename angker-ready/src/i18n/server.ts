import { cookies } from "next/headers";
import { asLang, asTheme } from "./index";
export const getLang = () => asLang(cookies().get("lang")?.value);
export const getTheme = () => asTheme(cookies().get("theme")?.value);
