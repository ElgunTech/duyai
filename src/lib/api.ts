import type { LanguageCode } from "../config/languages";
import type {
  AutoResponse,
  CallInsights,
  CallSummary,
  Health,
  StoredCall,
  TranscriptEntry,
  ViewerSnapshot,
} from "../types";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

/** The fields of a transcript line the server needs. */
const SPEAKER_NAMES: Record<TranscriptEntry["who"], string> = {
  me: "Me",
  friend: "Friend",
  ai: "AI assistant (speaking for Me)",
};

const toWire = (e: TranscriptEntry) => ({
  speaker: SPEAKER_NAMES[e.who],
  time: e.time,
  original: e.original,
  translation: e.translation,
});

export const api = {
  health: () => request<Health>("/api/health"),

  speechToken: () => request<{ token: string; region: string }>("/api/speech-token"),

  async translate(text: string, from: LanguageCode, to: LanguageCode, context: TranscriptEntry[]) {
    const { translation } = await request<{ translation: string }>("/api/translate", {
      text,
      from,
      to,
      context: context.map(toWire),
    });
    return translation;
  },

  /**
   * For the other party's speech: translation, scam-risk rating and, when `allowReply`
   * is on, a reply spoken on my behalf.
   */
  respond: (
    text: string,
    from: LanguageCode,
    to: LanguageCode,
    context: TranscriptEntry[],
    options: { profile: string; allowReply: boolean },
  ) =>
    request<AutoResponse>("/api/respond", {
      text,
      from,
      to,
      context: context.map(toWire),
      ...options,
    }),

  summarize: (
    transcript: TranscriptEntry[],
    myLang: LanguageCode,
    friendLang: LanguageCode,
    startedAt: number = Date.now(),
  ) =>
    request<CallSummary>("/api/summary", {
      transcript: transcript.map(toWire),
      myLang,
      friendLang,
      callStartedAt: new Date(startedAt).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),

  /** Saves a finished call to the call memory; returns earlier calls with the same number. */
  saveCall: (call: {
    id: string;
    startedAt: number;
    number?: string;
    duration: string;
    summary: CallSummary;
  }) => request<{ call: StoredCall; previous: StoredCall[] }>("/api/calls", call),

  /** Link (and QR code) for watching the call live on a phone in the same Wi-Fi. */
  viewerLink: () =>
    request<{
      url: string;
      qr: string;
      alternatives: { adapter: string; url: string }[];
      viewers: number;
      /** Public demo: the QR opens the demo on the phone instead of mirroring a call. */
      demo?: boolean;
    }>("/api/viewer/link"),

  /** Publishes the current call state to phones watching it. */
  pushViewerSnapshot: (snapshot: ViewerSnapshot) =>
    request<void>("/api/viewer/snapshot", snapshot).catch(() => {}),

  /** Live understanding of the call so far (intent, facts, promises). */
  insights: (transcript: TranscriptEntry[], myLang: LanguageCode) =>
    request<CallInsights>("/api/insights", { transcript: transcript.map(toWire), myLang }),
};
