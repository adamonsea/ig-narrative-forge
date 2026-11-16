import { useCallback, useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { publishedCounts, type PublishedCounts } from "@/lib/deskActivity";
import { hasStarted, horizonBuckets, londonTime, londonToday, onePerTitle } from "@/lib/whatsOn";
import { cn } from "@/lib/utils";

export interface GlanceItem { label: string; value: number | null; note?: string }

/** Three quiet figures side by side: today / this week / this month. */
export function GlanceTiles({ items }: { items: GlanceItem[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg bg-background/70 px-3 py-2">
          <dd className="text-xl font-semibold tabular-nums text-foreground">{it.value === null ? "–" : it.value.toLocaleString()}</dd>
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Stories that went live today, in the last 7 days and the last 30. Fetched only when the fold is open. */
export function PublishedGlance({ topicId }: { topicId: string }) {
  const [counts, setCounts] = useState<PublishedCounts | null>(null);
  useEffect(() => {
    if (!topicId) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("stories")
        .select("published_at, topic_articles!inner(topic_id)")
        .eq("topic_articles.topic_id", topicId)
        .eq("is_published", true)
        .gte("published_at", since)
        .limit(5000);
      if (!alive) return;
      setCounts(error ? { today: 0, week: 0, month: 0 } : publishedCounts((data ?? []).map((r) => r.published_at)));
    })();
    return () => { alive = false; };
  }, [topicId]);
  return (
    <GlanceTiles items={[
      { label: "Today", value: counts?.today ?? null },
      { label: "This week", value: counts?.week ?? null },
      { label: "This month", value: counts?.month ?? null },
    ]} />
  );
}

type Timed = { title: string; start_date: string; start_time: string | null };

/**
 * Events ahead today / next 7 days / next 30, live plus waiting (Hidden never counts),
 * each event name counted once at its next date. Reads the events directly so the
 * figures aren't capped by the feed's card list. Fetched only when the fold is open.
 */
export function EventHorizonGlance({ topicId, waiting }: { topicId: string; waiting: Timed[] }) {
  const [live, setLive] = useState<Timed[] | null>(null);
  useEffect(() => {
    if (!topicId) return;
    let alive = true;
    (async () => {
      const today = londonToday();
      const [y, m, d] = today.split("-").map(Number);
      const last = new Date(Date.UTC(y, m - 1, d + 29)).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("events")
        .select("title, start_date, start_time")
        .eq("topic_id", topicId).eq("status", "published")
        .gte("start_date", today).lte("start_date", last)
        .order("start_date").limit(5000);
      if (alive) setLive((data ?? []) as Timed[]);
    })();
    return () => { alive = false; };
  }, [topicId]);

  const today = londonToday();
  const time = londonTime();
  const upcoming = (list: Timed[]) => onePerTitle(list.filter((e) => !hasStarted(e, today, time)));
  const buckets = live ? horizonBuckets(upcoming(live), upcoming(waiting), today, time) : [];
  const item = (key: "today" | "week" | "month", label: string) => {
    const b = buckets.find((x) => x.key === key);
    return { label, value: b ? b.live + b.waiting : null, note: b && b.waiting > 0 ? `${b.waiting} waiting` : undefined };
  };
  return <GlanceTiles items={[item("today", "Today"), item("week", "This week"), item("month", "This month")]} />;
}

/** Is Autopilot running for this feed? `refresh` re-reads it after the owner changes the switch. */
export function useAutopilotOn(topicId: string) {
  const [on, setOn] = useState(false);
  const load = useCallback(async () => {
    if (!topicId) return;
    const { data } = await supabase.from("topic_automation_settings").select("automation_mode").eq("topic_id", topicId).maybeSingle();
    setOn(data?.automation_mode === "holiday");
  }, [topicId]);
  useEffect(() => { load(); }, [load]);
  return { on, refresh: load };
}

export function AutopilotPill({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary", className)}
      title="Autopilot is on: new stories are written and published for you"
    >
      <Plane className="h-3 w-3" aria-hidden="true" />Autopilot
    </span>
  );
}
