import { useState } from "react";
import { CalendarDays, ChevronDown, ExternalLink, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { coverSentence, countdown, dateBadge, eventTime, hiddenReason, isLowRelevance, type WhatsOnFeedEvent } from "@/lib/whatsOn";
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

/** One event waiting in Coming up: date tile, title, countdown line; Publish / Skip on hover. */
export function ComingUpEventCard({ event, today, onPublish, onSkip }: { event: DeskEvent; today: string; onPublish: () => void; onSkip: () => void }) {
  const low = isLowRelevance(event.relevance_score);
  return (
    <DeskCard
      title={event.title}
      visual={<DateTile date={event.start_date} />}
      faded={low}
      badges={event.source_api === "reader" ? <DeskBadge>Reader</DeskBadge> : null}
      meta={
        <MetaLine parts={[
          <span key="c" className="font-medium text-foreground">{countdown(event.start_date, today)}</span>,
          eventTime(event.start_time),
          event.location,
          low ? "may not be local" : null,
        ]} />
      }
      footer={event.source_url ? (
        <a
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.source_name || "Original listing"}</span>
        </a>
      ) : undefined}
      actions={
        <>
          <Button size="sm" onClick={onPublish}>Publish</Button>
          <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>
        </>
      }
    />
  );
}

/** Skipped and out-of-area events: a quiet "Hidden (n)" link at the bottom of Coming up. */
export function HiddenEvents({ events, onRestore }: { events: DeskEvent[]; onRestore: (e: DeskEvent) => void }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  return (
    <div className="pt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="tabular-nums">{`Hidden (${events.length})`}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <DateTile date={e.start_date} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{e.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                  <span className={e.status === "excluded" ? "font-medium text-destructive" : ""}>{hiddenReason(e.status, e.exclusion_reason)}</span>
                  {` · ${[e.location, e.source_name].filter(Boolean).join(" · ")}`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onRestore(e)}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
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

/** Coming up's settings: events on/off, reader suggestions and show in the feed. */
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

/** When events are off, Coming up is one slim card. */
export function EventsOffCard({ onSwitchOn, disabled }: { onSwitchOn: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base">Add what's on to your feed</p>
      <Button size="sm" onClick={onSwitchOn} disabled={disabled}>Switch on</Button>
    </div>
  );
}
