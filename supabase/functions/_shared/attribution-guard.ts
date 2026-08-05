/**
 * Strips model-written source/author credits from slide copy.
 * Attribution is always rendered from the article's real source_url, publication
 * and author, so any credit the model invents risks mis-representing a publisher.
 */
export function stripGeneratedAttribution(content: string): string {
  if (!content) return content;

  let cleaned = content
    // "Source: Sussex Express." / "Source: site.co.uk |"
    .replace(/[Ss]ource\s*[:\-—][^|]*?(\.(?=\s|$)|\s*\|\s*|$)/g, ' ')
    // "Read more at example.co.uk." / "Learn more on Sussex Express."
    .replace(/(Read (more|the full (story|article|details))|Learn more|Find out more)\s+(at|on|via)\s+[^|]*?(\.(?=\s|$)|\s*\|\s*|$)/g, ' ')
    // Trailing bylines: "By Peter Lindsey."
    .replace(/By [A-Z][A-Za-z'\-]+( [A-Z][A-Za-z'\-]+){0,2}[.,]?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) cleaned = 'Share this story.';
  return cleaned;
}
