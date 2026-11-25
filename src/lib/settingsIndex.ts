import type { SettingsSectionId } from "@/lib/settingsSections";

/** One findable setting: its page, its stable anchor (…/settings/{section}#{anchor}), label, one line and extra words people search with. */
export interface SettingEntry { section: SettingsSectionId; anchor: string; label: string; hint: string; synonyms?: string[] }

/** Anchor for a row label: lower case, words joined by hyphens. SettingRow uses the same rule. */
export const settingAnchor = (label: string) =>
  label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const e = (section: SettingsSectionId, label: string, hint: string, synonyms: string[] = [], anchor = settingAnchor(label)): SettingEntry =>
  ({ section, anchor, label, hint, synonyms });

/** The local "Find a setting" index. Keep in step with the rows on each page. */
export const SETTINGS_INDEX: SettingEntry[] = [
  e("general", "Name", "The feed's name.", ["title", "rename"]),
  e("general", "Welcome line", "A short line under the name.", ["tagline", "strapline", "intro"]),
  e("general", "Events", "Gather what's on as well as news.", ["what's on", "whats on", "turn on events", "calendar"]),
  e("general", "Handle", "Your feed's address.", ["handle", "address", "url", "link", "slug", "@"], "handle"),
  e("general", "About page", "Who curates the feed.", ["about", "bio", "curator"], "about-page"),

  e("look", "Logo", "Shown in the feed's top bar.", ["brand", "branding", "image"], "logo"),
  e("look", "App icon", "Browser tab and home screen.", ["favicon", "icon", "home screen"], "app-icon"),
  e("look", "Colour", "The feed's main colour.", ["color", "brand colour", "accent", "logo"], "colour"),
  e("look", "Top bar", "Colour of the top bar.", ["header", "color"]),
  e("look", "Background", "Colour behind the stories.", ["color", "theme"]),
  e("look", "Story cover", "How the first slide looks.", ["cover style", "card"], "cover"),

  e("pictures", "Picture colours", "One colour, cycle or random.", ["colour mode", "color"]),
  e("pictures", "Publisher photos", "Use source photos, credited.", ["photos", "images", "credit"]),
  e("pictures", "Illustration style", "How generated pictures look.", ["art", "artwork", "image style", "drawing"]),
  e("pictures", "Place pictures", "Reference photos of local places.", ["landmarks", "reference photos", "buildings"], "place-pictures"),

  e("coverage", "More of this", "Stories that mention these belong in the feed.", ["keywords", "terms", "topics", "include"]),
  e("coverage", "Less of this", "Stories about these are left out.", ["keywords", "negative keywords", "exclude", "block"]),
  e("coverage", "Categories", "Sections stories are sorted into.", ["sections", "tags", "taxonomy"]),

  e("local", "How local", "How closely stories must be about the area.", ["locality", "area", "radius"]),
  e("local", "Neighbouring places", "Nearby places that count as local.", ["nearby", "towns", "villages"]),
  e("local", "Big stories", "Let major regional stories through.", ["regional", "national"]),

  e("writing", "Audience", "Who the stories are written for.", ["readers", "expertise", "level"]),
  e("writing", "Tone", "How the stories sound.", ["voice", "style"]),
  e("writing", "Writing style", "The shape of each story.", ["format", "voice"]),
  e("writing", "House style", "Your own writing rules.", ["style guide", "rules", "voice"]),
  e("writing", "Example sentences", "Sentences that show your style.", ["examples", "voice"]),

  e("events", "Lead with", "Events or news first.", ["order", "events first"]),
  e("events", "Event cards", "Grouped or one card per event.", ["what's on card", "grouped", "individual"]),
  e("events", "Currency", "For event prices.", ["price", "euro", "pound", "money"]),
  e("events", "Event photos", "Show organisers' event photos.", ["pictures", "images"]),
  e("events", "Social captions", "Ready-to-post captions for approved events.", ["instagram", "facebook", "caption", "social", "post"]),
  e("events", "Days ahead", "Write automatically for events this many days away.", ["window", "credits", "instagram"]),
  e("events", "Languages", "Caption languages, in order.", ["portuguese", "english", "translation"]),
  e("events", "Templates", "One caption layout per platform.", ["instagram", "facebook", "website", "caption"]),
  e("events", "Hashtags", "Always added to captions.", ["tags", "instagram", "#"]),
  e("events", "Genres", "One per event.", ["category", "type"]),
  e("events", "Flags", "Labels such as Free or Kids.", ["free", "kids", "labels"]),
  e("events", "Voice rules", "Rules for caption writing.", ["tone", "style", "synopsis"]),

  e("autopilot", "Autopilot", "Publish without you.", ["automation", "holiday", "auto publish"]),
  e("autopilot", "Publishing pace", "How fast stories go out.", ["speed", "frequency"]),
  e("autopilot", "Release in batches", "Spread stories through the day.", ["drip", "timing", "schedule"]),
  e("autopilot", "Every", "Time between batches.", ["interval", "timing"]),
  e("autopilot", "Stories each time", "Stories per batch.", ["batch size"]),
  e("autopilot", "Active hours", "When batches go out.", ["hours", "schedule", "night"]),

  e("share", "Public link", "The feed's address.", ["url", "address", "share"]),
  e("share", "Email sign-ups", "Readers subscribe from the feed.", ["newsletter", "email", "subscribers", "mailing list"]),
  e("share", "Weekly roundup email", "The week's best stories.", ["newsletter", "email", "digest", "weekly"]),
  e("share", "Website widget", "Your latest headlines on any website.", ["embed", "widget"]),
  e("share", "RSS", "A live feed for reader apps.", ["feed reader", "xml"]),
  e("share", "AI assistants", "Let ChatGPT or Claude read the feed.", ["mcp", "chatgpt", "claude"]),
  e("share", "API token", "Read-only access to your events.", ["api", "developer", "json", "token", "key"]),
  e("share", "Include photos", "Event photos in the API.", ["api", "photos", "images"]),

  e("extras", "Trending", "Most interacted-with stories in 24 hours.", ["momentum", "popular"], "trending"),
  e("extras", "Donations", "Let readers support the feed.", ["support", "money", "tips", "stripe"]),
  e("extras", "Period reviews", "A public look back over a period.", ["reviews", "look back", "retrospective", "archive", "recap"], "period-reviews"),
];

/** Anchors shared before they were simplified → current anchor, so old links still land on the row. */
export const LEGACY_ANCHORS: Record<string, string> = {
  "look-logo": "logo", "look-app-icon": "app-icon", "look-colour": "colour", "look-top-bar": "top-bar",
  "look-background": "background", "look-cover": "cover", "picture-references-heading": "place-pictures", "story-momentum": "trending",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Ranked local search: label start > label word > synonym > description. Only pages the feed can open. */
export function findSettings(query: string, visible: readonly SettingsSectionId[], limit = 8): SettingEntry[] {
  const q = norm(query);
  if (!q) return [];
  const scored: [number, SettingEntry][] = [];
  for (const s of SETTINGS_INDEX) {
    if (!visible.includes(s.section)) continue;
    const label = norm(s.label);
    let score = 0;
    if (label.startsWith(q)) score = 4;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 3;
    else if ((s.synonyms ?? []).some((w) => norm(w).startsWith(q) || norm(w).split(/\s+/).some((x) => x.startsWith(q)))) score = 2;
    else if (norm(s.hint).includes(q)) score = 1;
    if (score) scored.push([score, s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, s]) => s);
}
