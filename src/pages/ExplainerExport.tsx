import { useEffect } from "react";
import { ExplainerPlayer } from "@/components/explainer/ExplainerPlayer";
import { TIMELINE, TOTAL_MS, sceneDuration } from "@/components/explainer/timeline";

/**
 * Offline render stage for the explainer film.
 *
 * Not linked anywhere and noindex — it exists so `scripts/render-explainer.mjs`
 * can capture clean, chrome-free frames at any resolution.
 */
const ExplainerExport = () => {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    document.title = "Explainer render stage";
    // Consumed by scripts/render-explainer.mjs to size the capture.
    (window as any).__explainerTiming = {
      totalMs: TOTAL_MS,
      scenes: TIMELINE.map((s) => ({ id: s.id, durationMs: sceneDuration(s) })),
    };
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  return (
    <main className="h-dvh w-screen overflow-hidden bg-[hsl(214,50%,7%)]">
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
