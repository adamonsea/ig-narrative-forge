import { useMemo } from "react";
import { useReducedMotion } from "./AnimatedNumber";

export interface FlowPoint {
  day: string;
  gathered: number;
  published: number;
}

/**
 * Gathered vs published over the last 30 days.
 * Hand-drawn SVG: no gridlines, no legend chrome — the labels carry the meaning.
 */
export function FlowRibbon({ data }: { data: FlowPoint[] }) {
  const reduced = useReducedMotion();
  const width = 600;
  const height = 72;

  const { gatheredPath, publishedPath, gatheredArea, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.gathered));
    const step = data.length > 1 ? width / (data.length - 1) : width;
    const pt = (v: number, i: number) => [i * step, height - (v / max) * (height - 6) - 2] as const;
    const line = (key: "gathered" | "published") =>
      data
        .map((d, i) => {
          const [x, y] = pt(d[key], i);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    const gatheredPath = line("gathered");
    return {
      gatheredPath,
      publishedPath: line("published"),
      gatheredArea: `${gatheredPath} L${width},${height} L0,${height} Z`,
      max,
    };
  }, [data]);

  if (!data.length) return null;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-[72px]"
        role="img"
        aria-label={`Stories gathered and published each day over the last ${data.length} days. Busiest day: ${max} gathered.`}
      >
        <defs>
          <linearGradient id="flow-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.07" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={gatheredArea} fill="url(#flow-fill)" />
        <path
          d={gatheredPath}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeOpacity="0.55"
          vectorEffect="non-scaling-stroke"
          className={reduced ? undefined : "flow-draw"}
        />
        <path
          d={publishedPath}
          fill="none"
          stroke="hsl(var(--purple-bright, var(--primary)))"
          strokeWidth="1.75"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={reduced ? undefined : "flow-draw flow-draw-slow"}
        />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-muted-foreground/60" /> Gathered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-purple-bright" /> Went live
        </span>
        <span className="ml-auto">Last {data.length} days</span>
      </div>
    </div>
  );
}
