import { describe, expect, it } from "vitest";
import type { SuggestedAction } from "../types";
import {
  buildIcs,
  commitmentToReminder,
  eventTimes,
  googleCalendarUrl,
  mailtoUrl,
  mapsUrl,
  parseLocalIso,
} from "./actions";

const checkIn: SuggestedAction = {
  type: "calendar",
  title: "Berlin otel: check-in",
  details: "Rezervasiya Əli adına, 240 €",
  start: "2026-10-12T14:00",
  end: "",
  all_day: false,
  location: "Hotel Adlon, Berlin",
};

describe("parseLocalIso", () => {
  it("parses dates and date-times", () => {
    expect(parseLocalIso("2026-10-12")).toEqual({ day: "20261012", time: undefined });
    expect(parseLocalIso("2026-10-12T09:05")).toEqual({ day: "20261012", time: "090500" });
    expect(parseLocalIso("sabah")).toBeNull();
    expect(parseLocalIso("")).toBeNull();
  });
});

describe("eventTimes", () => {
  it("defaults to one hour, rolling over midnight", () => {
    expect(eventTimes({ start: "2026-10-12T23:30", end: "", all_day: false })).toEqual({
      start: { day: "20261012", time: "233000" },
      end: { day: "20261013", time: "003000" },
      allDay: false,
    });
  });

  it("treats a date without time as all-day ending the next day", () => {
    expect(eventTimes({ start: "2026-12-31", end: "", all_day: false })).toEqual({
      start: { day: "20261231" },
      end: { day: "20270101" },
      allDay: true,
    });
  });

  it("returns null without a usable start", () => {
    expect(eventTimes({ start: "", end: "", all_day: true })).toBeNull();
  });
});

describe("googleCalendarUrl", () => {
  it("prefills title, local times, zone, details and location", () => {
    const url = new URL(googleCalendarUrl(checkIn, "Asia/Baku")!);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Berlin otel: check-in");
    expect(url.searchParams.get("dates")).toBe("20261012T140000/20261012T150000");
    expect(url.searchParams.get("ctz")).toBe("Asia/Baku");
    expect(url.searchParams.get("location")).toBe("Hotel Adlon, Berlin");
  });

  it("is null when the event has no date", () => {
    expect(googleCalendarUrl({ ...checkIn, start: "" }, "Asia/Baku")).toBeNull();
  });
});

describe("buildIcs", () => {
  it("creates a valid event with escaped text", () => {
    const ics = buildIcs(checkIn, "Asia/Baku", new Date("2026-10-09T08:00:00Z"))!;
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;TZID=Asia/Baku:20261012T140000");
    expect(ics).toContain("DTEND;TZID=Asia/Baku:20261012T150000");
    expect(ics).toContain("LOCATION:Hotel Adlon\\, Berlin");
    expect(ics).not.toContain("VALARM");
  });

  it("adds an alert to reminders", () => {
    const ics = buildIcs({ ...checkIn, type: "reminder" }, "Asia/Baku")!;
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
  });
});

describe("links", () => {
  it("builds map and e-mail links", () => {
    expect(mapsUrl("Hotel Adlon, Berlin")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Hotel%20Adlon%2C%20Berlin",
    );
    expect(mailtoUrl("Təsdiq", "Salam\nSağ olun")).toBe(
      "mailto:?subject=T%C9%99sdiq&body=Salam%0ASa%C4%9F%20olun",
    );
  });
});

describe("commitmentToReminder", () => {
  it("turns a dated promise into a reminder", () => {
    expect(
      commitmentToReminder({
        owner: "me",
        task: "Faylları göndər",
        due: "cümə günü",
        due_iso: "2026-10-16",
      }),
    ).toMatchObject({ type: "reminder", start: "2026-10-16", all_day: true });
    expect(commitmentToReminder({ owner: "me", task: "x", due: "", due_iso: "" })).toBeNull();
  });
});
