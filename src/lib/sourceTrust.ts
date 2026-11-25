/**
 * "Trust everything" guardrail: only sources about the feed's subject may skip
 * the keyword check. Broad sites always keep keyword filtering.
 */
const BROAD_SITES = [
  "polygon.com", "ign.com", "kotaku.com", "theverge.com", "eurogamer.net", "gamespot.com", "pcgamer.com",
  "vice.com", "buzzfeed.com", "bbc.co.uk", "bbc.com", "theguardian.com", "dailymail.co.uk", "independent.co.uk",
  "telegraph.co.uk", "thesun.co.uk", "mirror.co.uk", "metro.co.uk", "sky.com", "cnn.com", "nytimes.com",
  "forbes.com", "reuters.com", "apnews.com", "yahoo.com", "msn.com", "screenrant.com", "cbr.com",
  "gamerant.com", "bleedingcool.com", "animenewsnetwork.com", "techradar.com", "wired.com",
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function hostOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

export function isBroadSite(url: string): boolean {
  const h = hostOf(url);
  return Boolean(h) && BROAD_SITES.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True when the source's name or address carries one of the feed's subject words (4-letter stem match). */
export function isAboutSubject(source: { url: string; name?: string }, subjectTerms: string[]): boolean {
  const hay = norm(`${hostOf(source.url)} ${source.name ?? ""}`);
  return subjectTerms.some((t) => {
    const w = norm(t);
    return w.length >= 4 && hay.includes(w.slice(0, Math.min(w.length, 4)));
  });
}

export type TrustVerdict = "allowed" | "broad";

/** Regional feeds: local outlets are about the area, so only known broad sites are blocked. */
export function trustVerdict(source: { url: string; name?: string }, subjectTerms: string[], regional = false): TrustVerdict {
  if (isBroadSite(source.url)) return "broad";
  if (regional) return "allowed";
  return isAboutSubject(source, subjectTerms) ? "allowed" : "broad";
}
