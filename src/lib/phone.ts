import type { LanguageCode } from "../config/languages";

export interface CountryMatch {
  /** Calling code without "+", e.g. "49". */
  code: string;
  country: string;
  lang: LanguageCode;
}

/** Calling codes of countries whose main language the app supports. */
const COUNTRIES: [code: string, country: string, lang: LanguageCode][] = [
  ["994", "Azərbaycan", "az"],
  ["90", "Türkiyə", "tr"],
  ["49", "Almaniya", "de"],
  ["43", "Avstriya", "de"],
  ["41", "İsveçrə", "de"],
  ["423", "Lixtenşteyn", "de"],
  ["7", "Rusiya / Qazaxıstan", "ru"],
  ["375", "Belarus", "ru"],
  ["33", "Fransa", "fr"],
  ["377", "Monako", "fr"],
  ["1", "ABŞ / Kanada", "en"],
  ["44", "Böyük Britaniya", "en"],
  ["353", "İrlandiya", "en"],
  ["61", "Avstraliya", "en"],
  ["64", "Yeni Zelandiya", "en"],
  ["966", "Səudiyyə Ərəbistanı", "ar"],
  ["971", "BƏƏ", "ar"],
  ["974", "Qətər", "ar"],
  ["965", "Küveyt", "ar"],
  ["973", "Bəhreyn", "ar"],
  ["968", "Oman", "ar"],
  ["962", "İordaniya", "ar"],
  ["961", "Livan", "ar"],
  ["964", "İraq", "ar"],
  ["20", "Misir", "ar"],
  ["34", "İspaniya", "es"],
  ["52", "Meksika", "es"],
  ["54", "Argentina", "es"],
  ["57", "Kolumbiya", "es"],
  ["56", "Çili", "es"],
  ["51", "Peru", "es"],
  ["39", "İtaliya", "it"],
  ["55", "Braziliya", "pt"],
  ["351", "Portuqaliya", "pt"],
  ["86", "Çin", "zh"],
  ["886", "Tayvan", "zh"],
  ["81", "Yaponiya", "ja"],
  ["82", "Cənubi Koreya", "ko"],
  ["91", "Hindistan", "hi"],
  ["98", "İran", "fa"],
  ["380", "Ukrayna", "uk"],
  ["998", "Özbəkistan", "uz"],
  ["48", "Polşa", "pl"],
  ["31", "Niderland", "nl"],
  ["972", "İsrail", "he"],
];

// Longest codes first, so "+423" (Liechtenstein) wins over "+4…" prefixes and "+7" never
// shadows a longer code.
const BY_LENGTH = [...COUNTRIES].sort((a, b) => b[0].length - a[0].length);

/**
 * Normalizes a typed number to its international digits:
 * "+49 30 123", "0049 30 123" → "4930123"; a local "050 123 45 67" is treated as Azerbaijani.
 */
export function internationalDigits(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `994${digits.slice(1)}`;
  return digits;
}

/** Country and language for a phone number, or null if the code is unknown or too short. */
export function detectCountry(input: string): CountryMatch | null {
  const digits = internationalDigits(input);
  if (digits.length < 4) return null; // still typing
  const hit = BY_LENGTH.find(([code]) => digits.startsWith(code));
  return hit ? { code: hit[0], country: hit[1], lang: hit[2] } : null;
}
