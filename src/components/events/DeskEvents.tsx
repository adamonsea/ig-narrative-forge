import { useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Clock, ExternalLink, MapPin, Settings2, Ticket, UserRound, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { coverSentence, countdown, dateBadge, eventTime, dayLabel, hiddenReason, isLowRelevance, leftOutExplanation, liveAreaFlag, type WhatsOnFeedEvent } from "@/lib/whatsOn";
import type { DeskEvent } from "@/hooks/useWhatsOnEvents";
import { DeskBadge, DeskCard, MetaLine } from "@/components/topic-pipeline/DeskCard";

/** Day and number, the event's at-a-glance date. */
function DateTile({ date, size = "lg" }: { date: string; size?: "lg" | "sm" }) {
  const b = dateBadge(date);
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-background leading-none ${size === "lg" ? "h-16 w-16" : "h-12 w-12"}`}
      aria-hidden="true"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.weekday}</span>
      <span className={`mt-1 font-bold tabular-nums ${size === "lg" ? "text-2xl" : "text-lg"}`}>{b.day}</span>
    </div>
  );
}

type ComingUpItem = (WhatsOnFeedEvent & { exclusion_reason?: string | null; state: "live" }) | (DeskEvent & { state: "waiting" });
type DetailItem = ComingUpItem | (DeskEvent & { state: "left_out" });

interface EventActions {
  publish: (e: Pick<DeskEvent, "id" | "title">) => void;
  skip: (e: Pick<DeskEvent, "id" | "title">) => void;
  removeFromLive: (e: Pick<DeskEvent, "id" | "title">) => void;
  removeManyFromLive?: (events: Pick<DeskEvent, "id" | "title">[]) => void;
  unhide: (e: Pick<DeskEvent, "id" | "title">) => void;
}

const PAGE = 20;

const sourceLink = (url: string | null | undefined, name: string | null | undefined) => url ? (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
  >
    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="truncate">{name || "Original listing"}</span>
  </a>
) : undefined;

/** Amber tag for anything waiting on the owner. */
export function AttentionTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-attention/15 px-2 py-0.5 text-sm font-medium text-attention-foreground">{children}</span>;
}

/**
 * Events waiting for the owner's OK, pinned above the timeline with Publish and Skip
 * always showing: one click each, no hovering. Reader suggestions come first.
 */
function ToCheckList({ events, today, actions, onOpen }: {
  events: DeskEvent[]; today: string; actions: EventActions; onOpen: (e: DeskEvent) => void;
}) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="events-to-check" className="space-y-2 rounded-xl border border-attention/50 bg-attention-soft p-3">
      <h4 id="events-to-check" className="flex items-center gap-2 text-base font-semibold text-attention-foreground">
        <span className="h-2 w-2 rounded-full bg-attention" aria-hidden="true" />
        {events.length === 1 ? "1 event needs your OK" : `${events.length} events need your OK`}
      </h4>
      <ul className="space-y-2">
        {events.map((e) => {
          const reader = e.source_api === "reader";
          return (
            <li key={e.id} className="rounded-lg border border-border bg-background p-3">
              <button type="button" onClick={() => onOpen(e)} className="flex w-full min-w-0 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                <DateTile date={e.start_date} size="sm" />
                <span className="min-w-0 flex-1">
                  {reader && (
                    <span className="mb-1 flex items-center gap-1 text-sm font-medium text-attention-foreground">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />Suggested by a reader
                    </span>
                  )}
                  <span className="block text-lg font-semibold leading-snug">{e.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {[countdown(e.start_date, today), eventTime(e.start_time), e.location, isLowRelevance(e.relevance_score) ? "may not be local" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {sourceLink(e.source_url, e.source_name)}
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => actions.publish(e)}>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Publish
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => actions.skip(e)}>
                  <X className="mr-1.5 h-4 w-4" aria-hidden="true" />Skip
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Live events the location rules now place elsewhere: pinned under the to-check box with one-click Remove. */
function FlaggedList({ events, today, actions, onOpen }: {
  events: ComingUpItem[]; today: string; actions: EventActions; onOpen: (e: ComingUpItem) => void;
}) {
  const [all, setAll] = useState(false);
  if (events.length === 0) return null;
  const shown = all ? events : events.slice(0, 3);
  return (
    <section aria-labelledby="events-flagged" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="events-flagged" className="flex flex-1 items-center gap-2 text-base font-semibold text-destructive">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {events.length === 1 ? "1 live event looks out of area" : `${events.length} live events look out of area`}
        </h4>
        {events.length > 1 && actions.removeManyFromLive && (
          <Button size="sm" variant="outline" onClick={() => actions.removeManyFromLive!(events)}>Remove all {events.length}</Button>
        )}
      </div>
      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <button type="button" onClick={() => onOpen(e)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <DateTile date={e.start_date} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">{e.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{[countdown(e.start_date, today), e.location || e.source_name].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
            <Button size="sm" variant="outline" onClick={() => actions.removeFromLive(e)}>Remove</Button>
          </li>
        ))}
      </ul>
      {events.length > 3 && (
        <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${events.length}`}
        </Button>
      )}
    </section>
  );
}

