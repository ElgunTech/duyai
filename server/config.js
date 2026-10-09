import "dotenv/config";
import languages from "../shared/languages.json" with { type: "json" };

/** Runtime configuration, read once from the environment (.env). */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  azure: {
    key: process.env.AZURE_SPEECH_KEY ?? "",
    region: process.env.AZURE_SPEECH_REGION ?? "",
  },
  /** Optional Azure Translator: free, fast live translation that needs no Claude credit. */
  translator: {
    key: process.env.AZURE_TRANSLATOR_KEY ?? "",
    region: process.env.AZURE_TRANSLATOR_REGION ?? process.env.AZURE_SPEECH_REGION ?? "",
    /** "azure" (default when a key is set) or "claude" (Claude translates; Azure is the fallback). */
    engine:
      process.env.TRANSLATION_ENGINE || (process.env.AZURE_TRANSLATOR_KEY ? "azure" : "claude"),
  },
  claude: {
    /** Deep work where quality matters more than speed: the end-of-call report. */
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    /** Live path (translation, auto-answer, scam rating): every millisecond is heard. */
    fastModel: process.env.CLAUDE_FAST_MODEL || "claude-opus-5-5",
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  },
  /** Phone mode (GSM ↔ GSM through Twilio). Optional: the app works without it. */
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
    /** Fixed public URL (e.g. a named tunnel); if empty a temporary Cloudflare tunnel is opened. */
    publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/$/, ""),
  },
};

export const phoneModeConfigured = Boolean(
  config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber,
);

/** Supported languages (shared with the frontend). */
export const LANGUAGES = languages;

/** Language codes the API accepts, mapped to the names used in prompts. */
export const LANGUAGE_NAMES = Object.fromEntries(
  Object.entries(languages).map(([code, lang]) => [code, lang.englishName]),
);
