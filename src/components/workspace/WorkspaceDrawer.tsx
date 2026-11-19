import * as React from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The one workspace drawer: right-hand panel on wide screens, bottom sheet on phones,
 * fade only (no slide). Every editing view opens in it; delete confirmations stay in
 * the confirm box. Shown on /design.
 */
export interface WorkspaceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Visible line under the title. Prefer none. */
  description?: React.ReactNode | undefined;
  /** For screen readers when there is no visible description. */
  srDescription?: string | undefined;
  /** Pinned at the bottom: the drawer's actions. */
  footer?: React.ReactNode | undefined;
  size?: "md" | "lg" | "xl" | undefined;
  /** Focus the first field on open (off by default so phones don't jump to the keyboard). */
  autoFocus?: boolean | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}

const WIDTH = { md: "sm:max-w-md", lg: "sm:max-w-xl", xl: "sm:max-w-2xl" } as const;

export function WorkspaceDrawer({
  open,
  onOpenChange,
  title,
  description,
  srDescription,
  footer,
  size = "lg",
  autoFocus = false,
  className,
  children,
}: WorkspaceDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="panel"
        onOpenAutoFocus={autoFocus ? undefined : (e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
        className={cn("flex w-full flex-col gap-0 overflow-hidden p-0", WIDTH[size])}
      >
        <SheetHeader className="space-y-1 p-6 pb-4 pr-12 text-left">
          <SheetTitle className="text-lg font-semibold leading-snug">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm text-muted-foreground">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{srDescription ?? (typeof title === "string" ? title : "")}</SheetDescription>
          )}
        </SheetHeader>
        <div className={cn("min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6", className)}>{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
