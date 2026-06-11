// Shared logic for building a Story Reel teaser from a published story.
// Used by both the browser preview (Framer Motion) and, later, the
// server-side Remotion render so that preview === output.

export interface ReelBeatTiming {
  /** seconds */
  headline: number;
  detail: number;
  cta: number;
}

// Deliberately calm pacing for readability and credibility — never gimmicky.
export const REEL_PACE: ReelBeatTiming = {
  headline: 4,
  detail: 5,
  cta: 4,
};

export const REEL_TOTAL_SECONDS =
  REEL_PACE.headline + REEL_PACE.detail + REEL_PACE.cta;

export interface ReelTeaserContent {
  headline: string;
  detail: string;
  /** Display string for the CTA, e.g. "curatr.pro/feed/eastbourne-news" */
  feedUrl: string;
  /** Source attribution, e.g. "The Argus" */
  sourceLabel: string;
  /** Feed / topic brand name */
  brandName: string;
  /** Optional background image (cover illustration) */
  backgroundImage?: string | null;
}

interface StorySlideLike {
  slide_number: number;
  content: string;
}

interface StoryLike {
  title: string;
  slides?: StorySlideLike[] | null;
  cover_illustration_url?: string | null;
}

function trimToLength(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trim()}…`;
}

/**
 * Build the 3-beat teaser content from a story.
 * Beat 1: headline. Beat 2: first body slide (skipping the title slide).
 * Beat 3: CTA to read the full story on the published feed.
 */
export function buildReelContent(
  story: StoryLike,
  opts: { brandName: string; feedUrl: string; sourceLabel: string }
): ReelTeaserContent {
  const slides = (story.slides ?? [])
    .slice()
    .sort((a, b) => a.slide_number - b.slide_number);

  // First body slide = the hook. Skip slide 1 (usually the headline/title slide).
  const bodySlide = slides.find((s) => s.slide_number > 1) ?? slides[0];
  const detail = bodySlide ? trimToLength(bodySlide.content, 180) : '';

  return {
    headline: trimToLength(story.title, 110),
    detail,
    feedUrl: opts.feedUrl,
    sourceLabel: opts.sourceLabel,
    brandName: opts.brandName,
    backgroundImage: story.cover_illustration_url ?? null,
  };
}