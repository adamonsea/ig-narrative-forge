import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { settingAnchor } from "@/lib/settingsIndex";

/** Copies this row's direct link (page URL + #anchor). Shown on hover/focus (desktop) or after a long-press on its row (phone). Use inside any [data-setting-row] with "group/row". */
export function CopyLink({ anchor }: { anchor: string }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const row = ref.current?.closest<HTMLElement>("[data-setting-row]");
    if (!row) return;
    let timer: number | undefined;
    const start = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      timer = window.setTimeout(() => { setVisible(true); window.setTimeout(() => setVisible(false), 4000); }, 500);
    };
    const end = () => window.clearTimeout(timer);
    row.addEventListener("pointerdown", start);
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => row.addEventListener(t, end));
    return () => { end(); row.removeEventListener("pointerdown", start); ["pointerup", "pointercancel", "pointerleave"].forEach((t) => row.removeEventListener(t, end)); };
  }, []);
  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
    try { await navigator.clipboard.writeText(url); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => void copy()}
      aria-label="Copy link to this setting"
      className={cn(
        "ml-2 inline-flex min-h-8 items-center gap-1 rounded-full px-2 align-middle text-sm text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100",
        visible || copied ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
      )}
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Link2 aria-hidden className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** One setting: label + one plain line on the left, control (and inline Saved) on the right. Each row has a stable anchor from its label. */
export function SettingRow({ id, label, hint, children, stack = false, className }: {
  id?: string | undefined;
  label: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  /** Wide controls (lists, text areas) sit under the label instead of beside it. */
  stack?: boolean | undefined;
  className?: string | undefined;
}) {
  const anchor = id ?? settingAnchor(label);
  return (
    <div id={anchor} data-setting-row className={cn("group/row scroll-mt-24 py-5", stack ? "space-y-4" : "flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        <p className="text-base font-medium">{label}<CopyLink anchor={anchor} /></p>
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

/** One quiet line + Retry, for a row whose data couldn't load. */
export function SettingLoadError({ onRetry, what = "This" }: { onRetry: () => void; what?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-5 text-base text-muted-foreground">
      <p>{what} didn't load.</p>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-lg px-3 font-medium text-foreground hover:bg-muted">Retry</button>
    </div>
  );
}
