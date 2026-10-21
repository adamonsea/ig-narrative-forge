import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { FlaskConical, RefreshCw, ThumbsUp, Minus, ThumbsDown } from 'lucide-react';

// Satirical cartoon bench: picks recent stories, runs the two-stage
// gag-then-draw pipeline in image-model-bench (promptVariant: 'satirical'),
// and shows the results side by side with a verdict control.

const MODELS = [
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5 (baseline)' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
  { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare' },
  { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' },
] as const;

const QUALITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
] as const;

interface StoryOption {
  id: string;
  title: string;
}

interface BenchResult {
  id: string;
  story_id: string | null;
  story_title: string | null;
  model: string;
  quality: string;
  image_url: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  success: boolean;
  error: string | null;
  prompt: string | null;
  verdict: 'good' | 'acceptable' | 'reject' | null;
}

export const SatiricalBenchPanel: React.FC = () => {
  const { toast } = useToast();
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(['gpt-image-2', 'gpt-image-2.5-flare']));
  const [selectedQualities, setSelectedQualities] = useState<Set<string>>(new Set(['medium']));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [results, setResults] = useState<BenchResult[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('id, title')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(12);
      if (!error && data) setStories(data as StoryOption[]);
      setLoadingStories(false);
    };
    load();
  }, []);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void, max?: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else {
      if (max && next.size >= max) return;
      next.add(id);
    }
    setter(next);
  };

  const planned = useMemo(
    () => selectedStories.size * selectedModels.size * selectedQualities.size,
    [selectedStories, selectedModels, selectedQualities]
  );

  const refreshResults = async (rid: string) => {
    const { data } = await supabase
      .from('image_bench_results')
      .select('id, story_id, story_title, model, quality, image_url, cost_usd, duration_ms, success, error, prompt, verdict')
      .eq('run_id', rid)
      .order('created_at', { ascending: true });
    if (data) setResults(data as BenchResult[]);
  };

  const runBench = async () => {
    if (planned === 0) return;
    const rid = crypto.randomUUID();
    setRunId(rid);
    setResults([]);
    setRunning(true);

    let done = 0;
    for (const storyId of selectedStories) {
      for (const model of selectedModels) {
        for (const quality of selectedQualities) {
          done++;
          setProgress(`Generating ${done} of ${planned}…`);
          // One image per invocation — the edge function enforces this limit.
          const { error } = await supabase.functions.invoke('image-model-bench', {
            body: {
              storyIds: [storyId],
              models: [model],
              qualities: [quality],
              promptVariant: 'satirical',
              runId: rid,
            },
          });
          if (error) {
            console.warn('Bench invocation failed:', error);
          }
          await refreshResults(rid);
        }
      }
    }

    setRunning(false);
    setProgress('');
    toast({ title: 'Bench complete', description: `${planned} satirical cartoons generated.` });
  };

  const setVerdict = async (id: string, verdict: 'good' | 'acceptable' | 'reject') => {
    setResults(prev => prev.map(r => (r.id === id ? { ...r, verdict } : r)));
    await supabase.from('image_bench_results').update({ verdict }).eq('id', id);
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Satirical cartoon bench
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tests the two-stage satire pipeline: a text model writes the joke (target, irony, visual metaphor),
            then each image model draws it as a broadsheet-style cartoon. Nothing touches live stories.
          </p>
        </div>
        {runId && (
          <Button variant="ghost" size="sm" onClick={() => refreshResults(runId)} disabled={running}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        )}
      </div>

      {/* Story picker */}
      <div>
        <p className="text-sm font-medium mb-2">Stories <span className="text-muted-foreground font-normal">(up to 4)</span></p>
        {loadingStories ? (
          <Spinner size="sm" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {stories.map(story => (
              <label key={story.id} className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-accent/50">
                <Checkbox
                  checked={selectedStories.has(story.id)}
                  onCheckedChange={() => toggle(selectedStories, story.id, setSelectedStories, 4)}
                  className="mt-0.5"
                />
                <span className="line-clamp-2">{story.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Model + quality pickers */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium mb-2">Models</p>
          <div className="space-y-2">
            {MODELS.map(m => (
              <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedModels.has(m.id)}
                  onCheckedChange={() => toggle(selectedModels, m.id, setSelectedModels)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Quality</p>
          <div className="space-y-2">
            {QUALITIES.map(q => (
              <label key={q.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedQualities.has(q.id)}
                  onCheckedChange={() => toggle(selectedQualities, q.id, setSelectedQualities)}
                />
                {q.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={runBench} disabled={running || planned === 0}>
          {running ? <Spinner size="sm" className="mr-2" /> : null}
          Run bench {planned > 0 ? `(${planned} image${planned === 1 ? '' : 's'})` : ''}
        </Button>
        {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
      </div>

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
          {results.map(r => (
            <div key={r.id} className="rounded-lg border overflow-hidden bg-background">
              {r.success && r.image_url ? (
                <img src={r.image_url} alt={r.story_title ?? 'Bench result'} className="w-full aspect-[3/2] object-cover" />
              ) : (
                <div className="w-full aspect-[3/2] flex items-center justify-center text-sm text-destructive p-4 text-center">
                  {r.error ?? 'Failed'}
                </div>
              )}
              <div className="p-3 space-y-2">
                <p className="text-sm font-medium line-clamp-1">{r.story_title}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">{r.model}</Badge>
                  <Badge variant="outline">{r.quality}</Badge>
                  {r.cost_usd != null && <Badge variant="secondary">${r.cost_usd.toFixed(3)}</Badge>}
                  {r.duration_ms != null && <Badge variant="secondary">{(r.duration_ms / 1000).toFixed(0)}s</Badge>}
                </div>
                {r.prompt && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Prompt</summary>
                    <p className="mt-1 whitespace-pre-wrap line-clamp-6">{r.prompt}</p>
                  </details>
                )}
                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    variant={r.verdict === 'good' ? 'default' : 'ghost'}
                    onClick={() => setVerdict(r.id, 'good')}
                    title="Good"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant={r.verdict === 'acceptable' ? 'default' : 'ghost'}
                    onClick={() => setVerdict(r.id, 'acceptable')}
                    title="Acceptable"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant={r.verdict === 'reject' ? 'destructive' : 'ghost'}
                    onClick={() => setVerdict(r.id, 'reject')}
                    title="Reject"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
