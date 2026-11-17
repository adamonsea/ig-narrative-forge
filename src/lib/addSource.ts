/** Pure helpers for the Add source wizard (tested in addSource.test.ts). */

/** Host of a pasted link without "www.", or "" when it isn't a usable link yet. */
export function addSourceHost(raw: string): string {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return '';
  try {
    const u = new URL(/^(https?|webcal):\/\//i.test(t) ? t.replace(/^webcal:/i, 'https:') : `https://${t}`);
    return u.hostname.includes('.') ? u.hostname.replace(/^www\./, '').toLowerCase() : '';
  } catch {
    return '';
  }
}

/** A starting name from the link: "eastbourne-herald.co.uk" → "Eastbourne Herald". */
export function addSourceNameFromLink(raw: string): string {
  const host = addSourceHost(raw);
  if (!host) return '';
  const parts = host.split('.');
  const generic = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'uk', 'io', 'news', 'info']);
  const label = parts.find((p, i) => i < parts.length - 1 && !generic.has(p) && !['feeds', 'rss', 'news', 'm'].includes(p)) || parts[0];
  return label.split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
