import { Router } from "express";
import { config, LANGUAGE_NAMES } from "./config.js";
import { getCallState } from "./callDetect.js";
import { demoMode } from "./demo.js";
import { previousCalls, recentCalls, saveCall } from "./memory/callStore.js";
import { findCallNumber } from "./memory/phoneLinkHistory.js";
import { issueSpeechToken } from "./services/speech.js";
import {
  checkClaude,
  describeClaudeError,
  insights,
  respond,
  summarize,
  translate,
} from "./services/claude.js";
import { azureTranslate, checkTranslator, translatorConfigured } from "./services/translator.js";

const HEALTH_TTL_MS = 30_000;
const MAX_TEXT_LENGTH = 2000;
const MAX_PROFILE_LENGTH = 4000;
const MAX_TRANSCRIPT_LINES = 500;

const isLanguage = (code) => Object.hasOwn(LANGUAGE_NAMES, code);

const NO_REPLY = {
  reply: "",
  reply_translation: "",
  needs_user: false,
  note: "",
  risk: { level: "none", category: "none", reason: "" },
};

// The public demo never touches Claude (paid credit).
const useAzureFirst = () =>
  demoMode || (translatorConfigured() && config.translator.engine === "azure");

/**
 * Runs the Claude step; if it fails (e.g. no credit) and Azure Translator is set up, the
 * call keeps going with a plain Azure translation instead of an error.
 */
async function withAzureFallback(label, claudeStep, utterance) {
  try {
    return await claudeStep();
  } catch (err) {
    if (!translatorConfigured()) throw err;
    console.warn(
      `[${label}] Claude failed, Azure Translator fallback: ${describeClaudeError(err)}`,
    );
    return { ...NO_REPLY, translation: await azureTranslate(utterance) };
  }
}

