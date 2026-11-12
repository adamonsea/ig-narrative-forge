import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CalendarDays, ChevronDown, ExternalLink, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { coverSentence, dateBadge, dayLabel, eventTime, hiddenReason, isLowRelevance, type WhatsOnFeedEvent } from "@/lib/whatsOn";
import type { DeskEvent } from "@/hooks/useWhatsOnEvents";

export function TypeChip({ type }: { type: "story" | "event" }) {
  return type === "event" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <CalendarDays className="h-3 w-3" aria-hidden="true" />Event
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Story</span>
  );
}

function MiniDate({ date }: { date: string }) {
  const b = dateBadge(date);
  return (
    <div className="w-11 shrink-0 rounded-lg border border-border py-1 text-center leading-none" aria-hidden="true">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">{b.weekday}</div>
      <div className="mt-0.5 text-lg font-bold">{b.day}</div>
    </div>
  );
}

function RelevancePill({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  const low = isLowRelevance(score);
  return (
    <span
      title={low ? "Less likely to be local" : "Local relevance"}
      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${low ? "border-border bg-muted text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary"}`}
    >
      {score}%
    </span>
  );
}

const when = (e: Pick<DeskEvent, "start_date" | "start_time" | "location">) =>
  [dayLabel(e.start_date), eventTime(e.start_time), e.location].filter(Boolean).join(" · ");

/** One event waiting on the Desk: one tap, Publish or Skip. */
export function WaitingEventCard({ event, onPublish, onSkip }: { event: DeskEvent; onPublish: () => void; onSkip: () => void }) {
  const low = isLowRelevance(event.relevance_score);
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TypeChip type="event" />
          <span className="max-w-[160px] truncate">{event.source_name}</span>
          <RelevancePill score={event.relevance_score} />
          {low && <span>Couldn't confirm it's local</span>}
          <span className="ml-auto">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
        </div>
        <div className="flex items-start gap-3">
          <MiniDate date={event.start_date} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug">{event.title}</p>
            <p className="text-sm text-muted-foreground">{when(event)}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {event.source_url && (
            <Button variant="ghost" size="sm" asChild className="mr-auto text-muted-foreground">
              <a href={event.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Original</a>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
          <Button size="sm" onClick={onPublish} className="min-w-[96px]">Publish</Button>
        </div>
      </div>
    </Card>
  );
}

/** Skipped and out-of-area events, collapsed at the bottom of Waiting. */
export function HiddenEvents({ events, onRestore }: { events: DeskEvent[]; onRestore: (e: DeskEvent) => void }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground">
        <span>Hidden <span className="tabular-nums">{events.length}</span></span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <MiniDate date={e.start_date} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.title}</p>
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

/** The What's on card set in Live, where readers see it. Only the first one carries the controls. */
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
            <p className="font-medium">What's on · {events.length ? count : "nothing in the next 2 weeks"}</p>
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
              <MiniDate date={e.start_date} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.title}</p>
                <p className="truncate text-sm text-muted-foreground">{[eventTime(e.start_time), e.location].filter(Boolean).join(" · ")}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(e)} aria-label={`Remove “${e.title}” from the feed`}><X className="h-4 w-4" /></Button>
            </li>
          ))}
          <li className="py-2.5 text-xs text-muted-foreground">
            Past events drop off on their own{liveMore > 0 ? ` · ${liveMore} more published, coming up after these` : ""}.
          </li>
        </ul>
      )}
    </div>
  );
}

/** Pipeline setting: collect events and add them to the weekly email. */
export function EventsSwitch({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="desk-events-switch" className="text-sm text-muted-foreground">Events</Label>
      <Switch id="desk-events-switch" checked={on} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
