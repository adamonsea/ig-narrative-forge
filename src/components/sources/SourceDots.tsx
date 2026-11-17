import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Last 7 days (oldest → today), up to 3 dots a day: at a glance, is this tap running? */
export function SourceDots({ counts, size = "sm", className }: { counts: number[]; size?: "sm" | "lg"; className?: string }) {
  const days = counts.length ? counts : Array(7).fill(0);
  const total = days.reduce((a, b) => a + b, 0);
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-1.5 w-1.5";
  const today = new Date();
  return (
    <span className={cn("inline-flex items-end gap-[3px]", size === "lg" ? "h-10 gap-1.5" : "h-6", className)} role="img"
      aria-label={`${total} in the last 7 days`}>
      {days.map((n, i) => {
        const level = Math.min(n, 3);
        const d = new Date(today.getTime() - (days.length - 1 - i) * 86_400_000);
        return (
          <span key={i} className="flex flex-col-reverse items-center gap-[2px]" title={`${DAY_NAMES[d.getDay()]}: ${n}`}>
            {level === 0
              ? <span className={cn(dot, "rounded-full bg-muted-foreground/20")} />
              : Array.from({ length: level }).map((_, j) => <span key={j} className={cn(dot, "rounded-full bg-pop")} style={{ opacity: 0.55 + j * 0.2 }} />)}
          </span>
        );
      })}
    </span>
  );
}
