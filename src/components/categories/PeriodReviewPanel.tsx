import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edgeError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Disclosure } from '@/components/ui/editorial';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ExternalLink, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';

interface PeriodReviewPanelProps {
  topicId: string;
  topicSlug: string;
}

interface ReviewRow {
  id: string;
  slug: string;
  label: string;
  period_start: string;
  period_end: string;
  generated_at: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return isoDate(d);
};

const PRESETS = [
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '12 months', months: 12 },
] as const;

interface OptionRow {
  id: string;
  name: string;
  ids?: string[];
}

export const PeriodReviewPanel = ({ topicId, topicSlug }: PeriodReviewPanelProps) => {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [includeParliamentary, setIncludeParliamentary] = useState(false);
  const [customStart, setCustomStart] = useState(monthsAgo(6));
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));
  const [useCustom, setUseCustom] = useState(false);
  const [categories, setCategories] = useState<OptionRow[]>([]);
  const [sources, setSources] = useState<OptionRow[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from('topic_period_reviews')
      .select('id, slug, label, period_start, period_end, generated_at')
      .eq('topic_id', topicId)
      .order('generated_at', { ascending: false });
    setReviews((data ?? []) as ReviewRow[]);
  };

  const loadOptions = async () => {
    const [{ data: cats }, { data: srcs }] = await Promise.all([
      supabase
        .from('story_categories')
        .select('id, name, parent_id, topic_id')
        .or(`topic_id.is.null,topic_id.eq.${topicId}`)
        .order('name'),
      supabase.rpc('get_topic_sources', { p_topic_id: topicId }),
    ]);
    setCategories(
      ((cats ?? []) as any[])
        .filter((c) => !c.parent_id)
        .map((c) => ({ id: c.id as string, name: c.name as string }))
    );
    const byName = new Map<string, OptionRow>();
    for (const s of (srcs ?? []) as any[]) {
      const name = (s.source_name ?? '').trim();
      const sourceId = s.source_id as string | undefined;
      if (!name || !sourceId) continue;
      const existing = byName.get(name);
      if (existing) existing.ids?.push(sourceId);
      else byName.set(name, { id: sourceId, name, ids: [sourceId] });
    }
    const sourceRows: OptionRow[] = [...byName.values()];
    setSources(sourceRows.sort((a, b) => a.name.localeCompare(b.name)));
  };

  useEffect(() => {
    load();
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);


  const remove = async (r: ReviewRow) => {
    setDeletingId(r.id);
    try {
      const { error } = await supabase.from('topic_period_reviews').delete().eq('id', r.id);
      if (error) throw error;
      setReviews((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: 'Review deleted', description: r.label });
    } catch (err) {
      toast({
        title: 'Could not delete review',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const selectedSourceIds = () =>
    sources.filter((s) => selectedSources.includes(s.id)).flatMap((s) => s.ids ?? [s.id]);

  const selectedSourceNames = () =>
    sources.filter((s) => selectedSources.includes(s.id)).map((s) => s.name);

  const scopeSuffix = () => {
    const parts: string[] = [];
    if (selectedCategories.length) parts.push(`c${selectedCategories.length}-${selectedCategories[0].slice(0, 6)}`);
    if (selectedSources.length)
      parts.push(
        `s${selectedSources.length}-${(selectedSourceNames()[0] ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 6)}`
      );
    if (includeParliamentary) parts.push('parl');
    return parts.length ? `_${parts.join('_')}` : '';
  };

  const scopeLabel = () => {
    const bits: string[] = [];
    if (selectedCategories.length) {
      const names = categories.filter((c) => selectedCategories.includes(c.id)).map((c) => c.name);
      bits.push(names.length <= 2 ? names.join(' & ') : `${names.length} topics`);
    }
    if (selectedSources.length) {
      const names = selectedSourceNames();
      bits.push(names.length <= 2 ? names.join(' & ') : `${names.length} sources`);
    }
    if (includeParliamentary) bits.push('incl. Parliament');
    return bits.length ? ` · ${bits.join(', ')}` : '';
  };

  const fmtDay = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const periodSummary = () => {
    if (useCustom) return `${fmtDay(customStart)} – ${fmtDay(customEnd)}`;
    if (months !== null) return `the last ${months} months`;
    return null;
  };

  const pickPreset = (m: number) => {
    setMonths(m);
    setUseCustom(false);
  };

  const pickCustom = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setUseCustom(true);
    setMonths(null);
  };

  const generate = async (start: string, end: string) => {
    setGenerating(true);
    try {
      const label = `${new Date(start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(
        end
      ).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}${scopeLabel()}`;
      const { error } = await supabase.functions.invoke('generate-period-review', {
        body: {
          topicId,
          periodStart: start,
          periodEnd: end,
          label,
          slug: `${start}_${end}${scopeSuffix()}`,
          categoryIds: selectedCategories,
          sourceIds: selectedSourceIds(),
          sourceNames: selectedSourceNames(),
          includeParliamentary,
        },
      });
      if (error) {
        throw new Error(await edgeErrorMessage(error, 'The review service hit an unexpected problem. Please try again in a moment.'));
      }
      toast({ title: 'Review generated', description: label });
      load();
    } catch (err) {
      toast({
        title: 'Could not generate review',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-medium">Look back over…</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.months}
              type="button"
              size="sm"
              variant={!useCustom && months === p.months ? 'default' : 'outline'}
              aria-pressed={!useCustom && months === p.months}
              onClick={() => pickPreset(p.months)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {(selectedCategories.length > 0 || selectedSources.length > 0) && (
          <p className="text-xs text-muted-foreground">
            Covering{scopeLabel().replace(/^ · /, ' ')}.{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setSelectedCategories([]);
                setSelectedSources([]);
              }}
            >
              Include everything
            </button>
          </p>
        )}
        <Disclosure label="Choose topics and sources">
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Topics</p>
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No topics set up yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={selectedCategories.includes(c.id) ? 'default' : 'outline'}
                      aria-pressed={selectedCategories.includes(c.id)}
                      onClick={() => toggle(selectedCategories, setSelectedCategories, c.id)}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Sources</p>
              {sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sources yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sources.map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={selectedSources.includes(s.id) ? 'default' : 'outline'}
                      aria-pressed={selectedSources.includes(s.id)}
                      onClick={() => toggle(selectedSources, setSelectedSources, s.id)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <Label htmlFor="review-parliamentary" className="text-xs font-medium">
                Include Parliament coverage
                <span className="block font-normal text-muted-foreground">
                  Off by default so it doesn’t skew local comparisons.
                </span>
              </Label>
              <Switch
                id="review-parliamentary"
                checked={includeParliamentary}
                onCheckedChange={setIncludeParliamentary}
              />
            </div>
            <p className="text-xs text-muted-foreground">Nothing selected means everything is included.</p>
          </div>
        </Disclosure>
        <Disclosure label="Pick exact dates">
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="review-start" className="text-xs">
                From
              </Label>
              <Input
                id="review-start"
                type="date"
                value={customStart}
                onChange={(e) => pickCustom(setCustomStart)(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="review-end" className="text-xs">
                To
              </Label>
              <Input
                id="review-end"
                type="date"
                value={customEnd}
                onChange={(e) => pickCustom(setCustomEnd)(e.target.value)}
                className="w-auto"
              />
            </div>
          </div>
        </Disclosure>
        <div className="sticky bottom-4 z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            <p className="text-sm text-muted-foreground">
              {periodSummary() ? (
                <>
                  Reviewing <span className="font-medium text-foreground">{periodSummary()}</span>
                </>
              ) : (
                'Choose a period to review'
              )}
            </p>
            <Button
              size="sm"
              disabled={!periodSummary() || generating}
              onClick={() => {
                if (months === null) return;
                generate(
                  useCustom ? customStart : monthsAgo(months),
                  useCustom ? customEnd : isoDate(new Date())
                );
              }}
            >
              {generating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Generate review
            </Button>
          </div>
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50"
            >
              <Link to={`/feed/${topicSlug}/review/${r.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.period_start} → {r.period_end}
                  </p>
                </div>
                <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete review ${r.label}`}
                    disabled={deletingId === r.id}
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                    <AlertDialogDescription>
                      “{r.label}” will be removed for good. You can always generate it again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(r)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
