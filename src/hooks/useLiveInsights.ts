import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "../config/languages";
import { api } from "../lib/api";
import type { CallInsights, TranscriptEntry } from "../types";

/** At most one refresh per interval; the newest transcript wins. */
const MIN_INTERVAL_MS = 6000;
const MAX_LINES = 40;

/**
 * Keeps a live AI understanding of the call (intent, facts, promises) up to date while
 * it runs. A refresh is triggered by new translated lines, throttled, never overlapping.
 */
export function useLiveInsights(
  transcript: TranscriptEntry[],
  live: boolean,
  myLang: LanguageCode,
) {
  const [insights, setInsights] = useState<CallInsights | null>(null);
  const [updating, setUpdating] = useState(false);
  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);
  const doneCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const done = transcript.filter((e) => e.status === "done");
  const doneCount = done.length;

  // A new call starts with an empty transcript: forget the previous call's insights.
  useEffect(() => {
    if (transcript.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInsights(null);
      doneCountRef.current = 0;
    }
  }, [transcript.length]);

  useEffect(() => {
    if (!live || doneCount === 0 || doneCount === doneCountRef.current) return;

    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setUpdating(true);
      lastRunRef.current = Date.now();
      doneCountRef.current = doneCount;
      try {
        setInsights(await api.insights(done.slice(-MAX_LINES), myLang));
      } catch {
        /* keep the last good insights; the call itself is unaffected */
      } finally {
        inFlightRef.current = false;
        setUpdating(false);
      }
    };

    clearTimeout(timerRef.current);
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRunRef.current));
    timerRef.current = setTimeout(run, wait);
    return () => clearTimeout(timerRef.current);
    // `done` is derived from transcript; doneCount captures when it changes meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, doneCount, myLang]);

  return { insights, updating };
}
