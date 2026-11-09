/**
 * Clean closing slide: story text, then "By {reporter}" when we know them.
 *
 * Older stories were written with a reader prompt at the end ("Discuss with
 * others…", "Share this update…"). We remove those at render time, without
 * touching the stored copy, using deliberately narrow rules:
 *  - "Source:" / "Sources:" credit sentences are hidden anywhere on the last
 *    slide (the byline and publisher button carry the credit);
 *  - then only the last two remaining sentences are prompt candidates;
 *  - the sentence must START with a known prompt opener;
 *  - it is kept if it carries practical detail (numbers, contact, links);
 *  - it is kept if the slide reads as a police / public-safety /
 *    missing-person appeal — sharing those genuinely helps.
 */

const PROMPT_OPENERS =
  /^(?:share\s+(?:this|the|details|your|with)\b|discuss\s+(?:with|the|your|this)\b|explore\s+(?:further|the|more)\b|read\s+more\b)/i;

/** Model-written credit sentence: must START with "Source:" or "Sources:". */
const SOURCE_SENTENCE = /^\W{0,3}sources?\s*:/i;

/** "Have you …?" — only when the sentence is a question. */
const QUESTION_OPENER = /^have\s+you\b.*\?$/i;

/** Practical detail inside the sentence itself. */
const DETAIL_PROTECT =
  /\d|\b(?:quote|quoting|serial|contact|call|calling|report\s+it)\b|https?:\/\/|www\.|\b[\w-]+\.(?:co\.uk|com|org|gov\.uk|net)\b|@/i;

/** Appeal / public-safety context — anywhere on the slide keeps share asks. */
const APPEAL_PROTECT =
  /\b(?:appeal(?:s|ing)?|missing|trace|find|witness(?:es)?|sightings?|police|officers?|101|999)\b/i;

const splitSentences = (text: string): string[] =>
  // A sentence ends at . ! ? (plus closing quotes) followed by whitespace or the end,
  // so "eastbournetheatres.co.uk" or "£2.50" are never split.
  text.split(/(?<=[.!?]["'’”)]*)\s+/).map((s) => s.trim()).filter(Boolean);

const isReaderPrompt = (sentence: string, slideText: string): boolean => {
  const s = sentence.trim();
  if (!(PROMPT_OPENERS.test(s) || QUESTION_OPENER.test(s))) return false;
  if (DETAIL_PROTECT.test(s)) return false;
  if (APPEAL_PROTECT.test(slideText)) return false; // appeal wording anywhere on the slide
  return true;
};

export interface PromptStripResult {
  text: string;
  removed: string[];
}

/** Remove "Source:" credits and AI-written reader prompts from the last slide. */
export const stripReaderPrompts = (content: string, appealContext: string = content): PromptStripResult => {
  if (!content || /<[a-z]/i.test(content)) return { text: content, removed: [] };
  const removed: string[] = [];
  const sentences = splitSentences(content).filter((s) => {
    if (SOURCE_SENTENCE.test(s)) { removed.push(s); return false; }
    return true;
  });
  const start = Math.max(0, sentences.length - 2); // last two remaining sentences only
  const kept = sentences.filter((s, i) => {
    if (i >= start && isReaderPrompt(s, appealContext)) {
      removed.push(s);
      return false;
    }
    return true;
  });
  return removed.length ? { text: kept.join(' '), removed } : { text: content, removed };
};

/** True when nothing readable is left (empty, or punctuation/whitespace only). */
export const isEmptySlideText = (text: string | null | undefined): boolean =>
  !(text || '').replace(/<[^>]*>/g, '').replace(/[\s\p{P}\p{S}]/gu, '');

export interface PreparedSlide {
  content: string;
  links?: unknown[];
}

/**
 * Final reader-facing slide list. Cleans the last slide; if nothing is left,
 * drops it so the previous slide becomes the last one (and is cleaned in turn).
 * The headline slide is never dropped, so a story can't end on an empty or
 * byline-only slide. Input must already be in display order.
 */
export function prepareStorySlides<T extends PreparedSlide>(
  slides: T[],
  preClean: (text: string) => string = (t) => t
): { slides: T[]; dropped: number; removed: string[] } {
  const out = [...slides];
  const removedAll: string[] = [];
  let dropped = 0;
  while (out.length > 1) {
    const last = out[out.length - 1];
    const original = last.content || '';
    const pre = preClean(original);
    const { text, removed } = stripReaderPrompts(pre);
    if (pre !== original) {
      removedAll.push(original.endsWith(pre) ? original.slice(0, original.length - pre.length).trim() : original);
    }
    removedAll.push(...removed);
    if (isEmptySlideText(text)) {
      out.pop();
      dropped++;
      continue;
    }
    if (text !== original) {
      // Stored link offsets no longer line up with the cleaned text.
      out[out.length - 1] = { ...last, content: text, links: [] };
    }
    break;
  }
  return { slides: out, dropped, removed: removedAll };
}

const GENERIC_AUTHORS = new Set([
  'unknown', 'staff', 'staff writer', 'staff reporter', 'reporter', 'newsdesk',
  'news desk', 'editor', 'admin', 'local news', 'source', 'eezee news',
]);

/** A reporter name we can show, or null. Drops "By ", handles, URLs, placeholders. */
export const cleanAuthor = (author?: string | null): string | null => {
  const name = (author || '').replace(/\s+/g, ' ').trim().replace(/^by\s+/i, '').trim();
  if (!name || name.length > 80) return null;
  if (GENERIC_AUTHORS.has(name.toLowerCase())) return null;
  if (/[@/]|https?:|www\.|\.(?:com|co\.uk|org)\b|\d/i.test(name)) return null;
  if (!/\s/.test(name)) return null; // single token like "jefftravis" is a username
  return name;
};

export const buildReporterByline = (author?: string | null): string | null => {
  const name = cleanAuthor(author);
  return name ? `By ${name}` : null;
};