/** One upcoming event in the Event pool: live in the feed or waiting. Click for its details. */
function ComingUpEventCard({ event, today, actions, onOpen }: { event: ComingUpItem; today: string; actions: EventActions; onOpen: () => void }) {
  const waiting = event.state === "waiting";
  const low = waiting && isLowRelevance(event.relevance_score);
  return (
    <DeskCard
      title={event.title}
      visual={<DateTile date={event.start_date} />}
      onOpen={onOpen}
      badges={waiting
        ? <><AttentionTag>Needs your OK</AttentionTag>{event.source_api === "reader" ? <DeskBadge>Reader</DeskBadge> : null}</>
        : liveAreaFlag(event.exclusion_reason) ? <DeskBadge tone="destructive">{liveAreaFlag(event.exclusion_reason)}</DeskBadge> : null}
      meta={
        <MetaLine parts={[
          <span key="c" className="font-medium text-foreground">{countdown(event.start_date, today)}</span>,
          eventTime(event.start_time),
          event.location,
          low ? "may not be local" : null,
        ]} />
      }
      footer={sourceLink(event.source_url, event.source_name)}
      actions={waiting ? (
        <>
          <Button size="sm" onClick={() => actions.publish(event)}>Publish</Button>
          <Button size="sm" variant="ghost" onClick={() => actions.skip(event)}>Skip</Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => actions.removeFromLive(event)}>Remove</Button>
      )}
    />
  );
}

/** One event that didn't make the cut: why, then Add to feed. Click for its details. */
function LeftOutEventCard({ event, today, actions, onOpen }: { event: DeskEvent; today: string; actions: EventActions; onOpen: () => void }) {
  return (
    <DeskCard
      title={event.title}
      visual={<DateTile date={event.start_date} />}
      onOpen={onOpen}
      badges={<DeskBadge tone={event.status === "excluded" ? "destructive" : "muted"}>{hiddenReason(event.status, event.exclusion_reason)}</DeskBadge>}
      meta={
        <MetaLine parts={[
          <span key="c" className="font-medium text-foreground">{countdown(event.start_date, today)}</span>,
          eventTime(event.start_time),
          event.location,
        ]} />
      }
      footer={sourceLink(event.source_url, event.source_name)}
      actions={<Button size="sm" variant="outline" onClick={() => actions.publish(event)}>Add to feed</Button>}
    />
  );
}

interface EventDetailRow {
  description: string | null;
  end_date: string | null;
  end_time: string | null;
  price: string | null;
}

