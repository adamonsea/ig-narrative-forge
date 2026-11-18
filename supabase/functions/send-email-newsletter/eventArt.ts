/**
 * Email copies of the event category illustrations (src/components/events/EventCategoryIllustration.tsx):
 * the same art drawn on a transparent background, without the fine grain (keeps each file 10-40KB),
 * hosted on the app's own asset store. The email paints the feed's illustration tint behind them,
 * so each feed gets its own colour like the feed cards. Paths are relative to the site origin.
 */
export const EVENT_ART_PATHS: Record<string, string> = {
  'arts-theatre': '/__l5e/assets-v1/0d357f45-49f3-4827-86ef-fd1c89b8dc74/email-event-art-arts-theatre.png',
  'comedy': '/__l5e/assets-v1/2a94fba2-30dc-44c6-ba31-21cae8ef15ac/email-event-art-comedy.png',
  'family': '/__l5e/assets-v1/1c867b75-2c0d-4f31-80b4-514ab85833c3/email-event-art-family.png',
  'film': '/__l5e/assets-v1/4ec5bb96-5ca1-4fbf-b206-4dc9544a75f0/email-event-art-film.png',
  'food-drink': '/__l5e/assets-v1/ab3787bc-6453-457b-8096-bbbd624293b8/email-event-art-food-drink.png',
  'markets': '/__l5e/assets-v1/b5a28b70-5810-40ca-aa19-51ae9761154d/email-event-art-markets.png',
  'music': '/__l5e/assets-v1/8d5e2880-646d-470a-8cf3-8ab947ab151a/email-event-art-music.png',
  'nightlife': '/__l5e/assets-v1/7bc8a152-72ef-41aa-babf-178e91427e1a/email-event-art-nightlife.png',
  'other': '/__l5e/assets-v1/3ff92df7-8e19-4ddc-a556-3a335ec6662d/email-event-art-other.png',
  'outdoors': '/__l5e/assets-v1/ff11b742-cc47-4cc7-8517-c59072548e6a/email-event-art-outdoors.png',
  'sport': '/__l5e/assets-v1/560e2e3e-4370-408f-a352-c68a02ef29ac/email-event-art-sport.png',
  'talks': '/__l5e/assets-v1/f3d3c508-2cc6-4f89-9cfb-7f9394df4fb9/email-event-art-talks.png',
  'workshops': '/__l5e/assets-v1/ef17815b-fb1a-4a41-81ea-ad1ac22fc94d/email-event-art-workshops.png',
};

export function eventArtUrl(category: string | null | undefined, origin: string): string {
  const path = EVENT_ART_PATHS[category ?? ''] ?? EVENT_ART_PATHS.other;
  return `${origin.replace(/\/$/, '')}${path}`;
}
