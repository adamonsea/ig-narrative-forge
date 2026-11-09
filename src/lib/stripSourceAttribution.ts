/**
 * Removes AI-generated source attribution lines (e.g. "Source: example.co.uk |")
 * from slide copy. The real attribution is always rendered from the article's
 * actual source_url, so any model-written source name must be discarded to
 * avoid mis-crediting publications.
 */
export const stripGeneratedSourceAttribution = (content: string): string => {
  if (!content) return content;

  let cleaned = content;

  // Leading "Source: domain.tld |" / "Originally published by X — " style prefixes.
  // An explicit separator (| — – or a line break) is required, so a credit
  // followed by ". Real sentence" is left for sentence-level cleanup.
  // The colon (or explicit "published by") is required so ordinary prose that
  // merely starts with "Via" or "Source" is never truncated.
  cleaned = cleaned.replace(
    /^\s*(?:\*\*)?\s*(?:(?:source|via|credit)\s*:|originally (?:from|published by)|read more at)\s*\*{0,2}\s*[^\n|—–]{0,80}?(?:\s*(?:\||—|–)\s*|\n+)/i,
    ''
  );

  // Standalone attribution lines anywhere in the block
  cleaned = cleaned
    .split('\n')
    // One-sentence credit lines only: a line that carries a real sentence after
    // the credit ("Source: X. The road reopens…") must never be deleted whole.
    .filter((line) => !/^\s*(?:\*\*)?\s*(?:source|via|credit)\s*:\s*(?:[^\n.!?]|[.!?](?=\S)){0,80}[.!?]?\s*$/i.test(line))
    .join('\n');

  return cleaned.trim();
};
