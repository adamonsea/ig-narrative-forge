/**
 * Removes AI-generated source attribution lines (e.g. "Source: example.co.uk |")
 * from slide copy. The real attribution is always rendered from the article's
 * actual source_url, so any model-written source name must be discarded to
 * avoid mis-crediting publications.
 */
export const stripGeneratedSourceAttribution = (content: string): string => {
  if (!content) return content;

  let cleaned = content;

  // Leading "Source: domain.tld |" / "Source: The Example — " style prefixes
  cleaned = cleaned.replace(
    /^\s*(?:\*\*)?\s*(?:source|via|originally (?:from|published by)|read more at)\s*:?\s*\*{0,2}\s*[^\n|—–-]{0,80}?(?:\s*(?:\||—|–|-)\s*|\n+|$)/i,
    ''
  );

  // Standalone attribution lines anywhere in the block
  cleaned = cleaned
    .split('\n')
    .filter((line) => !/^\s*(?:\*\*)?\s*(?:source|via)\s*:\s*[^\n]{0,80}$/i.test(line))
    .join('\n');

  return cleaned.trim();
};
