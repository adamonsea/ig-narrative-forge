/**
 * The one list of publisher display names, shared by the app (source labels) and the
 * widget. Data only: add a publisher here, never inside a module or screen.
 */

/** Domain -> display name, used to label a story's source from its link. */
export const KNOWN_PUBLICATIONS: Record<string, string> = {
  'bbc.co.uk': 'BBC',
  'bbc.com': 'BBC',
  'theguardian.com': 'The Guardian',
  'theargus.co.uk': 'The Argus',
  'sussexexpress.co.uk': 'Sussex Express',
  'eastbourneherald.co.uk': 'Eastbourne Herald',
  'eastbournereporter.co.uk': 'Eastbourne Reporter',
  'bournefreelive.co.uk': 'Bourne Free Live',
  'eastbourne.gov.uk': 'Eastbourne Borough Council',
  'lewes-eastbourne.gov.uk': 'Lewes & Eastbourne Councils',
  'eastsussex.gov.uk': 'East Sussex County Council',
  'wealden.gov.uk': 'Wealden District Council',
  'hailsham-tc.gov.uk': 'Hailsham Town Council',
  'parliament.uk': 'UK Parliament',
  'gov.uk': 'GOV.UK',
  'sussex.police.uk': 'Sussex Police',
  'eastbourneunltd.co.uk': 'Eastbourne Chamber',
  'itv.com': 'ITV News',
  'sky.com': 'Sky News',
  'independent.co.uk': 'The Independent',
  'telegraph.co.uk': 'The Telegraph',
  'thetimes.co.uk': 'The Times',
  'standard.co.uk': 'Evening Standard',
};

/** Legacy or mistaken source names remapped to the real publication, so old embeds self-correct. */
export const SOURCE_ALIASES: Record<string, string> = {
  'eastbourne.news': 'eastbournereporter.co.uk',
};

/** Exact source-name -> display title used by the widget (kept separate so widget labels don't change). */
export const WIDGET_SOURCE_NAMES: Record<string, string> = {
  'eastbournereporter.co.uk': 'Eastbourne Reporter',
  'theargus.co.uk': 'The Argus',
  'sussexexpress.co.uk': 'Sussex Express',
  'eastbourne.news': 'Eastbourne News',
};
