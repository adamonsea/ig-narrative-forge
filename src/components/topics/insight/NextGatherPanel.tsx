import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radar } from "lucide-react";

interface SweepSource {
  name: string;
  stored: number;
}

interface Props {
  topicId: string;
}

const SWEEP_WINDOW_MS = 20 * 60 * 1000;

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const NextGatherPanel: React.FC<Props> = ({ topicId }) => {
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [frequencyHours, setFrequencyHours] = useState<number>(4);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [automationMode, setAutomationMode] = useState<string>("manual");
  const [sweepAt, setSweepAt] = useState<string | null>(null);
  const [sources, setSources] = useState<SweepSource[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;

    const load = async () => {
      const [{ data: settings }, { data: runs }] = await Promise.all([
        supabase
          .from("topic_automation_settings")
          .select(
            "next_run_at, last_run_at, automation_mode, scrape_frequency_hours, is_active"
          )
          .eq("topic_id", topicId)
          .maybeSingle(),
        supabase
          .from("scrape_runs")
          .select("finished_at, articles_stored, content_sources(source_name)")
          .eq("topic_id", topicId)
          .not("finished_at", "is", null)
          .order("finished_at", { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;

      setNextRunAt(settings?.next_run_at ?? null);
      setLastRunAt(settings?.last_run_at ?? null);
      setAutomationMode(settings?.automation_mode ?? "manual");
      setFrequencyHours(settings?.scrape_frequency_hours ?? 4);
      setIsActive(settings?.is_active ?? true);

      if (runs && runs.length > 0) {
        const latest = new Date(runs[0].finished_at as string).getTime();
        const inSweep = runs.filter(
          (r: any) => latest - new Date(r.finished_at).getTime() <= SWEEP_WINDOW_MS
        );
        const byName = new Map<string, number>();
        inSweep.forEach((r: any) => {
          const name = r.content_sources?.source_name || "Unknown source";
          byName.set(name, (byName.get(name) || 0) + (r.articles_stored || 0));
        });
        setSweepAt(runs[0].finished_at as string);
        setSources(
          Array.from(byName.entries())
            .map(([name, stored]) => ({ name, stored }))
            .sort((a, b) => b.stored - a.stored)
        );
      } else {
        setSweepAt(null);
        setSources([]);
      }
    };

    load();
    const poll = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [topicId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const isAutomatic = automationMode !== "manual" && isActive;
  const intervalMs = Math.max(1, frequencyHours) * 3600 * 1000;

  // Anchor the countdown to the most recent real activity so a stale
  // scheduled time rolls forward instead of sticking on "any moment".
  const dueAt = useMemo(() => {
    const anchors = [sweepAt, lastRunAt]
      .filter(Boolean)
      .map((iso) => new Date(iso as string).getTime())
      .filter((t) => !Number.isNaN(t));
    const lastActivity = anchors.length ? Math.max(...anchors) : null;

    const scheduled = nextRunAt ? new Date(nextRunAt).getTime() : null;
    if (scheduled && !Number.isNaN(scheduled) && scheduled > now) return scheduled;

    if (lastActivity) {
      let next = lastActivity + intervalMs;
      while (next <= now) next += intervalMs;
      return next;
    }
    return scheduled && !Number.isNaN(scheduled) ? scheduled : null;
  }, [nextRunAt, lastRunAt, sweepAt, intervalMs, now]);

  const remaining = dueAt !== null ? dueAt - now : null;
  const overdue =
    !isAutomatic && sweepAt
      ? now - new Date(sweepAt).getTime() > intervalMs
      : false;

  const totalStored = sources.reduce((sum, s) => sum + s.stored, 0);
  const contributing = sources.filter((s) => s.stored > 0);
  const imminent = isAutomatic && remaining !== null && remaining <= 0;

  const everyLabel =
    frequencyHours === 1 ? "every hour" : `every ${frequencyHours} hours`;

  return (
    <div className="rounded-xl border bg-card/50 px-4 py-6 text-center">
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Radar className={`h-4 w-4 ${imminent ? "live-pulse" : ""}`} aria-hidden />
        <span className="section-label">
          {isAutomatic ? "Next sweep" : "Gathering by hand"}
        </span>
      </div>

      {isAutomatic ? (
        <>
          <p className="mt-2 display-heading text-4xl tabular-nums">
            {remaining === null
              ? "Any moment"
              : imminent
              ? "Any moment"
              : formatCountdown(remaining)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Stories are collected automatically {everyLabel}.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 display-heading text-4xl">
            {sweepAt
              ? overdue
                ? "Due now"
                : formatCountdown(remaining ?? 0)
              : "Not run yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sweepAt
              ? overdue
                ? `Last gathered ${relativeTime(sweepAt)} — worth running again.`
                : `Last gathered ${relativeTime(sweepAt)}. Worth checking again ${everyLabel}.`
              : `Run a gather whenever you like — ${everyLabel} keeps a feed fresh.`}
          </p>
        </>
      )}

      <div className="mt-5 border-t pt-4 text-left">
        {sweepAt ? (
          <>
            <p className="text-sm text-foreground">
              Last sweep {relativeTime(sweepAt)} brought in{" "}
              <span className="font-semibold tabular-nums">{totalStored}</span>{" "}
              {totalStored === 1 ? "story" : "stories"} from {sources.length}{" "}
              {sources.length === 1 ? "source" : "sources"}.
            </p>
            {contributing.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {contributing.slice(0, 6).map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-muted-foreground">{s.name}</span>
                    <span className="tabular-nums text-foreground">{s.stored}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sweeps recorded yet for this feed.
          </p>
        )}
      </div>
    </div>
  );
};
