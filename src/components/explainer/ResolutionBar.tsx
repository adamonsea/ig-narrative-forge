import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const RESOLUTIONS = [
  { id: 1080, label: "1080p", size: "1920 x 1080", scale: "1" },
  { id: 1440, label: "1440p", size: "2560 x 1440", scale: "1.333" },
  { id: 2160, label: "4K", size: "3840 x 2160", scale: "2" },
] as const;

interface ResolutionBarProps {
  value: number;
  onChange: (res: number) => void;
}

/** Render-stage only control. Hidden during capture via ?chrome=0. */
export const ResolutionBar = ({ value, onChange }: ResolutionBarProps) => {
  const [copied, setCopied] = useState(false);
  const active = RESOLUTIONS.find((r) => r.id === value) ?? RESOLUTIONS[0];
  const command = `python3 scripts/render_explainer.py --res ${active.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed left-4 top-4 z-50 flex flex-col gap-2 rounded-xl border border-border/40 bg-background/85 p-3 text-foreground shadow-lg backdrop-blur">
      <div className="flex items-center gap-1" role="group" aria-label="Export resolution">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            aria-pressed={r.id === value}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              r.id === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{active.size}</p>
      <div className="flex items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy render command"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};