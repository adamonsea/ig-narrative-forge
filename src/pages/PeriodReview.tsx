import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronDown, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import { Reveal, CountUp } from '@/components/review/ReviewChapter';
import { ReviewSlide, BigStat, RankRows } from '@/components/review/ReviewSlide';

interface Movement {
  name: string;
  count: number;
  previous?: number;
  change_percent?: number | null;
}

interface ReviewData {
  summary: {
    total_stories: number;
    previous_total: number;
    change_percent: number | null;
    categories_covered: number;
    total_views: number;
    total_words?: number;
  };
  scale?: {
    total_words: number;
    avg_words: number;
    source_count: number;
    days_covered: number;
    busiest_day: { date: string; count: number } | null;
  };
  headline?: string | null;
  categoryBreakdown: Array<{ slug: string; name: string; count: number; previous: number; change_percent: number | null }>;
  subcategoryBreakdown: Array<{ name: string; count: number }>;
  subcategoryInsights?: Array<{
    slug: string;
    name: string;
    total: number;
    concentration: number;
    items: Array<{
      name: string;
      count: number;
      share: number;
      previous: number;
      change_percent: number | null;
      peak_month: string | null;
    }>;
  }>;
  subcategoryMovers?: Array<{
    parent: string;
    name: string;
    count: number;
    previous: number;
    change_percent: number | null;
    peak_month: string | null;
  }>;
  distinctiveTerms?: Array<{
    term: string;
    count: number;
    peak_month: string | null;
    burst: number;
    months_present: number;
  }>;
  termTrends?: Array<{
    term: string;
    total: number;
    series: number[];
    peak_month: string | null;
    trend: 'rising' | 'fading' | 'spiky' | 'steady';
  }>;
  trendMonths?: string[];

