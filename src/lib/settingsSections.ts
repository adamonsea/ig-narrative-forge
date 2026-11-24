/** Feed Settings pages: one section per URL (/dashboard/topic/:slug/settings/:section). */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "look", label: "Look" },
  { id: "coverage", label: "Coverage" },
  { id: "writing", label: "Writing" },
  { id: "events", label: "Events", eventsOnly: true },
  { id: "autopilot", label: "Autopilot" },
  { id: "share", label: "Share" },
  { id: "extras", label: "Extras" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Old ?section= values (help answers, bookmarks, assistant) → the page that now holds them. */
const LEGACY: Record<string, SettingsSectionId> = {
  identity: "general",
  brand: "general",
  voice: "writing",
  coverage: "coverage",
  automation: "autopilot",
  distribution: "share",
  features: "extras",
};

export function resolveSettingsSection(value: string | null | undefined, eventsEnabled = true): SettingsSectionId {
  const v = (value || "").toLowerCase();
  const direct = SETTINGS_SECTIONS.find((s) => s.id === v);
  const id = direct ? direct.id : LEGACY[v] ?? "general";
  if (id === "events" && !eventsEnabled) return "general";
  return id;
}

export const visibleSettingsSections = (eventsEnabled: boolean) =>
  SETTINGS_SECTIONS.filter((s) => !("eventsOnly" in s) || eventsEnabled);

export const settingsPath = (slug: string, section: string | null | undefined = "general") =>
  `/dashboard/topic/${slug}/settings/${resolveSettingsSection(section)}`;
