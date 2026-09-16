import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/editorial";
import { AnimatedNumber } from "./AnimatedNumber";
import { FlowRibbon } from "./FlowRibbon";
import {
  useCoverageMix,
  useDailyFlow,
  useLiveReaders,
  usePopularStories,
  useRisingTerms,
  useSourceMix,
} from "./useTopicInsight";

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <h3 className="section-label mb-3 flex items-center gap-1.5">
        {title}
        {hint && <InfoHint label={title}>{hint}</InfoHint>}
      </h3>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Bar({ value, max, muted }: { value: number; max: number; muted?: boolean }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 rounded-full bg-muted overflow-hidden">
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-700 ease-out",
          muted ? "bg-muted-foreground/40" : "bg-purple-bright"
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function LiveInsightStrip({
  topicId,
  liveCount,
  arrivalsCount,
}: {
  topicId: string;
  liveCount: number;
  arrivalsCount: number;
}) {
  const readers = useLiveReaders(topicId);
  const { data: flow } = useDailyFlow(topicId);
  const { data: coverage } = useCoverageMix(topicId);
  const { data: terms } = useRisingTerms(topicId);
  const { data: sources } = useSourceMix(topicId);
  const { data: popular } = usePopularStories(topicId);
  const [pulse, setPulse] = useState(false);

  // A soft pulse whenever something new lands, so the page feels alive.
  useEffect(() => {
    if (!topicId) return;
    const channel = supabase
      .channel(`insight-${topicId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "topic_articles" }, () => {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 1800);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId]);

  const totals = useMemo(() => {
    const gathered = flow.reduce((n, d) => n + Number(d.gathered || 0), 0);
    const published = flow.reduce((n, d) => n + Number(d.published || 0), 0);
    const rate = gathered > 0 ? Math.round((published / gathered) * 100) : 0;
    const week = flow.slice(-7).reduce((n, d) => n + Number(d.published || 0), 0);
    const priorWeek = flow.slice(-14, -7).reduce((n, d) => n + Number(d.published || 0), 0);
    return { gathered, published, rate, week, priorWeek };
  }, [flow]);

  const coverageMax = Math.max(1, ...coverage.map((c) => Number(c.current_count)));
  const sourceMax = Math.max(1, ...sources.map((s) => Number(s.stories_published_7d || 0)));
  const quietSources = sources.filter((s) => !Number(s.stories_published_7d));

  const weekTrend =
    totals.priorWeek === 0
      ? null
      : totals.week === totals.priorWeek
      ? "level with last week"
      : totals.week > totals.priorWeek
      ? `up on last week's ${totals.priorWeek}`
      : `down on last week's ${totals.priorWeek}`;

  return (
    <div className="rounded-2xl border bg-card">
      {/* Headline figures */}
      <div className="p-5 md:p-6 border-b">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                readers?.hour ? "bg-pop live-pulse" : "bg-muted-foreground/40",
                pulse && "live-pulse"
              )}
            />
            {readers === null
              ? "Checking readers…"
              : readers.hour > 0
              ? `${readers.hour} reading in the last hour · ${readers.today} today`
              : readers.today > 0
              ? `${readers.today} read your feed today`
              : "Quiet right now"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <AnimatedNumber value={liveCount} className="display-heading text-3xl md:text-4xl block leading-none" />
            <p className="text-xs text-muted-foreground mt-1.5">Live stories</p>
          </div>
          <div>
            <AnimatedNumber value={totals.week} className="display-heading text-3xl md:text-4xl block leading-none" />
            <p className="text-xs text-muted-foreground mt-1.5">
              Published this week{weekTrend ? `, ${weekTrend}` : ""}
            </p>
          </div>
          <div>
            <AnimatedNumber
              value={totals.gathered}
              className="display-heading text-3xl md:text-4xl block leading-none"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Gathered in 30 days</p>
          </div>
          <div>
            <AnimatedNumber
              value={totals.rate}
              format={(n) => `${n}%`}
              className="display-heading text-3xl md:text-4xl block leading-none"
            />
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
              You publish
              <InfoHint label="Publish rate">
                The share of gathered stories you let through. Low means your news values are tight; high means
                almost everything passes.
              </InfoHint>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FlowRibbon data={flow} />
        </div>
      </div>

      {/* Content and reader insight */}
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <div className="p-5 md:p-6 space-y-6">
          <Panel
            title="What your feed is about"
            hint="Share of your live stories by category over the last 30 days, with the month before shown faintly."
          >
            {coverage.length === 0 ? (
              <Quiet>Categories appear once your live stories have been sorted.</Quiet>
            ) : (
              <ul className="space-y-2.5">
                {coverage.slice(0, 6).map((c) => (
                  <li key={c.category_name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{c.category_name}</span>
                      <span className="text-muted-foreground tabular-nums text-xs">{c.current_count}</span>
                    </div>
                    <Bar value={Number(c.current_count)} max={coverageMax} />
                    {Number(c.previous_count) > 0 && (
                      <Bar value={Number(c.previous_count)} max={coverageMax} muted />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Rising places and subjects"
            hint="Terms matched on incoming stories that have grown fastest in the last seven days."
          >
            {terms.length === 0 ? (
              <Quiet>Nothing standing out this week.</Quiet>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {terms.map((t) => (
                  <span
                    key={t.term}
                    className="rounded-full bg-mint-soft px-2.5 py-1 text-xs"
                    title={`${t.recent_count} in the last 7 days`}
                  >
                    {t.term} <span className="text-muted-foreground tabular-nums">{t.recent_count}</span>
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="p-5 md:p-6 space-y-6">
          <Panel title="Where the feed comes from" hint="Stories published from each source in the last seven days.">
            {sources.length === 0 ? (
              <Quiet>No sources yet.</Quiet>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {sources.slice(0, 5).map((s) => (
                    <li key={s.source_id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate">{s.source_name || s.canonical_domain}</span>
                        <span className="text-muted-foreground tabular-nums text-xs">{s.stories_published_7d || 0}</span>
                      </div>
                      <Bar value={Number(s.stories_published_7d || 0)} max={sourceMax} />
                    </li>
                  ))}
                </ul>
                {quietSources.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    {quietSources.length} source{quietSources.length === 1 ? " has" : "s have"} sent nothing this week.
                  </p>
                )}
              </>
            )}
          </Panel>

          <Panel title="What readers reached for" hint="Your best-performing live stories, by reader reactions.">
            {popular.length === 0 ? (
              <Quiet>
                Not enough reader activity yet — this fills in as people start using your feed.
              </Quiet>
            ) : (
              <ol className="space-y-2">
                {popular.map((p, i) => (
                  <li key={p.story_id} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground tabular-nums w-4 shrink-0">{i + 1}</span>
                    <span className="truncate flex-1">{p.headline}</span>
                    <span className="text-muted-foreground tabular-nums text-xs shrink-0">{p.swipe_count}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {arrivalsCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {arrivalsCount} arrival{arrivalsCount === 1 ? "" : "s"} waiting on your decision below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
