// Places inside the feed dashboard the helper chat can take an owner to.
// Each destination becomes a one-click button in an answer, and the target
// element is highlighted on arrival so the owner can see exactly where to look.

export interface AssistantDestination {
  /** Stable id the assistant refers to. */
  id: string;
  /** Plain-language label shown on the button. */
  label: string;
  /** What lives there — used by the assistant to choose the right one. */
  describes: string;
  tab?: "feed" | "settings" | "reviews";
  section?: "coverage" | "voice" | "automation" | "distribution" | "identity" | "features";
  /** Element id to scroll to and highlight. */
  anchor?: string;
  /** Extra query params (e.g. auto-expanding the sources panel). */
  params?: Record<string, string>;
  /** Absolute path instead of the feed dashboard. */
  path?: (slug: string) => string;
  /** Opens in a new tab (public-facing pages). */
  external?: boolean;
}

export const ASSISTANT_DESTINATIONS: AssistantDestination[] = [
  { id: "pipeline", label: "Open Pipeline", describes: "Arrivals waiting for review and live published stories", tab: "feed" },
  { id: "add-story", label: "Add a story by hand", describes: "Paste or upload a story yourself", tab: "feed", anchor: "assistant-add-story" },
  { id: "sources", label: "Open Sources", describes: "Add, check or pause the websites stories are gathered from", tab: "feed", params: { sources: "true" } },
  { id: "publish-toggle", label: "Show the Live/Draft switch", describes: "Make the feed public or keep it a draft", anchor: "publish-toggle" },
  { id: "reviews", label: "Open Reviews", describes: "Build a public visual look-back over a period", tab: "reviews" },
  { id: "control-overview", label: "Open Editorial control", describes: "Overview of policy and anything needing a decision", tab: "settings" },
  { id: "news-values", label: "Open News values", describes: "How local a story must be, and big-story exceptions", tab: "settings", section: "coverage", anchor: "news-values-heading" },
  { id: "coverage-terms", label: "Open Coverage terms", describes: "Words that tell Curatr what belongs in the feed", tab: "settings", section: "coverage", anchor: "discovery-heading" },
  { id: "exclusions", label: "Open Exclusions", describes: "Words that keep unwanted stories out", tab: "settings", section: "coverage", anchor: "exclusions-heading" },
  { id: "categories", label: "Open Categories", describes: "How published stories are grouped for filters and reviews", tab: "settings", section: "coverage", anchor: "coverage-categories-heading" },
  { id: "voice", label: "Open Voice", describes: "Tone, writing style, house style and example sentences", tab: "settings", section: "voice" },
  { id: "picture-references", label: "Open Picture references", describes: "Local places, reference photos and illustration style", tab: "settings", section: "voice", anchor: "picture-references-heading" },
  { id: "automation", label: "Open Automation", describes: "How much Curatr may publish without you, and publishing pace", tab: "settings", section: "automation" },
  { id: "distribution", label: "Open Distribution", describes: "Email, RSS, widget, audio briefings and donations", tab: "settings", section: "distribution" },
  { id: "ai-assistants", label: "Open AI assistants", describes: "Connect the feed to ChatGPT or Claude", tab: "settings", section: "distribution", anchor: "ai-assistants-heading" },
  { id: "identity", label: "Open Identity", describes: "Brand, colour, welcome message and About page", tab: "settings", section: "identity" },
  { id: "features", label: "Open Optional features", describes: "Insight cards, sentiment, community signals, local tools", tab: "settings", section: "features" },
  { id: "your-feeds", label: "Back to your feeds", describes: "The list of all feeds you own", path: () => "/dashboard" },
  { id: "public-feed", label: "View the public feed", describes: "What readers see", path: (slug) => `/feed/${slug}`, external: true },
];

export const destinationById = (id: string) =>
  ASSISTANT_DESTINATIONS.find((destination) => destination.id === id);

export function destinationHref(destination: AssistantDestination, slug: string): string {
  if (destination.path) return destination.path(slug);
  const params = new URLSearchParams();
  params.set("tab", destination.tab ?? "settings");
  if (destination.section) params.set("section", destination.section);
  Object.entries(destination.params || {}).forEach(([key, value]) => params.set(key, value));
  return `/dashboard/topic/${slug}?${params.toString()}`;
}

/** Scroll an element into view and flash a highlight ring around it. */
export function highlightAnchor(anchorId: string, attempt = 0) {
  const element = document.getElementById(anchorId);
  if (!element) {
    if (attempt < 20) window.setTimeout(() => highlightAnchor(anchorId, attempt + 1), 150);
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const target = element.closest("section") || element;
  target.classList.add("assistant-highlight");
  window.setTimeout(() => target.classList.remove("assistant-highlight"), 2600);
}
