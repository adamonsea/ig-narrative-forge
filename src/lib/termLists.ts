// Rules for the two "What we look for" lists (More of this / Less of this).
// Pure functions so the behaviour is testable: one spelling per term, never in
// both lists, and long lists stay short on screen.

export type ListName = "more" | "less";

/** How a term is stored and compared: single spaces, trimmed, lower-case, at most 40 characters. */
export function normaliseTerm(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
}

export function hasTerm(list: string[], term: string): boolean {
  const t = normaliseTerm(term);
  return !!t && list.some((x) => normaliseTerm(x) === t);
}

/** Drops repeat spellings ("Eastbourne" / "eastbourne "), keeping the first one as saved. */
export function dedupeTerms(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of list) {
    const key = normaliseTerm(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** Removes every spelling of a term. */
export function removeTerm(list: string[], term: string): string[] {
  const t = normaliseTerm(term);
  return list.filter((x) => normaliseTerm(x) !== t);
}

/**
 * Adds a term to one list. If it was in the other list it moves across, so the
 * two lists can never contradict each other.
 */
export function addToList(
  lists: { more: string[]; less: string[] },
  target: ListName,
  term: string,
): { more: string[]; less: string[]; added: boolean; movedFrom: ListName | null } {
  const t = normaliseTerm(term);
  const other: ListName = target === "more" ? "less" : "more";
  if (!t || hasTerm(lists[target], t)) return { ...lists, added: false, movedFrom: null };
  const movedFrom = hasTerm(lists[other], t) ? other : null;
  const next = { ...lists, [target]: [...dedupeTerms(lists[target]), t], [other]: removeTerm(lists[other], t) } as { more: string[]; less: string[] };
  return { ...next, added: true, movedFrom };
}

/** Lists longer than this collapse on screen. */
export const COLLAPSE_AFTER = 12;
/** How many terms a collapsed list shows. */
export const COLLAPSED_SHOWS = 10;

/** Which terms to show: everything for short lists, the first 10 for long ones, or every match while searching. */
export function visibleTerms(list: string[], opts: { query?: string; showAll?: boolean } = {}): { shown: string[]; hidden: number; collapsible: boolean } {
  const terms = dedupeTerms(list);
  const collapsible = terms.length > COLLAPSE_AFTER;
  const q = normaliseTerm(opts.query ?? "");
  if (q) {
    const shown = terms.filter((t) => normaliseTerm(t).includes(q));
    return { shown, hidden: 0, collapsible };
  }
  if (!collapsible || opts.showAll) return { shown: terms, hidden: 0, collapsible };
  return { shown: terms.slice(0, COLLAPSED_SHOWS), hidden: terms.length - COLLAPSED_SHOWS, collapsible };
}

/** Suggestions worth offering: not dismissed and not already in either list. */
export function freshSuggestions<T extends { value: string }>(suggestions: T[], lists: { more: string[]; less: string[] }, dismissed: Record<string, boolean>, max = 6): T[] {
  return suggestions
    .filter((s) => !dismissed[s.value] && !dismissed[normaliseTerm(s.value)] && !hasTerm(lists.more, s.value) && !hasTerm(lists.less, s.value))
    .slice(0, max);
}
