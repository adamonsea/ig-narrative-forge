import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { MaskRevealHeading } from '@/components/MaskRevealHeading';
import { ReviewChapter, Reveal, CountUp, GrowBar } from '@/components/review/ReviewChapter';

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
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

const PeriodReview = () => {
  const { slug, reviewSlug } = useParams<{ slug: string; reviewSlug: string }>();
  const [review, setReview] = useState<{ label: string; narrative: string | null; data: ReviewData } | null>(null);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
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

  if (loading) {
    return (
      <main className="min-h-dvh bg-background px-5 py-16">
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
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

  const d = review.data;
  const {
    summary,
    scale,
    categoryBreakdown,
    crimeBreakdown,
    councilBreakdown,
    anomalies = [],
    risingTerms = [],
    fadingTerms = [],
    places = [],
    entities = [],
    categoryPerformance = [],
    sourceScorecard = [],
    timeline,
    hotTopics,
    topStories,
    topic,
  } = d;

  const place = topic?.name ?? 'the area';
  const maxMonth = Math.max(1, ...timeline.map((t) => t.count));
  const maxCat = Math.max(1, ...categoryBreakdown.map((c) => c.count));
  const movers = [...categoryBreakdown]
    .filter((c) => c.change_percent != null && Math.abs(c.change_percent) >= 15 && c.count + c.previous >= 6)
    .sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0))
    .slice(0, 5);
  const totalWords = scale?.total_words ?? summary.total_words ?? 0;

  return (
    <main className="min-h-dvh bg-background">
      <motion.div
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary"
        style={{ scaleX: progress }}
        aria-hidden
      />

      {/* Chapter 1 — cover */}
      <ReviewChapter className="min-h-[85dvh] flex flex-col justify-center">
        <Link
          to={`/feed/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {topic?.name ?? 'Feed'}
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">{review.label}</p>
        <MaskRevealHeading
          as="h1"
          onScroll={false}
          className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]"
          segments={[{ text: 'The state of ' }, { text: place, italic: true }]}
        />
        {d.headline && (
          <Reveal delay={0.35} className="mt-6">
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl">{d.headline}</p>
          </Reveal>
        )}
        <Reveal delay={0.5} className="mt-12">
          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div>
              <div className="text-4xl font-semibold">
                <CountUp value={summary.total_stories} />
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">Stories</div>
            </div>
            {totalWords > 0 && (
              <div>
                <div className="text-4xl font-semibold">
                  <CountUp value={totalWords} />
                </div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">Words written</div>
              </div>
            )}
            <div>
              <div className="text-4xl font-semibold">
                <CountUp value={summary.categories_covered} />
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">Beats covered</div>
            </div>
          </div>
        </Reveal>
      </ReviewChapter>

      {/* Chapter 2 — scale */}
      {scale && (
        <ReviewChapter tone="inverted">
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'The year ' }, { text: 'in numbers', italic: true }]}
          />
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { label: 'Avg words per story', value: scale.avg_words },
              { label: 'Sources drawn on', value: scale.source_count },
              { label: 'Days with news', value: scale.days_covered },
              { label: 'Busiest day', value: scale.busiest_day?.count ?? 0 },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08}>
                <div className="text-3xl font-semibold">
                  <CountUp value={s.value} />
                </div>
                <div className="text-xs uppercase tracking-wide opacity-70 mt-1">{s.label}</div>
              </Reveal>
            ))}
          </div>
          {scale.busiest_day && (
            <Reveal delay={0.4} className="mt-8">
              <p className="text-sm opacity-70">
                Busiest single day:{' '}
                {new Date(scale.busiest_day.date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                .
              </p>
            </Reveal>
          )}
        </ReviewChapter>
      )}

      {/* Chapter 3 — editor's note */}
      {review.narrative && (
        <ReviewChapter>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Editor's note</p>
          <div className="space-y-5">
            {review.narrative.split(/\n{2,}/).map((para, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <p className={i === 0 ? 'text-xl sm:text-2xl leading-relaxed font-medium' : 'text-base leading-relaxed text-muted-foreground'}>
                  {para}
                </p>
              </Reveal>
            ))}
          </div>
        </ReviewChapter>
      )}

      {/* Chapter 4 — what we covered */}
      <ReviewChapter tone="accent">
        <MaskRevealHeading
          className="text-3xl sm:text-4xl font-semibold tracking-tight"
          segments={[{ text: 'What we ' }, { text: 'covered', italic: true }]}
        />
        <ul className="mt-10 space-y-5">
          {categoryBreakdown.map((c, i) => (
            <Reveal key={c.slug} delay={Math.min(0.4, i * 0.05)}>
              <li className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.count}
                    {c.change_percent != null && (
                      <span className={c.change_percent >= 0 ? 'text-primary ml-2' : 'text-muted-foreground ml-2'}>
                        {c.change_percent > 0 ? '+' : ''}
                        {c.change_percent}%
                      </span>
                    )}
                  </span>
                </div>
                <GrowBar ratio={c.count / maxCat} />
              </li>
            </Reveal>
          ))}
        </ul>
      </ReviewChapter>

      {/* Chapter 5 — movers */}
      {movers.length > 0 && (
        <ReviewChapter>
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'What ' }, { text: 'shifted', italic: true }]}
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {movers.map((m, i) => (
              <Reveal key={m.slug} delay={i * 0.08}>
                <div className="rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 text-3xl font-semibold">
                    {(m.change_percent ?? 0) >= 0 ? (
                      <TrendingUp className="h-6 w-6 text-primary" />
                    ) : (
                      <TrendingDown className="h-6 w-6 text-muted-foreground" />
                    )}
                    {(m.change_percent ?? 0) > 0 ? '+' : ''}
                    {m.change_percent}%
                  </div>
                  <p className="mt-2 font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.previous} → {m.count} stories
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </ReviewChapter>
      )}

      {/* Chapter 6 — crime and council deep dives */}
      {[
        { title: 'Crime', data: crimeBreakdown },
        { title: 'Council & politics', data: councilBreakdown },
      ]
        .filter((b) => (b.data?.total ?? 0) > 0)
        .map((b, bi) => (
          <ReviewChapter key={b.title} tone={bi % 2 === 0 ? 'accent' : 'default'}>
            <MaskRevealHeading
              className="text-3xl sm:text-4xl font-semibold tracking-tight"
              segments={[{ text: `${b.title} — ` }, { text: 'up close', italic: true }]}
            />
            <p className="mt-3 text-muted-foreground">
              <CountUp value={b.data!.total} /> stories in this period.
            </p>
            <ul className="mt-8 space-y-4">
              {b.data!.items.slice(0, 10).map((item, i) => {
                const max = Math.max(1, ...b.data!.items.map((x) => x.count));
                return (
                  <Reveal key={item.name} delay={Math.min(0.4, i * 0.05)}>
                    <li className="space-y-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {item.count}
                          {item.change_percent != null && (
                            <span className="ml-2">
                              {item.change_percent > 0 ? '+' : ''}
                              {item.change_percent}%
                            </span>
                          )}
                        </span>
                      </div>
                      <GrowBar ratio={item.count / max} />
                    </li>
                  </Reveal>
                );
              })}
            </ul>
          </ReviewChapter>
        ))}

      {/* Chapter 7 — month by month */}
      {timeline.length > 0 && (
        <ReviewChapter tone="inverted">
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'Month ' }, { text: 'by month', italic: true }]}
          />
          <div className="mt-12 flex items-end gap-2 h-48">
            {timeline.map((t, i) => (
              <div key={t.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-[10px] opacity-70 tabular-nums">{t.count}</span>
                <motion.div
                  className="w-full rounded-t bg-background/90"
                  initial={{ height: reduce ? `${(t.count / maxMonth) * 100}%` : 0 }}
                  whileInView={{ height: `${Math.max(3, (t.count / maxMonth) * 100)}%` }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : i * 0.05, ease: [0.19, 1, 0.22, 1] }}
                />
                <span className="text-[10px] opacity-70">{monthLabel(t.month)}</span>
              </div>
            ))}
          </div>
        </ReviewChapter>
      )}

      {/* Chapter 8 — anomalies */}
      {anomalies.length > 0 && (
        <ReviewChapter>
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'Out of ' }, { text: 'nowhere', italic: true }]}
          />
          <p className="mt-3 text-muted-foreground">
            Words that spiked well above their own normal level in a single month.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {anomalies.map((a, i) => (
              <Reveal key={`${a.term}-${a.month}`} delay={i * 0.07}>
                <div className="rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    {monthLabel(a.month)}
                  </div>
                  <p className="mt-2 text-xl font-semibold">{a.term}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {a.count} stories that month — {a.multiple}× its usual {a.baseline}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </ReviewChapter>
      )}

      {/* Chapter 9 — rising and fading vocabulary */}
      {(risingTerms.length > 0 || fadingTerms.length > 0) && (
        <ReviewChapter tone="accent">
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'New words, ' }, { text: 'old words', italic: true }]}
          />
          {risingTerms.length > 0 && (
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Newly in the news</p>
              <div className="flex flex-wrap gap-2">
                {risingTerms.map((t, i) => (
                  <Reveal key={t.term} delay={Math.min(0.5, i * 0.04)}>
                    <span className="rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-sm">
                      {t.term}
                      <span className="text-muted-foreground ml-2 text-xs tabular-nums">{t.count}</span>
                    </span>
                  </Reveal>
                ))}
              </div>
            </div>
          )}
          {fadingTerms.length > 0 && (
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Gone quiet</p>
              <div className="flex flex-wrap gap-2">
                {fadingTerms.map((t, i) => (
                  <Reveal key={t.term} delay={Math.min(0.5, i * 0.04)}>
                    <span className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground line-through decoration-muted-foreground/40">
                      {t.term}
                    </span>
                  </Reveal>
                ))}
              </div>
            </div>
          )}
        </ReviewChapter>
      )}

      {/* Chapter 10 — places and names */}
      {(places.length > 0 || entities.length > 0 || hotTopics.length > 0) && (
        <ReviewChapter>
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'Places and ' }, { text: 'names', italic: true }]}
          />
          {places.length > 0 && (
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Streets and landmarks</p>
              <div className="flex flex-wrap gap-2">
                {places.map((p) => (
                  <span key={p.term} className="rounded-full border border-border px-3 py-1.5 text-sm">
                    {p.term}
                    <span className="text-muted-foreground ml-2 text-xs tabular-nums">{p.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {(entities.length > 0 ? entities : hotTopics).length > 0 && (
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Most named</p>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                {(entities.length > 0 ? entities : hotTopics).map((h) => (
                  <span
                    key={h.term}
                    className="font-semibold tracking-tight"
                    style={{ fontSize: `${Math.min(2.2, 1 + h.count / 25)}rem` }}
                  >
                    {h.term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </ReviewChapter>
      )}

      {/* Chapter 11 — reader signal */}
      {(topStories.length > 0 || categoryPerformance.length > 0) && (
        <ReviewChapter tone="accent">
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'What readers ' }, { text: 'cared about', italic: true }]}
          />
          {categoryPerformance.length > 0 && (
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Reads per story, by beat</p>
              <ul className="space-y-3">
                {categoryPerformance.map((c, i) => {
                  const max = Math.max(1, ...categoryPerformance.map((x) => x.reads_per_story));
                  return (
                    <Reveal key={c.slug} delay={Math.min(0.4, i * 0.05)}>
                      <li className="space-y-1.5">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground tabular-nums">{c.reads_per_story}</span>
                        </div>
                        <GrowBar ratio={c.reads_per_story / max} className="h-1.5" />
                      </li>
                    </Reveal>
                  );
                })}
              </ul>
            </div>
          )}
          {topStories.length > 0 && (
            <ul className="mt-10 space-y-3">
              {topStories.map((s, i) => (
                <Reveal key={s.id} delay={Math.min(0.4, i * 0.05)}>
                  <li>
                    <Link
                      to={`/feed/${slug}/story/${s.slug ?? s.id}`}
                      className="flex items-start gap-4 rounded-xl p-2 hover:bg-background transition-colors"
                    >
                      <span className="text-2xl font-semibold text-muted-foreground/50 tabular-nums w-8 shrink-0">
                        {i + 1}
                      </span>
                      {s.cover_illustration_url && (
                        <img
                          src={s.cover_illustration_url}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 rounded-lg object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.views} reads{s.shares > 0 ? ` · ${s.shares} shares` : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                </Reveal>
              ))}
            </ul>
          )}
        </ReviewChapter>
      )}

      {/* Chapter 12 — sources */}
      {sourceScorecard.length > 0 && (
        <ReviewChapter>
          <MaskRevealHeading
            className="text-3xl sm:text-4xl font-semibold tracking-tight"
            segments={[{ text: 'Where it ' }, { text: 'came from', italic: true }]}
          />
          <ul className="mt-10 space-y-3">
            {sourceScorecard.map((s, i) => {
              const max = Math.max(1, ...sourceScorecard.map((x) => x.count));
              return (
                <Reveal key={s.name} delay={Math.min(0.4, i * 0.05)}>
                  <li className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground tabular-nums">{s.count}</span>
                    </div>
                    <GrowBar ratio={s.count / max} className="h-1.5" />
                  </li>
                </Reveal>
              );
            })}
          </ul>
        </ReviewChapter>
      )}

      <ReviewChapter tone="inverted" className="text-center">
        <Reveal>
          <p className="text-lg">
            Every story above was gathered, checked and written for {place}.
          </p>
          <Link
            to={`/feed/${slug}`}
            className="inline-block mt-6 rounded-full bg-background text-foreground px-6 py-3 text-sm font-medium"
          >
            Read the feed
          </Link>
        </Reveal>
      </ReviewChapter>
    </main>
  );
};

export default PeriodReview;
