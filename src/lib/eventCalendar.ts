/**
 * Add to calendar: a calendar file (.ics) built in the reader's browser from the event's own facts.
 * No outside service. Times are the listing's local time (floating), since listings give local times.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time?: string | null | undefined; // HH:MM[:SS]
  location?: string | null | undefined;
  source_url?: string | null | undefined;
  description?: string | null | undefined;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const ymd = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
};

/** Folds long lines at 75 octets-ish as the calendar format asks (simple 73-char fold). */
const fold = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? " " : "") + line.slice(i, i + 73));
  return out.join("\r\n");
};

/** Pure: the calendar file text. Timed events last 2 hours; untimed events are all-day. */
export function buildIcs(e: CalendarEvent, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const time = e.start_time && /^\d{2}:\d{2}/.test(e.start_time) ? e.start_time.slice(0, 5) : null;
  let when: string[];
  if (time) {
    const [h, m] = time.split(":").map(Number) as [number, number];
    const endH = h + 2;
    const endDate = endH >= 24 ? nextDay(e.start_date) : e.start_date;
    const pad = (n: number) => String(n).padStart(2, "0");
    when = [`DTSTART:${ymd(e.start_date)}T${pad(h)}${pad(m)}00`, `DTEND:${ymd(endDate)}T${pad(endH % 24)}${pad(m)}00`];
  } else {
    when = [`DTSTART;VALUE=DATE:${ymd(e.start_date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.start_date))}`];
  }
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Curatr//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${e.id}@curatr.pro`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.source_url ? [`URL:${e.source_url}`] : []),
    ...(e.description || e.source_url ? [`DESCRIPTION:${esc([e.description, e.source_url].filter(Boolean).join("\n\n"))}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Downloads the file; phones offer to add it to the calendar. */
export function downloadIcs(e: CalendarEvent): void {
  const blob = new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${e.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
