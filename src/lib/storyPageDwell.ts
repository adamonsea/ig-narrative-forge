/**
 * "Stayed on a story page 10+ seconds" signal. Counts only time the tab is visible, and sends
 * once per story page view, only after a human signal (see humanSignal.ts). Written as a
 * `page_dwell` story interaction; read only through topic_engagement in the database.
 */
import { supabase } from '@/integrations/supabase/client';
import { canTrackReader, getVisitorId } from './visitorIdentity';
import { onHumanSignal } from './humanSignal';

export const STORY_PAGE_READ_MS = 10_000;

/** Pure visible-time clock, exported for tests. */
export function createDwellClock(now: () => number) {
  let total = 0;
  let since: number | null = null;
  return {
    show() { if (since === null) since = now(); },
    hide() { if (since !== null) { total += now() - since; since = null; } },
    elapsed() { return total + (since !== null ? now() - since : 0); },
  };
}

export function startStoryPageDwell(storyId: string, topicId: string): () => void {
  if (typeof window === 'undefined' || !canTrackReader()) return () => {};
  const clock = createDwellClock(() => performance.now());
  let done = false;
  let unsubscribe: () => void = () => {};

  const send = () => {
    if (done) return;
    done = true;
    supabase.rpc('record_story_interaction', {
      p_story_id: storyId,
      p_topic_id: topicId,
      p_visitor_id: getVisitorId('visitor'),
      p_interaction_type: 'page_dwell',
      p_user_agent: navigator.userAgent,
      p_referrer: (document.referrer || null)!,
    }).then(() => {}, () => {});
  };

  const onVisibility = () => (document.visibilityState === 'visible' ? clock.show() : clock.hide());
  if (document.visibilityState === 'visible') clock.show();
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(() => {
    if (clock.elapsed() >= STORY_PAGE_READ_MS) {
      window.clearInterval(timer);
      unsubscribe = onHumanSignal(send);
    }
  }, 1000);

  return () => {
    window.clearInterval(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
