/**
 * Finds the photo credit a source site gives for its lead picture.
 * Rules only (no model): JSON-LD ImageObject credit fields, then the
 * caption/credit text beside the matching <img>, then meta tags.
 * Returns plain text (no "Photo:" prefix) or undefined when the site names nobody.
 */

const MAX_LEN = 80;

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&copy;|&#169;/g, "©")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip "Photo:", "Picture:", "Credit:", "Image:", "©" prefixes and tidy. */
export function cleanCredit(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let s = decode(raw);
  s = s.replace(/^(?:photo(?:graph)?s?|pictures?|pics?|images?|credits?|copyright)\s*(?:by|credit)?\s*[:\-–—]?\s*/i, "");
  s = s.replace(/^©\s*/, "").replace(/^\(c\)\s*/i, "");
  s = s.replace(/[.\s]+$/, "").trim();
  if (s.length < 2 || s.length > MAX_LEN) return undefined;
  if (/^https?:\/\//i.test(s)) return undefined;
  return s;
}

function nameOf(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return nameOf(v[0]);
  if (typeof v === "object") return typeof v.name === "string" ? v.name : undefined;
  return undefined;
}

function creditFromImageObject(img: any): string | undefined {
  if (!img || typeof img !== "object") return undefined;
  return cleanCredit(img.creditText) ||
    cleanCredit(nameOf(img.copyrightHolder)) ||
    cleanCredit(nameOf(img.creator)) ||
    cleanCredit(nameOf(img.author)) ||
    cleanCredit(img.copyrightNotice);
}

function fileKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const path = new URL(url, "https://x.invalid").pathname;
    const last = path.split("/").filter(Boolean).pop() || "";
    const stem = last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]\d+x\d+$/, "");
    return stem.length >= 4 ? stem.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function imageUrlOf(img: any): string | undefined {
  if (!img) return undefined;
  if (typeof img === "string") return img;
  if (typeof img === "object") return img.url || img.contentUrl || img["@id"];
  return undefined;
}

function walk(node: any, visit: (n: any) => void, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit, depth + 1)); return; }
  if (typeof node !== "object") return;
  visit(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, visit, depth + 1);
}

/** JSON-LD: an ImageObject (or an article's image) with credit fields. */
export function creditFromJsonLd(html: string, imageUrl?: string): string | undefined {
  const key = fileKey(imageUrl);
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  let firstAny: string | undefined;
  for (const script of scripts) {
    const json = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let data: any;
    try { data = JSON.parse(json); } catch { continue; }
    let matched: string | undefined;
    walk(data, (n) => {
      if (matched) return;
      const t = n["@type"];
      const isImage = t === "ImageObject" || (Array.isArray(t) && t.includes("ImageObject"));
      if (!isImage) return;
      const c = creditFromImageObject(n);
      if (!c) return;
      const k = fileKey(imageUrlOf(n));
      if (key && k && (k === key || k.includes(key) || key.includes(k))) matched = c;
      else if (!firstAny) firstAny = c;
    });
    if (matched) return matched;
  }
  return firstAny;
}

/** Caption or credit element near the <img> that shows the lead picture. */
export function creditFromCaption(html: string, imageUrl?: string): string | undefined {
  const key = fileKey(imageUrl);
  if (!key) return undefined;
  const figures = html.match(/<figure\b[\s\S]*?<\/figure>/gi) || [];
  for (const fig of figures) {
    if (!fig.toLowerCase().includes(key)) continue;
    const creditEl = fig.match(/<[^>]+class=["'][^"']*(?:credit|byline|copyright|photographer)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/i)?.[1];
    const fromEl = cleanCredit(creditEl);
    if (fromEl) return fromEl;
    const caption = decode(fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || "");
    const labelled = caption.match(/(?:photo(?:graph)?|picture|pic|image|credit)\s*(?:by|credit)?\s*[:\-–—]\s*([^|.;()]{2,80})/i)?.[1] ||
      caption.match(/©\s*([^|.;()]{2,80})/)?.[1] ||
      caption.match(/\(\s*(?:photo|picture|pic|image)\s*[:\-]?\s*([^)]{2,80})\)/i)?.[1];
    const fromCaption = cleanCredit(labelled);
    if (fromCaption) return fromCaption;
  }
  return undefined;
}

function metaContent(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i");
  return html.match(re)?.[1] || html.match(re2)?.[1];
}

export function findPhotoCredit(html: string | null | undefined, imageUrl?: string | null): string | undefined {
  if (!html || !imageUrl) return undefined;
  try {
    return creditFromJsonLd(html, imageUrl) ||
      creditFromCaption(html, imageUrl) ||
      cleanCredit(metaContent(html, "og:image:credit")) ||
      cleanCredit(metaContent(html, "image:credit")) ||
      cleanCredit(metaContent(html, "dc.rights.photo"));
  } catch {
    return undefined;
  }
}

/** Arc promo item: credits.by[].name */
export function creditFromArcPromo(item: any): string | undefined {
  const by = item?.credits?.by;
  if (!Array.isArray(by)) return undefined;
  const names = by.map((c: any) => (typeof c?.name === "string" ? c.name.trim() : "")).filter(Boolean);
  return cleanCredit(Array.from(new Set(names)).join(", "));
}
