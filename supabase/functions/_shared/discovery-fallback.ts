/**
 * Additive discovery fallbacks: news sitemaps, regular sitemaps and JSON-LD
 * listings. These run ONLY after the existing scraping path has returned no
 * articles, and every function here fails soft (returns an empty result) so it
 * can never break a source that already works.
 */

export interface DiscoveredUrl {
  url: string;
  publishedAt?: string;
  title?: string;
}

export interface DiscoveryOutcome {
  method: 'news-sitemap' | 'sitemap' | 'jsonld' | 'none';
  urls: DiscoveredUrl[];
  methodsTried: string[];
  error?: string;
}

const UA = 'eeZee Discovery/1.0 (+https://curatr.pro)';
const FETCH_TIMEOUT_MS = 8000;

async function safeFetch(url: string, accept: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    return text && text.length > 50 ? text : null;
  } catch {
    return null;
  }
}

function originOf(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function withinWindow(dateStr: string | undefined, maxAgeDays: number): boolean {
  if (!dateStr) return true; // unknown date: let the normal age filter decide later
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Parse <url> entries out of a sitemap document. */
function parseUrlSet(xml: string): DiscoveredUrl[] {
  const out: DiscoveredUrl[] = [];
  const blocks = xml.match(/<url[\s>][\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const published =
      block.match(/<news:publication_date>\s*([^<]+?)\s*<\/news:publication_date>/i)?.[1] ||
      block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
    const title = block.match(/<news:title>\s*([^<]+?)\s*<\/news:title>/i)?.[1];
    out.push({ url: loc.trim(), publishedAt: published?.trim(), title: title?.trim() });
  }
  return out;
}

/** Parse child sitemap locations out of a sitemap index. */
function parseSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  const blocks = xml.match(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi) || [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (loc) out.push(loc.trim());
  }
  return out;
}

async function sitemapCandidates(origin: string): Promise<string[]> {
  const candidates = [
    `${origin}/news-sitemap.xml`,
    `${origin}/sitemap-news.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
  ];
  // robots.txt may point somewhere else entirely
  const robots = await safeFetch(`${origin}/robots.txt`, 'text/plain');
  if (robots) {
    for (const line of robots.split('\n')) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m) candidates.push(m[1].trim());
    }
  }
  return Array.from(new Set(candidates)).slice(0, 8);
}

/** Collect recent article URLs from a site's sitemaps. */
export async function discoverFromSitemaps(
  baseUrl: string,
  maxAgeDays: number,
  limit: number,
): Promise<{ method: 'news-sitemap' | 'sitemap' | 'none'; urls: DiscoveredUrl[] }> {
  const origin = originOf(baseUrl);
  if (!origin) return { method: 'none', urls: [] };

  const candidates = await sitemapCandidates(origin);
  for (const candidate of candidates) {
    const xml = await safeFetch(candidate, 'application/xml,text/xml,*/*');
    if (!xml) continue;

    const isNews = /news-sitemap|sitemap-news|<news:/i.test(candidate + xml.slice(0, 2000));

    let entries = parseUrlSet(xml);

    // Sitemap index: follow the two newest child sitemaps only
    if (entries.length === 0) {
      const children = parseSitemapIndex(xml).slice(0, 2);
      for (const child of children) {
        const childXml = await safeFetch(child, 'application/xml,text/xml,*/*');
        if (childXml) entries = entries.concat(parseUrlSet(childXml));
      }
    }

    const fresh = entries
      .filter(e => withinWindow(e.publishedAt, maxAgeDays))
      .filter(e => {
        // skip obvious non-article paths
        const p = e.url.toLowerCase();
        return !/\/(tag|category|author|page)\//.test(p) && !/\.(jpg|png|pdf|xml)$/.test(p);
      })
      .sort((a, b) => Date.parse(b.publishedAt || '0') - Date.parse(a.publishedAt || '0'))
      .slice(0, limit);

    if (fresh.length > 0) {
      return { method: isNews ? 'news-sitemap' : 'sitemap', urls: fresh };
    }
  }
  return { method: 'none', urls: [] };
}

/** Collect article URLs from JSON-LD structured data on a listing page. */
export async function discoverFromJsonLd(
  listingUrl: string,
  limit: number,
): Promise<DiscoveredUrl[]> {
  const html = await safeFetch(listingUrl, 'text/html');
  if (!html) return [];

  const out: DiscoveredUrl[] = [];
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];

  const pushEntry = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const type = String(node['@type'] || '');
    const url = node.url || node['@id'] || node.mainEntityOfPage?.['@id'];
    if (/Article|NewsArticle|BlogPosting|Report/i.test(type) && typeof url === 'string') {
      out.push({ url, title: typeof node.headline === 'string' ? node.headline : undefined, publishedAt: node.datePublished });
    }
    if (Array.isArray(node.itemListElement)) {
      for (const item of node.itemListElement) {
        if (item?.item) pushEntry(item.item);
        else if (typeof item?.url === 'string') out.push({ url: item.url, title: item.name });
      }
    }
  };

  for (const block of blocks) {
    const json = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(json);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
      for (const node of nodes) pushEntry(node);
    } catch {
      // malformed JSON-LD is common; ignore
    }
  }

  const seen = new Set<string>();
  return out
    .filter(e => {
      if (!e.url || seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    })
    .slice(0, limit);
}

/**
 * Run the fallback discovery ladder. Never throws.
 */
export async function discoverArticleUrls(
  sourceUrl: string,
  options: { maxAgeDays?: number; limit?: number } = {},
): Promise<DiscoveryOutcome> {
  const maxAgeDays = options.maxAgeDays ?? 14;
  const limit = Math.min(options.limit ?? 10, 25);
  const methodsTried: string[] = [];

  try {
    methodsTried.push('sitemap');
    const sitemap = await discoverFromSitemaps(sourceUrl, maxAgeDays, limit);
    if (sitemap.urls.length > 0) {
      return { method: sitemap.method as 'news-sitemap' | 'sitemap', urls: sitemap.urls, methodsTried };
    }

    methodsTried.push('jsonld');
    const jsonld = await discoverFromJsonLd(sourceUrl, limit);
    if (jsonld.length > 0) {
      return { method: 'jsonld', urls: jsonld, methodsTried };
    }

    return { method: 'none', urls: [], methodsTried };
  } catch (error) {
    return {
      method: 'none',
      urls: [],
      methodsTried,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