/** The full listing for one event, with the actions that fit where it is. */
function EventDetailSheet({ item, today, actions, onClose }: { item: DetailItem | null; today: string; actions: EventActions; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["event-detail", item?.id],
    enabled: Boolean(item?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("description, end_date, end_time, price").eq("id", item!.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as EventDetailRow | null;
    },
  });
  const done = (fn: () => void) => { fn(); onClose(); };
  const b = item ? dateBadge(item.start_date) : null;
  const ends = detail?.end_date && item && detail.end_date !== item.start_date
    ? `Until ${dayLabel(detail.end_date)}`
    : detail?.end_time ? `Until ${eventTime(detail.end_time)}` : null;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {item && b && (
          <>
            <SheetHeader className="space-y-3 border-b p-6 text-left">
              <div className="flex items-center gap-3">
                <DateTile date={item.start_date} />
                <div className="min-w-0 text-base">
                  <p className="font-medium">{dayLabel(item.start_date)}{eventTime(item.start_time) ? ` · ${eventTime(item.start_time)}` : ""}</p>
                  <p className="text-muted-foreground">{countdown(item.start_date, today)}</p>
                </div>
              </div>
              <SheetTitle className="text-xl leading-snug">{item.title}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  {item.state === "live" && (
                    <span className="flex flex-wrap gap-1.5">
                      <DeskBadge tone="primary">In the feed</DeskBadge>
                      {liveAreaFlag(item.exclusion_reason) && <DeskBadge tone="destructive">{liveAreaFlag(item.exclusion_reason)}</DeskBadge>}
                    </span>
                  )}
                  {item.state === "waiting" && (
                    <span className="flex flex-wrap gap-1.5">
                      <AttentionTag>Needs your OK</AttentionTag>
                      {item.source_api === "reader" && <DeskBadge><UserRound className="h-3.5 w-3.5" aria-hidden="true" />Suggested by a reader</DeskBadge>}
                    </span>
                  )}
                  {item.state === "left_out" && <DeskBadge tone={item.status === "excluded" ? "destructive" : "muted"}>{hiddenReason(item.status, item.exclusion_reason)}</DeskBadge>}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 p-6 text-base">
              {item.state === "live" && liveAreaFlag(item.exclusion_reason) && (
                <p className="rounded-lg bg-destructive/5 p-3 text-muted-foreground">You published this earlier, but {leftOutExplanation("excluded", item.exclusion_reason).charAt(0).toLowerCase() + leftOutExplanation("excluded", item.exclusion_reason).slice(1)} It stays in the feed until you remove it.</p>
              )}
              {item.state === "left_out" && (
                <p className="rounded-lg bg-muted p-3 text-muted-foreground">{leftOutExplanation(item.status, item.exclusion_reason)}</p>
              )}
              <dl className="space-y-3">
                {item.location && (
                  <div className="flex gap-3"><dt className="sr-only">Where</dt><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{item.location}</dd></div>
                )}
                {ends && (
                  <div className="flex gap-3"><dt className="sr-only">Ends</dt><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{ends}</dd></div>
                )}
                {detail?.price && (
                  <div className="flex gap-3"><dt className="sr-only">Price</dt><Ticket className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{detail.price}</dd></div>
                )}
              </dl>
              {isLoading ? (
                <div className="space-y-2" aria-hidden="true">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                </div>
              ) : detail?.description ? (
                <p className="whitespace-pre-line leading-relaxed text-foreground">{detail.description}</p>
              ) : null}
              {item.source_url && (
                <Button asChild variant="outline" className="w-full justify-center">
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    {item.source_name ? `See the listing on ${item.source_name}` : "See the full listing"}
                  </a>
                </Button>
              )}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t bg-background p-4">
              {item.state === "live" && (
                <Button variant="outline" className="flex-1" onClick={() => done(() => actions.removeFromLive(item))}>Remove from feed</Button>
              )}
              {item.state === "waiting" && (
                <>
                  <Button className="flex-1" onClick={() => done(() => actions.publish(item))}>Publish</Button>
                  <Button variant="ghost" onClick={() => done(() => actions.skip(item))}>Skip</Button>
                </>
              )}
              {item.state === "left_out" && (
                <>
                  <Button className="flex-1" onClick={() => done(() => actions.publish(item))}>Add to feed</Button>
                  <Button variant="ghost" onClick={() => done(() => actions.unhide(item))}>Put in waiting</Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The Event pool: every upcoming event (live or waiting), soonest first,
 * with a switch to see the ones that didn't make the cut. Click any event for its details.
 */
export function ComingUpPanel({ toCheck = [], upcoming, leftOut, today, actions }: {
  toCheck?: DeskEvent[]; upcoming: ComingUpItem[]; leftOut: DeskEvent[]; today: string; actions: EventActions;
}) {
  const [view, setView] = useState<"upcoming" | "left_out">("upcoming");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<DetailItem | null>(null);
  const list = view === "upcoming" ? upcoming : leftOut;
  const choose = (v: "upcoming" | "left_out") => { setView(v); setShown(PAGE); };
  const tabs: { key: "upcoming" | "left_out"; label: string; count: number }[] = [
    { key: "upcoming", label: "Coming up", count: upcoming.length },
    { key: "left_out", label: "Didn't make the cut", count: leftOut.length },
  ];

  return (
    <div className="space-y-3">
      <ToCheckList events={toCheck} today={today} actions={actions} onOpen={(e) => setOpen({ ...e, state: "waiting" })} />
      <FlaggedList events={upcoming.filter((e) => e.state === "live" && liveAreaFlag(e.exclusion_reason))} today={today} actions={actions} onOpen={setOpen} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Which events">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => choose(t.key)}
            className={cn(
              "truncate rounded-lg px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="tabular-nums text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-base text-muted-foreground">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {view === "upcoming" ? "No events coming up" : "Nothing left out"}
        </p>
      ) : view === "upcoming" ? (
        upcoming.slice(0, shown).map((e) => (
          <ComingUpEventCard key={`${e.state}-${e.id}`} event={e} today={today} actions={actions} onOpen={() => setOpen(e)} />
        ))
      ) : (
        leftOut.slice(0, shown).map((e) => (
          <LeftOutEventCard key={e.id} event={e} today={today} actions={actions} onOpen={() => setOpen({ ...e, state: "left_out" })} />
        ))
      )}

      {list.length > shown && (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, list.length - shown)} more
        </Button>
      )}

      <EventDetailSheet item={open} today={today} actions={actions} onClose={() => setOpen(null)} />
    </div>
  );
}

/** The What's on card set in Live now, where readers see it. Only the first one carries the controls. */
export function LiveWhatsOnRow({ events, today, showInFeed, liveMore, first, onToggleShow, onRemove }: {
  events: WhatsOnFeedEvent[]; today: string; showInFeed: boolean; liveMore: number; first: boolean;
  onToggleShow: (on: boolean) => void; onRemove: (e: WhatsOnFeedEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!first) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 px-3 py-2 text-sm text-muted-foreground">
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />What's on, again
      </div>
    );
  }
  const count = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  return (
    <div className={`rounded-xl border border-primary/30 bg-primary/5 ${showInFeed ? "" : "opacity-80"}`}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!events.length}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">What's on · {events.length ? count : "nothing in the next 2 weeks"}</p>
            {events.length > 0 && <p className="truncate text-sm text-muted-foreground">{coverSentence(events, today)}</p>}
          </div>
          {events.length > 0 && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-primary/20 px-3 py-2">
        <Checkbox id="whats-on-show-in-feed" checked={showInFeed} onCheckedChange={(v) => onToggleShow(v === true)} />
        <Label htmlFor="whats-on-show-in-feed" className="text-sm font-normal">Show in the feed</Label>
      </div>
      {open && events.length > 0 && (
        <ul className="divide-y divide-border border-t border-primary/20 px-3">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <DateTile date={e.start_date} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{e.title}</p>
                <p className="truncate text-sm text-muted-foreground">{[eventTime(e.start_time), e.location].filter(Boolean).join(" · ")}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(e)} aria-label={`Remove “${e.title}” from the feed`}><X className="h-4 w-4" /></Button>
            </li>
          ))}
          <li className="py-2.5 text-sm text-muted-foreground">
            Past events drop off on their own{liveMore > 0 ? ` · ${liveMore} more published, coming up after these` : ""}.
          </li>
        </ul>
      )}
    </div>
  );
}

