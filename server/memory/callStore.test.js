import { describe, expect, it } from "vitest";
import { numberKey } from "./callStore.js";

describe("numberKey", () => {
  it("matches the same number in different notations", () => {
    expect(numberKey("+994 77 123 45 67")).toBe("771234567");
    expect(numberKey("0771234567")).toBe("771234567");
    expect(numberKey("(077) 123-45-67")).toBe("771234567");
  });

  it("ignores values that are not phone numbers", () => {
    expect(numberKey("")).toBeNull();
    expect(numberKey(undefined)).toBeNull();
    expect(numberKey("123")).toBeNull();
  });
});
