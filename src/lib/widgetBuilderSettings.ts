/**
 * Saved settings for the public widget builder (/feed/:slug/widget).
 * Settings are remembered on the device per feed and can travel in a link
 * (?settings=...), so anyone can come back to the same widget later.
 * Pure helpers only — every value is validated before it is used.
 */

export interface WidgetBuilderSettings {
  maxHeadlines: number;
  theme: "auto" | "light" | "dark";
  accent: string;
  width: string;
  customTitle: string;
  customAvatar: string;
  showSubscribe: boolean;
  frequency: "daily" | "weekly";
  sources: string[];
  featuredSources: string[];
  featuredDaysBySource: Record<string, number>;
}

export const WIDGET_MAX_OPTIONS = [3, 5, 7, 10] as const;
export const WIDGET_WIDTH_OPTIONS = ["wide", "responsive", "100%", "400px", "350px", "300px"] as const;
export const WIDGET_SETTINGS_PARAM = "settings";
const MAX_FEATURED = 3;

export const widgetSettingsStorageKey = (slug: string) => `curatr_widget_settings:${slug}`;

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 200);

/** Keep only well-formed values; anything unknown or unsafe is dropped. */
export function parseWidgetSettings(raw: unknown): Partial<WidgetBuilderSettings> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<WidgetBuilderSettings> = {};

  if (typeof r["maxHeadlines"] === "number" && (WIDGET_MAX_OPTIONS as readonly number[]).includes(r["maxHeadlines"])) {
    out.maxHeadlines = r["maxHeadlines"];
  }
  if (r["theme"] === "auto" || r["theme"] === "light" || r["theme"] === "dark") out.theme = r["theme"];
  if (typeof r["accent"] === "string" && /^#[0-9a-fA-F]{6}$/.test(r["accent"])) out.accent = r["accent"];
  if (typeof r["width"] === "string" && (WIDGET_WIDTH_OPTIONS as readonly string[]).includes(r["width"])) {
    out.width = r["width"];
  }
  if (typeof r["customTitle"] === "string") out.customTitle = r["customTitle"].slice(0, 100);
  if (typeof r["customAvatar"] === "string" && (r["customAvatar"] === "" || /^https:\/\//.test(r["customAvatar"])) && r["customAvatar"].length <= 1000) {
    out.customAvatar = r["customAvatar"];
  }
  if (typeof r["showSubscribe"] === "boolean") out.showSubscribe = r["showSubscribe"];
  if (r["frequency"] === "daily" || r["frequency"] === "weekly") out.frequency = r["frequency"];
  if (isStringList(r["sources"])) out.sources = r["sources"];
  if (isStringList(r["featuredSources"])) out.featuredSources = r["featuredSources"].slice(0, MAX_FEATURED);

  const days = r["featuredDaysBySource"];
  if (days && typeof days === "object" && !Array.isArray(days)) {
    const clean: Record<string, number> = {};
    for (const [name, d] of Object.entries(days as Record<string, unknown>)) {
      if (typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 5) clean[name] = d;
    }
    out.featuredDaysBySource = clean;
  }
  return out;
}

/**
 * What gets saved. When every publication is ticked, the list is left out so
 * publications that join the feed later are included automatically.
 */
export function settingsToSave(
  config: WidgetBuilderSettings,
  allSourcesSelected: boolean,
): Partial<WidgetBuilderSettings> {
  const { sources, ...rest } = config;
  return allSourcesSelected ? rest : { ...rest, sources };
}

/** Match a saved publication choice against the feed's current publications. */
export function applySavedSources(
  saved: Partial<WidgetBuilderSettings> | null,
  available: string[],
): { sources: string[]; featuredSources: string[] } {
  const sources = saved?.sources ? saved.sources.filter((s) => available.includes(s)) : [...available];
  const featuredSources = (saved?.featuredSources ?? []).filter((s) => sources.includes(s));
  return { sources: sources.length > 0 ? sources : [...available], featuredSources };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeWidgetSettings(settings: Partial<WidgetBuilderSettings>): string {
  return toBase64Url(JSON.stringify(settings));
}

export function decodeWidgetSettings(value: string | null | undefined): Partial<WidgetBuilderSettings> | null {
  if (!value) return null;
  try {
    return parseWidgetSettings(JSON.parse(fromBase64Url(value)));
  } catch {
    return null;
  }
}
