/**
 * Measures call-understanding accuracy on the hand-labelled set (eval/dataset.mjs).
 *
 *   node eval/run.mjs                              # the app's pipeline (Claude, CLAUDE_MODEL)
 *   node eval/run.mjs --predictions preds.jsonl    # any other model, e.g. the fine-tuned one
 *   node eval/run.mjs --name my-run                # label for the results table
 *
 * A predictions file has one JSON object per line: { "id": "<case id>", "output": {...} }.
 * Results are written to eval/results/<name>.json and appended to eval/RESULTS.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALL_STARTED_AT, DATASET, TIME_ZONE } from "./dataset.mjs";
import { aggregate, scoreCase } from "./score.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const CONCURRENCY = 4;

/** The app's own pipeline: the end-of-call report from Claude. */
async function claudeOutputs() {
  const { config } = await import("../server/config.js");
  const { summarize } = await import("../server/services/claude.js");
  const outputs = new Map();
  const queue = [...DATASET];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const transcript = item.transcript.map((line, i) => ({
        ...line,
        time: `00:${String(i * 7).padStart(2, "0")}`,
        translation: line.original,
      }));
      const started = Date.now();
      try {
        const output = await summarize({
          transcript,
          myLang: "az",
          friendLang: "az",
          callStartedAt: CALL_STARTED_AT,
          timeZone: TIME_ZONE,
        });
        outputs.set(item.id, output);
        console.log(`  ✓ ${item.id} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      } catch (err) {
        outputs.set(item.id, { intent: "error", entities: [], commitments: [], actions: [] });
        console.log(`  ✗ ${item.id}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { outputs, model: config.claude.model };
}

function fileOutputs(file) {
  const outputs = new Map();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const { id, output } = JSON.parse(line);
    outputs.set(id, output);
  }
  return { outputs, model: path.basename(file) };
}

const pct = (v) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

async function main() {
  const predictions = option("predictions");
  console.log(
    `Qiymətləndirmə: ${DATASET.length} danışıq${predictions ? `, ${predictions}` : ", Claude"}`,
  );
  const { outputs, model } = predictions ? fileOutputs(predictions) : await claudeOutputs();
  const name = option("name") ?? model;

  const perCase = DATASET.map((item) => {
    const output = outputs.get(item.id) ?? {
      intent: "missing",
      entities: [],
      commitments: [],
      actions: [],
    };
    return { id: item.id, ...scoreCase(item.gold, output) };
  });
  const metrics = aggregate(perCase);

  console.log("\nNəticə");
  console.table({
    "Niyyət dəqiqliyi": pct(metrics.intentAccuracy),
    "Tarix (recall)": pct(metrics.dateRecall),
    "Saat (recall)": pct(metrics.timeRecall),
    "Qiymət (recall)": pct(metrics.priceRecall),
    "Öhdəlik precision": pct(metrics.commitmentPrecision),
    "Öhdəlik recall": pct(metrics.commitmentRecall),
    "Öhdəlik F1": pct(metrics.commitmentF1),
  });
  const failed = perCase.filter((r) => r.misses.length);
  if (failed.length) {
    console.log("Səhvlər:");
    for (const r of failed) console.log(`  ${r.id}: ${r.misses.join(", ")}`);
  }

  const resultsDir = path.join(here, "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir);
  const stamp = new Date().toISOString();
  writeFileSync(
    path.join(resultsDir, `${name.replace(/[^\w.-]+/g, "_")}.json`),
    JSON.stringify(
      { name, model, date: stamp, metrics, perCase, outputs: Object.fromEntries(outputs) },
      null,
      2,
    ),
  );

  const table = path.join(here, "RESULTS.md");
  if (!existsSync(table)) {
    writeFileSync(
      table,
      "# Qiymətləndirmə nəticələri\n\n" +
        `Test toplusu: eval/dataset.mjs (${DATASET.length} əl ilə etiketlənmiş danışıq).\n\n` +
        "| Tarix | Model | Niyyət | Tarix | Saat | Qiymət | Öhdəlik F1 |\n" +
        "|---|---|---|---|---|---|---|\n",
    );
  }
  appendFileSync(
    table,
    `| ${stamp.slice(0, 16).replace("T", " ")} | ${name} | ${pct(metrics.intentAccuracy)} | ` +
      `${pct(metrics.dateRecall)} | ${pct(metrics.timeRecall)} | ${pct(metrics.priceRecall)} | ` +
      `${pct(metrics.commitmentF1)} |\n`,
  );
  console.log(`\nYazıldı: eval/results/ və eval/RESULTS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
