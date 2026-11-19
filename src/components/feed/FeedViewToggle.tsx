import { useRef, type KeyboardEvent } from "react";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { FEED_VIEWS, FEED_VIEW_LABELS, type FeedView } from "@/lib/feedView";

interface FeedViewToggleProps {
  value: FeedView;
  onChange: (view: FeedView) => void;
  brandColor?: string | null | undefined;
}

/** Events | All | News — a three-way pill at the top of a feed that has both. */
export function FeedViewToggle({ value, onChange, brandColor }: FeedViewToggleProps) {
  const p = feedBrandPalette(brandColor);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const style = {
    "--fv-fill": toCss(p.light.fill), "--fv-on-fill": toCss(p.light.onFill),
    "--fv-fill-dark": toCss(p.dark.fill), "--fv-on-fill-dark": toCss(p.dark.onFill),
  } as React.CSSProperties;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = FEED_VIEWS.indexOf(value);
    const next = Math.min(FEED_VIEWS.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
    onChange(FEED_VIEWS[next]!);
    refs.current[next]?.focus();
  };

  return (
    <div className="mb-6 flex justify-center">
      <div
        role="radiogroup"
        aria-label="Show"
        onKeyDown={onKeyDown}
        style={style}
        className="feed-card inline-flex gap-1 rounded-full border border-border p-1 shadow-sm"
      >
        {FEED_VIEWS.map((view, i) => {
          const active = view === value;
          return (
            <button
              key={view}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(view)}
              className={`min-h-11 min-w-[5.5rem] rounded-full px-5 text-sm font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                active
                  ? "bg-[color:var(--fv-fill)] text-[color:var(--fv-on-fill)] dark:bg-[color:var(--fv-fill-dark)] dark:text-[color:var(--fv-on-fill-dark)]"
                  : "hover:bg-muted"
              }`}
            >
              {FEED_VIEW_LABELS[view]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
