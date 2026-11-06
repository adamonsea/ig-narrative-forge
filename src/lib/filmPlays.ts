import { supabase } from '@/integrations/supabase/client';
import { canTrackReader, getVisitorId } from '@/lib/visitorIdentity';

const EXCLUDE_KEY = 'curatr_exclude_me';
const sent = new Set<string>();

/** Visiting any page with ?exclude_me=1 stops this browser counting toward site stats. */
export const applyExcludeLink = () => {
  try {
    if (new URLSearchParams(window.location.search).get('exclude_me') === '1') {
      localStorage.setItem(EXCLUDE_KEY, '1');
    }
  } catch { /* ignore */ }
};

export const isExcludedBrowser = (): boolean => {
  try { return localStorage.getItem(EXCLUDE_KEY) === '1'; } catch { return false; }
};

export type FilmMilestone = 'started' | 'halfway' | 'finished';

/** Records a homepage film milestone once per page load; skips signed-in users, excluded browsers, bots and opt-outs. */
export const recordFilmMilestone = async (milestone: FilmMilestone) => {
  if (sent.has(milestone) || !canTrackReader() || isExcludedBrowser()) return;
  sent.add(milestone);
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    let referrer_host: string | null = null;
    try { referrer_host = document.referrer ? new URL(document.referrer).hostname : null; } catch { /* ignore */ }
    await supabase.from('film_plays' as any).insert({ visitor_id: getVisitorId('sv'), milestone, referrer_host });
  } catch { /* duplicates and failures are fine */ }
};
