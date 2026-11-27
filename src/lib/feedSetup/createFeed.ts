import type { SupabaseClient } from '@supabase/supabase-js';
import { createNewsSource } from './newsSources';
import { automationFromDraft, topicInsertFromDraft, type FeedSetupDraft } from '../feedSetup';

export interface SetupNewsSource {
  url: string; source_name: string; type: string; confidence_score: number;
  platform_reliability?: string | undefined;
}

/** Shared setup. Database checks remain the authority for caps and ownership. */
export async function createFeedFromDraft(db: SupabaseClient, draft: FeedSetupDraft,
  options: { ownerId: string; slug: string; isPublic: boolean; news: SetupNewsSource[]; hasEvents: boolean }) {
  const { data: feed, error } = await db.from('topics')
    .insert({ ...topicInsertFromDraft(draft, options.slug, options.ownerId), is_public: options.isPublic, ...(options.isPublic ? {} : {rss_enabled:false,mcp_enabled:false,email_subscriptions_enabled:false,public_widget_builder_enabled:false}) })
    .select('id, name, slug').single();
  if (error) throw error;
  if (!feed) throw new Error('The feed could not be created.');
  const warnings: string[] = [];
  const { error: automationError } = await db.from('topic_automation_settings')
    .update({ ...automationFromDraft(draft), updated_at: new Date().toISOString() }).eq('topic_id', feed.id);
  if (automationError) warnings.push('Autopilot could not be saved.');
  if (options.hasEvents) {
    const { error: eventError } = await db.from('topics').update({ events_enabled: true }).eq('id', feed.id);
    if (eventError) warnings.push('Events could not be switched on.');
  }
  const sourceIds: string[] = [];
  const connectedNews: { id: string; name: string; url: string; kind: string }[] = [];
  let failures = 0;
  for (const source of options.news) {
    try {
      const domain = new URL(source.url).hostname.replace(/^www\./, '');
      const { data: existing, error: readError } = await db.from('content_sources').select('id')
        .eq('topic_id', feed.id).eq('feed_url', source.url).limit(1).maybeSingle();
      if (readError) throw readError;
      let sourceId: string | undefined = existing?.id;
      if (!sourceId) {
        let credibility = Math.round(source.confidence_score * 0.8);
        if (source.platform_reliability === 'high') credibility += 15;
        if (source.platform_reliability === 'medium') credibility += 10;
        sourceId = await createNewsSource(db, {
          source_name: source.source_name, feed_url: source.url, canonical_domain: domain,
          content_type: 'news', credibility_score: Math.min(95, credibility), is_active: true,
          source_type: source.type === 'RSS' ? 'rss' : 'website',
          region: draft.topic_type === 'regional' ? draft.region : null,
        }, String(feed.id));
      }
      if (!sourceId) throw new Error('The source could not be saved.');
      const { error: linkError } = await db.rpc('add_source_to_topic', {
        p_topic_id: feed.id, p_source_id: sourceId, p_source_config: {},
      });
      if (linkError) throw linkError;
      sourceIds.push(sourceId);
      connectedNews.push({ id: sourceId, name: source.source_name, url: source.url, kind: 'news' });
    } catch (error) {
      failures++;
      warnings.push(error instanceof Error ? error.message : 'A source could not be saved.');
    }
  }
  return { feed: { id: String(feed.id), name: String(feed.name), slug: String(feed.slug) }, sourceIds, connectedNews, failures, warnings };
}
