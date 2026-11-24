import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { ja } from "./ja";
import { ru } from "./ru";
import { uk } from "./uk";
import { zh } from "./zh";

export type Messages = Record<keyof typeof en, string>;
const translations: Record<string, Messages> = { en, ru, uk, "zh-CN": zh, es, de, ja };
export const labels = (locale: string) => translations[locale] ?? en;
export const languages = {
    en: "English",
    ru: "Русский",
    uk: "Українська",
    "zh-CN": "简体中文",
    es: "Español",
    de: "Deutsch",
    ja: "日本語",
};
