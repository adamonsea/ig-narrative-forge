import DOMPurify from 'dompurify';

// Configure DOMPurify with safe defaults
const sanitizerConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br', 'a'],
  ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param html - The HTML string to sanitize
 * @param allowLinks - Whether to allow anchor tags (default: true)
 * @returns Sanitized HTML string
 */
export const sanitizeHtml = (html: string, allowLinks: boolean = true): string => {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = { ...sanitizerConfig };
  
  if (!allowLinks) {
    config.ALLOWED_TAGS = config.ALLOWED_TAGS.filter(tag => tag !== 'a');
    config.ALLOWED_ATTR = config.ALLOWED_ATTR.filter(attr => !['href', 'target', 'rel'].includes(attr));
  }

  return DOMPurify.sanitize(html, config);
};

/**
 * Creates a safe props object for dangerouslySetInnerHTML
 * @param html - The HTML string to sanitize
 * @param allowLinks - Whether to allow anchor tags (default: true)
 * @returns Object with __html property containing sanitized HTML
 */
export const createSafeHTML = (html: string, allowLinks: boolean = true) => ({
  __html: sanitizeHtml(html, allowLinks)
});

/**
 * Validates and sanitizes content with link replacements
 * @param content - The content to process
 * @param links - Optional links array for replacement
 * @returns Sanitized HTML with safe link replacements
 */
export const sanitizeContentWithLinks = (content: string, links?: any[]): string => {
  if (!content) return '';
  
  let processedContent = content;
  
  // Apply safe link replacements
  processedContent = processedContent
    .replace(
      /visit ([^\s]+)/gi, 
      'visit <a href="https://$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">$1</a>'
    )
    .replace(
      /call (\d{5}\s?\d{6})/gi,
      'call <a href="tel:$1" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">$1</a>'
    );

  return sanitizeHtml(processedContent, true);
};