import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const API = () => `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}`;

const authHeader = () =>
  "Basic " +
  Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");

async function twilioPost(path, params) {
  const res = await fetch(`${API()}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TwilioError(data.message || `Twilio HTTP ${res.status}`, data.code);
  return data;
}

export class TwilioError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Places an outbound call; Twilio fetches the call instructions (TwiML) from `voiceUrl`. */
export function createCall({ to, voiceUrl, statusUrl }) {
  return twilioPost("/Calls.json", {
    To: to,
    From: config.twilio.phoneNumber,
    Url: voiceUrl,
    StatusCallback: statusUrl,
    StatusCallbackEvent: "completed",
  });
}

/** Hangs up a call (ignores calls that already ended). */
export async function hangUp(callSid) {
  try {
    await twilioPost(`/Calls/${callSid}.json`, { Status: "completed" });
  } catch {
    /* already finished */
  }
}

const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** TwiML that streams the call audio both ways over a WebSocket. */
export function streamTwiml(streamUrl, parameters) {
  const params = Object.entries(parameters)
    .map(([name, value]) => `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(streamUrl)}">${params}</Stream></Connect></Response>`;
}

/**
 * Verifies that a webhook really comes from Twilio (X-Twilio-Signature):
 * HMAC-SHA1 over the full URL followed by the sorted POST parameters.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function isValidSignature(signature, url, params, authToken = config.twilio.authToken) {
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Human-readable reason for common Twilio call errors. */
export function describeTwilioError(err) {
  if (err?.code === 21219 || err?.code === 21608) {
    return "Bu nömrə Twilio-da təsdiqlənməyib (trial hesab yalnız təsdiqlənmiş nömrələrə zəng edir)";
  }
  if (err?.code === 21215 || err?.code === 13227) {
    return "Bu ölkəyə zəng icazəsi bağlıdır (Twilio → Voice → Geo permissions)";
  }
  if (err?.code === 21211) return "Nömrə düzgün formatda deyil (+994... kimi yazın)";
  return err?.message ?? String(err);
}
