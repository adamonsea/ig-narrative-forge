import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edgeError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export const PeriodReviewPanel = ({ topicId, topicSlug }: PeriodReviewPanelProps) => {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [months, setMonths] = useState<number>(6);
  const [customStart, setCustomStart] = useState(monthsAgo(6));
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));
  const [useCustom, setUseCustom] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('topic_period_reviews')
      .select('id, slug, label, period_start, period_end, generated_at')
      .eq('topic_id', topicId)
      .order('generated_at', { ascending: false });
    setReviews((data ?? []) as ReviewRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

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

  const generate = async (start: string, end: string) => {
    setGenerating(true);
    try {
      const label = `${new Date(start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(
        end
      ).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
      const { error } = await supabase.functions.invoke('generate-period-review', {
        body: { topicId, periodStart: start, periodEnd: end, label, slug: `${start}_${end}` },
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
              size="sm"
              variant={!useCustom && months === p.months ? 'default' : 'outline'}
              disabled={generating}
              onClick={() => {
                setUseCustom(false);
                setMonths(p.months);
                generate(monthsAgo(p.months), isoDate(new Date()));
              }}
            >
              {generating && !useCustom && months === p.months && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              {p.label}
            </Button>
          ))}
        </div>
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
                onChange={(e) => setCustomStart(e.target.value)}
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
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-auto"
              />
            </div>
            <Button
              size="sm"
              disabled={generating}
              onClick={() => {
                setUseCustom(true);
                generate(customStart, customEnd);
              }}
            >
              {generating && useCustom && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Generate
            </Button>
          </div>
        </Disclosure>
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
