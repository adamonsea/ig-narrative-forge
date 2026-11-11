import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStoryCategories } from '@/hooks/useStoryCategories';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Sparkles, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CategoriesPanelProps {
  topicId: string;
  totalStories?: number;
}

export const CategoriesPanel = ({ topicId, totalStories }: CategoriesPanelProps) => {
  const { categories, parents, childrenOf, settings, counts, classifiedCount, loading, isLocal, reload, saveSetting } =
    useStoryCategories(topicId);
  const { toast } = useToast();
  const [classifying, setClassifying] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
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
      let consecutiveErrors = 0;
      let lastError: string | null = null;
      // Resumable: keep asking for batches until nothing new comes back.
      // Smaller passes (75) stay well inside the edge invocation timeout;
      // 80 passes still covers a multi-thousand-story backlog in one click.
      for (let pass = 0; pass < 80; pass++) {
        const { data, error } = await supabase.functions.invoke('classify-stories', {
          body: { topicId, limit: 75, batchSize: 25 },
        });
        const payload = data as any;
        if (payload?.needsCategories) {
          toast({
            title: 'Add categories first',
            description: 'Use Suggest categories to get a set that fits this feed.',
          });
          return;
        }
        if (payload?.blocked) {
          throw new Error(
            payload.error ||
              'AI classification is blocked — the workspace AI credit limit has been reached.'
          );
        }
        if (error) {
          // Transient timeout / cold start — retry rather than throwing away
          // the progress already committed in earlier passes.
          consecutiveErrors += 1;
          lastError = error.message ?? String(error);
          if (consecutiveErrors >= 3) break;
          await new Promise((r) => setTimeout(r, 1500 * consecutiveErrors));
          continue;
        }
        consecutiveErrors = 0;
        const processed = payload?.processed ?? 0;
        done += processed;
        if (processed === 0) break;
      }

      if (done > 0) {
        toast({
          title: 'Classification run complete',
          description: lastError
            ? `${done} stories categorised. Some passes timed out — run again to continue.`
            : `${done} stories categorised.`,
        });
      } else {
        throw new Error(lastError ?? 'No stories were classified.');
      }
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
      if ((data as any)?.error) throw new Error((data as any).error);
      const next = (data as any)?.proposal ?? null;
      setProposal(next);
      setSelected(new Set((next?.categories ?? []).map((c: any) => c.slug)));
      toast({ title: 'Suggestions ready', description: 'Pick the categories you want below.' });
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

  const slugify = (v: string) =>
    v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  // Adds the chosen suggestions as this feed's own categories (owner-only via RLS).
  const addSelected = async () => {
    const chosen = (proposal?.categories ?? []).filter((c: any) => selected.has(c.slug));
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      const used = new Set(categories.map((c) => c.slug));
      let order = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 1;
      let added = 0;
      for (const c of chosen) {
        const slug = slugify(c.slug || c.name || '');
        if (!slug || used.has(slug) || !c.name) continue;
        const { data: parent, error } = await supabase
          .from('story_categories')
          .insert({ topic_id: topicId, slug, name: String(c.name).slice(0, 80), description: c.description ?? null, sort_order: order++ })
          .select('id')
          .single();
        if (error) throw error;
        used.add(slug);
        added += 1;
        const subs = (Array.isArray(c.subcategories) ? c.subcategories : [])
          .filter((sc: any) => sc?.name)
          .map((sc: any) => {
            let subSlug = slugify(sc.slug || sc.name);
            if (!subSlug || used.has(subSlug)) subSlug = `${slug}-${subSlug || 'other'}`;
            if (used.has(subSlug)) return null;
            used.add(subSlug);
            return { topic_id: topicId, parent_id: parent.id, slug: subSlug, name: String(sc.name).slice(0, 80), sort_order: order++ };
          })
          .filter(Boolean);
        if (subs.length) {
          const { error: subError } = await supabase.from('story_categories').insert(subs as any[]);
          if (subError) throw subError;
        }
      }
      setProposal(null);
      toast({
        title: added ? `${added} ${added === 1 ? 'category' : 'categories'} added` : 'Nothing new to add',
        description: added ? 'Run Classify stories to sort your stories into them.' : 'Those categories are already on this feed.',
      });
      reload();
    } catch (err) {
      toast({
        title: 'Could not add categories',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
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
          <Button size="sm" onClick={runClassification} disabled={classifying || parents.length === 0}>
            {classifying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Classify stories
          </Button>
        </div>
      </div>

      {proposal?.categories?.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-sm font-medium">Suggested categories for this feed</p>
          <ul className="space-y-2">
            {proposal.categories.map((c: any) => {
              const id = `suggest-${c.slug}`;
              return (
                <li key={c.slug} className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={selected.has(c.slug)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(c.slug);
                        else next.delete(c.slug);
                        return next;
                      })
                    }
                  />
                  <label htmlFor={id} className="cursor-pointer">
                    <span className="font-medium">{c.name}</span>
                    {c.description && <span className="text-muted-foreground"> — {c.description}</span>}
                    {c.subcategories?.length ? (
                      <span className="block text-xs text-muted-foreground">
                        {c.subcategories.map((s: any) => s.name).join(', ')}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={addSelected} disabled={adding || selected.size === 0}>
              {adding && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Add {selected.size} {selected.size === 1 ? 'category' : 'categories'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)} disabled={adding}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {parents.length === 0 && !proposal && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No categories yet. Use Suggest categories to get a set that fits what this feed covers.
        </p>
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
                <div className={isLocal ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3 sm:max-w-[50%]'}>
                  {isLocal && <div className="space-y-1">
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
                  </div>}
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