const isTimeZone = (zone) => {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const api = Router();

api.get("/speech-token", async (_req, res) => {
  try {
    res.json({ token: await issueSpeechToken(), region: config.azure.region });
  } catch (err) {
    console.error("[speech-token]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Call diagnostics from the browser (local only), printed to the server log. */
api.post("/diagnostics", (req, res) => {
  const { event, data } = req.body ?? {};
  if (typeof event === "string") {
    console.log(
      `[diag] ${new Date().toLocaleTimeString("az")} ${event}`,
      JSON.stringify(data ?? {}),
    );
  }
  res.status(204).end();
});

/** Is a Phone Link call active right now? (Windows only; used for automatic start/stop.) */
api.get("/call-state", (_req, res) => res.json(getCallState()));

let healthCache = { at: 0, data: null };

api.get("/health", async (_req, res) => {
  if (healthCache.data && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return res.json(healthCache.data);
  }
  const [azure, claude, translator] = await Promise.allSettled([
    issueSpeechToken(),
    checkClaude(),
    translatorConfigured() ? checkTranslator() : Promise.reject(new Error("not configured")),
  ]);
  const data = {
    /** Public cloud demo: Claude features and Windows call features are off. */
    demo: demoMode,
    azure: {
      ok: azure.status === "fulfilled",
      error: azure.reason?.message ?? null,
      region: config.azure.region || null,
    },
    claude: {
      ok: claude.status === "fulfilled",
      error: claude.reason ? describeClaudeError(claude.reason) : null,
      model: config.claude.model,
      fastModel: config.claude.fastModel,
    },
    translator: {
      ok: translator.status === "fulfilled",
      error: translator.reason?.message ?? null,
      engine: translatorConfigured() ? config.translator.engine : "claude",
    },
  };
  healthCache = { at: Date.now(), data };
  res.json(data);
});

/** Validates the fields shared by /translate and /respond; returns an error message or null. */
function utteranceError({ text, from, to, context }) {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    return "text is required (max 2000 chars)";
  }
  if (!isLanguage(from) || !isLanguage(to)) return "from/to must be supported language codes";
  if (!Array.isArray(context)) return "context must be an array";
  return null;
}

api.post("/translate", async (req, res) => {
  const { text, from, to, context = [] } = req.body ?? {};
  const invalid = utteranceError({ text, from, to, context });
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const utterance = { text, from, to };
    if (useAzureFirst()) return res.json({ translation: await azureTranslate(utterance) });
    const { translation } = await withAzureFallback(
      "translate",
      async () => ({ translation: await translate({ text, from, to, context }) }),
      utterance,
    );
    res.json({ translation });
  } catch (err) {
    console.error("[translate]", err);
    res.status(502).json({ error: describeClaudeError(err) });
  }
});

api.post("/respond", async (req, res) => {
  const { text, from, to, context = [], profile = "", allowReply = true } = req.body ?? {};
  const invalid = utteranceError({ text, from, to, context });
  if (invalid) return res.status(400).json({ error: invalid });
  if (typeof profile !== "string" || profile.length > MAX_PROFILE_LENGTH) {
    return res.status(400).json({ error: "profile must be a string (max 4000 chars)" });
  }
  if (typeof allowReply !== "boolean") {
    return res.status(400).json({ error: "allowReply must be a boolean" });
  }
  try {
    const utterance = { text, from, to };
    // Azure mode: translation only (no AI reply or AI risk rating); keyword scam alerts
    // still run in the browser. The public demo shows the full Claude path here.
    const result =
      useAzureFirst() && !demoMode
        ? { ...NO_REPLY, translation: await azureTranslate(utterance) }
        : await withAzureFallback(
            "respond",
            () => respond({ text, from, to, context, profile, allowReply }),
            utterance,
          );
    // Belt and braces: never let a reply through on a risky utterance or when replies are off.
    if (!allowReply || result.risk.level !== "none") {
      Object.assign(result, { reply: "", reply_translation: "" });
    }
    res.json(result);
  } catch (err) {
    console.error("[respond]", err);
    res.status(502).json({ error: describeClaudeError(err) });
  }
});

/**
 * Call memory: saves a finished call's report and returns earlier calls with the same
 * number. Without a number from the client, the number is looked up in Phone Link.
 */
api.post("/calls", async (req, res) => {
  const { id, startedAt, number, duration, summary } = req.body ?? {};
  if (typeof id !== "string" || !id || typeof startedAt !== "number" || !summary?.title) {
    return res.status(400).json({ error: "id, startedAt and summary are required" });
  }
  const resolved =
    (typeof number === "string" && number.trim()) || (await findCallNumber(startedAt));
  const call = saveCall({
    id,
    startedAt,
    savedAt: Date.now(),
    number: resolved || null,
    duration: typeof duration === "string" ? duration : "",
    title: String(summary.title),
    intent: String(summary.intent ?? "other"),
    outcome: String(summary.outcome ?? ""),
    summary: String(summary.summary ?? ""),
    commitments: Array.isArray(summary.commitments) ? summary.commitments.slice(0, 20) : [],
  });
  res.json({ call, previous: previousCalls(call.number, call.id).slice(0, 5) });
});

api.get("/calls", (req, res) => {
  const { number } = req.query;
  res.json(typeof number === "string" ? previousCalls(number) : recentCalls());
});

/** Live call understanding (intent, facts, promises) while the call is running. */
api.post("/insights", async (req, res) => {
  const { transcript, myLang } = req.body ?? {};
  if (
    !Array.isArray(transcript) ||
    !transcript.length ||
    transcript.length > MAX_TRANSCRIPT_LINES
  ) {
    return res.status(400).json({ error: "transcript must be a non-empty array" });
  }
  if (!isLanguage(myLang)) return res.status(400).json({ error: "myLang must be supported" });
  try {
    res.json(await insights({ transcript, myLang }));
  } catch (err) {
    console.error("[insights]", err);
    res.status(502).json({ error: describeClaudeError(err) });
  }
});

api.post("/summary", async (req, res) => {
  const { transcript, myLang, friendLang, callStartedAt, timeZone } = req.body ?? {};
  if (
    !Array.isArray(transcript) ||
    !transcript.length ||
    transcript.length > MAX_TRANSCRIPT_LINES
  ) {
    return res.status(400).json({ error: "transcript must be a non-empty array" });
  }
  if (!isLanguage(myLang) || !isLanguage(friendLang)) {
    return res.status(400).json({ error: "myLang/friendLang must be supported language codes" });
  }
  try {
    res.json(
      await summarize({
        transcript,
        myLang,
        friendLang,
        callStartedAt: typeof callStartedAt === "string" ? callStartedAt : "",
        timeZone: isTimeZone(timeZone) ? timeZone : "UTC",
      }),
    );
  } catch (err) {
    console.error("[summary]", err);
    res.status(502).json({ error: describeClaudeError(err) });
  }
});
