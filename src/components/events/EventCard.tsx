import { memo, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmblaSlideCarousel } from "@/components/ui/embla-slide-carousel";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { recordEventClick } from "@/lib/eventClicks";
import { EVENT_CATEGORY_LABELS, isEventCategory } from "@/components/events/EventCategoryIcon";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { dateBlock, eventTime, priceLine, type WhatsOnFeedEvent } from "@/lib/whatsOn";

function brandVars(color?: string | null) {
  const p = feedBrandPalette(color);
  return {
    "--ev-fill": toCss(p.light.fill), "--ev-on-fill": toCss(p.light.onFill), "--ev-accent": toCss(p.light.text),
    "--ev-fill-dark": toCss(p.dark.fill), "--ev-on-fill-dark": toCss(p.dark.onFill), "--ev-accent-dark": toCss(p.dark.text),
  } as React.CSSProperties;
}
const FILL = "bg-[color:var(--ev-fill)] text-[color:var(--ev-on-fill)] dark:bg-[color:var(--ev-fill-dark)] dark:text-[color:var(--ev-on-fill-dark)]";
const ACCENT = "text-[color:var(--ev-accent)] dark:text-[color:var(--ev-accent-dark)]";
const PILL = `inline-flex items-center gap-1.5 min-h-11 px-5 py-2 text-sm font-semibold whitespace-nowrap rounded-full transition-opacity hover:opacity-90 ${FILL}`;

/** The large sentence-case date block (Thu / 19 / Nov). Shown on /design. */
export function EventDateBlock({ ymd, className = "" }: { ymd: string; className?: string }) {
  const b = dateBlock(ymd);
  return (
    <div className={`w-[120px] rounded-2xl py-4 text-center font-lexend leading-none ${FILL} ${className}`} aria-hidden="true">
      <div className="text-lg font-semibold">{b.weekday}</div>
      <div className="my-2 text-6xl font-bold">{b.day}</div>
      <div className="text-lg font-semibold">{b.month}</div>
    </div>
  );
}

interface EventCardProps {
  event: WhatsOnFeedEvent;
  brandColor?: string | null;
  /** The feed's owner: their clicks don't count as sending readers. */
  isOwner?: boolean;
  /** The feed's currency (GBP / EUR / USD) for bare listing prices; unknown hides them. */
  currency?: string | null;
  /** Illustration set for the top band; the live feed always uses the default (set A). */
  Illustration?: ComponentType<{ category?: string | null; color: string; animate?: boolean }>;
}

/**
 * One event, two slides, built like the feed's story card so swiping is identical.
 * Slide 1: full-bleed category illustration in the feed colour (top third), the
 * date block across its angled seam, then title and venue.
 * Slide 2: day (and time), venue, price (only when known), up to four lines of
 * description. Both slides are top-aligned; the one link sits below both.
 */
function EventCardView({ event: e, brandColor, isOwner = false, currency = null, Illustration = EventCategoryIllustration }: EventCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const palette = feedBrandPalette(brandColor);
  const category = isEventCategory(e.event_type) ? e.event_type : "other";
  const b = dateBlock(e.start_date);
  const time = eventTime(e.start_time);
  const price = priceLine(e.price, e.is_free, currency);
  const source = e.source_name || "the organiser";

  // Longer titles step down a size so the whole title fits below the illustration band
  const titleSize = e.title.length > 50 ? "text-2xl md:text-3xl" : e.title.length > 28 ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl";
  const first = (
    <div key="date" className="flex h-full flex-col">
      <div className="relative h-[184px] shrink-0">
        <Illustration category={category} color={toCss(palette.light.fill)} animate={inView} />
        <div className="absolute bottom-0 left-0 right-0 px-5 md:px-8">
          <div className="mx-auto w-full max-w-xl">
            <EventDateBlock ymd={e.start_date} className="translate-y-1/2 shadow-md ring-4 ring-[hsl(var(--feed-card))]" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-5 pb-14 pt-[96px] md:px-8 md:pb-16">
        <div className="mx-auto w-full max-w-xl">
          <h3 className={`line-clamp-4 font-lexend font-semibold leading-[1.1] text-pretty ${titleSize}`}>
            <span className="sr-only">{`${b.weekday} ${b.day} ${b.month}, ${EVENT_CATEGORY_LABELS[category]}: `}</span>{e.title}
          </h3>
          {e.location && <p className="mt-3 line-clamp-2 text-lg opacity-75 md:text-xl">{e.location}</p>}
        </div>
      </div>
    </div>
  );

  const day = [`${b.weekday} ${b.day} ${b.month}`, time].filter(Boolean).join(", ");
  const facts = [day, e.location, price].filter(Boolean) as string[];
  const second = (
    <div key="facts" className="h-full px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <ul className="space-y-2 font-lexend text-2xl font-semibold leading-snug md:text-3xl">
          {facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
        {e.description && <p className="line-clamp-4 text-lg opacity-75 md:text-xl">{e.description}</p>}
      </div>
    </div>
  );

  return (
    <Card ref={ref} className="feed-card w-full overflow-hidden shadow-lg" style={brandVars(brandColor)} aria-label={`Event: ${e.title}`}>
      <div className="relative flex h-[600px] flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <EmblaSlideCarousel slides={[first, second]} height="100%" showDots dotStyle="instagram" ariaLabel={`Event: ${e.title}`} />
        </div>
        <div className="flex min-h-[68px] items-center justify-center p-4">
          {e.source_url && (
            <a href={e.source_url} target="_blank" rel="noopener noreferrer" className={PILL}
              onClick={() => { if (!isOwner) recordEventClick(e.id); }}>
              More at {source}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Memoised so loading the next 20 events doesn't re-render the cards already on screen. */
export const EventCard = memo(EventCardView);
