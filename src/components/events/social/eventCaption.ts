import { completeDescription } from "@/lib/eventDescription";
import { dateBlock, eventTime, priceLine } from "@/lib/whatsOn";

export interface SocialEvent {
  title: string;
  start_date: string;
  start_time: string | null;
  location: string | null;
  price?: string | null | undefined;
  is_free?: boolean | null | undefined;
  description?: string | null | undefined;
  event_type?: string | null | undefined;
  image_path?: string | null | undefined;
}

/** "Sat 22 Nov, 20:00" */
export function socialWhen(e: Pick<SocialEvent, "start_date" | "start_time">): string {
  const b = dateBlock(e.start_date);
  return [`${b.weekday} ${b.day} ${b.month}`, eventTime(e.start_time)].filter(Boolean).join(", ");
}

/** Ready-to-post caption: facts first, the tidy description, then where to find more. */
export function eventCaption(e: SocialEvent, opts: { feedName: string; feedUrl: string; currency?: string | null | undefined }): string {
  const facts = [socialWhen(e), e.location, priceLine(e.price, e.is_free, opts.currency)].filter(Boolean);
  const blurb = completeDescription(e.description);
  return [e.title, facts.join(" · "), blurb, `More on ${opts.feedName}: ${opts.feedUrl}`].filter(Boolean).join("\n\n");
}
