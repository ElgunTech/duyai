import { describe, expect, it } from "vitest";
import { average, formatClock, formatSeconds, gradeLatency } from "./format";

describe("formatClock", () => {
  it("formats milliseconds as mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(83_000)).toBe("01:23");
    expect(formatClock(3_599_999)).toBe("59:59");
  });

  it("never shows negative time", () => {
    expect(formatClock(-500)).toBe("00:00");
  });
});

describe("latency helpers", () => {
  it("formats seconds with one decimal", () => {
    expect(formatSeconds(2340)).toBe("2.3 s");
  });

  it("grades latency", () => {
    expect(gradeLatency(1800)).toBe("good");
    expect(gradeLatency(3000)).toBe("mid");
    expect(gradeLatency(5000)).toBe("slow");
  });

  it("averages values and handles empty input", () => {
    expect(average([1000, 3000])).toBe(2000);
    expect(average([])).toBeNull();
  });
});
