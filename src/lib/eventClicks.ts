import { supabase } from "@/integrations/supabase/client";
import { canTrackReader, getVisitorId } from "@/lib/visitorIdentity";

/** What a reader did with an event: went to buy tickets, went for details, or saved it to their calendar. */
export type EventClickKind = "tickets" | "details" | "calendar";

/** Pure: a link out counts as tickets when the listing has a price and isn't free; otherwise details. */
export function eventLinkKind(e: { price?: string | null | undefined; is_free?: boolean | null | undefined }): EventClickKind {
  return e.price && e.price.trim() && !e.is_free ? "tickets" : "details";
}

/** Record one event action. Never blocks the link; skips bots and readers who aren't counted. */
export function recordEventClick(eventId: string, kind: EventClickKind = "details"): void {
  if (!eventId || !canTrackReader()) return;
  void (supabase.rpc as any)("record_event_click", { p_event_id: eventId, p_visitor_id: getVisitorId("visitor"), p_kind: kind })
    .then(() => undefined, () => undefined);
}
