import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageCode } from "../config/languages";
import type { Notify } from "../context/toastContext";
import type {
  CallStatus,
  PartyState,
  ScamAlert,
  Side,
  TranscriptEntry,
  VoiceGender,
} from "../types";
import type { FinishedCall, LiveOptions } from "./useCallSession";
import { tr } from "../i18n/i18n";

export interface PhoneCallSettings {
  myNumber: string;
  friendNumber: string;
  myLang: LanguageCode;
  friendLang: LanguageCode;
  voice: VoiceGender;
}

export interface PhoneStatus {
  configured: boolean;
  ready: boolean;
  number: string | null;
}

type ServerStatus = "idle" | "calling-me" | "calling-friend" | "live" | "ended";

type PhoneEvent =
  | {
      type: "snapshot";
      status: ServerStatus;
      startedAt: number | null;
      transcript: TranscriptEntry[];
    }
  | { type: "status"; status: ServerStatus; startedAt: number | null; duration?: string }
  | { type: "partial"; who: Side; text: string }
  | { type: "entry"; entry: TranscriptEntry }
  | { type: "alert"; alert: ScamAlert }
  | { type: "playing"; to: Side; delayMs: number; durationMs: number }
  | { type: "error"; message: string };

const PHASE_LABEL: Partial<Record<ServerStatus, string>> = {
  get "calling-me"() {
    return tr("Sizə zəng edilir…", "Calling you…");
  },
  get "calling-friend"() {
    return tr("Qarşı tərəfə zəng edilir…", "Calling the other party…");
  },
};

const STATUS_POLL_MS = 5000;

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

/**
 * Phone-to-phone mode: the server places both calls through Twilio and runs the
 * translation pipeline; this hook starts/ends the call and mirrors its live state
 * from Server-Sent Events. Exposes the same shape as useCallSession.
 */
export function usePhoneCall(
  notify: Notify,
  liveOptions: LiveOptions,
  onFinished: (call: FinishedCall) => void,
) {
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [phase, setPhase] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [partials, setPartials] = useState<Record<Side, string>>({ me: "", friend: "" });
  const [alerts, setAlerts] = useState<ScamAlert[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [aiUntil, setAiUntil] = useState<Record<Side, number>>({ me: 0, friend: 0 });
  const [now, setNow] = useState(() => Date.now());

  const sessionRef = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const onFinishedRef = useRef(onFinished);
  const optionsRef = useRef(liveOptions);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  // Is Twilio configured and the tunnel up? Poll until it is.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const res = await fetch("/api/phone/status");
        const data: PhoneStatus = await res.json();
        if (cancelled) return;
        setPhoneStatus(data);
        if (data.configured && !data.ready) timer = setTimeout(check, STATUS_POLL_MS);
      } catch {
        if (!cancelled) setPhoneStatus({ configured: false, ready: false, number: null });
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Forward option changes (auto-answer, profile) to a running call.
  useEffect(() => {
    optionsRef.current = liveOptions;
    const id = sessionRef.current;
    if (id) {
      post(`/api/phone/${id}/options`, {
        autoAnswer: liveOptions.autoAnswer,
        profile: liveOptions.profile,
      }).catch(() => {});
    }
  }, [liveOptions]);

  // Re-render while the AI is speaking so party cards can switch back afterwards.
  const aiActive = Math.max(aiUntil.me, aiUntil.friend) > now;
  useEffect(() => {
    if (!aiActive) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [aiActive]);

  const commit = useCallback((entries: TranscriptEntry[]) => {
    transcriptRef.current = entries;
    setTranscript(entries);
  }, []);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    sessionRef.current = null;
  }, []);

  /** Applies a server call status (from the initial snapshot or a later update). */
  const applyStatus = useCallback(
    (serverStatus: ServerStatus, serverStartedAt: number | null, duration?: string) => {
      setStartedAt(serverStartedAt);
      setPhase(PHASE_LABEL[serverStatus] ?? null);
      if (serverStatus === "live") setStatus("live");
      if (serverStatus === "ended") {
        setStatus("ended");
        setPartials({ me: "", friend: "" });
        closeStream();
        onFinishedRef.current({
          transcript: transcriptRef.current,
          duration: duration ?? "00:00",
          startedAt: serverStartedAt ?? undefined,
        });
      }
    },
    [closeStream],
  );

  const handleEvent = useCallback(
    (event: PhoneEvent) => {
      switch (event.type) {
        case "snapshot":
          commit(event.transcript);
          applyStatus(event.status, event.startedAt);
          break;
        case "status":
          applyStatus(event.status, event.startedAt, event.duration);
          break;
        case "partial":
          setPartials((p) => ({ ...p, [event.who]: event.text }));
          break;
        case "entry": {
          const exists = transcriptRef.current.some((e) => e.id === event.entry.id);
          commit(
            exists
              ? transcriptRef.current.map((e) => (e.id === event.entry.id ? event.entry : e))
              : [...transcriptRef.current, event.entry],
          );
          if (event.entry.latencyMs !== undefined && event.entry.who !== "ai") {
            setLastLatency(event.entry.latencyMs);
          }
          break;
        }
        case "alert":
          setAlerts((list) => [...list.filter((a) => a.id !== event.alert.id), event.alert]);
          break;
        case "playing": {
          const until = Date.now() + event.delayMs + event.durationMs;
          setAiUntil((current) => ({ ...current, [event.to]: Math.max(current[event.to], until) }));
          setNow(Date.now());
          break;
        }
        case "error":
          notify(event.message, "error");
          break;
      }
    },
    [applyStatus, commit, notify],
  );

  const start = useCallback(
    async ({ myNumber, friendNumber, myLang, friendLang, voice }: PhoneCallSettings) => {
      setStatus("connecting");
      setPhase(tr("Zəng hazırlanır…", "Preparing the call…"));
      commit([]);
      setAlerts([]);
      setLastLatency(null);
      setStartedAt(null);
      try {
        const { id } = await post<{ id: string }>("/api/phone/call", {
          myNumber,
          friendNumber,
          myLang,
          friendLang,
          voice,
          autoAnswer: optionsRef.current.autoAnswer,
          profile: optionsRef.current.profile,
        });
        sessionRef.current = id;
        const source = new EventSource(`/api/phone/${id}/events`);
        source.onmessage = (message) => handleEvent(JSON.parse(message.data) as PhoneEvent);
        sourceRef.current = source;
      } catch (err) {
        notify(
          `${tr("Zəng başlamadı", "Call did not start")}: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        setStatus("error");
        setPhase(null);
      }
    },
    [commit, handleEvent, notify],
  );

  const stop = useCallback(async () => {
    const id = sessionRef.current;
    if (id) await post(`/api/phone/${id}/hangup`).catch(() => {});
    else setStatus("idle");
  }, []);

  useEffect(() => closeStream, [closeStream]);

  const dismissAlert = useCallback(
    (id: number) => setAlerts((list) => list.filter((a) => a.id !== id)),
    [],
  );

  const sideState = (side: Side): PartyState => {
    if (status !== "live") return "off";
    if (aiUntil[side] > now) return "ai";
    return partials[side] ? "speaking" : "listening";
  };

  return {
    phoneStatus,
    status,
    phase,
    isLive: status === "live",
    isBusy: status === "connecting" || status === "live",
    startedAt,
    transcript,
    partials,
    alerts,
    dismissAlert,
    lastLatency,
    partyStates: { me: sideState("me"), friend: sideState("friend") } as Record<Side, PartyState>,
    start,
    stop,
  };
}
