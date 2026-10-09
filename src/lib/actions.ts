import type { Commitment, SuggestedAction } from "../types";

/**
 * Turns AI-suggested actions into links and files that work without any account
 * linking: Google Calendar's public "add event" URL, .ics files for every other
 * calendar app, Google Maps searches and mailto: drafts.
 * Dates are local ISO 8601 ("2026-10-12" or "2026-10-12T14:00") in the user's time zone.
 */

const DEFAULT_EVENT_MINUTES = 60;

interface ParsedDate {
  /** YYYYMMDD */
  day: string;
  /** HHMMSS, absent for all-day values */
  time?: string;
}

/** "2026-10-12T14:05" → { day: "20261012", time: "140500" }; null if not a date. */
export function parseLocalIso(value: string): ParsedDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return { day: `${y}${mo}${d}`, time: h ? `${h}${mi}${s ?? "00"}` : undefined };
}

/** Adds minutes to a YYYYMMDD + HHMMSS pair (calendar math in UTC to avoid DST surprises). */
function addMinutes(date: ParsedDate, minutes: number): ParsedDate {
  const { day, time = "000000" } = date;
  const t = new Date(
    Date.UTC(
      +day.slice(0, 4),
      +day.slice(4, 6) - 1,
      +day.slice(6, 8),
      +time.slice(0, 2),
      +time.slice(2, 4),
    ),
  );
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`,
    time: `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`,
  };
}

const nextDay = (day: string) => addMinutes({ day, time: "000000" }, 24 * 60).day;

interface EventTimes {
  start: ParsedDate;
  end: ParsedDate;
  allDay: boolean;
}

/** Start/end of an event; a missing end means one hour later (or the next day if all-day). */
export function eventTimes(
  action: Pick<SuggestedAction, "start" | "end" | "all_day">,
): EventTimes | null {
  const start = parseLocalIso(action.start);
  if (!start) return null;
  const allDay = action.all_day || !start.time;
  const parsedEnd = parseLocalIso(action.end);
  if (allDay) {
    const endDay = parsedEnd && parsedEnd.day > start.day ? parsedEnd.day : nextDay(start.day);
    return { start: { day: start.day }, end: { day: endDay }, allDay: true };
  }
  const end =
    parsedEnd?.time && `${parsedEnd.day}${parsedEnd.time}` > `${start.day}${start.time}`
      ? parsedEnd
      : addMinutes(start, DEFAULT_EVENT_MINUTES);
  return { start, end, allDay: false };
}

const stamp = (d: ParsedDate) => (d.time ? `${d.day}T${d.time}` : d.day);

/** Google Calendar's prefilled "add event" page (no API key or sign-in flow needed). */
export function googleCalendarUrl(action: SuggestedAction, timeZone: string): string | null {
  const times = eventTimes(action);
  if (!times) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: action.title,
    dates: `${stamp(times.start)}/${stamp(times.end)}`,
    details: action.details,
  });
  if (action.location) params.set("location", action.location);
  if (!times.allDay) params.set("ctz", timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const icsEscape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (c) => `\\${c}`);

/** RFC 5545 calendar file; reminders get an alert 30 minutes before. */
export function buildIcs(
  action: SuggestedAction,
  timeZone: string,
  now = new Date(),
): string | null {
  const times = eventTimes(action);
  if (!times) return null;
  const utcStamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const when = (key: "DTSTART" | "DTEND", d: ParsedDate) =>
    times.allDay ? `${key};VALUE=DATE:${d.day}` : `${key};TZID=${timeZone}:${stamp(d)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DuyAI//EN",
    "BEGIN:VEVENT",
    `UID:${utcStamp}-${Math.random().toString(36).slice(2)}@duyai`,
    `DTSTAMP:${utcStamp}`,
    when("DTSTART", times.start),
    when("DTEND", times.end),
    `SUMMARY:${icsEscape(action.title)}`,
    `DESCRIPTION:${icsEscape(action.details)}`,
    ...(action.location ? [`LOCATION:${icsEscape(action.location)}`] : []),
    ...(action.type === "reminder"
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${icsEscape(action.title)}`,
          "TRIGGER:-PT30M",
          "END:VALARM",
        ]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export const mapsUrl = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

export const mailtoUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** A commitment of mine with a deadline becomes a reminder action. */
export function commitmentToReminder(commitment: Commitment): SuggestedAction | null {
  if (!commitment.due_iso) return null;
  return {
    type: "reminder",
    title: commitment.task,
    details: commitment.due,
    start: commitment.due_iso,
    end: "",
    all_day: !commitment.due_iso.includes("T"),
    location: "",
  };
}

/** Starts a download of a text file in the browser. */
export function downloadText(fileName: string, content: string, mimeType: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
