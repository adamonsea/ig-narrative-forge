/**
 * Reader-facing filtering on the public feed (Curate menu, "More like this",
 * filter banner, filter index download). Paused Nov 2026: barely used and the
 * index downloaded ~22MB per visit. Set to true to bring it all back.
 */
export const FEED_FILTERS_ENABLED = false;

/**
 * Reader first-visit extras on public feeds: welcome card + tooltip tour,
 * Play/bell pulses, in-feed install card, automatic notification pop-up and
 * the multi-step end-of-feed flow. Paused Nov 2026 to keep first visits clean
 * (cookie banner + one swipe hint only). Set to true to bring them all back.
 */
export const READER_ONBOARDING_EXTRAS = false;

/**
 * Parked features (community discussion, parliament, sentiment, email
 * segments, audio briefings, Family-safe). One shared switchboard for the
 * web app and the edge functions — flip a value there to bring one back.
 * See docs/parked-features.md.
 */
export { FEATURES } from "../../supabase/functions/_shared/parked-features.ts";
