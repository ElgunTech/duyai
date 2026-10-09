/**
 * Synthetic training data for the fine-tuned call-understanding model.
 *
 *   node training/generate_data.mjs --count 600            # → training/data/train.jsonl
 *   node training/generate_data.mjs --count 600 --model claude-sonnet-5-5
 *   node training/generate_data.mjs --model claude-sonnet-5-5 --budget 0.5   # stop at ~$0.50
 *
 * Claude writes short, realistic Azerbaijani phone calls (colloquial, often mixed with
 * Russian / English / Turkish words) together with their labels, resolving relative dates
 * against a random call date. These are "silver" labels for training only; the model is
 * evaluated on the separate hand-labelled set in eval/dataset.mjs, which is never shown here.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { DATASET } from "../eval/dataset.mjs";
import { INTENTS } from "../server/services/schemas.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const COUNT = Number(option("count", 600));
const MODEL = option("model", process.env.CLAUDE_MODEL || "claude-opus-5-5");
const BUDGET = Number(option("budget", Infinity)); // USD; stops before a batch would exceed it
const PER_REQUEST = 5;
// One request at a time under a budget, so the cap is never overshot by parallel batches.
const CONCURRENCY = Number.isFinite(BUDGET) ? 1 : 4;
// USD per million tokens [input, output]; unknown models are priced as Opus (conservative).
const PRICES = { opus: [5, 25], sonnet: [3, 15], haiku: [1, 5] };
const price = PRICES[Object.keys(PRICES).find((k) => MODEL.includes(k)) ?? "opus"];
let spent = 0;
let lastBatchCost = 0;
const OUT = path.join(here, "data", "train.jsonl");

const client = new Anthropic();

const LABEL = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["date", "time", "price", "location", "person", "phone", "reference", "other"],
          },
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["type", "label", "value"],
        additionalProperties: false,
      },
    },
    commitments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          owner: { type: "string", enum: ["me", "other"] },
          task: { type: "string" },
          due: { type: "string" },
          due_iso: { type: "string" },
        },
        required: ["owner", "task", "due", "due_iso"],
        additionalProperties: false,
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["calendar", "reminder", "note", "map", "email"] },
          title: { type: "string" },
          start: { type: "string" },
        },
        required: ["type", "title", "start"],
        additionalProperties: false,
      },
    },
  },
  required: ["intent", "entities", "commitments", "actions"],
  additionalProperties: false,
};

const BATCH_SCHEMA = {
  type: "object",
  properties: {
    calls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          transcript: {
            type: "array",
            items: {
              type: "object",
              properties: {
                speaker: { type: "string", enum: ["Me", "Friend"] },
                text: { type: "string" },
              },
              required: ["speaker", "text"],
              additionalProperties: false,
            },
          },
          label: LABEL,
        },
        required: ["transcript", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["calls"],
  additionalProperties: false,
};

const STYLES = [
  "very colloquial Baku Azerbaijani",
  "polite formal Azerbaijani",
  "Azerbaijani mixed with Russian words (code-switching, e.g. 'zdrasti', 'koroçe', 'davay')",
  "Azerbaijani mixed with English words (e.g. 'booking', 'deadline', 'okay', 'call')",
  "Azerbaijani mixed with Turkish words (e.g. 'tamam', 'merhaba', 'tabii')",
  "short, hurried speech with numbers spoken as words (e.g. 'saat ikiyə', 'iki yüz qırx manat')",
];

function randomCallDate(i) {
  // Spread over 2026; deterministic per batch so reruns are reproducible.
  const base = Date.UTC(2026, 0, 5, 5, 0);
  const day = (i * 37) % 360;
  const hour = 8 + ((i * 7) % 11);
  return new Date(base + day * 86_400_000 + hour * 3_600_000);
}

function prompt(intent, style, callDate) {
  const local = callDate.toLocaleString("en-GB", {
    timeZone: "Asia/Baku",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return [
    `Write ${PER_REQUEST} different, realistic phone calls between "Me" (the caller) and "Friend" (the other party), and label each one.`,
    `Intent of every call: ${intent}. Language style: ${style}. 2-8 turns each, natural spoken phrasing.`,
    `Each call should mention concrete details using relative or spoken forms where natural: dates ("sabah", "bazar ertəsi", "ayın 12-si"), times ("saat 3-də", "yarım 5"), prices, places, reference numbers, and at least one promise by someone.`,
    `The call takes place on ${local} (Asia/Baku).`,
    `Labels: resolve every date/time to local ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm) relative to that moment; times written as HH:mm in entity values (e.g. "14:00"); prices as numbers with currency; commitments with owner me/other, a short imperative task, the spoken deadline and its ISO form (or ""); actions: calendar for scheduled events, reminder for my deadlines, map for places, note for key facts, email when a written follow-up fits. Labels in Azerbaijani.`,
    `Vary names, places (Baku districts, other cities, abroad), amounts and situations. Do not reuse these sentences: ${DATASET.slice(
      0,
      6,
    )
      .map((d) => `"${d.transcript[0].original}"`)
      .join(", ")}.`,
  ].join("\n");
}

async function generateBatch(i) {
  const intent = INTENTS[i % INTENTS.length];
  const style = STYLES[i % STYLES.length];
  const callDate = randomCallDate(i);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { format: { type: "json_schema", schema: BATCH_SCHEMA } },
        messages: [{ role: "user", content: prompt(intent, style, callDate) }],
      });
      lastBatchCost =
        (response.usage.input_tokens * price[0] + response.usage.output_tokens * price[1]) / 1e6;
      spent += lastBatchCost;
      const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
      return JSON.parse(text).calls.map((call) => ({
        call_started_at: callDate.toISOString(),
        time_zone: "Asia/Baku",
        intent_hint: intent,
        style,
        transcript: call.transcript,
        label: call.label,
      }));
    } catch (err) {
      console.warn(`  batch ${i} attempt ${attempt} failed: ${err.message}`);
    }
  }
  return [];
}

/** Guard against leaking the evaluation set into training data. */
const evalSentences = new Set(
  DATASET.flatMap((d) => d.transcript.map((l) => l.original.toLowerCase())),
);
const leaks = (example) => example.transcript.some((l) => evalSentences.has(l.text.toLowerCase()));

