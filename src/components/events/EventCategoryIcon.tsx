import { cn } from "@/lib/utils";

/**
 * Event category icons — supplied by Adam/Claude. Do not redraw or restyle.
 *
 * - Line icons on a 48px grid, 2.5px rounded strokes, drawn in currentColor.
 * - One accent fill per icon from --ec-accent (defaults to pop green). On reader
 *   cards pass the feed's colour from feedBrandPalette() via the `accent` prop.
 * - Motion is a single calm loop per icon (1.6–3.6s). It only runs when `animate`
 *   is true — use it for the card in view — and never under prefers-reduced-motion.
 * - Unknown or suggested categories fall back to "other" until they get an icon.
 * - Styles and keyframes live once in src/index.css (.ec-icon …).
 */

export type EventCategory =
  | "music" | "family" | "sport" | "food-drink" | "arts-theatre" | "film"
  | "talks" | "nightlife" | "outdoors" | "markets" | "comedy" | "workshops" | "other";

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  music: "Music",
  family: "Family",
  sport: "Sport",
  "food-drink": "Food & drink",
  "arts-theatre": "Arts & theatre",
  film: "Film",
  talks: "Talks",
  nightlife: "Nightlife",
  outdoors: "Outdoors",
  markets: "Markets",
  comedy: "Comedy",
  workshops: "Workshops",
  other: "Other",
};

/** The starting set every events feed gets. Comedy and Workshops are spare icons for suggested categories. */
export const DEFAULT_EVENT_CATEGORIES: EventCategory[] = [
  "music", "family", "sport", "food-drink", "arts-theatre", "film", "talks", "nightlife", "outdoors", "markets",
];

const A = "var(--ec-accent)";

