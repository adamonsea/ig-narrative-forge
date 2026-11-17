import { useState, type ReactNode } from "react";
import { CalendarDays, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskCard } from "@/components/topic-pipeline/DeskCard";
import type { SourceHealth } from "@/lib/sourceHealth";
import { SourceDots } from "./SourceDots";

export const HEALTH_STRIPE: Record<SourceHealth, string> = {
  healthy: "border-t-mint",
  quiet: "border-t-attention",
  failing: "border-t-destructive",
  new: "border-t-muted-foreground/40",
};

export const HEALTH_TEXT: Record<SourceHealth, string> = {
  healthy: "text-pop",
  quiet: "text-attention-foreground",
  failing: "text-destructive",
  new: "text-muted-foreground",
};

export const hostOf = (url: string | null | undefined) => {
  if (!url) return "";
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return url; }
};

/** The site's own little icon, falling back to a globe (news) or calendar (events). */
export function SourceIcon({ domain, kind = "news", size = "md" }: { domain: string; kind?: "news" | "events"; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  if (!domain || failed) {
    const Icon = kind === "events" ? CalendarDays : Globe;
    return <span className={cn(box, "flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground")} aria-hidden="true"><Icon className="h-5 w-5" /></span>;
  }
  return (
    <span className={cn(box, "flex shrink-0 items-center justify-center rounded-xl border border-border bg-background")} aria-hidden="true">
      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} alt="" width={28} height={28}
        loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-7 w-7 rounded" />
    </span>
  );
}

/**
 * One source on the Sources tab. At rest: health colour (top edge), name, 7-day dots and one number.
 * Hover (or first tap) shows Gather; click opens the side panel with everything else.
 */
export function SourceCard({ name, domain, kind, health, healthLabel, dots, figure, figureLabel, action, busy, onOpen }: {
  name: string; domain: string; kind: "news" | "events"; health: SourceHealth; healthLabel: string;
  dots: number[]; figure: number; figureLabel: string; action?: ReactNode; busy?: boolean; onOpen: () => void;
}) {
  const flagged = health === "failing" || health === "quiet";
  return (
    <DeskCard
      title={name}
      visual={<SourceIcon domain={domain} kind={kind} />}
      onOpen={onOpen}
      keepActions={busy}
      className={cn("border-t-4", HEALTH_STRIPE[health])}
      badges={flagged ? <span className={cn("text-sm font-medium", HEALTH_TEXT[health])}>{healthLabel}</span> : null}
      meta={
        <span className="flex w-full items-center justify-between gap-3">
          <SourceDots counts={dots} />
          <span className="text-sm text-muted-foreground">
            <span className="text-lg font-semibold tabular-nums text-foreground">{figure}</span> {figureLabel}
          </span>
        </span>
      }
      actions={action ?? null}
    />
  );
}