const readLines = () =>
  existsSync(OUT)
    ? readFileSync(OUT, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim())
    : [];

async function main() {
  const batches = Math.ceil(COUNT / PER_REQUEST);
  if (!existsSync(path.dirname(OUT))) mkdirSync(path.dirname(OUT), { recursive: true });
  // Resume: batches already in the file are skipped, so an interrupted run never pays twice.
  const existing = readLines();
  const done = new Set(existing.map((l) => JSON.parse(l).batch));
  const queue = Array.from({ length: batches }, (_, i) => i).filter((i) => !done.has(i));
  let total = existing.length;
  console.log(`Hədəf ${COUNT}, artıq var: ${total}, qalan sorğu: ${queue.length}, model: ${MODEL}`);

  const worker = async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
      if (spent + lastBatchCost > BUDGET) {
        console.log(`  Büdcə həddi: ${spent.toFixed(2)}$ xərcləndi, dayanıram.`);
        return;
      }
      const batch = (await generateBatch(i)).filter((e) => !leaks(e));
      // Written immediately: stopping the script never loses paid-for examples.
      if (batch.length) {
        appendFileSync(OUT, batch.map((e) => JSON.stringify({ ...e, batch: i }) + "\n").join(""));
      }
      total += batch.length;
      console.log(`  ${total}/${COUNT}  (~${spent.toFixed(3)}$)`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Hazırdır: ${OUT} (${total} nümunə, ~${spent.toFixed(2)}$)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
