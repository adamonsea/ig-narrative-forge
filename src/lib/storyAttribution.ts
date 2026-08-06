/**
 * Deterministic closing-slide attribution.
 *
 * The model is never allowed to name a publication or author in slide copy
 * (it hallucinated the wrong source). Instead we rebuild the credit line here
 * from the story's own ground-truth database fields, so what readers see always
 * matches the article we actually linked to.
 */

const GENERIC_NAMES = new Set([
  'eezee news',
  'unknown publication',
  'unknown',
  'source',
  'local news',
  'staff writer',
  'staff reporter',
  'newsdesk',
  'news desk',
  'editor',
  'admin',
]);

const clean = (value?: string | null): string => {
  const trimmed = (value || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (GENERIC_NAMES.has(trimmed.toLowerCase())) return '';
  if (trimmed.length > 80) return '';
  return trimmed;
};

export const getSourceDomain = (sourceUrl?: string | null): string | null => {
  if (!sourceUrl || sourceUrl === '#') return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Publication name we can stand behind: the stored publication_name when it is
 * meaningful, otherwise the hostname of the article we link to.
 */
export const getPublicationLabel = (
  publicationName?: string | null,
  sourceUrl?: string | null
): string | null => clean(publicationName) || getSourceDomain(sourceUrl);

/**
 * "Reported by Jane Doe for Bourne Free Live" / "Reported by Bourne Free Live"
 * Returns null when neither field is trustworthy.
 */
export const buildBylineLine = (
  author?: string | null,
  publicationName?: string | null,
  sourceUrl?: string | null
): string | null => {
  const writer = clean(author);
  const publication = getPublicationLabel(publicationName, sourceUrl);

  if (writer && publication) return `Reported by ${writer} for ${publication}`;
  if (writer) return `Reported by ${writer}`;
  if (publication) return `Reported by ${publication}`;
  return null;
};

/**
 * Share prompt referencing the feed's topic, e.g.
 * "Share this with someone who follows Eastbourne."
 */
export const buildShareCta = (topicName?: string | null): string => {
  const topic = clean(topicName);
  return topic
    ? `Share this with someone who follows ${topic}.`
    : 'Share this with someone who would want to know.';
};
