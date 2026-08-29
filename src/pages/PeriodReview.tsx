import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';

interface ReviewData {
  summary: {
    total_stories: number;
    previous_total: number;
    change_percent: number | null;
    categories_covered: number;
    total_views: number;
  };
  categoryBreakdown: Array<{ slug: string; name: string; count: number; previous: number; change_percent: number | null }>;
  subcategoryBreakdown: Array<{ name: string; count: number }>;
  timeline: Array<{ month: string; count: number }>;
  hotTopics: Array<{ term: string; count: number }>;
  topStories: Array<{
    id: string;
    slug: string | null;
    title: string;
    cover_illustration_url: string | null;
    views: number;
    shares: number;
  }>;
  topic: { name?: string; region?: string; slug?: string };
}

const PeriodReview = () => {
  const { slug, reviewSlug } = useParams<{ slug: string; reviewSlug: string }>();
  const [review, setReview] = useState<{ label: string; narrative: string | null; data: ReviewData } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: topic } = await supabase.from('topics').select('id, name').eq('slug', slug).maybeSingle();
      if (!topic) {
        if (!cancelled) {
          setReview(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from('topic_period_reviews')
        .select('label, narrative, data')
        .eq('topic_id', topic.id)
        .eq('slug', reviewSlug)
        .maybeSingle();
      if (!cancelled) {
        setReview(data ? ({ ...data, data: data.data as unknown as ReviewData }) : null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, reviewSlug]);

  useEffect(() => {
    if (review) {
      document.title = `${review.data.topic?.name ?? 'Feed'} review — ${review.label}`;
    }
  }, [review]);

  if (loading) {
    return (
      <main className="min-h-dvh bg-background px-4 py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  if (!review) {
    return (
      <main className="min-h-dvh bg-background px-4 py-16">
        <div className="mx-auto max-w-2xl text-center space-y-3">
          <h1 className="text-2xl font-semibold">Review not found</h1>
          <p className="text-muted-foreground">This review may have been removed or is not public.</p>
          <Link to={`/feed/${slug}`} className="text-primary underline">
            Back to the feed
          </Link>
        </div>
      </main>
    );
  }

  const { summary, categoryBreakdown, subcategoryBreakdown, timeline, hotTopics, topStories, topic } = review.data;
  const maxMonth = Math.max(1, ...timeline.map((t) => t.count));
  const maxCat = Math.max(1, ...categoryBreakdown.map((c) => c.count));

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-10">
        <header className="space-y-3">
          <Link to={`/feed/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            {topic?.name ?? 'Feed'}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            The state of {topic?.name ?? 'the area'}
          </h1>
          <p className="text-muted-foreground">{review.label}</p>
        </header>

        <section className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-semibold">{summary.total_stories}</div>
            <div className="text-xs text-muted-foreground">Stories published</div>
          </div>
          <div>
            <div className="text-2xl font-semibold flex items-center gap-1">
              {summary.change_percent != null ? (
                <>
                  {summary.change_percent >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-primary" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  {summary.change_percent > 0 ? '+' : ''}
                  {summary.change_percent}%
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="text-xs text-muted-foreground">vs previous period</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{summary.categories_covered}</div>
            <div className="text-xs text-muted-foreground">Categories covered</div>
          </div>
        </section>

        {review.narrative && (
          <section className="rounded-xl border border-border p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">Editor's note</h2>
            <p className="text-base leading-relaxed">{review.narrative}</p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">What we covered</h2>
          <ul className="space-y-2">
            {categoryBreakdown.map((c) => (
              <li key={c.slug} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.count}
                    {c.change_percent != null && (
                      <span className={c.change_percent >= 0 ? 'text-primary ml-2' : 'text-muted-foreground ml-2'}>
                        {c.change_percent > 0 ? '+' : ''}
                        {c.change_percent}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {subcategoryBreakdown.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Story types</h2>
            <div className="flex flex-wrap gap-2">
              {subcategoryBreakdown.map((s) => (
                <Badge key={s.name} variant="secondary">
                  {s.name} · {s.count}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {timeline.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Month by month</h2>
            <div className="flex items-end gap-1.5 h-28">
              {timeline.map((t) => (
                <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary/80 rounded-t"
                    style={{ height: `${(t.count / maxMonth) * 100}%` }}
                    title={`${t.month}: ${t.count}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{t.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {hotTopics.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Hot topics</h2>
            <div className="flex flex-wrap gap-2">
              {hotTopics.map((h) => (
                <span
                  key={h.term}
                  className="rounded-full border border-border px-3 py-1 text-sm"
                  style={{ fontSize: `${Math.min(1.15, 0.8 + h.count / 40)}rem` }}
                >
                  {h.term}
                  <span className="text-muted-foreground ml-1.5 text-xs">{h.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {topStories.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              What readers cared about
            </h2>
            <ul className="space-y-2">
              {topStories.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/feed/${slug}/story/${s.slug ?? s.id}`}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    {s.cover_illustration_url && (
                      <img src={s.cover_illustration_url} alt="" loading="lazy" className="h-12 w-12 rounded object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium line-clamp-2">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.views} reads{s.shares > 0 ? ` · ${s.shares} shares` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
};

export default PeriodReview;
