import { cn } from "@/lib/utils";

/** One setting: label + one plain line on the left, control (and inline Saved) on the right. */
export function SettingRow({ id, label, hint, children, stack = false, className }: {
  id?: string | undefined;
  label: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  /** Wide controls (lists, text areas) sit under the label instead of beside it. */
  stack?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <div id={id} className={cn("scroll-mt-24 py-5", stack ? "space-y-4" : "flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        <p className="text-base font-medium">{label}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children && <div className={cn(stack ? "" : "flex shrink-0 items-center gap-3")}>{children}</div>}
    </div>
  );
}

/** A titled block of rows on a settings page. */
export function SettingGroup({ id, title, children }: { id?: string | undefined; title?: string | undefined; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id && title ? `${id}-title` : undefined} className="scroll-mt-24">
      {title && <h3 id={id ? `${id}-title` : undefined} className="mb-1 text-lg font-semibold">{title}</h3>}
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </section>
  );
}
