import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A quiet info icon. Explanatory copy lives in here instead of on the page,
 * so every settings surface stays light. Hover on desktop, tap on touch.
 */
export function InfoHint({ label, children }: { label?: string; children: React.ReactNode }) {
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
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
            {children}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed md:hidden">
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
  description?: string;
  actions?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={cn("scroll-mt-24", className)}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="display-heading text-2xl md:text-[1.75rem] leading-snug">{title}</h2>
        {actions && <div className="flex items-center gap-2 flex-shrink-0 pt-1">{actions}</div>}
      </div>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
    </div>
  );
}

export type SaveState = "saved" | "saving" | "not-saved" | null;

export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  if (!state) return null;
  return (
    <span className={cn("save-indicator", className)} aria-live="polite">
      {state === "saving" && (
        <span className="h-3 w-3 rounded-full border border-muted-foreground/40 border-t-muted-foreground animate-spin" />
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
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
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
  className?: string;
}) {
  const Comp = onToggle ? "button" : "span";
  return (
    <Comp
      {...(onToggle ? { onClick: onToggle, type: "button" as const } : {})}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
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
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-16 text-center max-w-md mx-auto", className)}>
      <h3 className="display-heading text-2xl mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-5">{description}</p>}
      {action}
    </div>
  );
}
