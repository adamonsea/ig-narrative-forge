import { cn } from "@/lib/utils";
import type { ResolvedWidgetContent } from "@/lib/widgetContent";

const OPTIONS: [ResolvedWidgetContent, string][] = [
  ["stories", "News"],
  ["events", "What's on"],
  ["both", "Both"],
];

/** "Show: News | What's on | Both" for widget builders. Both = News | What's on tabs in the widget. */
export function WidgetContentChoice({ value, onChange }: { value: ResolvedWidgetContent; onChange: (v: ResolvedWidgetContent) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id="widget-content-label">Show</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="widget-content-label">
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
