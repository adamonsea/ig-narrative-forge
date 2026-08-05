import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIMELINE, TOTAL_MS, sceneDuration } from './timeline';
import { haptic, playCue, type CueName } from './sfx';
import { clipForScene } from './avatar';

const ACCENT = 'hsl(155,100%,67%)';
const TICK = 50;

interface ExplainerPlayerProps {
  /** Fallback presenter clip used for any scene without its own clip. */
  avatarSrc?: string;
  onClose?: () => void;
  onFinished?: () => void;
  /** Rendered on the end card, e.g. a "Join the waitlist" button. */
  endCta?: React.ReactNode;
}

export const ExplainerPlayer = ({ avatarSrc, onClose, onFinished, endCta }: ExplainerPlayerProps) => {
  const prefersReduced = !!useReducedMotion();
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);
  /** True once this scene's presenter clip is actually rolling (or none exists). */
  const [clipRolling, setClipRolling] = useState(false);
  const tailTimer = useRef<number | null>(null);

  const scene = TIMELINE[index];
  const avatarClipSrc = scene.avatarClip ?? clipForScene(scene.id) ?? avatarSrc;
  const hasClip = !!avatarClipSrc;
  const beatMs = sceneDuration(scene);

  const cue = useCallback((name: CueName) => playCue(name, muted), [muted]);
  const tap = useCallback((ms: number) => haptic(ms, !prefersReduced), [prefersReduced]);

  const goTo = useCallback((next: number) => {
    if (tailTimer.current) {
      window.clearTimeout(tailTimer.current);
      tailTimer.current = null;
    }
    if (next >= TIMELINE.length) {
      setFinished(true);
      setPlaying(false);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinished?.();
      }
      return;
    }
    setIndex(next);
    setElapsed(0);
  }, [onFinished]);

  // Hold the beat clock until the presenter clip has begun, so buffering
  // delays push the beat out rather than eating the end of the narration.
  useEffect(() => {
    setClipRolling(!hasClip);
    if (!hasClip) return;
    // Failsafe: if the clip never reports playback, start the clock anyway.
    const id = window.setTimeout(() => setClipRolling(true), 2500);
    return () => window.clearTimeout(id);
  }, [scene.id, hasClip]);

  useEffect(() => {
    if (!playing || finished || !clipRolling) return;
    const id = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK;
        if (next >= beatMs) {
          goTo(index + 1);
          return 0;
        }
        return next;
      });
    }, TICK);
    return () => window.clearInterval(id);
  }, [playing, finished, clipRolling, beatMs, index, goTo]);

  useEffect(() => () => {
    if (tailTimer.current) window.clearTimeout(tailTimer.current);
  }, []);

  const replay = () => {
    finishedRef.current = false;
    setFinished(false);
    setIndex(0);
    setElapsed(0);
    setPlaying(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const progress = useMemo(() => {
    const before = TIMELINE.slice(0, index).reduce((s, x) => s + sceneDuration(x), 0);
    return finished ? 100 : ((before + elapsed) / TOTAL_MS) * 100;
  }, [index, elapsed, finished]);

  const SceneComponent = scene.Component;
  const avatarClip = avatarClipSrc;

  return (
    <div className="relative flex h-full w-full flex-col bg-[hsl(214,50%,7%)] text-white">
      {/* Stage */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!finished ? (
            <motion.div
              key={scene.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <SceneComponent reduced={prefersReduced} cue={cue} tap={tap} />
            </motion.div>
          ) : (
            <motion.div
              key="end"
              className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <h2 className="font-display text-[clamp(2rem,7vw,4.5rem)] leading-none tracking-tight">
                Curatr<span style={{ color: ACCENT }}>.</span>
                <span className="text-2xl opacity-70">pro</span>
              </h2>
              <p className="max-w-[42ch] text-[clamp(0.95rem,2.6vw,1.4rem)] text-white/70">
                A live feed on any subject or place — trawled, written, illustrated and published for you.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {endCta}
                <Button variant="outline" onClick={replay} className="border-white/25 bg-transparent text-white hover:bg-white/10">
                  <RotateCcw className="mr-2 h-4 w-4" /> Watch again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Presenter slot — one clip per scene, restarted on scene change */}
        {avatarClip && !finished && (
          <video
            key={scene.id}
            src={avatarClip}
            autoPlay
            muted={muted}
            playsInline
            aria-hidden="true"
            className="absolute bottom-[max(0.75rem,2.5vw)] right-[max(0.75rem,2.5vw)] h-[clamp(96px,17vw,220px)] w-[clamp(96px,17vw,220px)] rounded-full border-2 border-white/25 object-cover shadow-[0_2vmin_5vmin_rgba(0,0,0,0.5)]"
          />
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the explainer"
            className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/5 p-2 text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Caption */}
      <div className="px-[max(1rem,4vw)] pb-2">
        <AnimatePresence mode="wait">
          {!finished && (
            <motion.p
              key={`cap-${scene.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-[46ch] text-center font-display text-[clamp(1.05rem,3.6vw,2.1rem)] leading-snug text-white"
              aria-live="polite"
            >
              {scene.caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="space-y-2 px-[max(1rem,4vw)] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Explainer progress">
          <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${progress}%`, background: ACCENT }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
              disabled={finished}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next scene"
              disabled={finished}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
          <span className="text-xs text-white/40">
            {finished ? 'End' : `${index + 1} / ${TIMELINE.length}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExplainerPlayer;