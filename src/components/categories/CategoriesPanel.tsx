import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStoryCategories } from '@/hooks/useStoryCategories';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Sparkles, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CategoriesPanelProps {
  topicId: string;
  totalStories?: number;
}

export const CategoriesPanel = ({ topicId, totalStories }: CategoriesPanelProps) => {
  const { parents, childrenOf, settings, counts, classifiedCount, loading, reload, saveSetting } =
    useStoryCategories(topicId);
  const { toast } = useToast();
  const [classifying, setClassifying] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [storyTotal, setStoryTotal] = useState<number | null>(totalStories ?? null);

  useEffect(() => {
    if (totalStories != null) return;
    let cancelled = false;
    (async () => {
      // Single exact count via the topic_articles join — avoids the 1000-row
      // page cap that was under-reporting the backlog.
      const { count } = await supabase
        .from('stories')
        .select('id, topic_articles!inner(topic_id)', { count: 'exact', head: true })
        .eq('topic_articles.topic_id', topicId)
        .eq('is_published', true);
      if (!cancelled) setStoryTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, totalStories]);

  const runClassification = async () => {
    setClassifying(true);
    try {
      let done = 0;
      // Resumable: keep asking for batches until nothing new comes back.
      // 40 passes x 200 covers a multi-thousand-story backlog in one click.
      for (let pass = 0; pass < 40; pass++) {
        const { data, error } = await supabase.functions.invoke('classify-stories', {
          body: { topicId, limit: 200, batchSize: 25 },
        });
        const payload = data as any;
        if (payload?.blocked) {
          throw new Error(
            payload.error ||
              'AI classification is blocked — the workspace AI credit limit has been reached.'
          );
        }
        if (error) throw error;
        const processed = payload?.processed ?? 0;
        done += processed;
        if (processed === 0) break;
      }

      toast({ title: 'Classification run complete', description: `${done} stories categorised.` });
      reload();
    } catch (err) {
      toast({
        title: 'Classification failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setClassifying(false);
    }
  };

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-taxonomy', {
        body: { topicId, sampleSize: 400 },
      });
      if (error) throw error;
      setProposal((data as any)?.proposal ?? null);
      toast({ title: 'Taxonomy proposal ready', description: 'Review the suggested categories below.' });
    } catch (err) {
      toast({
        title: 'Discovery failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDiscovering(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const unclassified = Math.max(0, (storyTotal ?? 0) - classifiedCount);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-medium">
            {classifiedCount} of {storyTotal ?? '—'} stories categorised
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unclassified > 0 ? `${unclassified} still to classify` : 'Everything is up to date'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runDiscovery} disabled={discovering}>
            {discovering ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Suggest categories
          </Button>
          <Button size="sm" onClick={runClassification} disabled={classifying}>
            {classifying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Classify stories
          </Button>
        </div>
      </div>

      {proposal?.categories?.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-sm font-medium">Suggested taxonomy from your published stories</p>
          <ul className="space-y-1.5">
            {proposal.categories.map((c: any) => (
              <li key={c.slug} className="text-sm">
                <span className="font-medium">{c.name}</span>{' '}
                <span className="text-muted-foreground">
                  ~{c.approx_count ?? 0} stories
                  {c.subcategories?.length ? ` · ${c.subcategories.map((s: any) => s.name).join(', ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            This is a suggestion only — nothing has changed. Tell me which of these you want added to your feed.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {parents.map((cat) => {
          const setting = settings[cat.id];
          const enabled = setting?.enabled ?? true;
          const subs = childrenOf(cat.id);
          return (
            <Collapsible key={cat.id} className="rounded-xl border border-border">
              <div className="flex items-center justify-between gap-3 p-3">
                <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{cat.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {counts[cat.id] ?? 0}
                  </Badge>
                </CollapsibleTrigger>
                <Switch
                  checked={enabled}
                  aria-label={`Include ${cat.name} stories in this feed`}
                  onCheckedChange={(checked) => saveSetting(cat.id, { enabled: checked })}
                />
              </div>
              <CollapsibleContent className="border-t border-border p-3 space-y-3">
                {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`radius-${cat.id}`} className="text-xs">
                      Radius (miles)
                    </Label>
                    <Input
                      id={`radius-${cat.id}`}
                      type="number"
                      min={0}
                      max={200}
                      placeholder="Feed default"
                      defaultValue={setting?.geographic_radius_miles ?? ''}
                      onBlur={(e) =>
                        saveSetting(cat.id, {
                          geographic_radius_miles: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`threshold-${cat.id}`} className="text-xs">
                      Relevance threshold
                    </Label>
                    <Input
                      id={`threshold-${cat.id}`}
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Feed default"
                      defaultValue={setting?.relevance_threshold ?? ''}
                      onBlur={(e) =>
                        saveSetting(cat.id, {
                          relevance_threshold: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                {subs.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sub-categories: {subs.map((s) => s.name).join(', ')}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};
