/**
 * Finding a page's own calendar data (pure helpers, no network).
 *
 * Many venue sites (Umbraco, Knockout, FullCalendar, WordPress plugins …) send an
 * empty page and load their listings afterwards from a JSON address named in
 * their own scripts. We read those scripts, pick out same-site data addresses
 * that look like event listings, and the network side (read.ts) asks them for
 * JSON exactly as the page itself would. Read-only addresses on the same site
 * only; robots.txt is still respected for every one.
 */

const MAX_SCRIPTS = 6;
const MAX_ENDPOINTS = 5;

/** Words that say "this address returns data" rather than a page or a file. */
const DATA_HINT = /(\/api\/|\/ajax|ajax_|\/json|\.json\b|\/feed\b|\/rest\/|wp-json|graphql|\/services?\/|\/handlers?\/|\.ashx\b|\.php\b|\/data\/)/i;
/** Words that say "this is about events". */
const EVENT_HINT = /(event|calendar|whats-?on|listing|performance|show|production|gig|concert|programme|diary|agenda|schedule|find|search)/i;
/** Never call anything that might record, change or sign up. */
const UNSAFE = /(\blog(in|out)?\b|track|analytic|collect|subscribe|signup|sign-up|register|cart|basket|checkout|newsletter|contact|cookie|consent|captcha|payment|account|admin|delete|update|save|submit|vote|like|share|upload)/i;
const STATIC_FILE = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|eot|ico|map|html?|aspx|xml|pdf|mp4|mp3)(\?|#|$)/i;

function sameOrigin(href: string, pageUrl: string): string | null {
  try {
    const u = new URL(href, pageUrl);
    const page = new URL(pageUrl);
    if (u.hostname.replace(/^www\./, '') !== page.hostname.replace(/^www\./, '')) return null;
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** The site's own script files (CDN libraries are skipped — they never name the site's data). */
export function siteScriptUrls(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = sameOrigin(m[1].replace(/&amp;/g, '&'), pageUrl);
    if (!abs) continue;
    const path = new URL(abs).pathname.toLowerCase();
    if (/(jquery|knockout|bootstrap|modernizr|polyfill|masonry|imagesloaded|cookie|consent|analytics|gtag|recaptcha|swiper|slick|lazysizes|wp-includes)/.test(path)) continue;
    if (!out.includes(abs)) out.push(abs);
  }
  // Files that sound like calendars first
  return out.sort((a, b) => Number(EVENT_HINT.test(b)) - Number(EVENT_HINT.test(a))).slice(0, MAX_SCRIPTS);
}

/** Inline <script> bodies (settings blocks often hold the data address). */
export function inlineScripts(html: string): string {
  const out: string[] = [];
  const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!/application\/ld\+json/i.test(m[0])) out.push(m[1]);
  }
  return out.join('\n').slice(0, 300_000);
}

function looksLikeDataAddress(abs: string): boolean {
  const u = new URL(abs);
  const pathAndQuery = u.pathname + u.search;
  if (STATIC_FILE.test(u.pathname)) return false;
  if (UNSAFE.test(pathAndQuery)) return false;
  return DATA_HINT.test(pathAndQuery) && EVENT_HINT.test(pathAndQuery);
}

/**
 * Same-site data addresses named in the page and its scripts, most likely first.
 * Handles plain strings ('/api/events') and the common base + name pattern
 * (var base = '/Umbraco/Api/Events/'; … base + 'Find').
 */
export function findDataEndpoints(scripts: string[], html: string, pageUrl: string): string[] {
  const found = new Map<string, number>();
  const add = (raw: string, bonus = 0) => {
    const abs = sameOrigin(raw.trim(), pageUrl);
    if (!abs || !looksLikeDataAddress(abs)) return;
    const score = bonus + (/(event|calendar|whats-?on)/i.test(abs) ? 2 : 0) + (/(find|list|search|all|upcoming)/i.test(abs) ? 1 : 0);
    found.set(abs, Math.max(found.get(abs) ?? -1, score));
  };

  for (const code of scripts) {
    // name = '/some/path/'  (var/let/const, object keys, assignments)
    const vars = new Map<string, string>();
    const assign = /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(['"`])((?:https?:\/\/[^'"`\s]+)?\/[^'"`\s]{2,200})\2/g;
    let m: RegExpExecArray | null;
    while ((m = assign.exec(code))) vars.set(m[1], m[3]);
    // base + 'Name'
    const concat = /\b([A-Za-z_$][\w$]*)\s*\+\s*(['"`])([\w\-./?=&]{1,80})\2/g;
    const bases = new Set<string>();
    while ((m = concat.exec(code))) {
      const base = vars.get(m[1]);
      if (base) { add(base + m[3], 1); bases.add(base); }
    }
    // Any other quoted path (a base that is only ever extended isn't an address on its own)
    const literal = /(['"`])((?:https?:\/\/[^'"`\s]+)?\/[^'"`\s<>]{2,200})\1/g;
    while ((m = literal.exec(code))) if (!bases.has(m[2])) add(m[2]);
  }

  // WordPress "The Events Calendar" publishes a standard listings address
  if (/wp-content|api\.w\.org/i.test(html) && /tribe|the-events-calendar|tec-/i.test(html)) {
    add(new URL('/wp-json/tribe/events/v1/events?per_page=50', pageUrl).toString(), 3);
  }

  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, MAX_ENDPOINTS);
}

// ---------- WordPress sites with their own events list ----------

/** The site's WordPress data address, when the page names one (<link rel="https://api.w.org/" …>). */
export function wpRestBase(html: string, pageUrl: string): string | null {
  const tag = html.match(/<link\b[^>]*rel=["']?https:\/\/api\.w\.org\/?["']?[^>]*>/i)?.[0];
  if (!tag) return null;
  const href = tag.match(/href=["']?([^"'\s>]+)/i)?.[1];
  const abs = href ? sameOrigin(href.replace(/&amp;/g, '&'), pageUrl) : null;
  return abs && /\/wp-json\/?$/i.test(new URL(abs).pathname) ? abs.replace(/\/?$/, '/') : null;
}

/**
 * Event lists a WordPress site publishes under its own name ("/agendalx/v1/events",
 * "/tribe/events/v1/events"), picked from the routes in its data index. Core post
 * listings (/wp/v2/…) are skipped: their dates are publish dates, not event dates.
 * The pasted page's language (?lang=en) is carried over so titles match the page.
 */
export function wpEventLists(routes: string[], restBase: string, pageUrl: string): string[] {
  let lang: string | null = null;
  try { lang = new URL(pageUrl).searchParams.get('lang'); } catch { /* ignore */ }
  return routes
    .filter((r) => /^\/[\w-]+(\/[\w-]+)?\/v\d+\/events?$/i.test(r) && !/^\/wp\//i.test(r) && !UNSAFE.test(r))
    .slice(0, 2)
    .map((r) => {
      const u = new URL(restBase + r.replace(/^\//, ''));
      u.searchParams.set('per_page', '50');
      if (lang && /^[a-z]{2}(-[a-z]{2})?$/i.test(lang)) u.searchParams.set('lang', lang);
      return u.toString();
    });
}
