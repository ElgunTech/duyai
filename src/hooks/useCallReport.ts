import { useCallback, useState } from "react";
import type { LanguageCode } from "../config/languages";
import { api } from "../lib/api";
import { saveCallLocally } from "../lib/localMemory";
import type { CallSummary, StoredCall, TranscriptEntry } from "../types";
import type { FinishedCall } from "./useCallSession";

export interface CallReport extends FinishedCall {
  myLang: LanguageCode;
  friendLang: LanguageCode;
  summary: CallSummary | null;
  loading: boolean;
  error: string | null;
  /** Call memory: this call's number and earlier calls with it (once saved). */
  memory: { number: string | null; previous: StoredCall[] } | null;
}

/** Requests the end-of-call summary and holds it for the report dialog. */
export function useCallReport() {
  const [report, setReport] = useState<CallReport | null>(null);

  const generate = useCallback(
    async (
      call: FinishedCall,
      myLang: LanguageCode,
      friendLang: LanguageCode,
      /** The other party's number if known (phone mode or typed); else Phone Link is asked. */
      number?: string,
    ) => {
      const usable: TranscriptEntry[] = call.transcript.filter((e) => e.original);
      const base = { ...call, transcript: usable, myLang, friendLang, summary: null, memory: null };
      setReport({ ...base, loading: true, error: null });
      try {
        const summary = await api.summarize(usable, myLang, friendLang, call.startedAt);
        setReport({ ...base, summary, loading: false, error: null });
        // Remember the call; failures here must not hide the report. Without a server
        // store (public demo) the memory stays in this browser.
        const toSave = {
          id: crypto.randomUUID(),
          startedAt: call.startedAt ?? Date.now(),
          number,
          duration: call.duration,
          summary,
        };
        api
          .saveCall(toSave)
          .catch(() => saveCallLocally(toSave))
          .then(({ call: saved, previous }) =>
            setReport((current) =>
              current?.summary === summary
                ? { ...current, memory: { number: saved.number, previous } }
                : current,
            ),
          )
          .catch(() => {});
      } catch (err) {
        setReport({
          ...base,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [],
  );

  const close = useCallback(() => setReport(null), []);

  return { report, generate, close };
}
