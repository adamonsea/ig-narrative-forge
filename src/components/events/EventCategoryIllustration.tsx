import { useId, type JSX } from "react";
import { cn } from "@/lib/utils";
import type { EventCategory } from "./EventCategoryIcon";

/**
 * Event category illustrations — supplied by Adam/Claude. Do not redraw or restyle.
 * Full-bleed band for the top third of an individual event card, drawn in the feed's
 * theme colour (`color`) with white and ink tints over it, a printed grain texture,
 * and an angled bottom edge (the date card sits across that seam).
 * One slow drift when `animate` is true (card in view); still under reduced motion.
 * Styles and keyframes live once in src/styles.css (.ec-ill …).
 */

const L = (o: number) => ({ fill: "#fff", fillOpacity: o });
const D = (o: number) => ({ fill: "#0b1626", fillOpacity: o });
const SL = (o: number, w = 3) => ({ fill: "none", stroke: "#fff", strokeOpacity: o, strokeWidth: w, strokeLinecap: "round" as const });

type Art = (uid: string) => JSX.Element;

const ART: Record<EventCategory, Art> = {
  music: () => (
    <>
      <g className="ill-drift">
        <circle cx="318" cy="120" r="150" {...D(0.1)} />
        <circle cx="318" cy="120" r="115" {...L(0.14)} />
        <circle cx="318" cy="120" r="82" {...D(0.12)} />
        <circle cx="318" cy="120" r="50" {...L(0.3)} />
        <circle cx="318" cy="120" r="12" {...D(0.45)} />
      </g>
      <g transform="rotate(-14 110 110)">
        {[38, 70, 52, 96, 64, 84, 44].map((h, i) => (
          <rect key={i} x={40 + i * 24} y={140 - h} width="14" height={h + 40} rx="7" {...L(0.5 - i * 0.03)} />
        ))}
      </g>
    </>
  ),
  family: () => (
    <>
      <circle className="ill-drift" cx="300" cy="58" r="58" {...L(0.24)} />
      <path d="M0 128 C90 96 180 120 260 106 S380 90 400 100 V160 H0z" {...D(0.12)} />
      <g>
        <rect x="88" y="66" width="46" height="120" rx="23" {...L(0.6)} />
        <circle cx="111" cy="46" r="19" {...L(0.6)} />
        <rect x="150" y="98" width="34" height="90" rx="17" {...L(0.42)} />
        <circle cx="167" cy="82" r="14" {...L(0.42)} />
        <rect x="198" y="112" width="26" height="70" rx="13" {...L(0.3)} />
        <circle cx="211" cy="99" r="11" {...L(0.3)} />
      </g>
    </>
  ),
  sport: () => (
    <>
      <g className="ill-drift">
        {[190, 222, 254, 286, 318].map((r, i) => (
          <circle key={r} cx="420" cy="250" r={r} {...SL(0.4 - i * 0.05, 4)} />
        ))}
      </g>
      <path d="M0 160 L0 120 L400 40 L400 160z" {...D(0.1)} />
      <g transform="rotate(-18 120 72)">
        <circle cx="120" cy="72" r="38" {...L(0.62)} />
        <path d="M96 44 C112 62 112 82 96 100" {...{ fill: "none", stroke: "#0b1626", strokeOpacity: 0.22, strokeWidth: 3 }} />
        <path d="M144 44 C128 62 128 82 144 100" {...{ fill: "none", stroke: "#0b1626", strokeOpacity: 0.22, strokeWidth: 3 }} />
      </g>
    </>
  ),
  "food-drink": () => (
    <>
      <circle cx="300" cy="104" r="96" {...L(0.12)} />
      <circle cx="300" cy="104" r="66" {...L(0.18)} />
      <g transform="rotate(-16 120 90)">
        <path d="M86 30 h56 l-8 92 h-40 z" {...L(0.55)} />
        <path d="M92 76 h44 l-4 46 h-36 z" {...D(0.14)} />
      </g>
      <g transform="rotate(14 190 90)">
        <path d="M162 30 h56 l-8 92 h-40 z" {...L(0.42)} />
        <path d="M168 70 h44 l-5 52 h-35 z" {...D(0.12)} />
      </g>
      <g className="ill-drift">
        <circle cx="150" cy="18" r="6" {...L(0.7)} />
        <circle cx="168" cy="6" r="4" {...L(0.55)} />
        <circle cx="134" cy="2" r="3" {...L(0.45)} />
      </g>
    </>
  ),
  "arts-theatre": () => (
    <>
      <path className="ill-drift" d="M150 0 L250 0 L320 160 L80 160z" {...L(0.22)} />
      <ellipse cx="200" cy="150" rx="120" ry="20" {...L(0.3)} />
      <path d="M0 0 H120 C100 40 118 80 96 120 C88 140 70 156 40 160 H0z" {...D(0.2)} />
      <path d="M30 0 C40 50 26 100 40 160 M70 0 C78 46 64 96 72 150" {...{ fill: "none", stroke: "#0b1626", strokeOpacity: 0.16, strokeWidth: 6 }} />
      <path d="M400 0 H280 C300 40 282 80 304 120 C312 140 330 156 360 160 H400z" {...D(0.2)} />
      <path d="M370 0 C360 50 374 100 360 160 M330 0 C322 46 336 96 328 150" {...{ fill: "none", stroke: "#0b1626", strokeOpacity: 0.16, strokeWidth: 6 }} />
    </>
  ),
  film: () => (
    <>
      <path d="M260 0 L400 0 L400 160 L180 160z" {...L(0.12)} />
      <g transform="rotate(-12 200 80)">
        <g className="ill-drift">
          <rect x="-40" y="44" width="520" height="80" {...D(0.32)} />
          {Array.from({ length: 22 }, (_, i) => (
            <g key={i}>
              <rect x={-36 + i * 24} y="50" width="12" height="9" rx="2" {...L(0.65)} />
              <rect x={-36 + i * 24} y="109" width="12" height="9" rx="2" {...L(0.65)} />
            </g>
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={-20 + i * 84} y="66" width="72" height="36" rx="3" {...L(0.18 + (i % 2) * 0.12)} />
          ))}
        </g>
      </g>
    </>
  ),
  talks: () => (
    <>
      <path d="M210 20 h150 a22 22 0 0 1 22 22 v64 a22 22 0 0 1 -22 22 h-90 l-30 26 v-26 h-30 a22 22 0 0 1 -22 -22 v-64 a22 22 0 0 1 22 -22z" {...L(0.2)} />
      <g className="ill-drift">
        <path d="M60 36 h140 a24 24 0 0 1 24 24 v50 a24 24 0 0 1 -24 24 h-96 l-34 24 v-24 h-10 a24 24 0 0 1 -24 -24 v-50 a24 24 0 0 1 24 -24z" {...L(0.58)} />
        <circle cx="104" cy="86" r="8" {...D(0.3)} />
        <circle cx="132" cy="86" r="8" {...D(0.3)} />
        <circle cx="160" cy="86" r="8" {...D(0.3)} />
      </g>
    </>
  ),
  nightlife: (uid) => (
    <>
      <rect width="400" height="160" {...D(0.22)} />
      <g {...L(0.1)}>
        <path d="M200 170 L60 0 L110 0z" />
        <path d="M200 170 L180 0 L230 0z" />
        <path d="M200 170 L300 0 L350 0z" />
      </g>
      <mask id={`moon-${uid}`}>
        <rect width="400" height="160" fill="#fff" />
        <circle cx="332" cy="40" r="34" fill="#000" />
      </mask>
      <circle cx="314" cy="56" r="38" {...L(0.75)} mask={`url(#moon-${uid})`} />
      <g className="ill-twinkle">
        {[
          [60, 40, 7], [140, 24, 5], [250, 30, 6], [190, 70, 4], [96, 96, 4], [370, 110, 5],
        ].map(([x, y, s], i) => (
          <path key={i} d={`M${x} ${y! - s! * 2}L${x! + s! * 0.5} ${y! - s! * 0.5}L${x! + s! * 2} ${y}L${x! + s! * 0.5} ${y! + s! * 0.5}L${x} ${y! + s! * 2}L${x! - s! * 0.5} ${y! + s! * 0.5}L${x! - s! * 2} ${y}L${x! - s! * 0.5} ${y! - s! * 0.5}z`} {...L(0.8)} />
        ))}
      </g>
    </>
  ),
  outdoors: () => (
    <>
      <circle className="ill-drift" cx="292" cy="52" r="32" {...L(0.6)} />
      <path d="M0 110 L80 56 L150 96 L230 40 L330 104 L400 70 V160 H0z" {...L(0.18)} />
      <path d="M0 132 L100 84 L190 124 L290 76 L400 120 V160 H0z" {...D(0.12)} />
      <path d="M0 160 V146 L140 108 L260 142 L400 110 V160z" {...D(0.24)} />
      <path d="M96 34 l8 6 l8 -6 M122 22 l6 5 l6 -5" {...SL(0.7, 2.5)} />
    </>
  ),
  markets: () => (
    <>
      <path d="M-10 26 Q100 58 200 34 T410 30" {...SL(0.6, 2)} />
      <g className="ill-twinkle">
        {[30, 80, 130, 180, 230, 280, 330, 380].map((x, i) => (
          <circle key={x} cx={x} cy={[34, 44, 45, 39, 34, 32, 31, 30][i]! + 8} r="5" {...L(0.85)} />
        ))}
      </g>
      <g transform="rotate(-6 200 100)">
        {[0, 1].map((row) => {
          const hi = row ? 0.34 : 0.58;
          const lo = row ? 0.14 : 0.24;
          return (
            <g key={row} transform={`translate(${row * 46 - 30} ${row * 54 + 62})`}>
              {Array.from({ length: 18 }, (_, i) => (
                <g key={i}>
                  <rect x={i * 26} y="0" width="26" height="34" {...L(i % 2 ? lo : hi)} />
                  <path d={`M${i * 26} 34 a13 13 0 0 0 26 0z`} {...L(i % 2 ? lo : hi)} />
                </g>
              ))}
            </g>
          );
        })}
      </g>
    </>
  ),
  comedy: () => (
    <>
      <g transform="rotate(-12 280 90)">
        <circle cx="280" cy="90" r="110" {...L(0.2)} />
        <circle cx="244" cy="58" r="11" {...D(0.3)} />
        <circle cx="314" cy="58" r="11" {...D(0.3)} />
        <path className="ill-drift" d="M212 92 Q280 168 348 92z" {...L(0.65)} />
      </g>
      <g {...SL(0.6, 4)}>
        <path d="M40 40 q12 -14 24 0 t24 0" />
        <path d="M70 110 q10 -12 20 0 t20 0" />
        <path d="M130 70 l14 -10" />
      </g>
    </>
  ),
  workshops: () => (
    <>
      <path d="M-20 120 C80 40 180 150 280 70 S400 40 430 60" {...SL(0.55, 34)} />
      <g className="ill-drift">
        <circle cx="330" cy="120" r="10" {...L(0.6)} />
        <circle cx="352" cy="140" r="6" {...L(0.45)} />
        <circle cx="70" cy="34" r="7" {...L(0.5)} />
      </g>
      <g transform="rotate(32 170 40)">
        <rect x="120" y="30" width="110" height="18" rx="4" {...D(0.25)} />
        <path d="M230 30 l22 9 l-22 9z" {...L(0.6)} />
      </g>
    </>
  ),
  other: () => (
    <>
      <g className="ill-spin" style={{ transformOrigin: "200px 80px" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M200 80 L184 -160 L216 -160z" transform={`rotate(${i * 30} 200 80)`} {...L(i % 2 ? 0.08 : 0.16)} />
        ))}
      </g>
      <path d="M200 30 L212 68 L250 80 L212 92 L200 130 L188 92 L150 80 L188 68z" {...L(0.7)} />
      <path d="M300 34 l5 15 l15 5 l-15 5 l-5 15 l-5 -15 l-15 -5 l15 -5z" {...L(0.5)} />
      <path d="M96 100 l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 l12 -4z" {...L(0.45)} />
    </>
  ),
};

