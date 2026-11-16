/** Terms from the feed's own settings, used to highlight why an article matched. */
export interface HighlightTerms {
  regionName: string;
  landmarks: string[];
  keywords: string[];
  organizations: string[];
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const createRegex = (term: string) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = /^[\w-]+$/.test(term.trim()) ? "\\b" : "";
  return new RegExp(`${boundary}(${escaped})${boundary}`, "gi");
};

/** HTML-escaped text with the feed's region, landmarks, organisations and keywords marked. */
export function highlightContentWithContext(text: string, t: HighlightTerms): string {
  if (!text) return "";
  let out = escapeHtml(text);
  if (t.regionName) {
    out = out.replace(createRegex(t.regionName), '<mark class="bg-green-200 text-green-900 px-1.5 py-0.5 rounded font-bold border-2 border-green-500">$1</mark>');
  }
  t.landmarks.forEach((l) => { if (l?.trim()) out = out.replace(createRegex(l), '<mark class="bg-blue-200 text-blue-900 px-1 rounded font-semibold border border-blue-400">$1</mark>'); });
  t.organizations.forEach((o) => { if (o?.trim()) out = out.replace(createRegex(o), '<mark class="bg-purple-200 text-purple-900 px-1 rounded border border-purple-300">$1</mark>'); });
  t.keywords.forEach((k) => { if (k?.trim()) out = out.replace(createRegex(k), '<mark class="bg-yellow-100 text-yellow-800 px-1 rounded">$1</mark>'); });
  return out;
}
