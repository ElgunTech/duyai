import { useEffect, useRef, useState } from "react";
import { AUTO_END_MS, AUTO_START_LEVEL, AUTO_START_MS } from "../config/constants";
import { StreamAnalyser, audioContext, openInputStream, stopStream } from "../lib/audio";

const POLL_MS = 100;
/** How long the line must be at its idle level before a new sound counts as a new call. */
const LINE_IDLE_MS = 1500;
/** A call is this many times louder than the idle line's background noise. */
const RISE_FACTOR = 4;
/** The line counts as idle up to this multiple of its background noise. */
const IDLE_FACTOR = 2;
/** Floor for "idle" so a perfectly silent cable still works. */
const MIN_IDLE_LEVEL = 0.0005;

/** "armed": waiting for a call; "needs-click": the browser blocks audio until a click. */
export type AutoDetectState = "off" | "armed" | "needs-click" | "error";

export interface AutoDetect {
  state: AutoDetectState;
  /** Current call-line level (RMS), for diagnostics in the panel. */
  level: number;
  /** Background level of the idle line, learned before the call; used to detect its end. */
  idleLevel: number;
  /** What drives detection: the Windows call state (exact) or audio levels (fallback). */
  source: "windows" | "audio";
}

/**
 * Starts the translation as soon as phone audio appears on the call input
 * (Phone Link → virtual cable). It learns the idle line's background noise and reacts
 * to a clear rise above it. Only measures the level locally: no cloud cost.
 */
export function useCallAutoStart({
  enabled,
  deviceId,
  onCallStart,
}: {
  enabled: boolean;
  deviceId: string;
  onCallStart: (idleLevel: number) => void;
}): AutoDetect {
  const [detect, setDetect] = useState<AutoDetect>({
    state: "off",
    level: 0,
    idleLevel: 0,
    source: "audio",
  });
  const onCallStartRef = useRef(onCallStart);

  useEffect(() => {
    onCallStartRef.current = onCallStart;
  }, [onCallStart]);

  // Browsers keep audio suspended until the user interacts with the page once.
  useEffect(() => {
    const resume = () => audioContext();
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => {
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !deviceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetect((d) => (d.state === "off" ? d : { ...d, state: "off" }));
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let analyser: StreamAnalyser | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let tick = 0;
    let floor = Infinity; // learned background noise of the idle line
    let idleMs = 0;
    let activeMs = 0;

    openInputStream(deviceId, true)
      .then((s) => {
        stream = s;
        if (cancelled) return stopStream(s);
        analyser = new StreamAnalyser(s);
        timer = setInterval(() => {
          if (audioContext().state !== "running") {
            return setDetect((d) => ({ ...d, state: "needs-click" }));
          }
          const level = analyser?.level() ?? 0;
          // Follow the floor down at once, up only very slowly (speech must not raise it).
          floor = level < floor ? level : floor + (level - floor) * 0.002;
          const idleLimit = Math.max(MIN_IDLE_LEVEL, floor * IDLE_FACTOR);
          const startLimit = Math.max(AUTO_START_LEVEL, floor * RISE_FACTOR);

          // Only a *new* call counts: sound must follow a stretch of idle line, so stopping
          // the translation by hand mid-call does not immediately restart it.
          idleMs = level <= idleLimit ? idleMs + POLL_MS : idleMs;
          if (idleMs >= LINE_IDLE_MS) {
            // Count loud time, forgive short gaps (ringback tones pulse on and off).
            activeMs =
              level > startLimit ? activeMs + POLL_MS : Math.max(0, activeMs - POLL_MS / 2);
            if (activeMs >= AUTO_START_MS) {
              activeMs = 0;
              idleMs = 0;
              onCallStartRef.current(idleLimit);
            }
          }
          if (tick++ % 5 === 0)
            setDetect({ state: "armed", level, idleLevel: idleLimit, source: "audio" });
        }, POLL_MS);
      })
      .catch(() => !cancelled && setDetect((d) => ({ ...d, state: "error" })));

    return () => {
      cancelled = true;
      clearInterval(timer);
      analyser?.dispose();
      stopStream(stream);
    };
  }, [enabled, deviceId]);

  return detect;
}

/**
 * Fires once when the call line has dropped back to its idle level for a while:
 * Phone Link stops sending audio when the phone call ends.
 */
export function useCallAutoEnd({
  enabled,
  analyser,
  idleLevel,
  onCallEnd,
}: {
  enabled: boolean;
  analyser: StreamAnalyser | null;
  /** Idle-line level learned before the call (see useCallAutoStart). */
  idleLevel: number;
  onCallEnd: () => void;
}) {
  const onCallEndRef = useRef(onCallEnd);

  useEffect(() => {
    onCallEndRef.current = onCallEnd;
  }, [onCallEnd]);

  useEffect(() => {
    if (!enabled || !analyser) return;
    const limit = Math.max(MIN_IDLE_LEVEL, idleLevel);
    let silentMs = 0;
    const timer = setInterval(() => {
      silentMs = analyser.level() <= limit ? silentMs + POLL_MS : 0;
      if (silentMs >= AUTO_END_MS) {
        clearInterval(timer);
        onCallEndRef.current();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, analyser, idleLevel]);
}

const CALL_STATE_POLL_MS = 700;

export interface WindowsCallState {
  /** The server can see Phone Link calls (Windows). */
  supported: boolean;
  inCall: boolean;
}

/**
 * Polls the server for the Windows Phone Link call state (the phone's Hands-Free audio
 * device is active only during a call). Exact, unlike guessing from audio levels.
 */
export function useWindowsCallState(enabled: boolean): WindowsCallState | null {
  const [state, setState] = useState<WindowsCallState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/call-state");
        const data: WindowsCallState = await res.json();
        if (!cancelled)
          setState((s) => (s?.supported === data.supported && s.inCall === data.inCall ? s : data));
      } catch {
        /* server restarting: keep the last state */
      }
    };
    void poll();
    const timer = setInterval(poll, CALL_STATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return enabled ? state : null;
}
