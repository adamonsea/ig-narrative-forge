import { useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmblaSlideCarousel } from "@/components/ui/embla-slide-carousel";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { recordEventClick } from "@/lib/eventClicks";
import { coverLines, dateBadge, eventGroup, eventTime, type WhatsOnFeedEvent } from "@/lib/whatsOn";

function brandVars(color?: string | null) {
  const p = feedBrandPalette(color);
  return {
    "--ev-fill": toCss(p.light.fill), "--ev-on-fill": toCss(p.light.onFill), "--ev-accent": toCss(p.light.text),
    "--ev-fill-dark": toCss(p.dark.fill), "--ev-on-fill-dark": toCss(p.dark.onFill), "--ev-accent-dark": toCss(p.dark.text),
  } as React.CSSProperties;
}
const FILL = "bg-[color:var(--ev-fill)] text-[color:var(--ev-on-fill)] dark:bg-[color:var(--ev-fill-dark)] dark:text-[color:var(--ev-on-fill-dark)]";
const ACCENT = "text-[color:var(--ev-accent)] dark:text-[color:var(--ev-accent-dark)]";
const PILL = `inline-flex items-center gap-1.5 min-h-9 px-4 py-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap rounded-full transition-opacity hover:opacity-90 ${FILL}`;

interface WhatsOnCardProps {
  /** Up to 8 upcoming events, soonest first. */
  events: WhatsOnFeedEvent[];
  today: string;
  /** Which set this is: "Today", "This week" or "Later this month". */
  label?: string;
  brandColor?: string | null;
  /** The feed's owner: their clicks don't count as sending readers. */
  isOwner?: boolean;
}

/**
 * The feed's "What's on" card set, built like a story card: a cover naming the
 * first events, then one event per swipe. Facts and a link back to the source only.
 */
export function WhatsOnCard({ events, today, label = "Next 2 weeks", brandColor, isOwner = false }: WhatsOnCardProps) {
  const [slide, setSlide] = useState(0);
  if (!events.length) return null;
  const { lines, more } = coverLines(events, today);
  const current = slide > 0 ? events[slide - 1] : null;
  const fan = events.slice(0, 3);

  const cover = (
    <div key="cover" className="flex h-full flex-col">
      <div className={`relative flex h-64 w-full items-center justify-center overflow-hidden md:h-80 ${FILL}`} aria-hidden="true">
        {fan.map((e, i) => {
          const b = dateBadge(e.start_date);
          const pos = fan.length === 1 ? 1 : fan.length === 2 ? [0.5, 1.5][i] : i;
          const rot = [-9, 2, 11][Math.round(pos)];
          const x = (pos - 1) * 88;
          return (
            <div key={e.id} className="absolute w-[104px] rounded-2xl bg-[hsl(var(--feed-card))] py-3 text-center font-lexend leading-none text-[hsl(var(--feed-card-foreground))] shadow-xl"
              style={{ transform: `translateX(${x}px) rotate(${rot}deg)`, zIndex: 3 - Math.abs(Math.round(pos) - 1) }}>
              <div className={`text-xs font-semibold tracking-[0.1em] ${ACCENT}`}>{b.weekday}</div>
              <div className="my-1 text-5xl font-bold">{b.day}</div>
              <div className="text-xs font-semibold tracking-[0.1em] opacity-70">{b.month}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-1 items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-xl">
          <h3 className="font-lexend text-[2.5rem] font-semibold uppercase leading-[1.04] md:text-6xl">What's on</h3>
          <ul className="mt-4 space-y-1.5 font-lexend text-xl leading-snug md:text-2xl">
            {lines.map((l, i) => (
              <li key={`${l.title}-${i}`}><span className={`font-semibold ${ACCENT}`}>{l.day}</span> {l.title}</li>
            ))}
            {more > 0 && <li className="opacity-70">+ {more} more</li>}
          </ul>
        </div>
      </div>
    </div>
  );

  const slides = [cover, ...events.map((e) => {
    const b = dateBadge(e.start_date);
    const meta = [eventTime(e.start_time), e.location].filter(Boolean).join(" · ");
    return (
      <div key={e.id} className="flex h-full items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-xl">
          <p className={`text-sm font-semibold uppercase tracking-[0.14em] ${ACCENT}`}>{eventGroup(e, today)}</p>
          <div className={`mt-5 w-[104px] rounded-2xl py-3 text-center font-lexend leading-none ${FILL}`} aria-hidden="true">
            <div className="text-xs font-semibold tracking-[0.1em]">{b.weekday}</div>
            <div className="my-1 text-5xl font-bold">{b.day}</div>
            <div className="text-xs font-semibold tracking-[0.1em]">{b.month}</div>
          </div>
          <h3 className="mt-6 font-lexend text-4xl font-semibold leading-[1.08] text-pretty md:text-5xl">
            <span className="sr-only">{`${b.weekday} ${b.day} ${b.month}: `}</span>{e.title}
          </h3>
          {meta && <p className="mt-4 text-lg opacity-75 md:text-xl">{meta}</p>}
        </div>
      </div>
    );
  })];

  const source = current?.source_name || "the organiser";

  return (
    <Card className="feed-card w-full overflow-hidden shadow-lg" style={brandVars(brandColor)} aria-label="What's on">
      <div className="relative flex min-h-[600px] flex-col">
        <div className="feed-card-header flex items-center justify-between border-b p-4">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ACCENT}`}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />What's on</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <EmblaSlideCarousel slides={slides} height="100%" showDots dotStyle="instagram" onSlideChange={setSlide} ariaLabel="What's on: events" />
        </div>
        <div className="flex min-h-[68px] justify-center p-4">
          {current ? (
            current.source_url ? (
              <a href={current.source_url} target="_blank" rel="noopener noreferrer" className={PILL}
                onClick={() => { if (!isOwner) recordEventClick(current.id); }}>
                More at {source}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <span className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">From {source}</span>
            )
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              Swipe for {events.length} {events.length === 1 ? "event" : "events"}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
