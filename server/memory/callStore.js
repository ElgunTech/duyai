import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Call memory: finished call reports kept in a local JSON file (data/calls.json), so the
 * next call with the same number can show what was discussed and promised before.
 * Local only; nothing leaves this computer.
 */

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DATA_DIR = path.join(root, "data");
const FILE = path.join(DATA_DIR, "calls.json");
const MAX_CALLS = 500;

/** Same number in any notation: "+994 77 123 45 67", "0771234567" → "771234567". */
export function numberKey(number) {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : null;
}

function readAll() {
  if (!existsSync(FILE)) return [];
  try {
    const calls = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(calls) ? calls : [];
  } catch {
    return [];
  }
}

function writeAll(calls) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${FILE}.tmp`;
  writeFileSync(temp, JSON.stringify(calls, null, 2));
  renameSync(temp, FILE); // atomic replace: never a half-written file
}

/** Earlier calls with the same number, newest first. */
export function previousCalls(number, excludeId) {
  const key = numberKey(number);
  if (!key) return [];
  return readAll()
    .filter((c) => c.id !== excludeId && numberKey(c.number) === key)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function saveCall(call) {
  const calls = readAll().filter((c) => c.id !== call.id);
  calls.push(call);
  calls.sort((a, b) => b.startedAt - a.startedAt);
  writeAll(calls.slice(0, MAX_CALLS));
  return call;
}

export function recentCalls(limit = 50) {
  return readAll()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}
