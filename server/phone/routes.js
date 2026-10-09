import express, { Router } from "express";
import { config, LANGUAGE_NAMES, phoneModeConfigured } from "../config.js";
import { getSession, PhoneSession } from "./session.js";
import { getPublicUrl } from "./tunnel.js";
import { isValidSignature, streamTwiml } from "./twilio.js";

const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_PROFILE_LENGTH = 4000;
const isLanguage = (code) => Object.hasOwn(LANGUAGE_NAMES, code);

const maskNumber = (n) => (n ? `${n.slice(0, 4)}…${n.slice(-2)}` : null);

// ---------------------------------------------------------------------------
// Browser-facing API: /api/phone/*
// ---------------------------------------------------------------------------

export const phoneApi = Router();

phoneApi.get("/status", (_req, res) => {
  res.json({
    configured: phoneModeConfigured,
    ready: phoneModeConfigured && Boolean(getPublicUrl()),
    number: maskNumber(config.twilio.phoneNumber),
  });
});

phoneApi.post("/call", async (req, res) => {
  if (!phoneModeConfigured) {
    return res.status(503).json({ error: "Twilio açarları .env faylında yoxdur" });
  }
  const baseUrl = getPublicUrl();
  if (!baseUrl)
    return res.status(503).json({ error: "İnternet tuneli hələ açılır, bir az gözləyin" });

  const {
    myNumber,
    friendNumber,
    myLang,
    friendLang,
    voice,
    autoAnswer,
    profile = "",
  } = req.body ?? {};
  if (!E164.test(myNumber ?? "") || !E164.test(friendNumber ?? "")) {
    return res.status(400).json({ error: "Nömrələr +994501234567 formatında olmalıdır" });
  }
  if (myNumber === friendNumber) return res.status(400).json({ error: "Nömrələr eyni ola bilməz" });
  if (!isLanguage(myLang) || !isLanguage(friendLang) || myLang === friendLang) {
    return res.status(400).json({ error: "İki fərqli dəstəklənən dil seçin" });
  }
  if (typeof profile !== "string" || profile.length > MAX_PROFILE_LENGTH) {
    return res.status(400).json({ error: "Profil çox uzundur" });
  }

  const session = new PhoneSession({
    myNumber,
    friendNumber,
    myLang,
    friendLang,
    voice: voice === "m" ? "m" : "f",
    autoAnswer: autoAnswer === true,
    profile,
  });
  try {
    await session.start(baseUrl);
    res.json({ id: session.id });
  } catch {
    // session.start already reported the reason as an "error" event; repeat it here.
    res.status(502).json({ error: "Zəng başlamadı", id: session.id });
  }
});

phoneApi.post("/:id/hangup", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Zəng tapılmadı" });
  session.end();
  res.json({ ok: true });
});

phoneApi.post("/:id/options", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Zəng tapılmadı" });
  session.updateOptions(req.body ?? {});
  res.json({ ok: true });
});

/** Live call events for the browser (Server-Sent Events). */
phoneApi.get("/:id/events", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "snapshot", ...session.snapshot() });

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  session.on("event", send);
  req.on("close", () => {
    clearInterval(keepAlive);
    session.off("event", send);
  });
});

// ---------------------------------------------------------------------------
// Twilio webhooks: /twilio/*
// ---------------------------------------------------------------------------

export const twilioWebhooks = Router();
twilioWebhooks.use(express.urlencoded({ extended: false }));

/**
 * Only Twilio may drive our calls. Signed requests are checked with HMAC (X-Twilio-Signature).
 * Some trial accounts send webhooks unsigned; those are accepted only when they belong to a
 * live call we created: our AccountSid, an unguessable session id, and the CallSid that
 * Twilio returned when we placed that leg.
 */
function isTrustedWebhook(req) {
  const params = req.body ?? {};
  const signature = req.get("X-Twilio-Signature");
  if (signature) {
    return isValidSignature(signature, `${getPublicUrl()}${req.originalUrl}`, params);
  }
  const leg = getSession(req.query.session)?.legs[req.query.leg];
  return (
    params.AccountSid === config.twilio.accountSid &&
    Boolean(leg?.callSid) &&
    params.CallSid === leg.callSid
  );
}

twilioWebhooks.use((req, res, next) => {
  if (isTrustedWebhook(req)) return next();
  console.warn("[twilio] rejected webhook", req.path);
  res.status(403).end();
});

/** Call instructions: stream this leg's audio to our WebSocket. */
twilioWebhooks.post("/voice", (req, res) => {
  const { session: id, leg } = req.query;
  if (!getSession(id) || (leg !== "me" && leg !== "friend")) {
    return res.type("text/xml").send("<Response><Hangup/></Response>");
  }
  const streamUrl = `${getPublicUrl().replace(/^https/, "wss")}/twilio/stream`;
  res.type("text/xml").send(streamTwiml(streamUrl, { session: id, leg }));
});

twilioWebhooks.post("/status", (req, res) => {
  getSession(req.query.session)?.onCallStatus(req.query.leg, req.body?.CallStatus);
  res.status(204).end();
});
