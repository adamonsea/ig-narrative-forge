import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BarChart3, ExternalLink } from 'lucide-react';
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

  const generate = async () => {
    setGenerating(true);
    try {
      const label = `${new Date(start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(
        end
      ).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
      const { error } = await supabase.functions.invoke('generate-period-review', {
        body: { topicId, periodStart: start, periodEnd: end, label, slug: `${start}_${end}` },
      });
      if (error) throw error;
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
            <Link
              key={r.id}
              to={`/feed/${topicSlug}/review/${r.slug}`}
              className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">
                  {r.period_start} → {r.period_end}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
