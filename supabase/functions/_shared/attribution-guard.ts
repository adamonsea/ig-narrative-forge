/**
 * Strips model-written source/author credits from slide copy.
 * Attribution is always rendered from the article's real source_url, publication
 * and author, so any credit the model invents risks mis-representing a publisher.
 */
export function stripGeneratedAttribution(content: string): string {
  if (!content) return content;

  // Only strip attribution that appears as its own line or as a leading/trailing
  // credit fragment — never mid-sentence, where "source:" is legitimate prose.
  let cleaned = content
    // Whole lines that are just a credit: "Source: Sussex Express"
    .split('\n')
    .filter((line) => !/^\s*(?:\*\*)?\s*(?:source|via|credit)\s*:\s*[^\n]{0,80}$/i.test(line))
    .join('\n')
    // Leading credit prefix: "Source: site.co.uk | ..."
    .replace(/^\s*(?:\*\*)?\s*[Ss]ource\s*[:\-—]\s*[^|\n.]{0,60}(?:\s*\|\s*|\.\s+|\n)/, '')
    // Trailing credit: "... Source: Sussex Express."
    .replace(/(?:\s*\|\s*|\s)[Ss]ource\s*[:\-—]\s*[^|\n.]{0,60}\.?\s*$/, '')
    // "Read more at example.co.uk." — only as a trailing sentence
    .replace(/(?:^|\s)(?:Read (?:more|the full (?:story|article|details))|Learn more|Find out more)\s+(?:at|on|via)\s+[^|\n.]{0,60}\.?\s*$/, '')
    // Trailing byline that is a standalone sentence: "By Peter Lindsey."
    .replace(/(?:^|(?<=[.!?]\s))By [A-Z][A-Za-z'\-]+(?: [A-Z][A-Za-z'\-]+){0,2}\.\s*$/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!cleaned) cleaned = 'Share this story.';
  return cleaned;
}