  crimeBreakdown?: { total: number; items: Movement[] };
  councilBreakdown?: { total: number; items: Movement[] };
  anomalies?: Array<{ term: string; month: string; count: number; baseline: number; multiple: number }>;
  risingTerms?: Array<{ term: string; count: number; month: string | null }>;
  fadingTerms?: Array<{ term: string; count: number }>;
  places?: Array<{ term: string; count: number }>;
  entities?: Array<{ term: string; count: number }>;
  categoryPerformance?: Array<{ slug: string; name: string; stories: number; views: number; reads_per_story: number }>;
  sourceScorecard?: Array<{ name: string; count: number }>;
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

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short' });

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString();

const PeriodReview = () => {
  const { slug, reviewSlug } = useParams<{ slug: string; reviewSlug: string }>();
  const [review, setReview] = useState<{ label: string; narrative: string | null; data: ReviewData } | null>(null);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollReady, setScrollReady] = useState(false);
  const { scrollYProgress } = useScroll(scrollReady ? { container: scrollRef } : {});
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });


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
        setReview(data ? { ...data, data: data.data as unknown as ReviewData } : null);
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

  useEffect(() => {
    if (!loading && review && scrollRef.current) {
      setScrollReady(true);
    } else {
      setScrollReady(false);
    }
  }, [loading, review]);


  if (loading) {
    return (
      <main className="min-h-dvh bg-background px-6 py-16">
        <div className="mx-auto max-w-lg space-y-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  if (!review) {
    return (
      <main className="min-h-dvh bg-background px-4 py-16">
        <div className="mx-auto max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Review not found</h1>
          <p className="text-muted-foreground">This review may have been removed or is not public.</p>
          <Link to={`/feed/${slug}`} className="text-primary underline">
            Back to the feed
          </Link>
        </div>
      </main>
    );
  }

  const d = review.data;
  const {
    summary,
    scale,
    categoryBreakdown,
    subcategoryInsights = [],
    subcategoryMovers = [],
    distinctiveTerms = [],
    termTrends = [],
    trendMonths = [],
    anomalies = [],
    risingTerms = [],
    places = [],
    entities = [],
    sourceScorecard = [],
    timeline,
    hotTopics,
    topStories,
    topic,
  } = d;

  const place = topic?.name ?? 'the area';
  const maxMonth = Math.max(1, ...timeline.map((t) => t.count));
  const peakMonth = timeline.reduce<{ month: string; count: number } | null>(
    (best, t) => (!best || t.count > best.count ? t : best),
    null
  );
  const topMover = [...categoryBreakdown]
    .filter((c) => c.change_percent != null && Math.abs(c.change_percent) >= 15 && c.count + c.previous >= 6)
    .sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0))[0];
  const totalWords = scale?.total_words ?? summary.total_words ?? 0;
  const spike = anomalies[0];
  const names =
    distinctiveTerms.length > 0
      ? distinctiveTerms.slice(0, 6).map((t) => ({ term: t.term, count: t.count }))
      : (entities.length > 0 ? entities : hotTopics).slice(0, 6);
  const subDeepDives = subcategoryInsights.slice(0, 3);
  const chartMonths = trendMonths.length > 0 ? trendMonths : timeline.map((t) => t.month);
  const pullQuote = (review.narrative ?? '').split(/\n{2,}/)[0]?.trim() ?? '';


  return (
    <main
      ref={scrollRef}
      className="h-dvh overflow-y-auto snap-y snap-mandatory bg-background scroll-smooth"
    >
      <motion.div
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary"
        style={{ scaleX: progress }}
        aria-hidden
      />

      {/* Cover */}
      <ReviewSlide>
        <Link
          to={`/feed/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {topic?.name ?? 'Feed'}
        </Link>
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mb-4">{review.label}</p>
        <MaskRevealHeading
          as="h1"
          onScroll={false}
          className="text-[clamp(2.5rem,11vw,4.5rem)] font-semibold tracking-tight leading-[1.02]"
          segments={[{ text: 'The state of ' }, { text: place, italic: true }]}
        />
        <Reveal delay={0.4} className="mt-10">
          <div className="flex items-end gap-8">
            <div>
              <div className="text-5xl font-semibold tracking-tight">
                <CountUp value={summary.total_stories} />
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Stories</p>
            </div>
            <div>
              <div className="text-5xl font-semibold tracking-tight">
                <CountUp value={summary.categories_covered} />
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Beats</p>
            </div>
          </div>
        </Reveal>
        <motion.div
          className="mt-14 flex items-center gap-2 text-xs text-muted-foreground"
          animate={reduce ? undefined : { y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
        >
          <ChevronDown className="h-4 w-4" />
          Scroll
        </motion.div>
      </ReviewSlide>

      {/* Words written */}
      {totalWords > 0 && (
        <ReviewSlide tone="inverted" label="The scale">
          <BigStat value={<CountUp value={totalWords} />} caption={`words published about ${place}`} />
          {scale && (
            <Reveal delay={0.2} className="mt-10 flex gap-10 text-sm opacity-70">
              <span>{scale.days_covered} days with news</span>
              <span>{scale.source_count} sources</span>
            </Reveal>
          )}
        </ReviewSlide>
      )}

      {/* Pull quote */}
      {pullQuote && (
        <ReviewSlide label="In short">
          <Reveal>
            <p className="text-2xl sm:text-3xl font-medium leading-snug tracking-tight">{pullQuote}</p>
          </Reveal>
        </ReviewSlide>
      )}

      {/* Top beats */}
      {categoryBreakdown.length > 0 && (
        <ReviewSlide tone="accent" label="What we covered">
          <MaskRevealHeading
            className="mb-8 text-3xl font-semibold tracking-tight"
            segments={[{ text: 'The five ' }, { text: 'biggest beats', italic: true }]}
          />
          <RankRows
            items={categoryBreakdown.slice(0, 5).map((c) => ({
              key: c.slug,
              label: c.name,
              value: c.count,
              note: c.change_percent != null ? `${c.change_percent > 0 ? '+' : ''}${c.change_percent}%` : undefined,
            }))}
          />
        </ReviewSlide>
      )}

      {/* Biggest shift */}
      {topMover && (
        <ReviewSlide label="The shift">
          <div className="flex items-center gap-3">
            {(topMover.change_percent ?? 0) >= 0 ? (
              <TrendingUp className="h-10 w-10 text-primary" />
            ) : (
              <TrendingDown className="h-10 w-10 text-muted-foreground" />
            )}
            <BigStat
              value={`${(topMover.change_percent ?? 0) > 0 ? '+' : ''}${topMover.change_percent}`}
              suffix="%"
              caption={`${topMover.name} — ${topMover.previous} to ${topMover.count} stories`}
            />
          </div>
        </ReviewSlide>
      )}

      {/* Rhythm */}
      {timeline.length > 1 && (
        <ReviewSlide tone="inverted" label="Month by month">
          <div className="flex h-56 items-end gap-1.5">
            {timeline.map((t, i) => (
              <div key={t.month} className="flex h-full flex-1 flex-col justify-end gap-2">
                <motion.div
                  className="w-full rounded-t bg-background/90"
                  initial={{ height: reduce ? `${(t.count / maxMonth) * 100}%` : 0 }}
                  whileInView={{ height: `${Math.max(3, (t.count / maxMonth) * 100)}%` }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : i * 0.05, ease: [0.19, 1, 0.22, 1] }}
                />
                <span className="text-center text-[10px] opacity-60">{monthLabel(t.month)}</span>
              </div>
            ))}
          </div>
          {peakMonth && (
            <Reveal delay={0.3} className="mt-8">
              <p className="text-sm opacity-70">
                Busiest month: {monthLabel(peakMonth.month)} — {peakMonth.count} stories.
              </p>
            </Reveal>
          )}
        </ReviewSlide>
      )}

      {/* Spike */}
      {spike && (
        <ReviewSlide tone="accent" label="Out of nowhere">
          <Reveal>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              {monthLabel(spike.month)}
            </div>
            <p className="mt-4 text-[clamp(2.5rem,12vw,4.5rem)] font-semibold leading-none tracking-tight">
              {spike.term}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              {spike.multiple}× its usual level — {spike.count} stories that month
            </p>
          </Reveal>
        </ReviewSlide>
      )}

      {/* Words of the period */}
      {(risingTerms.length > 0 || names.length > 0) && (
        <ReviewSlide label="The words">
          <MaskRevealHeading
            className="mb-8 text-3xl font-semibold tracking-tight"
            segments={[{ text: 'Names that ' }, { text: 'kept coming up', italic: true }]}
          />
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
            {names.map((h, i) => (
              <Reveal key={h.term} delay={Math.min(0.4, i * 0.06)}>
                <span
                  className="font-semibold tracking-tight"
                  style={{ fontSize: `${Math.min(2.4, 1.1 + h.count / 22)}rem` }}
                >
                  {h.term}
                </span>
              </Reveal>
            ))}
          </div>
          {risingTerms.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-2">
              {risingTerms.slice(0, 6).map((t, i) => (
                <Reveal key={t.term} delay={Math.min(0.4, i * 0.05)}>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm">
                    ↑ {t.term}
                  </span>
                </Reveal>
              ))}
            </div>
          )}
        </ReviewSlide>
      )}

      {/* Places */}
      {places.length > 0 && (
        <ReviewSlide tone="accent" label="On the map">
          <MaskRevealHeading
            className="mb-8 text-3xl font-semibold tracking-tight"
            segments={[{ text: 'Streets in ' }, { text: 'the news', italic: true }]}
          />
          <div className="flex flex-wrap gap-2">
            {places.slice(0, 8).map((p, i) => (
              <Reveal key={p.term} delay={Math.min(0.4, i * 0.05)}>
                <span className="rounded-full border border-border px-3 py-1.5 text-sm">{p.term}</span>
              </Reveal>
            ))}
          </div>
        </ReviewSlide>
      )}

      {/* Most read */}
      {topStories.length > 0 && (
        <ReviewSlide label="Most read">
          <ul className="space-y-4">
            {topStories.slice(0, 3).map((s, i) => (
              <Reveal key={s.id} delay={i * 0.08}>
                <li>
                  <Link
                    to={`/feed/${slug}/story/${s.slug ?? s.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-border p-3 transition-colors hover:bg-muted"
                  >
                    {s.cover_illustration_url ? (
                      <img
                        src={s.cover_illustration_url}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="w-8 shrink-0 text-2xl font-semibold tabular-nums text-muted-foreground/50">
                        {i + 1}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium">{s.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{compact(s.views)} reads</p>
                    </div>
                  </Link>
                </li>
              </Reveal>
            ))}
          </ul>
        </ReviewSlide>
      )}

      {/* Sources */}
      {sourceScorecard.length > 0 && (
        <ReviewSlide tone="inverted" label="Where it came from">
          <RankRows
            tone="inverted"
            items={sourceScorecard.slice(0, 5).map((s) => ({ key: s.name, label: s.name, value: s.count }))}
          />
        </ReviewSlide>
      )}

      {/* Outro */}
      <ReviewSlide className="text-center">
        <Reveal>
          <p className="text-xl font-medium tracking-tight">Every story, gathered and written for {place}.</p>
          <Link
            to={`/feed/${slug}`}
            className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Read the feed
          </Link>
        </Reveal>
      </ReviewSlide>
    </main>
  );
};

export default PeriodReview;
