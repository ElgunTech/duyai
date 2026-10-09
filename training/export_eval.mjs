/**
 * Exports the evaluation conversations (inputs only, no gold labels) for the Python
 * prediction script: node training/export_eval.mjs → training/data/eval_inputs.jsonl
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALL_STARTED_AT, DATASET, TIME_ZONE } from "../eval/dataset.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "data", "eval_inputs.jsonl");
if (!existsSync(path.dirname(out))) mkdirSync(path.dirname(out), { recursive: true });

writeFileSync(
  out,
  DATASET.map((d) =>
    JSON.stringify({
      id: d.id,
      call_started_at: CALL_STARTED_AT,
      time_zone: TIME_ZONE,
      transcript: d.transcript.map((l) => ({ speaker: l.speaker, text: l.original })),
    }),
  ).join("\n") + "\n",
);
console.log(`Yazıldı: ${out} (${DATASET.length} danışıq)`);
