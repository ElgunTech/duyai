import { describe, expect, it } from "vitest";
import { detectCountry, internationalDigits } from "./phone";

describe("internationalDigits", () => {
  it("handles +, 00 and local Azerbaijani formats", () => {
    expect(internationalDigits("+49 30 1234567")).toBe("49301234567");
    expect(internationalDigits("0049 30 1234567")).toBe("49301234567");
    expect(internationalDigits("050 123 45 67")).toBe("994501234567");
    expect(internationalDigits("(+90) 212-555-00-00")).toBe("902125550000");
  });
});

describe("detectCountry", () => {
  it.each([
    ["+49 30 1234567", "de", "Almaniya"],
    ["+43 1 234567", "de", "Avstriya"],
    ["+90 212 555 0000", "tr", "Türkiyə"],
    ["+7 495 123 45 67", "ru", "Rusiya / Qazaxıstan"],
    ["+1 212 555 0100", "en", "ABŞ / Kanada"],
    ["+44 20 7946 0000", "en", "Böyük Britaniya"],
    ["+971 4 123 4567", "ar", "BƏƏ"],
    ["+33 1 23 45 67 89", "fr", "Fransa"],
    ["+994 50 123 45 67", "az", "Azərbaycan"],
    ["050 123 45 67", "az", "Azərbaycan"],
  ])("%s → %s", (number, lang, country) => {
    expect(detectCountry(number)).toMatchObject({ lang, country });
  });

  it("prefers the longest matching code", () => {
    expect(detectCountry("+423 123 4567")?.country).toBe("Lixtenşteyn");
    expect(detectCountry("+375 29 123 4567")?.lang).toBe("ru");
    expect(detectCountry("+998 90 123 45 67")?.lang).toBe("uz");
    expect(detectCountry("+81 3 1234 5678")?.lang).toBe("ja");
    expect(detectCountry("+351 21 123 4567")?.lang).toBe("pt");
  });

  it("returns null while typing or for unsupported countries", () => {
    expect(detectCountry("+4")).toBeNull();
    expect(detectCountry("")).toBeNull();
    expect(detectCountry("+84 24 1234 5678")).toBeNull(); // Vietnam: language not supported
  });
});
