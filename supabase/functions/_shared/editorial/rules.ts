/** Genre, flags and synopsis checks for editorial profiles — pure rules, no AI. */
export interface GenreRule { name: string; from: string[] }
export type FlagRule = "free" | "kids" | "english" | "festival";

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** First genre whose source words appear in the event's raw tags/category. Null → AI suggestion + review flag. */
export function mapGenre(genres: readonly GenreRule[], tags: readonly (string | null | undefined)[]): string | null {
  const hay = tags.map(norm).filter(Boolean);
  for (const g of genres) {
    for (const w of g.from.map(norm)) if (w && hay.some((t) => t === w || t.split(/[,;/|]\s*/).includes(w) || new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) return g.name;
  }
  return null;
}

const KIDS = /\b(criancas|crianca|infantil|familias?|kids|children|family)\b/;
const ENGLISH = /\b(in english|em ingles|english subtitles|legendas em ingles|legendado em ingles|sem palavras|no language|without words|english[- ]friendly)\b/;

/** Flags set from the source only; English-friendly needs the source to say so. */
export function deriveFlags(rules: Record<string, FlagRule>, e: { is_free?: boolean | null; festival?: string | null; source_tags?: readonly string[] | null; sourceText?: string | null }): string[] {
  const tags = norm((e.source_tags ?? []).join(" "));
  const text = norm(e.sourceText);
  const out: string[] = [];
  for (const [label, rule] of Object.entries(rules)) {
    if (rule === "free" && e.is_free === true) out.push(label);
    else if (rule === "festival" && e.festival?.trim()) out.push(label);
    else if (rule === "kids" && KIDS.test(tags)) out.push(label);
    else if (rule === "english" && ENGLISH.test(`${tags} ${text}`)) out.push(label);
  }
  return out;
}

const PROMO = /\b(unmissable|unforgettable|don'?t miss|must[- ]see|great energy|amazing|incredible|imperdivel|inesquecivel|nao perca|a nao perder|incrivel|espetacular|fantastico)\b/;
const PT_BR = /\b(voce|voces|onibus|trem|tela|garota|legal|a gente|ingressos?|diretora?|cardapio|celular|banheiro|estreia mundial no brasil)\b/;
const PT_BR_GERUND = /\b(esta|estao|estou|estamos)\s+\w+(ando|endo|indo)\b/;

export function sentences(text: string): string[] {
  // Initials ("J.S. Bach", "S. Paulo") are not sentence ends
  return text.trim().split(/(?<=[.!?…])(?<!(?:^|[\s.])[A-ZÀ-Ý]\.)\s+(?=[A-ZÀ-Ý"“(])/).filter((s) => s.trim());
}
export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** True when any 8 consecutive words of the synopsis appear in the source text. */
export function copiesSource(synopsis: string, source: string, n = 8): boolean {
  const w = norm(synopsis).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const src = ` ${norm(source).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ")} `;
  for (let i = 0; i + n <= w.length; i++) if (src.includes(` ${w.slice(i, i + n).join(" ")} `)) return true;
  return false;
}

/** Review flags for one synopsis. Empty list = passes every automatic check. */
export function synopsisFlags(text: string, lang: string, ctx: { sourceText: string; eventDate: string; postDate: string }): string[] {
  const L = lang.slice(0, 2).toUpperCase();
  const t = text.trim();
  if (!t) return [`Synopsis missing (${L})`];
  const n = norm(t);
  const flags: string[] = [];
  if (sentences(t).length !== 2) flags.push(`Synopsis not 2 sentences (${L})`);
  const wc = wordCount(t);
  if (wc < 35 || wc > 70) flags.push(`Synopsis ${wc} words (${L})`);
  if (t.includes("!")) flags.push(`Exclamation mark (${L})`);
  if (t.includes("?")) flags.push(`Question in synopsis (${L})`);
  if (PROMO.test(n)) flags.push(`Promo wording (${L})`);
  if (L === "PT" && lang.toLowerCase() !== "pt-br" && (PT_BR.test(n) || PT_BR_GERUND.test(n))) flags.push("Possible Brazilian Portuguese");
  if (ctx.eventDate !== ctx.postDate && /\b(hoje|today|tonight|esta noite)\b/.test(n)) flags.push(`"Today" used but not posting that day (${L})`);
  if (copiesSource(t, ctx.sourceText)) flags.push(`Copies source wording (${L})`);
  return flags;
}

/** Fact-safety flags: what the caption had to leave out, or a fact that needs a look. */
export function factFlags(e: { start_time?: string | null; price?: string | null; is_free?: boolean | null; location?: string | null; description?: string | null }, currency?: string | null): string[] {
  const f: string[] = [];
  if (!e.start_time) f.push("Start time unconfirmed");
  if (e.is_free !== true && !e.price?.trim()) f.push("Price not stated");
  else if (e.is_free !== true && currencyMissing(e.price, currency)) f.push("Currency not stated");
  if (!e.location?.trim()) f.push("Venue not stated");
  if (descriptionCutOff(e.description)) f.push("Description cut off");
  return f;
}

/** A price is fine with a currency symbol/code, a free word, or the feed's own currency; only a bare number without either is flagged. */
export function currencyMissing(price: string | null | undefined, currency?: string | null): boolean {
  const p = norm(price);
  if (!p || !/\d/.test(p)) return false;
  if (/[€£$]|\b(eur|euros?|gbp|usd|libras?|pounds?)\b/.test(p)) return false;
  if (/\b(gratis|gratuito|gratuita|free|entrada livre)\b/.test(p)) return false;
  return !currency;
}

/** The stored description stops mid-way ("…" / "..."). */
export function descriptionCutOff(d: string | null | undefined): boolean {
  return /(\.\.\.|…)\s*$/.test((d ?? "").trim());
}

/** Model flags that code decides instead (currency, cut-off text, missing time/price) are dropped. */
export function keepModelFlag(flag: string): boolean {
  return !/currency|cut off|truncat|start time|time (not|unconfirmed)|price not/i.test(flag);
}
