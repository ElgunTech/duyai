import { createContext, useContext } from "react";
import { LANGUAGES, type LanguageCode } from "../config/languages";
import { storage } from "../lib/storage";

export type UiLang = "en" | "az";

const STORAGE_KEY = "uiLang";

function initialLang(): UiLang {
  const saved = storage.get(STORAGE_KEY);
  return saved === "az" || saved === "en" ? saved : "en"; // English by default
}

/**
 * The interface language lives in a module variable so plain functions (validation
 * messages, report text) can translate too; React re-renders through UiLangContext.
 */
let current: UiLang = initialLang();

export const getUiLang = () => current;

export function setUiLangGlobal(lang: UiLang) {
  current = lang;
  storage.set(STORAGE_KEY, lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Picks the text for the current interface language: `tr("Salam", "Hello")`. */
export const tr = (az: string, en: string) => (current === "az" ? az : en);

/** A call language's name in the interface language ("Almanca" / "German"). */
export const langName = (code: LanguageCode) =>
  current === "az" ? LANGUAGES[code].name : LANGUAGES[code].englishName;

export const UiLangContext = createContext<{ lang: UiLang; setLang: (lang: UiLang) => void }>({
  lang: current,
  setLang: () => {},
});

export const useUiLang = () => useContext(UiLangContext);
