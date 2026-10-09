/**
 * Scores one model output against the hand-written gold labels of eval/dataset.mjs.
 * Pure functions: shared by eval/run.mjs (Claude) and the fine-tuned model's predictions.
 *
 * The output may be the full call report (server SUMMARY_SCHEMA) or the compact form the
 * fine-tuned model produces: { intent, entities, commitments, actions }.
 */

const lower = (s) => String(s ?? "").toLocaleLowerCase("az");

/** All text in an output, for "does this value appear anywhere" checks. */
function textBlob(output) {
  const parts = [
    ...(output.entities ?? []).flatMap((e) => [e.label, e.value]),
    ...(output.actions ?? []).flatMap((a) => [a.title, a.details, a.start, a.end]),
    ...(output.commitments ?? []).flatMap((c) => [c.task, c.due, c.due_iso]),
  ];
  return lower(parts.join(" | "));
}

/** Dates the output resolved to ISO form. */
function isoDates(output) {
  const values = [
    ...(output.actions ?? []).flatMap((a) => [a.start, a.end]),
    ...(output.commitments ?? []).map((c) => c.due_iso),
    ...(output.entities ?? []).map((e) => e.value),
  ];
  return new Set(values.flatMap((v) => String(v ?? "").match(/\d{4}-\d{2}-\d{2}/g) ?? []));
}

/** 14:00 also matches "14.00" and ISO "T14:00". */
const hasTime = (blob, hhmm) => blob.includes(hhmm) || blob.includes(hhmm.replace(":", "."));

/** A number such as 240 must appear as a whole number (not inside 1240). */
const hasNumber = (blob, number) => new RegExp(`(^|[^\\d])${number}([^\\d]|$)`).test(blob);

/** Greedy matching of gold promises to predicted ones (same owner + a keyword). */
function matchCommitments(gold, predicted) {
  const used = new Set();
  let matched = 0;
  for (const g of gold) {
    const index = predicted.findIndex(
      (p, i) =>
        !used.has(i) &&
        p.owner === g.owner &&
        g.keywords.some((k) => lower(p.task).includes(lower(k))),
    );
    if (index >= 0) {
      used.add(index);
      matched++;
    }
  }
  return matched;
}

/** Per-case result: counts for each metric plus human-readable misses. */
export function scoreCase(gold, output) {
  const blob = textBlob(output);
  const dates = isoDates(output);
  const acceptable = Array.isArray(gold.intent) ? gold.intent : [gold.intent];
  const predictedCommitments = output.commitments ?? [];
  const matchedCommitments = matchCommitments(gold.commitments, predictedCommitments);

  const missedDates = gold.dates.filter((d) => !dates.has(d));
  const missedTimes = gold.times.filter((t) => !hasTime(blob, t));
  const missedPrices = gold.prices.filter((p) => !hasNumber(blob, p));

  return {
    intentCorrect: acceptable.includes(output.intent),
    dates: { found: gold.dates.length - missedDates.length, total: gold.dates.length },
    times: { found: gold.times.length - missedTimes.length, total: gold.times.length },
    prices: { found: gold.prices.length - missedPrices.length, total: gold.prices.length },
    commitments: {
      matched: matchedCommitments,
      gold: gold.commitments.length,
      predicted: predictedCommitments.length,
    },
    misses: [
      ...(acceptable.includes(output.intent)
        ? []
        : [`intent: ${output.intent} (gözlənilən ${acceptable.join("/")})`]),
      ...missedDates.map((d) => `tarix ${d}`),
      ...missedTimes.map((t) => `saat ${t}`),
      ...missedPrices.map((p) => `qiymət ${p}`),
      ...(matchedCommitments < gold.commitments.length
        ? [`öhdəlik ${matchedCommitments}/${gold.commitments.length}`]
        : []),
    ],
  };
}

const ratio = (a, b) => (b === 0 ? null : a / b);

/** Aggregate metrics over all cases. */
export function aggregate(results) {
  const sum = (pick) => results.reduce((acc, r) => acc + pick(r), 0);
  const cMatched = sum((r) => r.commitments.matched);
  const cGold = sum((r) => r.commitments.gold);
  const cPred = sum((r) => r.commitments.predicted);
  const recall = ratio(cMatched, cGold);
  const precision = ratio(cMatched, cPred);
  return {
    cases: results.length,
    intentAccuracy: ratio(
      sum((r) => (r.intentCorrect ? 1 : 0)),
      results.length,
    ),
    dateRecall: ratio(
      sum((r) => r.dates.found),
      sum((r) => r.dates.total),
    ),
    timeRecall: ratio(
      sum((r) => r.times.found),
      sum((r) => r.times.total),
    ),
    priceRecall: ratio(
      sum((r) => r.prices.found),
      sum((r) => r.prices.total),
    ),
    commitmentPrecision: precision,
    commitmentRecall: recall,
    commitmentF1:
      precision && recall
        ? (2 * precision * recall) / (precision + recall)
        : precision === 0
          ? 0
          : null,
  };
}
