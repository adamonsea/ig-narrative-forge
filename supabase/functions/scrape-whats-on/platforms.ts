/**
 * Ticketing platforms (pure rules, no network). Many small organisers sell through a
 * white-label ticket shop on their own subdomain (grovetheatre.onlineticketseller.com).
 * The organiser's subdomain is a source; the platform's own site is not.
 */

export interface TicketPlatform {
  /** Registrable domain, e.g. onlineticketseller.com */
  domain: string;
  /** Plain name for messages */
  label: string;
}

export const TICKET_PLATFORMS: TicketPlatform[] = [
  { domain: 'onlineticketseller.com', label: 'Online Ticket Seller' },
];

/** Subdomains that belong to the platform itself, never an organiser. */
const PLATFORM_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'help', 'support', 'docs', 'status', 'mail', 'blog', 'cdn', 'assets']);

function hostOf(raw: string): string | null {
  try {
    const u = new URL(/^\w+:\/\//.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The ticketing platform a link is on (its own site or an organiser's shop), or null. */
export function platformOf(raw: string): TicketPlatform | null {
  const host = hostOf(raw);
  return host ? platformFor(host) : null;
}

function platformFor(host: string): TicketPlatform | null {
  return TICKET_PLATFORMS.find((p) => host === p.domain || host.endsWith(`.${p.domain}`)) ?? null;
}

/** The organiser's shop address (https://<organiser>.<platform>) or null when it isn't one. */
export function ticketShopOrigin(raw: string): string | null {
  const host = hostOf(raw);
  if (!host) return null;
  const p = platformFor(host);
  if (!p || host === p.domain) return null;
  const sub = host.slice(0, -(p.domain.length + 1));
  if (!sub || sub.includes('.') || PLATFORM_SUBDOMAINS.has(sub)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return null;
  return `https://${host}`;
}

/** A plain sentence when someone pastes the platform's own site instead of an organiser's page. */
export function platformRootNudge(raw: string): string | null {
  const host = hostOf(raw);
  if (!host) return null;
  const p = platformFor(host);
  if (!p) return null;
  if (ticketShopOrigin(raw)) return null;
  return `That's ${p.label}'s own site. Paste an organiser's page instead, like grovetheatre.${p.domain}.`;
}

/** Organiser shop addresses found in a list of links (search results), de-duplicated, in order. */
export function organiserShops(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const o = ticketShopOrigin(u);
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

/** Search queries that find organiser shops for a place or subject (all platforms, or just one). */
export function discoveryQueries(term: string, platforms: TicketPlatform[] = TICKET_PLATFORMS): string[] {
  const t = term.replace(/["']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  return platforms.map((p) => `site:${p.domain} ${t}`);
}
