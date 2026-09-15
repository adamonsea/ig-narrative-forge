import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// Side-by-side comparison of image models on real stories, so the replacement
// for GPT Image 1.5 (removed from the OpenAI API on 1 December 2026) is chosen
// on how the pictures actually look rather than on price alone.

const MODELS = [
  { id: 'gpt-image-1.5', label: 'Image 1.5 (current)' },
  { id: 'gpt-image-2', label: 'Image 2' },
  { id: 'gpt-image-2.5-flare', label: 'Image 2.5 Flare' },
  { id: 'gpt-image-2.5-sunburst', label: 'Image 2.5 Sunburst' },
];

const QUALITIES = [
  { id: 'low', label: 'Quick' },
  { id: 'medium', label: 'Creative' },
  { id: 'high', label: 'Premium' },
  { id: 'xhigh', label: 'Extra (2.5 only)' },
  { id: 'max', label: 'Max (2.5 only)' },
];

const PRICES: Record<string, Record<string, number>> = {
  'gpt-image-1.5': { low: 0.013, medium: 0.05, high: 0.2 },
  'gpt-image-2': { low: 0.006, medium: 0.041, high: 0.165 },
  'gpt-image-2.5-flare': { low: 0.006, medium: 0.041, high: 0.165, xhigh: 0.25, max: 0.32 },
  'gpt-image-2.5-sunburst': { low: 0.006, medium: 0.041, high: 0.165, xhigh: 0.25, max: 0.32 },
};

interface StoryOption {
  id: string;
  title: string;
}

interface BenchResult {
  id: string;
  run_id: string;
  story_id: string | null;
  story_title: string | null;
  model: string;
  quality: string;
  image_url: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  success: boolean;
  error: string | null;
  verdict: string | null;
}

const qualityLabel = (q: string) => QUALITIES.find((x) => x.id === q)?.label ?? q;
const modelLabel = (m: string) => MODELS.find((x) => x.id === m)?.label ?? m;

