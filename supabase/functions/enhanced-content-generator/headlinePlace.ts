/**
 * Place names in headlines on local feeds (pure, tested): the feed's own town is a given,
 * so it's left out; a story from somewhere else (a nearby town or village) names that place,
 * so readers can tell it isn't on their doorstep. Subject feeds get no place rule.
 */
export function headlinePlaceRule(topicType: string | null | undefined, region: string | null | undefined): string {
  const place = (region || '').replace(/\s+/g, ' ').trim();
  if (topicType !== 'regional' || !place) return '';
  return [
    `- This feed covers ${place}. Readers know that, so do NOT put "${place}" in the headline when the story happens there.`,
    `- If the story mainly happens somewhere other than ${place} (a nearby town, village or wider area), DO name that place in the headline, e.g. "Hailsham school wins national award".`,
  ].join('\n');
}

/** The same rule, for the copy-editing pass that may only rephrase slide 1. */
export function headlinePlaceEditRule(topicType: string | null | undefined, region: string | null | undefined): string {
  const place = (region || '').replace(/\s+/g, ' ').trim();
  if (topicType !== 'regional' || !place) return '';
  return `- Slide 1 only: you may drop "${place}" from the headline. Keep any other place name in it.`;
}