interface EventCategoryIllustrationProps {
  category?: string | null | undefined;
  /** Feed theme colour (any CSS colour), e.g. from feedBrandPalette(). */
  color: string;
  /** Slow drift; pass true only for the card in view. */
  animate?: boolean | undefined;
  /** Cut the bottom edge at an angle (default on). */
  angled?: boolean | undefined;
  className?: string | undefined;
}

export function EventCategoryIllustration({ category, color, animate = false, angled = true, className }: EventCategoryIllustrationProps) {
  const uid = useId().replace(/:/g, "");
  const key = (category && category in ART ? category : "other") as EventCategory;
  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className={cn("ec-ill", className)}
      data-animate={animate ? "true" : "false"}
      style={angled ? { clipPath: "polygon(0 0, 100% 0, 100% 78%, 0 100%)" } : undefined}
      aria-hidden="true"
    >
      <defs>
        <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" seed="7" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0 .55 .9" />
          </feComponentTransfer>
        </filter>
        <filter id={`speck-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="3" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.25" />
        </filter>
      </defs>
      <rect width="400" height="160" fill={color} />
      <rect width="400" height="160" filter={`url(#speck-${uid})`} opacity="0.12" />
      {ART[key](uid)}
      <rect width="400" height="160" filter={`url(#grain-${uid})`} style={{ mixBlendMode: "multiply" }} opacity="0.32" />
    </svg>
  );
}

export default EventCategoryIllustration;
