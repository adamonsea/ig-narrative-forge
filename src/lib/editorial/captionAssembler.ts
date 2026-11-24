/** Editorial profile caption assembly. Pure code: facts are never AI text. */
export type CaptionLine = string; // e.g. "{date} · {time}" — dropped when any token in it is empty
export type CaptionFields = Record<string, string | null | undefined>;

const TOKEN = /\{([a-z_]+(?:\.[a-zA-Z-]+)?)\}/g;

export function assembleCaption(template: CaptionLine[], fields: CaptionFields): string {
  const out: string[] = [];
  for (const line of template) {
    let empty = false;
    const filled = line.replace(TOKEN, (_m, key: string) => {
      const v = (fields[key] ?? "").trim();
      if (!v) empty = true;
      return v;
    });
    if (empty) continue;
    if (filled === "" && out[out.length - 1] === "") continue; // collapse blank lines
    out.push(filled);
  }
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** "20h" / "20h30" / "8pm" / "20:00" → "20:00"; anything unclear → null (review flag). */
export function normaliseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})[h:.](\d{2})?$/) ?? s.match(/^(\d{1,2})h$/);
  if (m) {
    const h = Number(m[1]), min = Number(m[2] ?? 0);
    return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
  }
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]) % 12; if (m[3] === "pm") h += 12;
    const min = Number(m[2] ?? 0);
    return min < 60 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
  }
  return null;
}

/** "2 hours before" with start 20:00 → "18:00". */
export function relativeBefore(phrase: string, start: string | null): string | null {
  const st = normaliseTime(start);
  const m = phrase.toLowerCase().match(/(\d+)\s*(hour|hora|minute|minuto)s?\s*(before|antes)/);
  if (!st || !m) return null;
  const [h, mi] = st.split(":").map(Number) as [number, number];
  const mins = h * 60 + mi - Number(m[1]) * (m[2]!.startsWith("h") ? 60 : 1);
  if (mins < 0) return null;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Event hashtags: lower case, no accents, no spaces, clamped to the profile range. */
export function cleanHashtags(tags: string[], max: number): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const c = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (c) seen.add(`#${c}`);
  }
  return [...seen].slice(0, max);
}

/** Fields a human edited are never overwritten by a re-gather or regeneration. */
export function mergeUnlocked<T extends Record<string, unknown>>(current: T, incoming: Partial<T>, locked: Set<string>): T {
  const next = { ...current };
  for (const k of Object.keys(incoming) as (keyof T)[]) if (!locked.has(String(k))) next[k] = incoming[k] as T[keyof T];
  return next;
}
