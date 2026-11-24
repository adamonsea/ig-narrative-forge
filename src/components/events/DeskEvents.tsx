import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Clock, Crop, ExternalLink, ImagePlus, MapPin, Settings2, Ticket, UserRound, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { eventPhotoUrl } from "@/lib/eventPhotos";
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
import { EventCategoryIcon, EVENT_CATEGORY_LABELS, isEventCategory } from "@/components/events/EventCategoryIcon";
import { useEventCategories, useEventCategoryActions } from "@/hooks/useEventCategories";
import { DeskBadge, DeskCard, MetaLine } from "@/components/topic-pipeline/DeskCard";
import { Textarea } from "@/components/ui/textarea";
import { InlineError } from "@/components/ui/editorial";
import { EventSocialPack } from "@/components/events/social/EventSocialPack";
import { EventPictureEditor } from "@/components/picture-edit/EventPictureEditor";
import { EventEditorialPanel } from "@/components/events/EventEditorialPanel";

/** Day and number, the event's at-a-glance date. */
function DateTile({ date, size = "lg", category }: { date: string; size?: "lg" | "sm"; category?: string | null | undefined }) {
  const b = dateBadge(date);
  return (
    <div
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-background leading-none ${size === "lg" ? "h-16 w-16" : "h-12 w-12"}`}
      aria-hidden="true"
    >
      <span className="text-sm font-medium text-muted-foreground">{b.weekday}</span>
      <span className={`mt-1 font-bold tabular-nums ${size === "lg" ? "text-2xl" : "text-lg"}`}>{b.day}</span>
      {category !== undefined && (
        <span className="absolute -bottom-2 -right-2 rounded-full border border-border bg-background p-0.5">
          <EventCategoryIcon category={category} className="h-6 w-6" />
        </span>
      )}
    </div>
  );
}

type ComingUpItem = (WhatsOnFeedEvent & { exclusion_reason?: string | null | undefined; area_confirmed?: boolean | undefined; state: "live" }) | (DeskEvent & { state: "waiting" });
type DetailItem = ComingUpItem | (DeskEvent & { state: "left_out" });

interface EventActions {
  publish: (e: Pick<DeskEvent, "id" | "title">) => void;
  skip: (e: Pick<DeskEvent, "id" | "title">) => void;
  removeFromLive: (e: Pick<DeskEvent, "id" | "title">) => void;
  removeManyFromLive?: (events: Pick<DeskEvent, "id" | "title">[]) => void;
  /** The owner says flagged events are fine where they are: never flagged again. */
  keepInArea?: (events: Pick<DeskEvent, "id" | "title">[]) => void;
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
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {[countdown(e.start_date, today), eventTime(e.start_time), e.location, isLowRelevance(e.relevance_score) ? "may not be local" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {sourceLink(e.source_url, e.source_name)}
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => actions.publish(e)}>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />Publish
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => actions.skip(e)}>
                  <X className="mr-2 h-4 w-4" aria-hidden="true" />Skip
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Live events the location rules now place elsewhere: pinned in amber with one-click Keep (never flagged again) or Remove. */
function FlaggedList({ events, today, actions, onOpen }: {
  events: ComingUpItem[]; today: string; actions: EventActions; onOpen: (e: ComingUpItem) => void;
}) {
  const [all, setAll] = useState(false);
  if (events.length === 0) return null;
  const shown = all ? events : events.slice(0, 3);
  return (
    <section aria-labelledby="events-flagged" className="space-y-2 rounded-xl border border-attention/50 bg-attention-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="events-flagged" className="flex flex-1 items-center gap-2 text-base font-semibold text-attention-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {events.length === 1 ? "1 live event looks out of area" : `${events.length} live events look out of area`}
        </h4>
        {events.length > 1 && actions.keepInArea && (
          <Button size="sm" variant="ghost" onClick={() => actions.keepInArea!(events)}>Keep all</Button>
        )}
        {events.length > 1 && actions.removeManyFromLive && (
          <Button size="sm" variant="ghost" onClick={() => actions.removeManyFromLive!(events)}>Remove all</Button>
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
            <div className="flex shrink-0 gap-2">
              {actions.keepInArea && (
                <Button size="sm" variant="outline" onClick={() => actions.keepInArea!([e])} aria-label={`Keep “${e.title}” in the feed`}>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />Keep
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => actions.removeFromLive(e)} aria-label={`Remove “${e.title}” from the feed`}>Remove</Button>
            </div>
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

/** One amber line when 8+ "Other" events share a theme: "12 events look like Comedy. Add it?" */
function CategorySuggestion({ topicId }: { topicId: string }) {
  const { data } = useEventCategories(topicId);
  const { decide } = useEventCategoryActions(topicId);
  const s = data?.suggestion;
  if (!s) return null;
  const label = EVENT_CATEGORY_LABELS[s.category as keyof typeof EVENT_CATEGORY_LABELS] ?? s.category;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-attention/40 bg-attention-soft p-3 text-base">
      <EventCategoryIcon category={s.category} className="h-6 w-6" title="" />
      <p className="min-w-0 flex-1">{s.count} events look like {label}. Add it?</p>
      <Button size="sm" onClick={() => void decide(s.category, "added", s.ids)}>Add</Button>
      <Button size="sm" variant="ghost" onClick={() => void decide(s.category, "skipped")}>Skip</Button>
    </div>
  );
}

/** One upcoming event in the Event pool: live in the feed or waiting. Click for its details. */
function ComingUpEventCard({ event, today, actions, onOpen, topicId }: { event: ComingUpItem; today: string; actions: EventActions; onOpen: () => void; topicId?: string | undefined }) {
  const waiting = event.state === "waiting";
  const low = waiting && isLowRelevance(event.relevance_score);
  return (
    <DeskCard
      title={event.title}
      visual={<DateTile date={event.start_date} category={event.event_type ?? null} />}
      onOpen={onOpen}
      badges={waiting
        ? <><AttentionTag>Needs your OK</AttentionTag>{event.source_api === "reader" ? <DeskBadge>Reader</DeskBadge> : null}</>
        : liveAreaFlag(event.exclusion_reason, event.area_confirmed) ? <AttentionTag>{liveAreaFlag(event.exclusion_reason, event.area_confirmed)}</AttentionTag> : null}
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
  is_free?: boolean | null | undefined;
  event_type?: string | null | undefined;
  price: string | null;
  image_path?: string | null | undefined;
  image_hidden?: boolean | null | undefined;
  image_original_path?: string | null | undefined;
  image_framing?: unknown;
  description_edited?: boolean | null | undefined;
}

/** The owner's own wording for an event; it sticks when the source is gathered again. */
function DescriptionEditor({ eventId, detail, topicId }: { eventId: string; detail: EventDetailRow; topicId?: string | undefined }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(detail.description ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const save = async (value: string | null, edited: boolean) => {
    setState("saving");
    const { error } = await supabase.from("events").update({ description: value, description_edited: edited } as never).eq("id", eventId);
    if (error) { setState("error"); return; }
    queryClient.setQueryData(["event-detail", eventId], (d: EventDetailRow | null | undefined) => (d ? { ...d, description: value, description_edited: edited } : d));
    queryClient.invalidateQueries({ queryKey: ["events-feed", topicId] });
    setState("saved");
  };
  const onBlur = () => {
    const value = text.trim();
    if (value === (detail.description ?? "").trim()) return;
    void save(value || null, true);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`desc-${eventId}`} className="text-sm text-muted-foreground">Description</Label>
        <span className="text-sm text-muted-foreground" aria-live="polite">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}</span>
      </div>
      <Textarea id={`desc-${eventId}`} value={text} onChange={(e) => { setText(e.target.value); setState("idle"); }} onBlur={onBlur} rows={6} className="text-base leading-relaxed" />
      {state === "error" && <InlineError message="Couldn't save the description." actionLabel="Try again" onAction={onBlur} />}
      {detail.description_edited && (
        <Button variant="ghost" size="sm" className="px-0 text-muted-foreground" onClick={() => void save(detail.description, false)}>Use listing text</Button>
      )}
    </div>
  );
}

/** The full listing for one event, with the actions that fit where it is. */
function EventDetailSheet({ item, today, actions, onClose, topicId }: { item: DetailItem | null; today: string; actions: EventActions; onClose: () => void; topicId?: string | undefined }) {
  const { data: cats } = useEventCategories(topicId);
  const { setCategory } = useEventCategoryActions(topicId);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["event-detail", item?.id],
    enabled: Boolean(item?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("description, description_edited, end_date, end_time, price, is_free, event_type, image_path, image_hidden, image_original_path, image_framing" as never).eq("id", item!.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as EventDetailRow | null;
    },
  });
  const done = (fn: () => void) => { fn(); onClose(); };
  const queryClient = useQueryClient();
  const [editingPicture, setEditingPicture] = useState(false);
  useEffect(() => { setEditingPicture(false); }, [item?.id]);
  const pictureSaved = (saved: { image_path: string; image_original_path: string; image_framing: unknown }) => {
    if (!item) return;
    queryClient.setQueryData(["event-detail", item.id], (d: EventDetailRow | null | undefined) => (d ? { ...d, ...saved, image_hidden: false } : d));
    queryClient.invalidateQueries({ queryKey: ["events-feed", topicId] });
    setEditingPicture(false);
  };
  const photo = detail && !detail.image_hidden ? eventPhotoUrl(detail.image_path) : null;
  // Swap the listing photo for the illustration (or back); sticks for this event name
  const setPhoto = async (show: boolean) => {
    if (!item) return;
    queryClient.setQueryData(["event-detail", item.id], (d: EventDetailRow | null | undefined) => (d ? { ...d, image_hidden: !show } : d));
    const { error } = await (supabase.rpc as any)("set_topic_event_visibility", { p_event_id: item.id, p_action: show ? "show_photo" : "hide_photo" });
    if (error) queryClient.invalidateQueries({ queryKey: ["event-detail", item.id] });
    queryClient.invalidateQueries({ queryKey: ["events-feed", topicId] });
  };
  const b = item ? dateBadge(item.start_date) : null;
  const ends = detail?.end_date && item && detail.end_date !== item.start_date
    ? `Until ${dayLabel(detail.end_date)}`
    : detail?.end_time ? `Until ${eventTime(detail.end_time)}` : null;

  return (
    <Sheet open={Boolean(item)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="panel" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
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
              <SheetTitle className="text-lg leading-snug">{item.title}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  {item.state === "live" && (
                    <span className="flex flex-wrap gap-2">
                      <DeskBadge tone="primary">In the feed</DeskBadge>
                      {liveAreaFlag(item.exclusion_reason, item.area_confirmed) && <AttentionTag>{liveAreaFlag(item.exclusion_reason, item.area_confirmed)}</AttentionTag>}
                    </span>
                  )}
                  {item.state === "waiting" && (
                    <span className="flex flex-wrap gap-2">
                      <AttentionTag>Needs your OK</AttentionTag>
                      {item.source_api === "reader" && <DeskBadge><UserRound className="h-3.5 w-3.5" aria-hidden="true" />Suggested by a reader</DeskBadge>}
                    </span>
                  )}
                  {item.state === "left_out" && <DeskBadge tone={item.status === "excluded" ? "destructive" : "muted"}>{hiddenReason(item.status, item.exclusion_reason)}</DeskBadge>}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 p-6 text-base">
              {editingPicture && detail && topicId ? (
                <EventPictureEditor eventId={item.id} topicId={topicId} detail={detail} onDone={pictureSaved} onCancel={() => setEditingPicture(false)} />
              ) : (
                <>
                  {photo && <img src={photo} alt="" className="aspect-[2/1] w-full rounded-xl object-cover" />}
                  {detail && (
                    <div className="flex flex-wrap items-center gap-2">
                      {topicId && (
                        <Button variant="outline" size="sm" onClick={() => setEditingPicture(true)}>
                          {photo ? <Crop className="mr-2 h-4 w-4" aria-hidden="true" /> : <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {photo ? "Edit picture" : "Add photo"}
                        </Button>
                      )}
                      {photo && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void setPhoto(false)}>Use illustration</Button>}
                      {detail.image_hidden && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void setPhoto(true)}>Use photo</Button>}
                    </div>
                  )}
                </>
              )}
              {item.state === "live" && liveAreaFlag(item.exclusion_reason, item.area_confirmed) && (
                <p className="rounded-lg bg-attention-soft p-3 text-muted-foreground">{leftOutExplanation("excluded", item.exclusion_reason)}</p>
              )}
              {item.state === "left_out" && (
                <p className="rounded-lg bg-muted p-3 text-muted-foreground">{leftOutExplanation(item.status, item.exclusion_reason)}</p>
              )}
              {topicId && cats && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
                  {cats.categories.map((c) => {
                    const on = (detail?.event_type ?? item.event_type ?? "other") === c;
                    return (
                      <button key={c} type="button" role="radio" aria-checked={on}
                        onClick={() => { if (!on) void setCategory(item.id, c); }}
                        className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          on ? "border-purple-bright bg-purple-bright/10 font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                        <EventCategoryIcon category={c} className="h-5 w-5" title="" />
                        {isEventCategory(c) ? EVENT_CATEGORY_LABELS[c] : c}
                      </button>
                    );
                  })}
                </div>
              )}
              <dl className="space-y-3">
                {item.location && (
                  <div className="flex gap-3"><dt className="sr-only">Where</dt><MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{item.location}</dd></div>
                )}
                {ends && (
                  <div className="flex gap-3"><dt className="sr-only">Ends</dt><Clock className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{ends}</dd></div>
                )}
                {(detail?.price || detail?.is_free) && (
                  <div className="flex gap-3"><dt className="sr-only">Price</dt><Ticket className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{detail.is_free ? "Free" : detail.price}</dd></div>
                )}
              </dl>
              {isLoading ? (
                <div className="space-y-2" aria-hidden="true">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                </div>
              ) : detail ? (
                <DescriptionEditor key={item.id} eventId={item.id} detail={detail} topicId={topicId} />
              ) : null}
              {detail && (
                <EventSocialPack topicId={topicId} event={{
                  title: item.title, start_date: item.start_date, start_time: item.start_time, location: item.location,
                  price: detail.price, is_free: detail.is_free, description: detail.description,
                  event_type: detail.event_type ?? item.event_type, image_path: detail.image_hidden ? null : detail.image_path,
                }} />
              )}
              {topicId && <EventEditorialPanel eventId={item.id} topicId={topicId} />}
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
              {item.state === "live" && liveAreaFlag(item.exclusion_reason, item.area_confirmed) && actions.keepInArea && (
                <Button className="flex-1" onClick={() => done(() => actions.keepInArea!([item]))}>Keep</Button>
              )}
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
export function ComingUpPanel({ toCheck = [], upcoming, leftOut, today, actions, topicId }: {
  toCheck?: DeskEvent[] | undefined; upcoming: ComingUpItem[]; leftOut: DeskEvent[]; today: string; actions: EventActions; topicId?: string | undefined;
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
      {topicId && <CategorySuggestion topicId={topicId} />}
      <ToCheckList events={toCheck} today={today} actions={actions} onOpen={(e) => setOpen({ ...e, state: "waiting" })} />
      <FlaggedList events={upcoming.filter((e) => e.state === "live" && liveAreaFlag(e.exclusion_reason, e.area_confirmed))} today={today} actions={actions} onOpen={setOpen} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Which events">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => choose(t.key)}
            className={cn(
              "truncate rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          <ComingUpEventCard key={`${e.state}-${e.id}`} event={e} today={today} actions={actions} onOpen={() => setOpen(e)} topicId={topicId} />
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

      <EventDetailSheet item={open} today={today} actions={actions} onClose={() => setOpen(null)} topicId={topicId} />
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
            <li key={e.id} className="flex items-center gap-3 py-3">
              <DateTile date={e.start_date} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{e.title}</p>
                <p className="truncate text-sm text-muted-foreground">{[eventTime(e.start_time), e.location].filter(Boolean).join(" · ")}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(e)} aria-label={`Remove “${e.title}” from the feed`}><X className="h-4 w-4" /></Button>
            </li>
          ))}
          <li className="py-3 text-sm text-muted-foreground">
            Past events drop off on their own{liveMore > 0 ? ` · ${liveMore} more published, coming up after these` : ""}.
          </li>
        </ul>
      )}
    </div>
  );
}

/** The Event pool's settings: events on/off, reader suggestions and show in the feed. */
export function EventsSettings({ on, onChange, disabled, suggestOn, onSuggestChange, showInFeed, onShowInFeedChange }: {
  on: boolean; onChange: (on: boolean) => void; disabled?: boolean | undefined;
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
export function EventsOffCard({ onSwitchOn, disabled }: { onSwitchOn: () => void; disabled?: boolean | undefined }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-base">Add what's on to your feed</p>
      <Button size="sm" onClick={onSwitchOn} disabled={disabled}>Switch on</Button>
    </div>
  );
}
