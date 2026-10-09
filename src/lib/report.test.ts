import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setUiLangGlobal } from "../i18n/i18n";
import type { CallSummary, TranscriptEntry } from "../types";
import { buildReportText, reportFileName } from "./report";

// These assertions check the Azerbaijani report text.
beforeAll(() => setUiLangGlobal("az"));
afterAll(() => setUiLangGlobal("en"));

const transcript: TranscriptEntry[] = [
  {
    id: 0,
    who: "me",
    time: "00:02",
    original: "Salam, otaq istəyirəm.",
    translation: "Hallo, ich möchte ein Zimmer.",
    toLang: "de",
    status: "done",
  },
  {
    id: 1,
    who: "friend",
    time: "00:07",
    original: "Gerne.",
    translation: "",
    toLang: "az",
    status: "error",
  },
  {
    id: 2,
    who: "ai",
    time: "00:09",
    original: "Für zwei Personen.",
    translation: "İki nəfər üçün.",
    toLang: "az",
    status: "done",
  },
];

const summary: CallSummary = {
  title: "Otel rezervasiyası",
  intent: "hotel_booking",
  outcome: "Rezervasiya təsdiqləndi",
  summary: "Otaq rezerv olundu.",
  entities: [{ type: "price", label: "Qiymət", value: "€240" }],
  agreements: ["Pulsuz ləğv"],
  commitments: [{ owner: "me", task: "Xatırlatma yarat", due: "12 Okt", due_iso: "2026-10-12" }],
  actions: [
    {
      type: "calendar",
      title: "Check-in",
      details: "",
      start: "2026-10-12T14:00",
      end: "",
      all_day: false,
      location: "Berlin",
    },
  ],
  open_questions: ["Ödəniş tarixi razılaşdırılmayıb"],
};

describe("buildReportText", () => {
  it("includes the summary sections and the transcript", () => {
    const text = buildReportText({
      summary,
      transcript,
      myLang: "az",
      friendLang: "de",
      duration: "03:42",
    });
    expect(text).toContain("ZƏNG HESABATI — Otel rezervasiyası");
    expect(text).toContain("Dillər: Azərbaycanca – Almanca");
    expect(text).toContain("• Qiymət: €240");
    expect(text).toContain("• Mən: Xatırlatma yarat (12 Okt)");
    expect(text).toContain("• Check-in (2026-10-12 14:00)");
    expect(text).toContain("• Ödəniş tarixi razılaşdırılmayıb");
    expect(text).toContain("[00:02] Mən: Salam, otaq istəyirəm.");
    expect(text).toContain("[00:07] Qarşı tərəf: Gerne.");
    expect(text).toContain("[00:09] AI (mənim adımdan): Für zwei Personen.");
  });

  it("works without a summary and marks missing translations", () => {
    const text = buildReportText({
      summary: null,
      transcript,
      myLang: "az",
      friendLang: "de",
      duration: "00:10",
    });
    expect(text.startsWith("TRANSKRİPT")).toBe(true);
    expect(text).toContain("→ —");
  });
});

describe("reportFileName", () => {
  it("is date-stamped", () => {
    expect(reportFileName(new Date(2026, 9, 8, 14, 5))).toBe("zeng-2026-10-08-1405.txt");
  });
});
