import { describe, expect, it } from "vitest";
import { aggregate, scoreCase } from "./score.mjs";

const gold = {
  intent: "hotel_booking",
  dates: ["2026-10-10"],
  times: ["14:00"],
  prices: ["240"],
  commitments: [{ owner: "me", keywords: ["pasport"] }],
};

const perfect = {
  intent: "hotel_booking",
  entities: [{ type: "price", label: "Qiymət", value: "240 manat" }],
  commitments: [{ owner: "me", task: "Pasportun şəklini göndər", due: "bu gün", due_iso: "" }],
  actions: [
    { type: "calendar", title: "Check-in", details: "", start: "2026-10-10T14:00", end: "" },
  ],
};

describe("scoreCase", () => {
  it("gives full marks to a correct output", () => {
    const r = scoreCase(gold, perfect);
    expect(r.intentCorrect).toBe(true);
    expect(r.misses).toEqual([]);
    expect(r.commitments).toEqual({ matched: 1, gold: 1, predicted: 1 });
  });

  it("reports what was missed", () => {
    const r = scoreCase(gold, {
      intent: "travel",
      entities: [{ type: "price", label: "Qiymət", value: "1240" }],
      commitments: [{ owner: "other", task: "pasport", due: "", due_iso: "" }],
      actions: [],
    });
    expect(r.misses).toEqual([
      "intent: travel (gözlənilən hotel_booking)",
      "tarix 2026-10-10",
      "saat 14:00",
      "qiymət 240",
      "öhdəlik 0/1",
    ]);
  });

  it("accepts any of several acceptable intents", () => {
    expect(
      scoreCase({ ...gold, intent: ["purchase", "other"] }, { ...perfect, intent: "other" })
        .intentCorrect,
    ).toBe(true);
  });
});

describe("aggregate", () => {
  it("computes accuracy, recall and commitment F1", () => {
    const a = aggregate([
      scoreCase(gold, perfect),
      scoreCase(gold, { ...perfect, intent: "travel" }),
    ]);
    expect(a.intentAccuracy).toBe(0.5);
    expect(a.dateRecall).toBe(1);
    expect(a.commitmentF1).toBe(1);
  });
});
