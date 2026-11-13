/**
 * PARKED FEATURES — the one switchboard for features that are switched off
 * for every feed (Nov 2026). See docs/parked-features.md.
 *
 * false = hidden in every screen AND stopped in the background (crons,
 *         generation, scraping, audio credits). Saved per-feed settings and
 *         data stay untouched in the database.
 * true  = back on. Each feed's own saved setting decides again, exactly as
 *         before. After flipping, redeploy the functions listed in the doc.
 *
 * Plain TypeScript with no imports: read by both the web app
 * (via src/lib/featureFlags.ts) and the edge functions.
 */
export const FEATURES = {
  /** Reddit/forum talking points and the community pulse feed card. */
  communityDiscussion: false,
  /** UK Parliament MP votes/debates collection, tracked MPs and parliament feed cards. */
  parliament: false,
  /** Keyword sentiment ("coverage mood") tracking and sentiment feed cards. */
  sentiment: false,
  /** Splitting email subscribers into segments with their own sends. */
  emailSegments: false,
  /** Spoken daily/weekly briefings (ElevenLabs, charged in credits). */
  audioBriefings: false,
  /** Rule-based filter that leaves out adult, violent and gambling stories. */
  familySafe: false,
} as const;

export type ParkedFeature = keyof typeof FEATURES;

/** JSON body for a background job that was asked to run while its feature is parked. */
export function parkedResponseBody(feature: ParkedFeature) {
  return JSON.stringify({ success: true, skipped: true, reason: 'feature_parked', feature });
}
