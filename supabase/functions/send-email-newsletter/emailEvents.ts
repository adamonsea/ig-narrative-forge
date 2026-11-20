/**
 * Picture-led event cards for events-focused briefing emails (events-led feeds, or no news).
 * Pure: takes the picked events plus their stored details and returns what the card shows.
 * Picture = Curatr's stored copy of the listing photo (as JPEG via the email image proxy),
 * otherwise the category illustration on the feed's illustration tint (same colour as the feed).
 */
import { eventIllustrationTint, feedBrandPalette, type RGB } from '../_shared/feedBrandColor.ts';
import { formatPrice } from '../_shared/currency.ts';
import { eventArtUrl } from './eventArt.ts';

export const CATEGORY_LABELS: Record<string, string> = {
  music: 'Music', family: 'Family', sport: 'Sport', 'food-drink': 'Food & drink',
  'arts-theatre': 'Arts & theatre', film: 'Film', talks: 'Talks', nightlife: 'Nightlife',
  outdoors: 'Outdoors', markets: 'Markets', comedy: 'Comedy', workshops: 'Workshops', other: 'Other',
};

export const EMAIL_DESCRIPTION_CHARS = 180;

export interface BaseEmailEvent {
  id: string;
  title: string;
  date_label: string;
  time_label: string;
  location: string | null;
  url: string | null;
}

export interface EventDetails {
  id: string;
  description: string | null;
  event_type: string | null; // the event's category key (same field the feed cards read)
  price: string | null;
  is_free: boolean | null;
  image_path: string | null;
  image_hidden: boolean | null;
  source_name: string | null;
}

export interface RichEmailEvent extends BaseEmailEvent {
  category_label: string | null;
  photo_url: string | null;
  art_url: string;
  description: string | null;
  price_label: string | null;
  source_name: string | null;
}

export interface EmailBrand {
  fill: string;
  onFill: string;
  accent: string;
  tint: string;
}

const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/** The feed's colours for the email, from the same rules the feed cards use. */
export function emailBrand(color: string | null | undefined): EmailBrand {
  const p = feedBrandPalette(color).light;
  return { fill: hex(p.fill), onFill: hex(p.onFill), accent: hex(p.text), tint: hex(eventIllustrationTint(color)) };
}

export function isStoredEventPhoto(path: string | null | undefined): path is string {
  return Boolean(path) && /^[0-9a-f-]{36}\/events\/[0-9a-f-]{36}(-v\d+)?\.(webp|jpg)$/i.test(path as string);
}

/** Stored WebP → 1200×480 JPEG (2× a 600px email), cropped to fill like the art band. */
export function emailPhotoUrl(supabaseUrl: string, path: string): string {
  const src = `${supabaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/storage/v1/object/public/topic-assets/${path}`;
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=1200&h=480&fit=cover&output=jpg&q=72`;
}

export function shortDescription(text: string | null | undefined, max = EMAIL_DESCRIPTION_CHARS): string | null {
  const t = (text ?? '')
    .replace(/<[^>]*>?/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export function enrichEmailEvents(
  events: BaseEmailEvent[],
  details: EventDetails[],
  opts: { supabaseUrl: string; origin: string; currency: unknown },
): RichEmailEvent[] {
  const byId = new Map(details.map((d) => [d.id, d]));
  return events.map((e) => {
    const d = byId.get(e.id);
    const category = d?.event_type && CATEGORY_LABELS[d.event_type] ? d.event_type : null;
    const photo = d && !d.image_hidden && isStoredEventPhoto(d.image_path) ? emailPhotoUrl(opts.supabaseUrl, d.image_path) : null;
    return {
      ...e,
      category_label: category && category !== 'other' ? CATEGORY_LABELS[category] : null,
      photo_url: photo,
      art_url: eventArtUrl(category, opts.origin),
      description: shortDescription(d?.description),
      price_label: d ? formatPrice(d.price, d.is_free, opts.currency) : null,
      source_name: d?.source_name ?? null,
    };
  });
}
