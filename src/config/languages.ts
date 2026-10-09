// Shared with the server (phone mode synthesizes speech server-side).
import languages from "../../shared/languages.json";

export const LANGUAGES = languages;

export type LanguageCode = keyof typeof LANGUAGES;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && value in LANGUAGES;
}
