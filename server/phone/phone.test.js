import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { alertBeepMulaw, linearToMulaw } from "./mulaw.js";
import { describeTwilioError, isValidSignature, streamTwiml } from "./twilio.js";

describe("linearToMulaw", () => {
  it("encodes silence and full scale per G.711", () => {
    expect(linearToMulaw(0)).toBe(0xff);
    expect(linearToMulaw(32767)).toBe(0x80);
    expect(linearToMulaw(-32768)).toBe(0x00);
  });

  it("is symmetric apart from the sign bit", () => {
    for (const sample of [100, 1000, 8000, 20000]) {
      expect(linearToMulaw(sample) ^ linearToMulaw(-sample)).toBe(0x80);
    }
  });

  it("renders the alert beep at 8 kHz", () => {
    const beep = alertBeepMulaw();
    expect(beep.length).toBe(Math.floor(8000 * 0.48));
    expect(new Set(beep).size).toBeGreaterThan(10); // not silence
  });
});

describe("isValidSignature", () => {
  const token = "test-auth-token";
  const url = "https://example.trycloudflare.com/twilio/voice?session=abc&leg=me";
  const params = { CallSid: "CA123", From: "+17375550100", To: "+994501234567" };
  const sign = (data) => createHmac("sha1", token).update(data).digest("base64");
  // Twilio: URL followed by the POST parameters sorted by name, each as key+value.
  const valid = sign(url + "CallSidCA123From+17375550100To+994501234567");

  it("accepts a correctly signed request", () => {
    expect(isValidSignature(valid, url, params, token)).toBe(true);
  });

  it("rejects tampered parameters, URLs, tokens and missing signatures", () => {
    expect(isValidSignature(valid, url, { ...params, To: "+15550000000" }, token)).toBe(false);
    expect(isValidSignature(valid, url.replace("leg=me", "leg=friend"), params, token)).toBe(false);
    expect(isValidSignature(valid, url, params, "other-token")).toBe(false);
    expect(isValidSignature(undefined, url, params, token)).toBe(false);
  });
});

describe("streamTwiml", () => {
  it("streams to the WebSocket with escaped parameters", () => {
    const xml = streamTwiml("wss://host/twilio/stream", { session: 'a"b<c', leg: "me" });
    expect(xml).toContain('<Stream url="wss://host/twilio/stream">');
    expect(xml).toContain('<Parameter name="session" value="a&#34;b&#60;c"/>');
    expect(xml).toContain('<Parameter name="leg" value="me"/>');
  });
});

describe("describeTwilioError", () => {
  it("explains unverified numbers on trial accounts", () => {
    expect(describeTwilioError({ code: 21219 })).toMatch(/təsdiqlənməyib/);
  });
});