const ImageModelBench: React.FC = () => {
  const { isProductOwner, loading: authLoading } = useAuth();

  const [stories, setStories] = useState<StoryOption[]>([]);
  const [selectedStories, setSelectedStories] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-image-1.5', 'gpt-image-2']);
  const [selectedQualities, setSelectedQualities] = useState<string[]>(['low', 'medium', 'high']);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BenchResult[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);

  const loadResults = useCallback(async () => {
    const { data } = await supabase
      .from('image_bench_results' as never)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setResults((data as unknown as BenchResult[]) || []);
  }, []);

  useEffect(() => {
    if (!isProductOwner) return;
    const load = async () => {
      const { data } = await supabase
        .from('stories')
        .select('id, title, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(40);
      setStories(((data as unknown as StoryOption[]) || []));
      setLoadingStories(false);
    };
    load();
    loadResults();
  }, [isProductOwner, loadResults]);

  const estimate = useMemo(() => {
    let images = 0;
    let cost = 0;
    selectedStories.forEach(() => {
      selectedModels.forEach((m) => {
        selectedQualities.forEach((q) => {
          const isTwoFive = m.startsWith('gpt-image-2.5');
          if (!isTwoFive && (q === 'xhigh' || q === 'max')) return;
          images += 1;
          cost += PRICES[m]?.[q] ?? 0;
        });
      });
    });
    return { images, cost };
  }, [selectedStories, selectedModels, selectedQualities]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const runBench = async () => {
    if (selectedStories.length === 0 || selectedModels.length === 0 || selectedQualities.length === 0) {
      toast.error('Pick at least one story, model and quality level');
      return;
    }

    // One picture per call: a single high-quality generation can take over a
    // minute and the function is cut off at 150 seconds.
    const jobs: { storyId: string; model: string; quality: string }[] = [];
    selectedStories.forEach((storyId) => {
      selectedModels.forEach((model) => {
        selectedQualities.forEach((quality) => {
          const isTwoFive = model.startsWith('gpt-image-2.5');
          if (!isTwoFive && (quality === 'xhigh' || quality === 'max')) return;
          jobs.push({ storyId, model, quality });
        });
      });
    });

    setRunning(true);
    setProgress({ done: 0, total: jobs.length });
    const runId = crypto.randomUUID();
    const promptByStory = new Map<string, string>();

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        const { data, error } = await supabase.functions.invoke('image-model-bench', {
          body: {
            storyIds: [job.storyId],
            models: [job.model],
            qualities: [job.quality],
            runId,
            // Reuse the prompt already built for this story so we only pay for
            // the wording work once.
            promptOverride: promptByStory.get(job.storyId),
          },
        });
        if (error) throw error;
        const returnedPrompt = (data as { results?: { prompt?: string }[] })?.results?.[0]?.prompt;
        if (returnedPrompt) promptByStory.set(job.storyId, returnedPrompt);
      } catch (error) {
        console.error(error);
        toast.error(`${modelLabel(job.model)} · ${qualityLabel(job.quality)} failed — carrying on`);
      }
      setProgress({ done: i + 1, total: jobs.length });
      await loadResults();
    }

    setRunning(false);
    toast.success('Comparison finished');
  };

  const setVerdict = async (id: string, verdict: string) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, verdict } : r)));
    const { error } = await supabase
      .from('image_bench_results' as never)
      .update({ verdict } as never)
      .eq('id', id);
    if (error) toast.error('Could not save that rating');
  };

  const grouped = useMemo(() => {
    const map = new Map<string, BenchResult[]>();
    results.forEach((r) => {
      const key = `${r.run_id}::${r.story_id}`;
      map.set(key, [...(map.get(key) || []), r]);
    });
    return Array.from(map.entries());
  }, [results]);

  const tally = useMemo(() => {
    const map = new Map<string, { good: number; acceptable: number; reject: number }>();
    results.forEach((r) => {
      if (!r.verdict) return;
      const key = `${modelLabel(r.model)} · ${qualityLabel(r.quality)}`;
      const current = map.get(key) || { good: 0, acceptable: 0, reject: 0 };
      current[r.verdict as 'good' | 'acceptable' | 'reject'] += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].good - a[1].good);
  }, [results]);

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20"><Spinner /></div>
      </AppLayout>
    );
  }

  if (!isProductOwner) {
    return (
      <AppLayout>
        <main className="container mx-auto py-10 px-4">
          <p className="text-sm text-muted-foreground">This page is not available on your account.</p>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="container mx-auto py-6 px-4 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Image model comparison</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The current model stops working on 1 December. Generate the same story across models and
            quality levels, then rate the pictures to decide what replaces it.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Set up a comparison</CardTitle>
            <CardDescription>
              Each picture uses exactly the prompt the live pipeline would build, so you are comparing
              models rather than wording.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h2 className="text-sm font-medium mb-2">Models</h2>
              <div className="flex flex-wrap gap-4">
                {MODELS.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`model-${m.id}`}
                      checked={selectedModels.includes(m.id)}
                      onCheckedChange={() => toggle(selectedModels, setSelectedModels, m.id)}
                    />
                    <Label htmlFor={`model-${m.id}`} className="text-sm">{m.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium mb-2">Quality levels</h2>
              <div className="flex flex-wrap gap-4">
                {QUALITIES.map((q) => (
                  <div key={q.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`quality-${q.id}`}
                      checked={selectedQualities.includes(q.id)}
                      onCheckedChange={() => toggle(selectedQualities, setSelectedQualities, q.id)}
                    />
                    <Label htmlFor={`quality-${q.id}`} className="text-sm">{q.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium mb-2">Stories (most recent published)</h2>
              {loadingStories ? (
                <Spinner />
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-3">
                  {stories.map((s) => (
                    <div key={s.id} className="flex items-start gap-2">
                      <Checkbox
                        id={`story-${s.id}`}
                        checked={selectedStories.includes(s.id)}
                        onCheckedChange={() => toggle(selectedStories, setSelectedStories, s.id)}
                      />
                      <Label htmlFor={`story-${s.id}`} className="text-sm leading-snug">{s.title}</Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {estimate.images} pictures · about ${estimate.cost.toFixed(2)}
              </p>
              <Button onClick={runBench} disabled={running || estimate.images === 0}>
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Story {progress.done} of {progress.total}
                  </>
                ) : (
                  'Run comparison'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {tally.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your ratings so far</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Model and level</th>
                    <th className="py-2 pr-4 font-medium">Good</th>
                    <th className="py-2 pr-4 font-medium">Acceptable</th>
                    <th className="py-2 font-medium">Reject</th>
                  </tr>
                </thead>
                <tbody>
                  {tally.map(([key, counts]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 pr-4">{key}</td>
                      <td className="py-2 pr-4">{counts.good}</td>
                      <td className="py-2 pr-4">{counts.acceptable}</td>
                      <td className="py-2">{counts.reject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <section className="space-y-6">
          {grouped.map(([key, rows]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base">{rows[0].story_title || 'Untitled story'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((r) => (
                    <div key={r.id} className="space-y-2">
                      {r.image_url ? (
                        <a href={r.image_url} target="_blank" rel="noreferrer">
                          <img
                            src={r.image_url}
                            alt={`${modelLabel(r.model)} at ${qualityLabel(r.quality)}`}
                            loading="lazy"
                            className="w-full aspect-[3/2] object-cover rounded-md border"
                          />
                        </a>
                      ) : (
                        <div className="w-full aspect-[3/2] rounded-md border bg-muted flex items-center justify-center p-3">
                          <p className="text-xs text-muted-foreground text-center">{r.error || 'No image'}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline">{modelLabel(r.model)}</Badge>
                        <Badge variant="outline">{qualityLabel(r.quality)}</Badge>
                        {r.cost_usd !== null && <span>${Number(r.cost_usd).toFixed(3)}</span>}
                        {r.duration_ms !== null && <span>{(r.duration_ms / 1000).toFixed(1)}s</span>}
                      </div>
                      {r.image_url && (
                        <div className="flex gap-1">
                          {(['good', 'acceptable', 'reject'] as const).map((v) => (
                            <Button
                              key={v}
                              size="sm"
                              variant={r.verdict === v ? 'default' : 'outline'}
                              className="h-7 text-xs capitalize"
                              onClick={() => setVerdict(r.id, v)}
                            >
                              {v}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </AppLayout>
  );
};

export default ImageModelBench;
