import { X } from "lucide-react";
import { useTopicPulse } from "@/hooks/useTopicPulse";
import { pickMilestone } from "@/lib/pulse";

/** Header indicator: readers active in the last 5 minutes. */
export function ReadingNow() {
  const ctx = useTopicPulse();
  const n = ctx?.pulse?.reading_now ?? 0;
  if (!ctx?.pulse) return null;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground tabular-nums" aria-live="polite">
      <span className="relative flex h-2 w-2" aria-hidden>
        {n > 0 && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping motion-reduce:animate-none" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${n > 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
      </span>
      {n} reading now
    </span>
  );
}

/** One rare, dismissible celebration on the Desk. */
export function MilestoneNote() {
  const ctx = useTopicPulse();
  if (!ctx?.pulse) return null;
  const today = new Date().toISOString().slice(0, 10);
  const m = pickMilestone(ctx.pulse, today);
  if (!m) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-base animate-fade-in">
      <span>✦ {m.text}</span>
      <button
        type="button"
        onClick={() => ctx.dismissMilestone(m.key)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
