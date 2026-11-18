/**
 * Firecrawl, used only when a site shows our reader a bot check instead of the page
 * (ticket shops behind Cloudflare) and to search for organiser shops.
 * Works with a direct key (fc-…) or a Lovable connection key (lovc_…) via the gateway.
 */

const DIRECT = 'https://api.firecrawl.dev/v2';
const GATEWAY = 'https://connector-gateway.lovable.dev/firecrawl/v2';

function endpoint(): { base: string; headers: Record<string, string> } | null {
  const key = Deno.env.get('FIRECRAWL_API_KEY');
  if (!key) return null;
  if (key.startsWith('lovc_')) {
    const lovable = Deno.env.get('LOVABLE_API_KEY');
    if (!lovable) return null;
    return { base: GATEWAY, headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' } };
  }
  return { base: DIRECT, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export const firecrawlAvailable = () => endpoint() !== null;

/** The page's raw HTML, or null when Firecrawl isn't set up or the page couldn't be read. */
export async function firecrawlRawHtml(url: string, timeoutMs = 45000, retried = false): Promise<string | null> {
  const ep = endpoint();
  if (!ep) return null;
  try {
    const res = await fetch(`${ep.base}/scrape`, {
      method: 'POST', headers: ep.headers, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false }),
    });
    // Per-minute limit: wait as asked (up to 30s) and try once more
    if (res.status === 429 && !retried) {
      const wait = Math.min(30, Number((await res.json().catch(() => ({})))?.retry_after_seconds) || 6);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return firecrawlRawHtml(url, timeoutMs, true);
    }
    if (!res.ok) {
      console.warn(`firecrawl scrape ${url} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    return data?.data?.rawHtml ?? null;
  } catch (e) {
    console.warn('firecrawl scrape error', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Web search result links for a query (no page content). */
export async function firecrawlSearch(query: string, limit = 20): Promise<string[]> {
  const ep = endpoint();
  if (!ep) return [];
  try {
    const res = await fetch(`${ep.base}/search`, {
      method: 'POST', headers: ep.headers, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      console.warn(`firecrawl search failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    const data = await res.json();
    const web = (data?.data?.web ?? data?.data ?? []) as { url?: string }[];
    return Array.isArray(web) ? web.map((r) => r?.url).filter((u): u is string => typeof u === 'string') : [];
  } catch (e) {
    console.warn('firecrawl search error', e instanceof Error ? e.message : e);
    return [];
  }
}

/** Every address Firecrawl can find on a site, subdomains included (no page content). */
export async function firecrawlMap(url: string, limit = 5000): Promise<string[]> {
  const ep = endpoint();
  if (!ep) return [];
  try {
    const res = await fetch(`${ep.base}/map`, {
      method: 'POST', headers: ep.headers, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ url, includeSubdomains: true, limit }),
    });
    if (!res.ok) {
      console.warn(`firecrawl map failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return [];
    }
    const data = await res.json();
    const links = (data?.links ?? []) as ({ url?: string } | string)[];
    return links.map((l) => typeof l === 'string' ? l : l?.url).filter((u): u is string => typeof u === 'string');
  } catch (e) {
    console.warn('firecrawl map error', e instanceof Error ? e.message : e);
    return [];
  }
}
