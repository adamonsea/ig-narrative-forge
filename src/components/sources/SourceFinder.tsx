import { opt } from "@/lib/optionalProps";
import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ShopSuggestions } from './ShopSuggestions';

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official' | 'WordPress' | 'Substack';
  confidence_score: number;
  rationale: string;
  platform_reliability?: 'high' | 'medium' | 'low' | undefined;
}

export interface SourceFinderProps {
  topicId: string;
  topicName: string;
  description?: string | undefined;
  keywords: string[];
  topicType: 'regional' | 'keyword';
  region?: string | undefined;
  onSourceAdded?: () => void;
  /** An organiser's ticket shop was added as an events source. */
  onEventsAdded?: () => void;
}

const BLOCKED = ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'linkedin.com',
  'blogspot', 'tumblr', 'medium.com', 'youtube.com', 'vimeo.com'];

/** "Find sources" step of Add source: AI suggestions, tap one to add it to this feed. */
export function SourceFinder({ topicId, topicName, description = '', keywords, topicType, region, onSourceAdded, onEventsAdded }: SourceFinderProps) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const linkedUrls = async () => {
    const { data } = await supabase
      .from('topic_sources')
      .select('source_id, content_sources!inner(feed_url, canonical_domain)')
      .eq('topic_id', topicId);
    const urls = new Set<string>();
    (data || []).forEach((ts: any) => {
      if (ts.content_sources?.feed_url) urls.add(ts.content_sources.feed_url.toLowerCase());
      if (ts.content_sources?.canonical_domain) urls.add(ts.content_sources.canonical_domain.toLowerCase());
    });
    return urls;
  };

  const find = async () => {
    if (!topicName.trim()) return;
    setLoading(true);
    try {
      const [existing, res] = await Promise.all([
        linkedUrls(),
        supabase.functions.invoke('suggest-content-sources', {
          body: { topicName, description, keywords: keywords.join(', '), topicType, region, enhanced: true,
            focusPlatforms: ['WordPress', 'RSS', 'Substack', 'News'], excludeProblematic: true },
        }),
      ]);
      if (res.error) throw res.error;
      const linked = (s: SourceSuggestion) => {
        const url = s.url.toLowerCase();
        try { return existing.has(url) || existing.has(new URL(s.url).hostname.replace('www.', '').toLowerCase()); }
        catch { return existing.has(url); }
      };
      const score = (s: SourceSuggestion) => s.confidence_score
        + (s.platform_reliability === 'high' ? 25 : s.platform_reliability === 'medium' ? 15 : 0)
        + (['WordPress', 'RSS', 'Substack', 'News'].includes(s.type) ? 20 : 0);
      const list = ((res.data?.suggestions || []) as SourceSuggestion[])
        .filter((s) => s.confidence_score >= 60 && s.platform_reliability !== 'low'
          && !BLOCKED.some((p) => s.url.toLowerCase().includes(p)) && !linked(s))
        .sort((a, b) => score(b) - score(a));
      setSuggestions(list);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({ title: "Couldn't find sources", description: 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { find(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [topicId]);

  const add = async (s: SourceSuggestion) => {
    setAdding(s.url);
    try {
      const domain = new URL(s.url).hostname.replace('www.', '');
      const { data: existingSource } = await supabase
        .from('content_sources').select('id')
        .or(`feed_url.eq.${s.url},canonical_domain.eq.${domain}`)
        .maybeSingle();
      let sourceId = existingSource?.id;
      if (!sourceId) {
        let credibility = Math.round(s.confidence_score * 0.8);
        if (s.platform_reliability === 'high') credibility += 15;
        if (s.platform_reliability === 'medium') credibility += 10;
        const { data: created, error } = await supabase
          .from('content_sources')
          .insert({
            source_name: s.source_name, feed_url: s.url, canonical_domain: domain, content_type: 'news',
            credibility_score: Math.min(95, credibility), is_active: true, topic_id: topicId,
            source_type: s.type === 'RSS' ? 'rss' : 'website', ...opt("region", topicType === 'regional' ? region : null),
          })
          .select('id').single();
        if (error) throw error;
        sourceId = created.id;
      }
      const { error: linkError } = await supabase.rpc('add_source_to_topic', { p_topic_id: topicId, p_source_id: sourceId, p_source_config: {} });
      if (linkError) throw new Error(linkError.message);
      setSuggestions((prev) => prev.filter((x) => x.url !== s.url));
      setAdded((n) => n + 1);
      toast({ title: 'Added', description: s.source_name });
      onSourceAdded?.();
      window.dispatchEvent(new CustomEvent('sourceAdded'));
    } catch (error) {
      console.error('Error adding source:', error);
      toast({ title: "Couldn't add", description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setAdding(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Finding sources">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      {suggestions.length > 0 ? (
        <ul className="space-y-2">
          {suggestions.map((s) => {
            const busy = adding === s.url;
            let domain = s.url;
            try { domain = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* keep url */ }
            return (
              <li key={s.url} className={cn('flex items-center gap-3 rounded-xl border bg-card p-3', busy && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{s.source_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{domain}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => add(s)} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}Add
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Dismiss ${s.source_name}`}
                      onClick={() => setSuggestions((prev) => prev.filter((x) => x.url !== s.url))} disabled={busy}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Dismiss</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-base text-muted-foreground">{added > 0 ? `${added} added.` : 'No new sources found.'}</p>
      )}
      <ShopSuggestions topicId={topicId} {...opt("onAdded", onEventsAdded)} />
      <Button variant="ghost" size="sm" onClick={find}>Find more</Button>
    </div>
  );
}
