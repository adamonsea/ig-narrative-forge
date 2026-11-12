import { supabase } from "@/integrations/supabase/client";
import { canTrackReader, getVisitorId } from "@/lib/visitorIdentity";

/** Record one outbound click on an event link. Never blocks the link; skips bots and "Essential only". */
export function recordEventClick(eventId: string): void {
  if (!eventId || !canTrackReader()) return;
  void (supabase.rpc as any)("record_event_click", { p_event_id: eventId, p_visitor_id: getVisitorId("visitor") })
    .then(() => undefined, () => undefined);
}
