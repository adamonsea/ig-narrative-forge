/**
 * Event descriptions that read as finished thoughts.
 *
 * Listings arrive with long, rambling or cut-off text. Cards show only whole
 * sentences up to `max` characters; if even the first sentence is too long, the
 * text ends on a whole word with an ellipsis. Never rewrites words, so dates and
 * prices stay exactly as the listing (or the owner) wrote them.
 */
export const EVENT_DESCRIPTION_MAX = 220;

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "sr", "jr", "no", "vs", "approx", "e.g", "i.e", "etc", "av", "r", "sto", "sta", "prof"]);

/** Indices just after each sentence end (., !, ? or … followed by a space and a fresh start). */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!".!?…".includes(ch!)) continue;
    let j = i + 1;
    while (j < text.length && `"'”’)]`.includes(text[j]!)) j++;
    if (j >= text.length) { ends.push(j); continue; }
    if (!/\s/.test(text[j]!)) continue;
    const next = text.slice(j).trimStart()[0] ?? "";
    if (!/[\p{Lu}\p{N}"'“‘(¡¿]/u.test(next)) continue;
    if (ch === ".") {
      const word = text.slice(0, i).split(/\s/).pop()?.toLowerCase() ?? "";
      if (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word)) continue;
    }
    ends.push(j);
  }
  return ends;
}

export function completeDescription(raw: string | null | undefined, max = EVENT_DESCRIPTION_MAX): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const fit = sentenceEnds(text).filter((e) => e <= max);
  if (fit.length) return text.slice(0, fit[fit.length - 1]).trim();
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, "")}…`;
}
