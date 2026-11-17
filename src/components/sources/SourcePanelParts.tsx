import { useState, type ReactNode } from "react";
import { Download, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { HealthVerdict } from "@/lib/sourceHealth";

const DOT: Record<string, string> = { healthy: "bg-mint", quiet: "bg-attention", failing: "bg-destructive-ink", new: "bg-muted-foreground/50" };
const BOX: Record<string, string> = { healthy: "bg-mint-soft", quiet: "bg-attention-soft", failing: "bg-destructive-soft", new: "bg-muted" };

/** Health in one plain sentence at the top of the panel. */
export function HealthLine({ verdict }: { verdict: HealthVerdict }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-lg p-3 text-base", BOX[verdict.health])}>
      <span className={cn("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", DOT[verdict.health])} aria-hidden="true" />
      <span className="text-foreground">{verdict.reason}</span>
    </p>
  );
}

/** One section of the source panel, styled like the Desk's story drawer. */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-6 py-6">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** A label and a figure, for the activity grid. */
export function Figure({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Small info icon with a tooltip: explanations live here, never as sublines. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="mt-0.5 shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm">{children}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Gather older stories" opened in place: the fold shows how far back, then one Gather.
 * Never a pop-up — the Desk's own pattern.
 */
export function BackfillFold({ onRun, trigger = "Gather older stories" }: {
  onRun: (days: number) => Promise<void> | void;
  trigger?: string;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onRun(days);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />{trigger}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 flex flex-wrap items-center gap-3">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger aria-label="How far back" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="100">Last 100 days</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={run} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Gather
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
