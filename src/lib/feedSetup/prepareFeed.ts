import type { SupabaseClient } from '@supabase/supabase-js';
import { draftFromSuggestion, nameCandidate, slugify, type FeedSetupDraft, type EventSourceSuggestion } from '../feedSetup';
import type { SetupNewsSource } from './createFeed';

const BLOCKED_HOSTS = ['facebook.com','twitter.com','instagram.com','tiktok.com','reddit.com','pinterest.com','linkedin.com','youtube.com','medium.com'];
export function rankSetupSources<T extends SetupNewsSource>(raw: T[]) {
  const list = raw.filter(s => s.confidence_score >= 40 && s.platform_reliability !== 'low'
    && !BLOCKED_HOSTS.some(b => { try { const h = new URL(s.url).hostname; return h === b || h.endsWith(`.${b}`); } catch { return true; } }))
    .sort((a,b) => {
      const score = (s: SetupNewsSource) => s.confidence_score + (s.platform_reliability === 'high' ? 25 : s.platform_reliability === 'medium' ? 15 : 0);
      return score(b)-score(a);
    });
  return { list, picked: new Set(list.slice(0,5).map(s => s.url)) };
}
export async function suggestFeedSetup(db: SupabaseClient, about: string) {
  const { data, error } = await db.functions.invoke('suggest-feed-setup', { body: { about } });
  if (error || !data?.setup) throw new Error('We could not prepare your feed. Try again.');
  return data.setup as Parameters<typeof draftFromSuggestion>[0];
}
export async function freeFeedName(db: SupabaseClient, base: string) {
  for (let attempt=1; attempt<=9; attempt++) {
    const candidate = nameCandidate(base,attempt);
    const { data, error } = await db.rpc('check_topic_slug_available',{p_slug:slugify(candidate)});
    if (error) throw error;
    if (data !== false) return candidate;
  }
  throw new Error('Choose a different feed name.');
}
export async function findSetupNews(db: SupabaseClient, draft: FeedSetupDraft) {
  const body = { topicName:draft.name,description:draft.description,keywords:draft.keywords.slice(0,12).join(', '),topicType:draft.topic_type,...(draft.region ? {region:draft.region} : {}) };
  let result = await db.functions.invoke('suggest-content-sources',{body});
  if (result.error || result.data?.error || !result.data?.suggestions?.length) result = await db.functions.invoke('suggest-content-sources',{body});
  if (result.error || result.data?.error) throw new Error('News sources could not be found. Try again.');
  return rankSetupSources((result.data?.suggestions ?? []) as SetupNewsSource[]);
}
export async function findSetupEvents(db: SupabaseClient, draft: FeedSetupDraft) {
  const {data,error} = await db.functions.invoke('scrape-whats-on',{body:{action:'find',name:draft.name,region:draft.region,topicType:draft.topic_type}});
  if (error || data?.error) throw new Error('Event sources could not be found. Try again.');
  const list = (data?.suggestions ?? []) as EventSourceSuggestion[];
  return {list,picked:new Set<string>(data?.ticked ?? list.slice(0,3).map(e=>e.url))};
}
