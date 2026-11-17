import { useId, type JSX } from "react";
import { cn } from "@/lib/utils";
import type { EventCategory } from "./EventCategoryIcon";

/**
 * Event category illustrations, set B (for comparison with the supplied set A).
 * Same props and slot as EventCategoryIllustration: a full-bleed band for the top
 * third of an individual event card with an angled bottom edge.
 * Drawn only in tints of the feed colour on a pale tint of it, textured with a
 * printed halftone (SVG patterns, no filters). One slow motion per category when
 * `animate` is true (card in view); still under reduced motion.
 * Styles and keyframes live once in src/index.css (.ec-alt …).
 */

type Ctx = { c: string; uid: string };
type Art = (x: Ctx) => JSX.Element;
const T = (c: string, o: number) => ({ fill: c, fillOpacity: o });
const S = (c: string, o: number, w = 4) => ({ fill: "none", stroke: c, strokeOpacity: o, strokeWidth: w, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

const ART: Record<EventCategory, Art> = {
  music: ({ c, uid }) => (
    <>
      <g className="alt-drift">
        <path d="M-40 118 Q0 96 40 118 T120 118 T200 118 T280 118 T360 118 T440 118" {...S(c, 0.45, 6)} />
      </g>
      <circle cx="280" cy="64" r="54" fill={`url(#dots-${uid})`} />
      <circle cx="280" cy="64" r="54" {...S(c, 0.55, 3)} />
      <circle cx="280" cy="64" r="34" {...T(c, 0.55)} />
      <circle cx="280" cy="64" r="11" {...T(c, 1)} />
      <path d="M200 30 a86 86 0 0 0 0 68" {...S(c, 0.5, 5)} />
      <path d="M180 20 a110 110 0 0 0 0 88" {...S(c, 0.3, 5)} />
    </>
  ),
  family: ({ c, uid }) => (
    <>
      <rect x="0" y="118" width="400" height="42" fill={`url(#dots-${uid})`} />
      <circle cx="240" cy="62" r="50" {...T(c, 0.45)} />
      <circle cx="302" cy="80" r="34" {...T(c, 0.75)} />
      <g className="alt-rise">
        <circle cx="188" cy="88" r="22" {...T(c, 1)} />
      </g>
      <path d="M150 40 l10 -10 M168 46 l14 -4" {...S(c, 0.5, 4)} />
    </>
  ),
  sport: ({ c }) => (
    <>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${-20 + i * 44} 170 L${260 + i * 44} -10`} {...S(c, 0.18 + i * 0.08, 10)} />
      ))}
      <g className="alt-drift">
        <circle cx="294" cy="58" r="26" {...T(c, 1)} />
        <path d="M275 41 q19 17 0 34 M313 41 q-19 17 0 34" {...S("#fff", 0.55, 3)} />
      </g>
    </>
  ),
  "food-drink": ({ c, uid }) => (
    <>
      <circle cx="288" cy="82" r="70" fill={`url(#dots-${uid})`} />
      <path d="M222 70 h132 a66 66 0 0 1 -132 0z" {...T(c, 0.9)} />
      <rect x="214" y="64" width="148" height="10" rx="5" {...T(c, 0.55)} />
      <g className="alt-rise">
        <path d="M258 52 q-10 -12 0 -22 t0 -22" {...S(c, 0.5, 4)} />
        <path d="M288 52 q-10 -12 0 -22 t0 -22" {...S(c, 0.65, 4)} />
        <path d="M318 52 q-10 -12 0 -22 t0 -22" {...S(c, 0.5, 4)} />
      </g>
    </>
  ),
  "arts-theatre": ({ c, uid }) => (
    <>
      <path d="M196 160 V76 a74 74 0 0 1 148 0 V160z" {...T(c, 0.3)} />
      <path d="M222 160 V82 a48 48 0 0 1 96 0 V160z" fill={`url(#dots-${uid})`} />
      <path d="M0 0 H150 Q120 50 150 100 Q90 90 60 160 H0z" {...T(c, 0.45)} />
      <g className="alt-drift">
        <circle cx="270" cy="74" r="15" {...T(c, 1)} />
      </g>
    </>
  ),
  film: ({ c }) => (
    <>
      <g className="alt-drift">
        {Array.from({ length: 20 }, (_, i) => (
          <rect key={i} x={-20 + i * 24} y="10" width="12" height="10" rx="2" {...T(c, 0.45)} />
        ))}
      </g>
      <rect x="186" y="32" width="150" height="86" rx="12" {...T(c, 0.25)} />
      <rect x="186" y="32" width="150" height="86" rx="12" {...S(c, 0.7, 3)} />
      <path d="M246 56 L290 75 L246 94z" {...T(c, 1)} />
    </>
  ),
  talks: ({ c }) => (
    <>
      <path d="M236 18 a46 46 0 1 1 -28 82 l-24 10 l9 -22 a46 46 0 0 1 43 -70z" {...T(c, 0.35)} />
      <g {...T(c, 0.9)}>
        <circle cx="218" cy="64" r="6" />
        <circle cx="238" cy="64" r="6" />
        <circle cx="258" cy="64" r="6" />
      </g>
      <g className="alt-rise">
        <path d="M306 52 a30 30 0 1 1 16 56 l18 12 l-27 -5 a30 30 0 0 1 -7 -63z" {...T(c, 0.85)} />
      </g>
    </>
  ),
  nightlife: ({ c, uid }) => (
    <>
      <rect width="400" height="160" {...T(c, 0.6)} />
      <rect width="400" height="160" fill={`url(#dots-${uid})`} opacity="0.5" />
      <mask id={`moon-alt-${uid}`}>
        <rect width="400" height="160" fill="#fff" />
        <circle cx="312" cy="46" r="32" fill="#000" />
      </mask>
      <circle cx="294" cy="58" r="36" fill="#fff" fillOpacity="0.7" mask={`url(#moon-alt-${uid})`} />
      <g className="alt-glow" fill="#fff" fillOpacity="0.75">
        <path d="M200 30 l3 9 l9 3 l-9 3 l-3 9 l-3 -9 l-9 -3 l9 -3z" />
        <path d="M236 92 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z" />
        <path d="M150 64 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z" />
        <path d="M370 118 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z" />
      </g>
    </>
  ),
  outdoors: ({ c, uid }) => (
    <>
      <g className="alt-rise">
        <circle cx="282" cy="48" r="26" {...T(c, 0.95)} />
      </g>
      <ellipse cx="120" cy="150" rx="200" ry="84" fill={`url(#dots-${uid})`} />
      <ellipse cx="330" cy="142" rx="170" ry="52" {...T(c, 0.4)} />
      <ellipse cx="200" cy="164" rx="240" ry="46" {...T(c, 0.65)} />
    </>
  ),
  markets: ({ c, uid }) => (
    <>
      <g className="alt-sway">
        <path d="M-10 18 Q200 70 410 18" {...S(c, 0.6, 2.5)} />
        {[30, 80, 130, 180, 230, 280, 330, 380].map((x, i) => {
          const y = 18 + 52 * (1 - Math.pow((x - 200) / 210, 2)) * 0.5;
          return <path key={x} d={`M${x - 14} ${y} L${x + 14} ${y} L${x} ${y + 26}z`} {...T(c, i % 2 ? 0.45 : 0.95)} />;
        })}
      </g>
      <g>
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={`M${186 + i * 26} 88 h26 v12 a13 13 0 0 1 -26 0z`} {...T(c, i % 2 ? 0.4 : 0.8)} />
        ))}
      </g>
      <rect x="186" y="112" width="156" height="20" fill={`url(#dots-${uid})`} />
    </>
  ),
  comedy: ({ c, uid }) => (
    <>
      <circle cx="280" cy="66" r="62" fill={`url(#dots-${uid})`} />
      <g className="alt-sway">
        <path d="M226 68 h108 a54 54 0 0 1 -108 0z" {...T(c, 0.95)} />
        <circle cx="254" cy="42" r="8" {...T(c, 0.95)} />
        <circle cx="306" cy="42" r="8" {...T(c, 0.95)} />
      </g>
      <g {...S(c, 0.45, 5)}>
        <path d="M190 30 l-16 -10" />
        <path d="M184 70 h-20" />
        <path d="M192 108 l-16 10" />
      </g>
    </>
  ),
  workshops: ({ c, uid }) => (
    <>
      <g className="alt-turn">
        <path d="M280 66 L280 14 A52 52 0 1 1 231 83z" {...T(c, 0.4)} />
        <circle cx="280" cy="66" r="52" {...S(c, 0.6, 3)} />
        <circle cx="280" cy="66" r="7" {...T(c, 1)} />
      </g>
      <g transform="rotate(-18 200 106)">
        <rect x="100" y="96" width="220" height="26" rx="4" {...T(c, 0.75)} />
        {Array.from({ length: 11 }, (_, i) => (
          <path key={i} d={`M${112 + i * 20} 96 v${i % 2 ? 7 : 12}`} {...S("#fff", 0.7, 2)} />
        ))}
      </g>
      <rect x="0" y="0" width="140" height="70" fill={`url(#dots-${uid})`} />
    </>
  ),
  other: ({ c, uid }) => (
    <>
      <rect x="0" y="0" width="400" height="160" fill={`url(#dots-${uid})`} opacity="0.6" />
      <g className="alt-drift">
        <circle cx="220" cy="60" r="28" {...T(c, 0.9)} />
        <path d="M282 26 L322 94 L242 94z" {...T(c, 0.45)} />
        <rect x="296" y="72" width="40" height="40" rx="6" transform="rotate(14 316 92)" {...T(c, 0.7)} />
      </g>
    </>
  ),
};

