import { en, type Dict } from "./en";
import { km } from "./km";
export type Lang = "km" | "en";
export type Theme = "dark" | "light";
export const getDict = (l: Lang): Dict => (l === "en" ? en : km);
export const asLang = (v?: string): Lang => (v === "en" ? "en" : "km");
export const asTheme = (v?: string): Theme => (v === "light" ? "light" : "dark");
export type { Dict };
