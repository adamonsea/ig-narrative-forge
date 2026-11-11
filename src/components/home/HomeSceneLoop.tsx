import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { TIMELINE } from '@/components/explainer/timeline';
import { useUnit } from '@/components/explainer/scenes';

export type HomeSceneId = 'sources' | 'filter' | 'written' | 'editor' | 'publish';

/** Pause after each run before the scene restarts. */
const LOOP_GAP_MS = 1500;

/**
 * Explainer scenes size themselves from the browser window and switch to
 * stacked layouts on portrait screens. On portrait phones a 16:9 box would
 * shrink those layouts to nothing, so the frame takes each scene's own
 * height there (in scene units). Landscape screens get a 16:9 frame.
 */
const PORTRAIT_HEIGHT_U: Record<HomeSceneId, number> = {
  sources: 100,
  filter: 72,
  written: 70,
  publish: 72,
  editor: 54,
};

/**
 * On landscape screens each scene's content sits in the middle of a large
 * stage. The frame zooms to this box (scene units) so the content fills it.
 */
const LANDSCAPE_CONTENT_U: Record<HomeSceneId, { w: number; h: number }> = {
  sources: { w: 84, h: 50 },
  filter: { w: 92, h: 70 },
  written: { w: 72, h: 66 },
  publish: { w: 104, h: 56 },
  editor: { w: 74, h: 46 },
};

const noop = () => {};

const useWindowSize = () => {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(() =>
    typeof window === 'undefined' ? { w: 1280, h: 800 } : read(),
  );
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return size;
};

interface HomeSceneLoopProps {
  sceneId: HomeSceneId;
  /** Plain description of the animation for screen readers. */
  label: string;
}

/**
 * Plays one explainer scene in a rounded frame: no captions, controls,
 * presenter, sound or haptics. The scene renders in a virtual window-sized
 * stage scaled down to the frame, mounts only while in view, restarts each
 * time it re-enters view, and loops by remounting after its duration.
 */
const HomeSceneLoop = ({ sceneId, label }: HomeSceneLoopProps) => {
  const scene = TIMELINE.find((s) => s.id === sceneId);
  const reduced = !!useReducedMotion();
  const u = useUnit();
  const { w: winW, h: winH } = useWindowSize();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [inView, setInView] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrameW(entry.contentRect.width));
    ro.observe(el);
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setRun((r) => r + 1);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!inView || reduced || !scene) return;
    const t = window.setTimeout(() => setRun((r) => r + 1), scene.duration + LOOP_GAP_MS);
    return () => window.clearTimeout(t);
  }, [inView, run, reduced, scene]);

  const portrait = winH > winW;
  const stageW = winW;
  const stageH = portrait ? PORTRAIT_HEIGHT_U[sceneId] * u : Math.min(winH, (winW * 9) / 16);
  const frameH = portrait ? (frameW * stageH) / stageW : (frameW * 9) / 16;
  // Visible window of the stage: the whole stage on portrait, the content box on landscape.
  const box = LANDSCAPE_CONTENT_U[sceneId];
  const viewW = portrait
    ? stageW
    : Math.min(stageW, (stageH * 16) / 9, Math.max(box.w * u, ((box.h * u) * 16) / 9));
  const scale = frameW > 0 ? frameW / viewW : 0;
  const offX = frameW / 2 - (stageW * scale) / 2;
  const offY = frameH / 2 - (stageH * scale) / 2;
  const Scene = scene?.Component;

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={label}
      className={`relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[hsl(214,50%,7%)] shadow-[0_40px_120px_-40px_hsl(270_100%_68%_/_0.35)] ${
        portrait ? '' : 'aspect-video'
      }`}
      style={portrait ? { aspectRatio: `${stageW} / ${stageH}` } : undefined}
    >
      {inView && Scene && scale > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: offX,
            top: offY,
            width: stageW,
            height: stageH,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <Scene key={run} reduced={reduced} cue={noop} tap={noop} />
        </div>
      )}
    </div>
  );
};

export default HomeSceneLoop;
