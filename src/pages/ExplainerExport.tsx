import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExplainerPlayer } from "@/components/explainer/ExplainerPlayer";
import { TIMELINE, TOTAL_MS, sceneDuration } from "@/components/explainer/timeline";
import { ResolutionBar, RESOLUTIONS } from "@/components/explainer/ResolutionBar";

/**
 * Offline render stage for the explainer film.
 *
 * Not linked anywhere and noindex — it exists so `scripts/render-explainer.mjs`
 * can capture clean, chrome-free frames at any resolution.
 */
const ExplainerExport = () => {
  const [params, setParams] = useSearchParams();
  const parsed = Number(params.get("res"));
  const res = RESOLUTIONS.some((r) => r.id === parsed) ? parsed : 1080;
  const showChrome = params.get("chrome") !== "0";
  const [, force] = useState(0);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    document.title = "Explainer render stage";
    // Consumed by scripts/render-explainer.mjs to size the capture.
    (window as any).__explainerTiming = {
      totalMs: TOTAL_MS,
      res,
      width: Math.round((res * 16) / 9),
      height: res,
      scenes: TIMELINE.map((s) => ({ id: s.id, durationMs: sceneDuration(s) })),
    };
    return () => {
      document.head.removeChild(meta);
    };
  }, [res]);

  return (
    <main className="h-dvh w-screen overflow-hidden bg-[hsl(214,50%,7%)]">
      {showChrome && (
        <ResolutionBar
          value={res}
          onChange={(next) => {
            params.set("res", String(next));
            setParams(params, { replace: true });
            force((n) => n + 1);
          }}
        />
      )}
      <ExplainerPlayer
        renderMode
        onFinished={() => {
          (window as any).__explainerFinished = true;
        }}
      />
    </main>
  );
};

export default ExplainerExport;