interface EventCategoryIllustrationAltProps {
  category?: string | null;
  /** Feed theme colour (any CSS colour), e.g. from feedBrandPalette(). */
  color: string;
  /** One slow motion; pass true only for the card in view. */
  animate?: boolean;
  /** Cut the bottom edge at an angle (default on). */
  angled?: boolean;
  className?: string;
}

export function EventCategoryIllustrationAlt({ category, color, animate = false, angled = true, className }: EventCategoryIllustrationAltProps) {
  const uid = useId().replace(/:/g, "");
  const key = (category && category in ART ? category : "other") as EventCategory;
  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className={cn("ec-alt", className)}
      data-animate={animate ? "true" : "false"}
      style={angled ? { clipPath: "polygon(0 0, 100% 0, 100% 78%, 0 100%)" } : undefined}
      aria-hidden="true"
    >
      <defs>
        <pattern id={`dots-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="3" cy="3" r="1.3" fill={color} fillOpacity="0.55" />
        </pattern>
        <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`halftone-${uid}`}>
          <rect width="400" height="160" fill={`url(#fade-${uid})`} />
        </mask>
      </defs>
      <rect width="400" height="160" fill={color} />
      <rect width="400" height="160" fill="#fff" fillOpacity="0.62" />
      <rect width="400" height="160" fill={`url(#dots-${uid})`} mask={`url(#halftone-${uid})`} />
      {ART[key]({ c: color, uid })}
    </svg>
  );
}

export default EventCategoryIllustrationAlt;
