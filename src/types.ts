import type { LanguageCode } from "./config/languages";

export type Side = "me" | "friend";

/** What a party card shows: idle, listening, the person talking, or the AI voice playing to them. */
export type PartyState = "off" | "listening" | "speaking" | "ai";

export type VoiceGender = "f" | "m";

export type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

/** Who produced a transcript line; "ai" is an automatic reply spoken on my behalf. */
export type Speaker = Side | "ai";

export interface TranscriptEntry {
  id: number;
  who: Speaker;
  /** Elapsed call time when the phrase was heard, e.g. "01:23". */
  time: string;
  original: string;
  translation: string;
  toLang: LanguageCode;
  status: "pending" | "done" | "error";
  error?: string;
  /** From "phrase recognized" to "translated voice starts playing". */
  latencyMs?: number;
  /** Auto-answer mode: why the AI left this question to me. */
  note?: string;
  /** Phone-scam risk detected in this utterance. */
  risk?: RiskAssessment;
}

export type RiskLevel = "none" | "warning" | "danger";

export type RiskCategory =
  | "none"
  | "card"
  | "cvv"
  | "otp"
  | "pin"
  | "password"
  | "remote_access"
  | "money"
  | "impersonation"
  | "other";

export interface RiskAssessment {
  level: RiskLevel;
  category: RiskCategory;
  reason: string;
}

/** A raised scam alert, shown as a banner until dismissed. */
export interface ScamAlert extends RiskAssessment {
  id: number;
  entryId: number;
  time: string;
  quote: string;
}

/** Result of /api/respond for one utterance of the other party. */
export interface AutoResponse {
  translation: string;
  reply: string;
  reply_translation: string;
  needs_user: boolean;
  note: string;
  risk: RiskAssessment;
}

export type EntityType =
  "date" | "time" | "price" | "location" | "person" | "phone" | "reference" | "other";

export type CallIntent =
  | "hotel_booking"
  | "restaurant_booking"
  | "appointment"
  | "meeting"
  | "purchase"
  | "delivery"
  | "customer_support"
  | "travel"
  | "personal"
  | "scam_attempt"
  | "other";

export interface Entity {
  type: EntityType;
  label: string;
  value: string;
}

/** A promise made during the call: by me (the caller) or by the other party. */
export interface Commitment {
  owner: "me" | "other";
  task: string;
  /** As said in the call ("by Friday"). */
  due: string;
  /** Local ISO 8601 ("2026-10-12" or "2026-10-12T14:00"), or "". */
  due_iso: string;
}

export type ActionType = "calendar" | "reminder" | "note" | "map" | "email";

/** A ready-to-run follow-up suggested by the AI. Dates are local ISO 8601 or "". */
export interface SuggestedAction {
  type: ActionType;
  title: string;
  details: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string;
}

export interface CallSummary {
  title: string;
  intent: CallIntent;
  outcome: string;
  summary: string;
  entities: Entity[];
  agreements: string[];
  commitments: Commitment[];
  actions: SuggestedAction[];
  open_questions: string[];
}

/** A finished call kept in the local call memory. */
export interface StoredCall {
  id: string;
  startedAt: number;
  number: string | null;
  duration: string;
  title: string;
  intent: CallIntent;
  outcome: string;
  summary: string;
  commitments: Commitment[];
}

/** Live understanding of the call so far. */
export interface CallInsights {
  intent: CallIntent;
  status: string;
  facts: Entity[];
  commitments: { owner: "me" | "other"; task: string; due: string }[];
}

export interface ProviderHealth {
  ok: boolean;
  error: string | null;
}

export interface Health {
  /** Public cloud demo (Claude and Windows call features off). */
  demo?: boolean;
  azure: ProviderHealth & { region: string | null };
  claude: ProviderHealth & { model: string; fastModel?: string };
  /** Azure Translator: "azure" = live translation without Claude credit. */
  translator?: ProviderHealth & { engine: "azure" | "claude" };
}

export type DeviceRole = "myMic" | "myOut" | "callIn" | "callOut";

export type DeviceSelection = Record<DeviceRole, string>;

export interface DeviceIssue {
  level: "error" | "warning";
  message: string;
}

/** What phones watching the call (QR viewer) receive. */
export interface ViewerSnapshot {
  status: CallStatus;
  myLang: { code: string; name: string };
  friendLang: { code: string; name: string };
  muted: boolean;
  entries: Pick<TranscriptEntry, "id" | "who" | "time" | "original" | "translation" | "status">[];
  partials: Record<Side, string>;
  alerts: { id: number; level: string; reason: string; quote: string }[];
  summary: { title: string; summary: string } | null;
}
