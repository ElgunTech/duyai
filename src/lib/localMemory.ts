import type { CallSummary, StoredCall } from "../types";
import { storage } from "./storage";

const KEY = "callMemory";
const MAX_CALLS = 50;

/** Same number in different notations: compare the last 9 digits. */
const numberKey = (number?: string | null) => {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : null;
};

/**
 * Call memory kept in this browser only. Used by the public demo, where the server has no
 * private disk and visitors must never see each other's calls.
 */
export function saveCallLocally(call: {
  id: string;
  startedAt: number;
  number?: string;
  duration: string;
  summary: CallSummary;
}): { call: StoredCall; previous: StoredCall[] } {
  let all: StoredCall[];
  try {
    all = JSON.parse(storage.get(KEY) ?? "[]") as StoredCall[];
  } catch {
    all = [];
  }
  const stored: StoredCall = {
    id: call.id,
    startedAt: call.startedAt,
    number: call.number || null,
    duration: call.duration,
    title: call.summary.title,
    intent: call.summary.intent,
    outcome: call.summary.outcome,
    summary: call.summary.summary,
    commitments: call.summary.commitments,
  };
  const key = numberKey(stored.number);
  const previous = key
    ? all
        .filter((c) => numberKey(c.number) === key)
        .slice(-5)
        .reverse()
    : [];
  storage.set(KEY, JSON.stringify([...all, stored].slice(-MAX_CALLS)));
  return { call: stored, previous };
}
