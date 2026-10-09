import { describe, expect, it } from "vitest";
import { detectScam, isRisky, moreSevere } from "./scam";

describe("detectScam", () => {
  it.each([
    ["Назовите код из СМС, пожалуйста", "otp"],
    ["Please read me the verification code we just sent", "otp"],
    ["SMS kodunu deyin zəhmət olmasa", "otp"],
    ["Bitte nennen Sie Ihre Kartennummer", "card"],
    ["Kart nömrənizi deyə bilərsiniz?", "card"],
    ["And the CVV on the back?", "cvv"],
    ["Назовите три цифры на обороте карты", "cvv"],
    ["What is your PIN?", "pin"],
    ["Şifrənizi deyin", "password"],
    ["Please install AnyDesk", "remote_access"],
  ])("flags %j as %s", (text, category) => {
    expect(detectScam(text)).toMatchObject({ level: "danger", category });
  });

  it.each([
    "Für wie viele Personen?",
    "Das Zimmer kostet 240 Euro insgesamt.",
    "Adınız nədir?",
    "Spinning class starts at nine", // "pin" inside another word
    "Thank you for calling Hotel Adlon.",
    "Я отправлю вам смс с подтверждением брони", // an SMS is fine, asking for its code is not
  ])("does not flag %j", (text) => {
    expect(detectScam(text)).toBeNull();
  });
});

describe("moreSevere", () => {
  const warning = { level: "warning" as const, category: "impersonation" as const, reason: "bank" };
  const danger = { level: "danger" as const, category: "otp" as const, reason: "" };

  it("keeps the higher level and fills in a missing reason", () => {
    expect(moreSevere(warning, danger)).toBe(danger);
    expect(moreSevere(danger, warning)).toEqual({ ...danger, reason: "bank" });
    expect(moreSevere(undefined, warning)).toBe(warning);
  });

  it("isRisky ignores 'none'", () => {
    expect(isRisky({ level: "none", category: "none", reason: "" })).toBe(false);
    expect(isRisky(warning)).toBe(true);
    expect(isRisky(undefined)).toBe(false);
  });
});
