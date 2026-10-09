/**
 * JSON schemas for Claude structured outputs (output_config.format).
 * Every property is required; "not mentioned" is expressed as "" or [] so the
 * frontend never has to handle missing keys.
 */

export const INTENTS = [
  "hotel_booking",
  "restaurant_booking",
  "appointment",
  "meeting",
  "purchase",
  "delivery",
  "customer_support",
  "travel",
  "personal",
  "scam_attempt",
  "other",
];

const entity = {
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
};

const commitment = {
  type: "object",
  properties: {
    owner: {
      type: "string",
      enum: ["me", "other"],
      description: "me = the caller, other = the other party",
    },
    task: { type: "string", description: "What was promised, as a short imperative phrase" },
    due: { type: "string", description: "Deadline as said in the call, or empty" },
    due_iso: {
      type: "string",
      description: "Deadline as local ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm), or empty",
    },
  },
  required: ["owner", "task", "due", "due_iso"],
  additionalProperties: false,
};

const action = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["calendar", "reminder", "note", "map", "email"] },
    title: { type: "string" },
    details: {
      type: "string",
      description: "Event description, note text, or the e-mail body for type email",
    },
    start: {
      type: "string",
      description: "Local ISO 8601 start (YYYY-MM-DD or YYYY-MM-DDTHH:mm), or empty",
    },
    end: { type: "string", description: "Local ISO 8601 end, or empty" },
    all_day: { type: "boolean" },
    location: { type: "string", description: "Address or place name, or empty" },
  },
  required: ["type", "title", "details", "start", "end", "all_day", "location"],
  additionalProperties: false,
};

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short title of the call" },
    intent: { type: "string", enum: INTENTS },
    outcome: { type: "string", description: "Main result, e.g. BOOKING CONFIRMED" },
    summary: { type: "string", description: "2-4 sentence summary" },
    entities: { type: "array", items: entity },
    agreements: { type: "array", items: { type: "string" } },
    commitments: { type: "array", items: commitment },
    actions: { type: "array", items: action },
    open_questions: {
      type: "array",
      items: { type: "string" },
      description: "Important things left unclear or not agreed (e.g. payment deadline)",
    },
  },
  required: [
    "title",
    "intent",
    "outcome",
    "summary",
    "entities",
    "agreements",
    "commitments",
    "actions",
    "open_questions",
  ],
  additionalProperties: false,
};

/** Lightweight live view, refreshed during the call. */
export const INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    status: { type: "string", description: "Where the conversation stands, max 8 words" },
    facts: { type: "array", items: entity },
    commitments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          owner: { type: "string", enum: ["me", "other"] },
          task: { type: "string" },
          due: { type: "string" },
        },
        required: ["owner", "task", "due"],
        additionalProperties: false,
      },
    },
  },
  required: ["intent", "status", "facts", "commitments"],
  additionalProperties: false,
};

export const RESPOND_SCHEMA = {
  type: "object",
  properties: {
    translation: {
      type: "string",
      description: "The utterance translated into the caller's language",
    },
    reply: {
      type: "string",
      description:
        "Spoken reply in the other party's language, or empty if the AI should not answer",
    },
    reply_translation: {
      type: "string",
      description: "The reply translated into the caller's language, or empty",
    },
    needs_user: {
      type: "boolean",
      description: "True if this is a question only the caller can answer",
    },
    note: {
      type: "string",
      description:
        "When needs_user: a short hint for the caller in their language, otherwise empty",
    },
    risk: {
      type: "object",
      description: "Phone-scam risk of this utterance",
      properties: {
        level: { type: "string", enum: ["none", "warning", "danger"] },
        category: {
          type: "string",
          enum: [
            "none",
            "card",
            "cvv",
            "otp",
            "pin",
            "password",
            "remote_access",
            "money",
            "impersonation",
            "other",
          ],
        },
        reason: {
          type: "string",
          description: "One short sentence in the caller's language, empty when level is none",
        },
      },
      required: ["level", "category", "reason"],
      additionalProperties: false,
    },
  },
  required: ["translation", "reply", "reply_translation", "needs_user", "note", "risk"],
  additionalProperties: false,
};
