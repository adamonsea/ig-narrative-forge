import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BarChart3, ExternalLink, Trash2 } from 'lucide-react';
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

export const PeriodReviewPanel = ({ topicId, topicSlug }: PeriodReviewPanelProps) => {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const today = new Date();
  const sixMonthsAgo = new Date(today.getTime() - 182 * 24 * 60 * 60 * 1000);
  const [start, setStart] = useState(isoDate(sixMonthsAgo));
  const [end, setEnd] = useState(isoDate(today));

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

  const generate = async () => {
    setGenerating(true);
    try {
      const label = `${new Date(start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(
        end
      ).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
      const { error } = await supabase.functions.invoke('generate-period-review', {
        body: { topicId, periodStart: start, periodEnd: end, label, slug: `${start}_${end}` },
      });
      if (error) {
        throw new Error(await extractEdgeFunctionError(error, 'The review service hit an unexpected problem. Please try again in a moment.'));
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
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">State of the area review</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Builds a shareable review of everything published in a period — story mix by category, what grew, hot topics
          and the stories readers cared about.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="review-start" className="text-xs">
              From
            </Label>
            <Input id="review-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="review-end" className="text-xs">
              To
            </Label>
            <Input id="review-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Generate review
        </Button>
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
