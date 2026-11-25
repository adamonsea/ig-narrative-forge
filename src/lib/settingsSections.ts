/** Feed Settings pages: one section per URL (/dashboard/topic/:slug/settings/:section). */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General", purpose: "Name, welcome line and the feed basics." },
  { id: "look", label: "Look", purpose: "How the feed looks to readers." },
  { id: "pictures", label: "Pictures", purpose: "How story pictures are made." },
  { id: "coverage", label: "Coverage", purpose: "What belongs in the feed." },
  { id: "local", label: "Local", purpose: "How close to home stories must be.", regionalOnly: true },
  { id: "writing", label: "Writing", purpose: "How stories are written." },
  { id: "events", label: "Events", purpose: "How events show, and captions for social posts.", eventsOnly: true },
  { id: "autopilot", label: "Autopilot", purpose: "How much happens without you." },
  { id: "share", label: "Share", purpose: "Ways for readers to follow the feed." },
  { id: "extras", label: "Extras", purpose: "Optional cards and tools. All off unless you switch them on." },
  { id: "usage", label: "Usage", purpose: "" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Old ?section= values (help answers, bookmarks, assistant) → the page that now holds them. */
const LEGACY: Record<string, SettingsSectionId> = {
  identity: "general",
  brand: "general",
  voice: "writing",
  coverage: "coverage",
  "how-local": "local",
  locality: "local",
  automation: "autopilot",
  distribution: "share",
  features: "extras",
};

export function resolveSettingsSection(value: string | null | undefined, eventsEnabled = true, regional = true): SettingsSectionId {
  const v = (value || "").toLowerCase();
  const direct = SETTINGS_SECTIONS.find((s) => s.id === v);
  const id = direct ? direct.id : LEGACY[v] ?? "general";
  if (id === "events" && !eventsEnabled) return "general";
  if (id === "local" && !regional) return "coverage";
  return id;
}

export const visibleSettingsSections = (eventsEnabled: boolean, regional = true) =>
  SETTINGS_SECTIONS.filter((s) => (!("eventsOnly" in s) || eventsEnabled) && (!("regionalOnly" in s) || regional));

export const settingsPath = (slug: string, section: string | null | undefined = "general") =>
  `/dashboard/topic/${slug}/settings/${resolveSettingsSection(section)}`;
