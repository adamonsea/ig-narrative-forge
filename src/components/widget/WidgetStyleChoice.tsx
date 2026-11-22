import { cn } from "@/lib/utils";
import type { WidgetStyle } from "@/lib/widgetContent";

const OPTIONS: [WidgetStyle, string][] = [
  ["list", "Headlines"],
  ["cards", "Cards"],
];

/** "Style: Headlines | Cards" for widget builders. Cards = a swipeable row of feed-style cards. */
export function WidgetStyleChoice({ value, onChange }: { value: WidgetStyle; onChange: (v: WidgetStyle) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id="widget-style-label">Style</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="widget-style-label">
        {OPTIONS.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-base transition-colors",
              value === v ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/40",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
