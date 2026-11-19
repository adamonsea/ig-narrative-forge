import { Fragment, useState, type ReactNode } from "react";
import { Newspaper, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

/** Joins the parts of a card's one quiet line with a middle dot, skipping empty parts. */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {shown.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {typeof p === "string" ? <span className="truncate">{p}</span> : p}
        </Fragment>
      ))}
    </>
  );
}

interface DeskCardProps {
  title: string;
  thumbnailUrl?: string | null;
  thumbClassName?: string;
  thumbTitle?: string;
  /** Badges that are true right now (Rising, Scheduled, Ready…), shown before the quiet line. */
  badges?: ReactNode;
  /** The one quiet line under the headline. */
  meta: ReactNode;
  /** At most two actions, shown on hover (or on the first tap on touch screens). */
  actions: ReactNode;
  /** Keep the actions showing (e.g. while one is running). */
  keepActions?: boolean;
  /** Actions always showing on their own row (items waiting on the owner). */
  pinActions?: boolean;
  /** Click to open the item (e.g. its drawer). Without it the card only reveals its actions. */
  onOpen?: () => void;
  /** Replaces the thumbnail, e.g. an event's date tile. */
  visual?: ReactNode;
  /** Faded, for items that rank below the rest. */
  faded?: boolean;
  /** Something before the thumbnail, e.g. a selection tick box. */
  leading?: ReactNode;
  /** Something under the quiet line, e.g. the similar-reports fold. */
  footer?: ReactNode;
  className?: string;
  id?: string;
}

/** A calm Desk card: at rest a thumbnail, headline and one quiet line; actions on hover; click to open. */
export function DeskCard({
  title, thumbnailUrl, thumbClassName, thumbTitle, badges, meta, actions, keepActions, pinActions, onOpen, visual, faded, leading, footer, className, id,
}: DeskCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const handleBodyClick = () => {
    if (!onOpen || (isTouch() && !revealed)) {
      setRevealed(true);
      return;
    }
    onOpen();
  };

  return (
    <div
      id={id}
      tabIndex={-1}
      data-revealed={revealed || keepActions ? "true" : "false"}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setRevealed(false);
      }}
      className={cn(
        "desk-card group relative rounded-xl border border-border bg-card outline-none transition-[box-shadow,opacity] duration-200 hover:shadow-md",
        faded && "opacity-60 hover:opacity-100 focus-within:opacity-100",
        pinActions && "desk-card-pinned",
        className,
      )}
    >
      <div className={cn("flex items-start gap-3 p-3", onOpen && "cursor-pointer")} onClick={handleBodyClick}>
        {leading}
        {visual ? visual : thumbnailUrl && !thumbFailed ? (
          <img
            src={thumbnailUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            title={thumbTitle}
            className={cn("h-16 w-16 shrink-0 rounded-lg object-cover", thumbClassName)}
          />
        ) : (
          <div
            title={thumbTitle}
            className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", thumbClassName)}
            aria-hidden="true"
          >
            <Newspaper className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="line-clamp-2 rounded text-left text-lg font-semibold leading-snug text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </button>
          ) : (
            <p className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">{title}</p>
          )}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {badges}
            {meta}
          </div>
          {footer}
        </div>
      </div>
      <div
        className="desk-card-actions [&_button]:h-9"
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
      </div>
    </div>
  );
}

/** Small true-right-now badge (Rising, Scheduled, Ready, Draft, Failed). */
export function DeskBadge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "pop" | "warning" | "destructive" }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    pop: "text-pop",
    warning: "bg-attention-soft text-attention-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium", tones[tone])}>{children}</span>;
}

/**
 * The quick spike on every story card: a small, quiet icon kept apart from the main action
 * (first in the row, gap after it) so it is fast to reach but hard to hit by mistake.
 * Undo comes from the toast the handler shows.
 */
export function SpikeButton({ label = "Skip", onClick, disabled }: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="mr-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
