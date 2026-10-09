import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { ViewerSnapshot } from "../types";

/** Partial results change many times a second; phones get at most this many updates. */
const MIN_GAP_MS = 250;

/** Keeps phones watching the call (QR viewer) up to date: only on change, throttled. */
export function useViewerSync(snapshot: ViewerSnapshot) {
  const serialized = JSON.stringify(snapshot);
  const latest = useRef(serialized);
  const sentJson = useRef("");
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latest.current = serialized;
    if (serialized === sentJson.current) return;
    const send = () => {
      lastSent.current = Date.now();
      timer.current = undefined;
      if (latest.current === sentJson.current) return;
      sentJson.current = latest.current;
      void api.pushViewerSnapshot(JSON.parse(latest.current) as ViewerSnapshot);
    };
    const wait = MIN_GAP_MS - (Date.now() - lastSent.current);
    if (wait <= 0) send();
    else timer.current ??= setTimeout(send, wait);
  }, [serialized]);

  useEffect(() => () => clearTimeout(timer.current), []);
}
