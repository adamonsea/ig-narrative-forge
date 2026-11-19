import { useState, type ReactNode } from "react";
import { CalendarDays, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskCard } from "@/components/topic-pipeline/DeskCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SourceHealth } from "@/lib/sourceHealth";
import { SourceDots } from "./SourceDots";

/** Muted fill for the whole card: the health colour is the card's background, not a bright edge. */
export const HEALTH_FILL: Record<SourceHealth, string> = {
  healthy: "bg-mint-soft border-mint/35",
  quiet: "bg-attention-soft border-attention/40",
  failing: "bg-destructive-soft border-destructive/35",
  new: "bg-muted border-border",
};

/** Dots in the same colour family as the fill, so a card reads as one tinted tile. */
export const HEALTH_DOT: Record<SourceHealth, string> = {
  healthy: "bg-mint-ink",
  quiet: "bg-attention-foreground",
  failing: "bg-destructive-ink",
  new: "bg-muted-foreground/60",
};

export const HEALTH_TEXT: Record<SourceHealth, string> = {
  healthy: "text-mint-ink",
  quiet: "text-attention-foreground",
  failing: "text-destructive-ink",
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
    <span className={cn(box, "flex shrink-0 items-center justify-center rounded-xl border border-chip-border bg-chip")} aria-hidden="true">
      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} alt="" width={28} height={28}
        loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-7 w-7 rounded" />
    </span>
  );
}

export interface SourceFigure { key: string; label: string; tip: string; value: number }

/** A small table of letters over figures (e.g. W M Y), each letter explained in a tooltip. */
export function SourceFigures({ figures }: { figures: SourceFigure[] }) {
  return (
    <dl className="flex shrink-0 gap-4 text-right">
      {figures.map((f) => (
        <div key={f.key} className="flex min-w-6 flex-col items-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <dt tabIndex={0} className="cursor-default rounded text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span aria-hidden="true">{f.label}</span><span className="sr-only">{f.tip}</span>
              </dt>
            </TooltipTrigger>
            <TooltipContent>{f.tip}</TooltipContent>
          </Tooltip>
          <dd className="text-lg font-semibold leading-tight tabular-nums text-foreground">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One source on the Sources tab. At rest: a muted health-coloured fill, name, 7-day dots and a mini W/M/Y table.
 * Hover (or first tap) shows Gather; click opens the side panel with everything else.
 */
export function SourceCard({ name, domain, kind, health, healthLabel, dots, figures, action, busy, onOpen }: {
  name: string; domain: string; kind: "news" | "events"; health: SourceHealth; healthLabel: string;
  dots: number[]; figures: SourceFigure[]; action?: ReactNode | undefined; busy?: boolean | undefined; onOpen: () => void;
}) {
  const flagged = health === "failing" || health === "quiet";
  return (
    <DeskCard
      title={name}
      visual={<SourceIcon domain={domain} kind={kind} />}
      onOpen={onOpen}
      keepActions={busy}
      className={cn(HEALTH_FILL[health])}
      badges={flagged ? <span className={cn("text-sm font-medium", HEALTH_TEXT[health])}>{healthLabel}</span> : null}
      meta={
        <span className="flex w-full items-end justify-between gap-3">
          <SourceDots counts={dots} dotClass={HEALTH_DOT[health]} />
          <SourceFigures figures={figures} />
        </span>
      }
      actions={action ?? null}
    />
  );
}
