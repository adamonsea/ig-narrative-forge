import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { HealthVerdict } from "@/lib/sourceHealth";

const DOT: Record<string, string> = { healthy: "bg-mint", quiet: "bg-attention", failing: "bg-destructive", new: "bg-muted-foreground/50" };
const BOX: Record<string, string> = { healthy: "bg-mint-soft", quiet: "bg-attention-soft", failing: "bg-destructive/10", new: "bg-muted" };

/** Health in one plain sentence at the top of the panel. */
export function HealthLine({ verdict }: { verdict: HealthVerdict }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-lg p-3 text-base", BOX[verdict.health])}>
      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT[verdict.health])} aria-hidden="true" />
      <span className="text-foreground">{verdict.reason}</span>
    </p>
  );
}

/** One section of the source panel, styled like the Desk's story drawer. */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-6 py-5">
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