const ICONS: Record<EventCategory, React.ReactElement> = {
  music: (
    <>
      <g className="ec-music-notes">
        <path d="M17 33V12l18-4v21" />
        <path d="M17 17l18-4" />
        <ellipse cx="12.5" cy="33.5" rx="4.5" ry="3.5" fill={A} />
        <ellipse cx="30.5" cy="29.5" rx="4.5" ry="3.5" fill={A} />
      </g>
      <path className="ec-music-wave ec-w1" d="M40 20c1.6 1.6 1.6 4.4 0 6" />
      <path className="ec-music-wave ec-w2" d="M43.5 17c3 3 3 9 0 12" />
    </>
  ),
  family: (
    <>
      <circle cx="17" cy="11" r="4" />
      <path d="M10 40V26a7 7 0 0 1 14 0v14" />
      <g className="ec-family-child">
        <circle cx="33" cy="22" r="3.2" fill={A} />
        <path d="M28 40v-8a5 5 0 0 1 10 0v8" />
      </g>
      <path d="M24 30l4 2" />
    </>
  ),
  sport: (
    <>
      <ellipse className="ec-sport-shadow" cx="24" cy="42" rx="9" ry="1.8" fill="currentColor" stroke="none" opacity=".2" />
      <g className="ec-sport-ball">
        <circle cx="24" cy="28" r="11" fill={A} />
        <path d="M14.6 22.5c4.4 2.2 4.4 8.8 0 11" />
        <path d="M33.4 22.5c-4.4 2.2-4.4 8.8 0 11" />
      </g>
    </>
  ),
  "food-drink": (
    <>
      <path d="M13 14h22l-2.5 24a3 3 0 0 1-3 2.7h-11a3 3 0 0 1-3-2.7z" />
      <path d="M14.4 24h19.2l-1.3 13.6a2 2 0 0 1-2 1.8H17.7a2 2 0 0 1-2-1.8z" fill={A} stroke="none" opacity=".9" />
      <circle className="ec-bubble ec-b1" cx="20" cy="33" r="1.4" fill="currentColor" stroke="none" />
      <circle className="ec-bubble ec-b2" cx="26" cy="35" r="1.1" fill="currentColor" stroke="none" />
      <circle className="ec-bubble ec-b3" cx="29" cy="31" r="1" fill="currentColor" stroke="none" />
      <path d="M28 14l4-7h5" />
    </>
  ),
  "arts-theatre": (
    <g className="ec-mask">
      <path d="M11 10h26v13c0 9-6 15-13 15s-13-6-13-15z" fill={A} />
      <path d="M16.5 19.5c1.5-1.5 4-1.5 5.5 0" />
      <path d="M26 19.5c1.5-1.5 4-1.5 5.5 0" />
      <path d="M17.5 27c3.5 4 9.5 4 13 0" />
    </g>
  ),
  film: (
    <>
      <rect x="9" y="20" width="30" height="19" rx="2.5" />
      <g className="ec-clapper">
        <path d="M9 20l1-6.5 29-4.5 1 6.5z" fill={A} />
        <path d="M17 12.6l3.5 5.4M25 11.4l3.5 5.4M33 10.2l3.5 5.4" />
      </g>
      <path d="M9 27h30" opacity=".35" />
    </>
  ),
  talks: (
    <>
      <path d="M9 13a4 4 0 0 1 4-4h22a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H21l-8 7v-7a4 4 0 0 1-4-4z" />
      <circle className="ec-dot ec-d1" cx="17" cy="20.5" r="2.2" fill={A} stroke="none" />
      <circle className="ec-dot ec-d2" cx="24" cy="20.5" r="2.2" fill={A} stroke="none" />
      <circle className="ec-dot ec-d3" cx="31" cy="20.5" r="2.2" fill={A} stroke="none" />
    </>
  ),
  nightlife: (
    <>
      <path d="M30 9a14 14 0 1 0 9 22A12 12 0 0 1 30 9z" />
      <path className="ec-star ec-s1" d="M36 8l1.2 2.8L40 12l-2.8 1.2L36 16l-1.2-2.8L32 12l2.8-1.2z" fill={A} />
      <path className="ec-star ec-s2" d="M41 20l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" fill={A} />
    </>
  ),
  outdoors: (
    <>
      <g className="ec-sun">
        <circle cx="33" cy="14" r="4.5" fill={A} />
        <path d="M33 5.5v2M33 20.5v2M24.5 14h2M39.5 14h2M27 8l1.4 1.4M37.6 18.6L39 20M27 20l1.4-1.4M37.6 9.4L39 8" />
      </g>
      <path d="M5 40l12-15 7 8 5-5 14 12z" />
    </>
  ),
  markets: (
    <>
      <g className="ec-awning">
        <path d="M8 12h32l2 8H6z" fill={A} />
        <path d="M6 20c0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0 0 2.5 4.5 2.5 4.5 0" />
        <path d="M16 12l-1.5 8M24 12v8M32 12l1.5 8" opacity=".5" />
      </g>
      <path d="M10 24v15h28V24" />
      <path d="M10 32h28" />
    </>
  ),
  comedy: (
    <>
      <circle cx="24" cy="24" r="15" />
      <path d="M17 20.5c1.2-1.6 3.4-1.6 4.6 0M26.4 20.5c1.2-1.6 3.4-1.6 4.6 0" />
      <path className="ec-grin" d="M16.5 27h15c0 4.5-3.4 7.5-7.5 7.5s-7.5-3-7.5-7.5z" fill={A} />
    </>
  ),
  workshops: (
    <g className="ec-brush">
      <path d="M33 8l7 7-15 15-7-7z" />
      <path d="M18 23c-5 0-8 4-8 8 0 3-1.5 5-3 6 6 1 13-1 14-7z" fill={A} />
    </g>
  ),
  other: (
    <g className="ec-sparkle">
      <path d="M24 7l3.4 10.2L38 21l-10.6 3.8L24 35l-3.4-10.2L10 21l10.6-3.8z" fill={A} />
      <path d="M37 31l1.4 3.6L42 36l-3.6 1.4L37 41l-1.4-3.6L32 36l3.6-1.4z" />
    </g>
  ),
};

interface EventCategoryIconProps {
  category?: string | null;
  /** Run the loop. Pass true only for the card in view. */
  animate?: boolean;
  /** Accent colour (any CSS colour), e.g. the feed colour from feedBrandPalette(). */
  accent?: string;
  className?: string;
  title?: string;
}

export function isEventCategory(value: string | null | undefined): value is EventCategory {
  return !!value && value in ICONS;
}

export function EventCategoryIcon({ category, animate = false, accent, className, title }: EventCategoryIconProps) {
  const key: EventCategory = isEventCategory(category) ? category : "other";
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("ec-icon h-12 w-12", className)}
      data-animate={animate ? "true" : "false"}
      style={accent ? ({ ["--ec-accent" as string]: accent } as React.CSSProperties) : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title ?? EVENT_CATEGORY_LABELS[key]}
    >
      {ICONS[key]}
    </svg>
  );
}

export default EventCategoryIcon;
