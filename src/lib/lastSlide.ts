/**
 * Clean closing slide: story text, then "By {reporter}" when we know them.
 *
 * Older stories were written with a reader prompt at the end ("Discuss with
 * others…", "Share this update…"). We remove those at render time, without
 * touching the stored copy, using deliberately narrow rules:
 *  - only the last two sentences of the last slide are candidates;
 *  - the sentence must START with a known prompt opener;
 *  - it is kept if it carries practical detail (numbers, contact, links);
 *  - it is kept if the slide is a police / public-safety / missing-person
 *    appeal — sharing those genuinely helps.
 */

const PROMPT_OPENERS =
  /^(?:share\s+(?:this|the|details|your)\b|discuss\s+(?:with|the|your)\b|explore\s+(?:further|the)\b|read\s+more\s+(?:on|about)\b)/i;

/** "Have you …?" — only when the sentence is a question. */
const QUESTION_OPENER = /^have\s+you\b.*\?$/i;

/** Practical detail inside the sentence itself. */
const DETAIL_PROTECT =
  /\d|\b(?:quote|quoting|serial|contact|call|calling|report\s+it)\b|https?:\/\/|www\.|\b[\w-]+\.(?:co\.uk|com|org|gov\.uk|net)\b|@/i;

/** Appeal / public-safety context — anywhere on the slide keeps share asks. */
const APPEAL_PROTECT =
  /\b(?:appeal(?:s|ing)?|missing|trace|find|witness(?:es)?|sightings?|police|officers?|101|999)\b/i;

const splitSentences = (text: string): string[] =>
  (text.match(/[^.!?]+(?:[.!?]+["'’”)]*|$)/g) || []).map((s) => s.trim()).filter(Boolean);

const isReaderPrompt = (sentence: string, slideText: string): boolean => {
  const s = sentence.trim();
  if (!(PROMPT_OPENERS.test(s) || QUESTION_OPENER.test(s))) return false;
  if (DETAIL_PROTECT.test(s)) return false;
  if (APPEAL_PROTECT.test(slideText)) return false;
  return true;
};

export interface PromptStripResult {
  text: string;
  removed: string[];
}

/** Remove AI-written reader prompts from the end of the last slide. */
export const stripReaderPrompts = (content: string): PromptStripResult => {
  if (!content || /<[a-z]/i.test(content)) return { text: content, removed: [] };
  const sentences = splitSentences(content);
  if (sentences.length < 2) return { text: content, removed: [] };
  const removed: string[] = [];
  const start = Math.max(1, sentences.length - 2); // never remove the opening sentence
  const kept = sentences.filter((s, i) => {
    if (i >= start && isReaderPrompt(s, content)) {
      removed.push(s);
      return false;
    }
    return true;
  });
  return removed.length ? { text: kept.join(' '), removed } : { text: content, removed };
};

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
