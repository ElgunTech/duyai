import { config, LANGUAGES } from "../config.js";
import { withNetworkRetry } from "./retry.js";

const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
const TIMEOUT_MS = 4000; // per attempt; network drops are retried

/** Azure Translator (free F0 tier: 2M characters a month): fast, no Claude credit needed. */
export const translatorConfigured = () => Boolean(config.translator.key);

/** Azure Translator uses a few codes of its own (e.g. "zh-Hans" for Mandarin). */
const translatorCode = (code) => LANGUAGES[code]?.translator ?? code;

export async function azureTranslate({ text, from, to }) {
  const url =
    `${ENDPOINT}&from=${encodeURIComponent(translatorCode(from))}` +
    `&to=${encodeURIComponent(translatorCode(to))}`;
  const response = await withNetworkRetry(() =>
    fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.translator.key,
        ...(config.translator.region && {
          "Ocp-Apim-Subscription-Region": config.translator.region,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text }]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Azure Translator ${response.status}: ${body?.error?.message ?? "error"}`);
  }
  const translation = body?.[0]?.translations?.[0]?.text;
  if (typeof translation !== "string") throw new Error("Azure Translator: empty response");
  return translation;
}

/** Health check: one tiny translation (a few characters of the free quota). */
export const checkTranslator = () => azureTranslate({ text: "salam", from: "az", to: "en" });