/** The Event pool's settings: events on/off, reader suggestions and show in the feed. */
export function EventsSettings({ on, onChange, disabled, suggestOn, onSuggestChange, showInFeed, onShowInFeedChange }: {
  on: boolean; onChange: (on: boolean) => void; disabled?: boolean;
  suggestOn?: boolean; onSuggestChange?: (on: boolean) => void;
  showInFeed?: boolean; onShowInFeedChange?: (on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="Events settings" disabled={disabled}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="desk-events-switch" className="text-base">Events</Label>
          <Switch id="desk-events-switch" checked={on} onCheckedChange={onChange} disabled={disabled} />
        </div>
        {on && onShowInFeedChange && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="desk-events-show-in-feed" className="text-base font-normal">Show in the feed</Label>
            <Switch id="desk-events-show-in-feed" checked={Boolean(showInFeed)} onCheckedChange={onShowInFeedChange} disabled={disabled} />
          </div>
        )}
        {on && onSuggestChange && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="desk-reader-suggest" className="text-base font-normal">Let readers suggest events</Label>
            <Switch id="desk-reader-suggest" checked={Boolean(suggestOn)} onCheckedChange={onSuggestChange} disabled={disabled} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** When events are off, the Event pool is one slim card. */
export function EventsOffCard({ onSwitchOn, disabled }: { onSwitchOn: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base">Add what's on to your feed</p>
      <Button size="sm" onClick={onSwitchOn} disabled={disabled}>Switch on</Button>
    </div>
  );
}
