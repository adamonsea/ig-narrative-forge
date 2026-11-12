import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { recordEventClick } from "@/lib/eventClicks";
import { dateBadge, eventTime, type WhatsOnFeedEvent } from "@/lib/whatsOn";

interface WhatsOnCardsProps {
  events: WhatsOnFeedEvent[];
  /** e.g. "Today – Sat 14 Nov" */
  dates: string;
  brandColor?: string | null;
  isOwner?: boolean;
  onRemove?: (event: WhatsOnFeedEvent) => void;
}

/**
 * One "What's on" card set in the feed: 3–4 events, one per card, swiped sideways.
 * Facts and a link back to the source only — no event pages.
 */
export function WhatsOnCards({ events, dates, brandColor, isOwner = false, onRemove }: WhatsOnCardsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const palette = feedBrandPalette(brandColor);
  const brandVars = {
    "--ev-fill": toCss(palette.light.fill),
    "--ev-on-fill": toCss(palette.light.onFill),
    "--ev-accent": toCss(palette.light.text),
    "--ev-fill-dark": toCss(palette.dark.fill),
    "--ev-on-fill-dark": toCss(palette.dark.onFill),
    "--ev-accent-dark": toCss(palette.dark.text),
  } as React.CSSProperties;

  const onScroll = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const cards = Array.from(row.children) as HTMLElement[];
    const left = row.scrollLeft;
    let best = 0;
    cards.forEach((c, i) => {
      if (Math.abs(c.offsetLeft - row.offsetLeft - left) < Math.abs(cards[best].offsetLeft - row.offsetLeft - left)) best = i;
    });
    setActive(row.scrollLeft + row.clientWidth >= row.scrollWidth - 4 ? cards.length - 1 : best);
  }, []);

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, events.length - 1))); }, [events.length]);

  const go = (dir: -1 | 1) => {
    const row = rowRef.current;
    const card = row?.children[0] as HTMLElement | undefined;
    if (!row || !card) return;
    row.scrollBy({ left: dir * (card.offsetWidth + 12), behavior: "smooth" });
  };

  if (!events.length) return null;
  const many = events.length > 1;
  const count = `${events.length} ${events.length === 1 ? "event" : "events"}`;

  return (
    <section style={brandVars} aria-label="What's on" className="feed-card w-full rounded-xl border border-border shadow-lg pt-5 pb-4">
      <div className="flex items-start justify-between gap-4 px-5 pb-3.5 sm:px-6 sm:pb-4">
        <div>
          <h3 className="font-lexend text-xl font-bold tracking-tight">What's on</h3>
          <p className="text-sm opacity-75">{dates} · {count}</p>
        </div>
        {many && (
          <div className="hidden gap-1.5 sm:flex">
            <button type="button" onClick={() => go(-1)} disabled={active === 0} aria-label="Previous events"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border transition-opacity hover:opacity-80 disabled:opacity-30">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} disabled={active >= events.length - 1} aria-label="More events"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border transition-opacity hover:opacity-80 disabled:opacity-30">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={rowRef}
        onScroll={onScroll}
        role="list"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 sm:scroll-px-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((e) => {
          const badge = dateBadge(e.start_date);
          const time = eventTime(e.start_time);
          const meta = [time, e.location].filter(Boolean).join(" · ");
          const source = e.source_name || "the organiser";
          return (
            <article
              key={e.id}
              role="listitem"
              className={`relative flex min-h-[212px] shrink-0 snap-start flex-col gap-3 rounded-xl border border-border bg-[hsl(var(--feed-card-header))] p-4 ${many ? "basis-[78%] sm:basis-[calc((100%-24px)/2.35)]" : "basis-full"}`}
            >
              {isOwner && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(e)}
                  aria-label={`Remove “${e.title}” from your feed`}
                  title="Remove from your feed"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <div className={`flex items-start gap-3 ${isOwner ? "pr-6" : ""}`}>
                <div
                  className="w-[54px] shrink-0 rounded-[10px] py-1.5 text-center font-lexend leading-none bg-[color:var(--ev-fill)] text-[color:var(--ev-on-fill)] dark:bg-[color:var(--ev-fill-dark)] dark:text-[color:var(--ev-on-fill-dark)]"
                  aria-hidden="true"
                >
                  <div className="text-[11px] font-semibold tracking-[0.08em]">{badge.weekday}</div>
                  <div className="my-0.5 text-2xl font-bold">{badge.day}</div>
                  <div className="text-[11px] font-semibold tracking-[0.08em]">{badge.month}</div>
                </div>
                <h4 className="line-clamp-3 font-lexend text-lg font-semibold leading-snug">
                  <span className="sr-only">{`${badge.weekday} ${badge.day} ${badge.month}: `}</span>
                  {e.title}
                </h4>
              </div>
              {meta && <p className="text-sm leading-snug opacity-75">{meta}</p>}
              {e.source_url ? (
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { if (!isOwner) recordEventClick(e.id); }}
                  className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5 text-sm font-medium hover:underline"
                >
                  <span className="truncate">More at {source}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-[color:var(--ev-accent)] dark:text-[color:var(--ev-accent-dark)]" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <p className="mt-auto border-t border-border pt-2.5 text-sm font-medium">From {source}</p>
              )}
            </article>
          );
        })}
      </div>

      {many && (
        <div className="mt-3.5 flex justify-center gap-1.5" aria-hidden="true">
          {events.map((e, i) => (
            <span key={e.id} className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-current" : "w-1.5 bg-current opacity-25"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
