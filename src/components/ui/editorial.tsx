import { useState } from "react";
import { AlertCircle, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A quiet info icon. Explanatory copy lives in here instead of on the page,
 * so every settings surface stays light. Hover on desktop, tap on touch.
 */
export function InfoHint({ label, children }: { label?: string | undefined; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <span
      role="button"
      tabIndex={0}
      aria-label={label || "More information"}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-help align-middle"
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-sm leading-relaxed">
            {children}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" className="max-w-xs text-sm leading-relaxed md:hidden">
          {children}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

/**
 * Quiet editorial workspace primitives.
 * Section headers, disclosures, save states and status pills shared by
 * every dashboard surface so hierarchy and feedback stay consistent.
 */

export function SectionHeader({
  title,
  description,
  actions,
  id,
  className,
}: {
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode | undefined;
  id?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div id={id} className={cn("scroll-mt-24", className)}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold leading-snug">{title}</h2>
        {actions && <div className="flex items-center gap-2 flex-shrink-0 pt-1">{actions}</div>}
      </div>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
    </div>
  );
}

export type SaveState = "saved" | "saving" | "not-saved" | null;

export function SaveIndicator({ state, className }: { state: SaveState; className?: string | undefined }) {
  if (!state) return null;
  return (
    <span className={cn("save-indicator", className)} aria-live="polite">
      {state === "saving" && (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      )}
      {state === "saved" && <span className="h-1.5 w-1.5 rounded-full bg-pop" />}
      {state === "not-saved" && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
      {state === "saved" ? "Saved" : state === "saving" ? "Saving" : "Not saved"}
    </span>
  );
}

export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in fade-in-0 duration-200">
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The one publish-state pill. Clicking it opens the shared confirm flow. */
export function StatusPill({
  live,
  onToggle,
  className,
}: {
  live: boolean;
  onToggle?: () => void;
  className?: string | undefined;
}) {
  const Comp = onToggle ? "button" : "span";
  return (
    <Comp
      {...(onToggle ? { onClick: onToggle, type: "button" as const } : {})}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
        live
          ? "bg-mint-soft text-foreground hover:bg-mint-soft/70"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
        className
      )}
      aria-label={live ? "Feed is live. Click to take offline." : "Feed is a draft. Click to publish."}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", live ? "bg-pop" : "bg-muted-foreground/60")}
      />
      {live ? "Live" : "Draft"}
    </Comp>
  );
}

export function PageState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("py-16 text-center max-w-md mx-auto", className)}>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-5">{description}</p>}
      {action}
    </div>
  );
}

/** The one error state: inline, destructive-soft, one plain sentence and one fix. */
export function InlineError({
  message,
  actionLabel,
  onAction,
  className,
}: {
  message: string;
  actionLabel?: string | undefined;
  onAction?: () => void;
  className?: string | undefined;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive-soft p-3 text-base text-destructive-ink",
        className
      )}
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
