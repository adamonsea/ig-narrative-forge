/**
 * Ticketing platforms whose organisers each have their own shop subdomain.
 * Mirrors supabase/functions/scrape-whats-on/platforms.ts (the server decides; this only shapes Add source).
 */
export interface TicketPlatform { domain: string; label: string }

export const TICKET_PLATFORMS: TicketPlatform[] = [
  { domain: "onlineticketseller.com", label: "Online Ticket Seller" },
];

const PLATFORM_SUBDOMAINS = new Set(["www", "app", "admin", "api", "help", "support", "docs", "status", "mail", "blog", "cdn", "assets"]);

const hostOf = (raw: string): string | null => {
  try { return new URL(/^\w+:\/\//.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`).hostname.toLowerCase(); } catch { return null; }
};

/** The platform a link is on (its own site or an organiser's shop), or null. */
export function ticketPlatformOf(raw: string): TicketPlatform | null {
  const host = hostOf(raw);
  if (!host) return null;
  return TICKET_PLATFORMS.find((p) => host === p.domain || host.endsWith(`.${p.domain}`)) ?? null;
}

/** True for an organiser's own shop (grovetheatre.onlineticketseller.com), false for the platform's site. */
export function isOrganiserShop(raw: string): boolean {
  const host = hostOf(raw);
  const p = ticketPlatformOf(raw);
  if (!host || !p || host === p.domain) return false;
  const sub = host.slice(0, -(p.domain.length + 1));
  return Boolean(sub) && !sub.includes(".") && !PLATFORM_SUBDOMAINS.has(sub);
}
