import { memo, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowUpRight, CalendarPlus, Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmblaSlideCarousel } from "@/components/ui/embla-slide-carousel";
import { eventIllustrationTint, feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { eventLinkKind, recordEventClick } from "@/lib/eventClicks";
import { downloadIcs } from "@/lib/eventCalendar";
import { EVENT_CATEGORY_LABELS, isEventCategory } from "@/components/events/EventCategoryIcon";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { dateBlock, eventTime, priceLine, type WhatsOnFeedEvent } from "@/lib/whatsOn";
import { eventPhotoUrl } from "@/lib/eventPhotos";
import { completeDescription } from "@/lib/eventDescription";

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
export function EventDateBlock({ ymd, className = "" }: { ymd: string; className?: string | undefined }) {
  const b = dateBlock(ymd);
  return (
    <div className={`w-[120px] rounded-2xl py-4 text-center font-lexend leading-none ${FILL} ${className}`} aria-hidden="true">
      <div className="text-lg font-semibold">{b.weekday}</div>
      <div className="my-2 text-6xl font-bold">{b.day}</div>
      <div className="text-lg font-semibold">{b.month}</div>
    </div>
  );
}

/**
 * The date block as the quick "Add to calendar" button on slide 1. A small + badge on its
 * corner settles in once the card is first in view (no tooltips); on hover-capable screens it
 * opens into "Add to calendar"; after a tap it briefly shows a tick. Slide 2 keeps its own link.
 */
export function EventDateButton({ ymd, title, revealed, onAdd, className = "" }: {
  ymd: string; title: string; revealed: boolean; onAdd: () => void; className?: string | undefined;
}) {
  const b = dateBlock(ymd);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(t);
  }, [added]);
  return (
    <button type="button" onClick={() => { onAdd(); setAdded(true); }}
      aria-label={`Add ${title} on ${b.weekday} ${b.day} ${b.month} to calendar`}
      className={`group relative inline-block align-top rounded-2xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ev-accent)] ${className}`}>
      <EventDateBlock ymd={ymd} className="shadow-md ring-4 ring-[hsl(var(--feed-card))] transition-transform duration-200 ease-out group-active:scale-[0.97]" />
      <span aria-hidden="true"
        className={`absolute -top-2 left-[calc(100%-26px)] inline-flex h-9 min-w-9 origin-left items-center justify-center rounded-full bg-[hsl(var(--feed-card))] px-2 text-sm font-semibold shadow-md ring-2 ring-[color:var(--ev-fill)] dark:ring-[color:var(--ev-fill-dark)] ${ACCENT} motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:delay-200 ${revealed ? "scale-100" : "motion-safe:scale-0"}`}>
        {added ? <Check className="h-5 w-5" strokeWidth={2.75} /> : <Plus className="h-5 w-5" strokeWidth={2.75} />}
        <span className="max-w-0 overflow-hidden whitespace-nowrap motion-safe:transition-[max-width] motion-safe:duration-200 [@media(hover:hover)]:group-hover:max-w-[10rem] [@media(hover:hover)]:group-focus-visible:max-w-[10rem]">
          <span className="pl-1 pr-1">{added ? "Added" : "Add to calendar"}</span>
        </span>
      </span>
    </button>
  );
}

interface EventCardProps {
  event: WhatsOnFeedEvent;
  brandColor?: string | null | undefined;
  /** The feed's owner: their clicks don't count as sending readers. */
  isOwner?: boolean | undefined;
  /** The feed's currency (GBP / EUR / USD) for bare listing prices; unknown hides them. */
  currency?: string | null | undefined;
  /** Illustration set for the top band; the live feed always uses the default (set A). */
  Illustration?: (ComponentType<{ category?: string | null | undefined; color: string; animate?: boolean | undefined }>) | undefined;
}

/** Same angled seam as the illustrations, so the date block sits across it either way. */
const SEAM = { clipPath: "polygon(0 0, 100% 0, 100% 78%, 0 100%)" } as const;

/**
 * The listing's own photo (Curatr's stored copy) with a soft fade where the date block
 * sits; if it can't load, the category illustration takes its place.
 */
export function EventPhotoBand({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[hsl(var(--feed-card-foreground)/0.06)]" style={SEAM}>
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[hsl(var(--feed-card)/0.55)] to-transparent" aria-hidden="true" />
    </div>
  );
}

/**
 * One event, two slides, built like the feed's story card so swiping is identical.
 * Slide 1: the listing's photo when Curatr has a stored copy, otherwise the full-bleed
 * category illustration in a pale feed tint (top third), with a small category pill, the
 * date block across its angled seam, then title and venue.
 * Slide 2: day (and time), venue, price (only when known), and the description cut to
 * whole sentences by completeDescription(). Both slides are top-aligned; the one link sits below both.
 */
function EventCardView({ event: e, brandColor, isOwner = false, currency = null, Illustration = EventCategoryIllustration }: EventCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry!.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // The + badge settles in the first time the card is in view, then stays
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { if (inView) setRevealed(true); }, [inView]);
  const addToCalendar = () => {
    downloadIcs({ id: e.id, title: e.title, start_date: e.start_date, start_time: e.start_time, location: e.location, source_url: e.source_url, description: completeDescription(e.description) });
    if (!isOwner) recordEventClick(e.id, "calendar");
  };

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
        {(() => {
          const art = <Illustration category={category} color={toCss(eventIllustrationTint(brandColor))} animate={inView} />;
          const photo = eventPhotoUrl(e.image_path);
          return photo ? <EventPhotoBand src={photo} fallback={art} /> : art;
        })()}
        <div className="absolute left-0 right-0 top-4 px-5 md:px-8" aria-hidden="true">
          <div className="mx-auto w-full max-w-xl">
            <span className="inline-flex rounded-full bg-[hsl(var(--feed-card))] px-3 py-1 text-sm font-semibold text-[hsl(var(--feed-card-foreground))] shadow-sm">
              {EVENT_CATEGORY_LABELS[category]}
            </span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-5 md:px-8">
          <div className="mx-auto w-full max-w-xl">
            <EventDateButton ymd={e.start_date} title={e.title} revealed={revealed} onAdd={addToCalendar} className="translate-y-1/2" />
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
        {completeDescription(e.description) && <p className="text-lg opacity-75 md:text-xl">{completeDescription(e.description)}</p>}
        <button type="button" className={`inline-flex min-h-11 items-center gap-2 text-base font-semibold underline-offset-4 hover:underline ${ACCENT}`}
          onClick={addToCalendar}>
          <CalendarPlus className="h-5 w-5" aria-hidden="true" />Add to calendar
        </button>
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
              onClick={() => { if (!isOwner) recordEventClick(e.id, eventLinkKind(e)); }}>
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
