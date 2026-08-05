import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CueName } from './sfx';

export interface SceneProps {
  reduced: boolean;
  cue: (name: CueName) => void;
  tap: (ms: number) => void;
}

const ACCENT = 'hsl(155,100%,67%)';
const VIOLET = 'hsl(270,100%,68%)';
const PAPER = '#fafaf8';
const INK = 'hsl(214,50%,9%)';

/** Fire timed cues for a scene; cleared automatically when the scene unmounts. */
const useBeats = (beats: Array<[number, () => void]>) => {
  const ref = useRef(beats);
  ref.current = beats;
  useEffect(() => {
    const timers = ref.current.map(([at, fn]) => window.setTimeout(fn, at));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

/**
 * Responsive scene unit. Derived from the larger viewport edge so portrait
 * phones get the same visual weight as landscape desktops.
 */
const isPortrait = () =>
  typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

export const useUnit = () => {
  const read = () => Math.max(window.innerWidth, window.innerHeight) * 0.0085;
  const [u, setU] = useState(() => (typeof window === 'undefined' ? 10 : read()));
  useEffect(() => {
    const on = () => setU(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return u;
};

/** Full-bleed stage: every scene fills the device, scaling with viewport. */
const Stage = ({ children }: { children: React.ReactNode }) => {
  const u = useUnit();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-[calc(var(--u)*4)]"
      style={{ ['--u' as string]: `${u}px` }}
    >
      <div className="w-full max-w-[min(1100px,94vw)]">{children}</div>
    </div>
  );
};

/** Chunky card — thick border, soft radius, no fussy detail. */
const Chunk = ({
  children,
  className = '',
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={`rounded-[calc(var(--u)*2)] border-[calc(var(--u)*0.4)] border-white/25 bg-white/[0.08] ${className}`}
    style={style}
  >
    {children}
  </div>
);

const Bars = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-[calc(var(--u)*1)]">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`h-[calc(var(--u)*1.2)] rounded-full bg-white/25 ${i === count - 1 ? 'w-2/3' : 'w-full'}`}
      />
    ))}
  </div>
);

/* ---------------------------------------------------------------- 1. Problem */

const CLIPPINGS = [
  { t: 'Council votes on seafront plan', x: -34, y: -26, r: -9 },
  { t: 'Pier repairs delayed again', x: 22, y: -30, r: 7 },
  { t: 'New bus route consultation', x: -8, y: -4, r: -3 },
  { t: 'School wins county award', x: 34, y: 4, r: 11 },
  { t: 'Flood defence funding gap', x: -36, y: 20, r: 6 },
  { t: 'Market traders speak out', x: 6, y: 26, r: -8 },
  { t: 'Hospital waiting times rise', x: 32, y: 30, r: -12 },
  { t: 'Festival line-up announced', x: -18, y: 6, r: 13 },
];

export const SceneProblem = ({ reduced, cue }: SceneProps) => {
  const u = useUnit();
  const tall = isPortrait();
  const sx = tall ? 0.2 : 1.05;
  const sy = tall ? 0.85 : 0.85;
  useBeats([[200, () => cue('rustle')]]);
  return (
    <Stage>
      {tall ? (
        <div className="mx-auto flex w-full flex-col items-center gap-[calc(var(--u)*2)]">
          <div className="text-center">
            <div className="font-display text-[calc(var(--u)*16)] leading-none text-white tabular-nums">{count}</div>
            <div className="mt-[calc(var(--u)*1.5)] text-[calc(var(--u)*1.8)] uppercase tracking-[0.3em] text-white/45">
              articles today
            </div>
          </div>
          {SOURCES.map((s, i) => (
            <motion.div
              key={s}
              className="flex w-[min(calc(var(--u)*40),74vw)] items-center justify-center rounded-full border-[calc(var(--u)*0.4)] border-white/25 bg-white/[0.08] px-[calc(var(--u)*3)] py-[calc(var(--u)*1.6)] text-[calc(var(--u)*2.2)] font-medium text-white/85"
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reduced ? 0.3 : 0.5, delay: reduced ? 0 : 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.span
                className="mr-[calc(var(--u)*1.2)] inline-block h-[calc(var(--u)*1.4)] w-[calc(var(--u)*1.4)] rounded-full"
                style={{ background: ACCENT }}
                animate={reduced ? {} : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
              {s}
            </motion.div>
          ))}
        </div>
      ) : (
      <div className="relative mx-auto h-[calc(var(--u)*62)] w-full max-w-full">
        {CLIPPINGS.map((c, i) => (
          <motion.div
            key={c.t}
            className="absolute left-1/2 top-1/2 w-[min(calc(var(--u)*38),58vw)] max-w-[300px] px-[calc(var(--u)*2.4)] py-[calc(var(--u)*2)] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
            style={{ background: PAPER, color: INK, translate: '-50% -50%' }}
            initial={{
              x: c.x * sx * 1.5 * u,
              y: (c.y * sy - 70) * u,
              rotate: reduced ? c.r : c.r * 3,
              opacity: 0,
            }}
            animate={{ x: c.x * sx * u, y: c.y * sy * u, rotate: reduced ? 0 : c.r, opacity: 1 }}
            transition={{
              duration: reduced ? 0.35 : 0.9,
              delay: reduced ? 0 : i * 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <p className="text-[calc(var(--u)*1.2)] font-semibold uppercase tracking-[0.3em] opacity-45">
              Local news
            </p>
            <p className="mt-[calc(var(--u)*1)] font-display text-[calc(var(--u)*2.6)] leading-tight">{c.t}</p>
            <div className="mt-[calc(var(--u)*1.6)] space-y-[calc(var(--u)*0.7)]">
              <div className="h-[calc(var(--u)*0.8)] w-full rounded-full bg-black/10" />
              <div className="h-[calc(var(--u)*0.8)] w-3/4 rounded-full bg-black/10" />
            </div>
          </motion.div>
        ))}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 2. Subject */

const TYPED = 'Eastbourne';

export const SceneSubject = ({ reduced, cue, tap }: SceneProps) => {
  const [text, setText] = useState(reduced ? TYPED : '');
  const [chip, setChip] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setText(TYPED.slice(0, i));
      cue('tick');
      if (i >= TYPED.length) {
        window.clearInterval(id);
        window.setTimeout(() => {
          setChip(true);
          cue('confirm');
          tap(12);
        }, 380);
      }
    }, 130);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stage>
      <div className="mx-auto w-full max-w-[calc(var(--u)*80)] space-y-[calc(var(--u)*4)]">
        <p className="text-[calc(var(--u)*1.8)] uppercase tracking-[0.35em] text-white/45">Your subject</p>
        <Chunk className="flex items-center gap-[calc(var(--u)*2)] px-[calc(var(--u)*4)] py-[calc(var(--u)*5)]">
          <span className="font-display text-[calc(var(--u)*8)] leading-none text-white">{text}</span>
          {!chip && <span className="inline-block h-[calc(var(--u)*8)] w-[calc(var(--u)*0.8)] animate-pulse bg-white/80" />}
        </Chunk>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={chip ? { opacity: 1, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          className="inline-flex items-center gap-2 rounded-full px-[calc(var(--u)*4)] py-[calc(var(--u)*1.8)] text-[calc(var(--u)*2.6)] font-semibold"
          style={{ background: ACCENT, color: INK }}
        >
          Feed created
        </motion.div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 3. Sources */

const SOURCES = ['Local paper', 'Council', 'Community blog', 'Radio', 'Listings'];

export const SceneSources = ({ reduced, cue }: SceneProps) => {
  const u = useUnit();
  const tall = isPortrait();
  const [count, setCount] = useState(reduced ? 47 : 0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setCount((c) => (c >= 47 ? (window.clearInterval(id), 47) : c + 1));
    }, 90);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBeats(SOURCES.map((_, i) => [400 + i * 600, () => cue('pulse')] as [number, () => void]));

  return (
    <Stage>
      <div className="relative mx-auto h-[calc(var(--u)*62)] w-full max-w-full">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-display text-[calc(var(--u)*16)] leading-none text-white tabular-nums">{count}</div>
          <div className="mt-[calc(var(--u)*1.5)] text-[calc(var(--u)*1.8)] uppercase tracking-[0.3em] text-white/45">
            articles today
          </div>
        </div>
        {SOURCES.map((s, i) => {
          const angle = (i / SOURCES.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <motion.div
              key={s}
              className="absolute left-1/2 top-1/2 max-w-[42vw] truncate rounded-full border-[calc(var(--u)*0.4)] border-white/25 bg-white/[0.08] px-[calc(var(--u)*3)] py-[calc(var(--u)*1.6)] text-[calc(var(--u)*2.2)] font-medium text-white/85"
              style={{ translate: '-50% -50%' }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
              animate={{
                x: Math.cos(angle) * u * (tall ? 11 : 24),
                y: Math.sin(angle) * u * (tall ? 27 : 16),
                opacity: 1,
                scale: 1,
              }}
              transition={{
                duration: reduced ? 0.3 : 0.7,
                delay: reduced ? 0 : 0.15 * i,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <motion.span
                className="mr-[calc(var(--u)*1.2)] inline-block h-[calc(var(--u)*1.4)] w-[calc(var(--u)*1.4)] rounded-full align-middle"
                style={{ background: ACCENT }}
                animate={reduced ? {} : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
              {s}
            </motion.div>
          );
        })}
      </div>
      )}
    </Stage>
  );
};

/* ---------------------------------------------------------------- 4. Filter */

export const SceneFilter = ({ reduced, cue, tap }: SceneProps) => {
  const u = useUnit();
  useBeats([
    [1400, () => cue('thud')],
    [2000, () => { cue('thud'); tap(14); }],
  ]);
  return (
    <Stage>
      <div className="relative mx-auto h-[calc(var(--u)*62)] w-full max-w-full max-w-[calc(var(--u)*80)]">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={`d-${i}`}
            className="absolute h-[calc(var(--u)*7)] w-[calc(var(--u)*22)] rounded-[calc(var(--u)*1.5)] border-[calc(var(--u)*0.4)] border-white/15 bg-white/[0.06]"
            style={{ left: `${4 + i * 18}%` }}
            initial={{ y: 0, opacity: 0.8 }}
            animate={{ y: reduced ? 90 : u * 55, opacity: 0 }}
            transition={{ duration: reduced ? 0.4 : 1.7, delay: i * 0.16, ease: 'easeIn' }}
          />
        ))}

        <div className="absolute left-0 right-0 top-1/2 flex items-center gap-[calc(var(--u)*2)]">
          <div
            className="h-[calc(var(--u)*0.5)] flex-1 rounded-full"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)' }}
          />
          <span className="text-[calc(var(--u)*1.6)] uppercase tracking-[0.3em] text-white/50">relevance</span>
          <div
            className="h-[calc(var(--u)*0.5)] flex-1 rounded-full"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)' }}
          />
        </div>

        <div className="absolute bottom-0 left-1/2 w-[min(calc(var(--u)*56),86vw)] -translate-x-1/2 space-y-[calc(var(--u)*2)]">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`k-${i}`}
              initial={{ y: -160, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: reduced ? 0.3 : 0.6,
                delay: reduced ? 0 : 1.2 + i * 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Chunk className="flex items-center gap-[calc(var(--u)*2.5)] px-[calc(var(--u)*3)] py-[calc(var(--u)*2.6)]">
                <span className="h-[calc(var(--u)*2)] w-[calc(var(--u)*2)] rounded-full" style={{ background: ACCENT }} />
                <span className="h-[calc(var(--u)*1.4)] flex-1 rounded-full bg-white/35" />
              </Chunk>
            </motion.div>
          ))}
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 5. Written */

const HEADLINE = 'Seafront plan wins narrow approval';

export const SceneWritten = ({ reduced, cue }: SceneProps) => {
  const [typed, setTyped] = useState(reduced ? HEADLINE : '');
  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useBeats([[2600, () => cue('chime')]]);

  return (
    <Stage>
      <Chunk className="mx-auto w-full max-w-[calc(var(--u)*62)] overflow-hidden">
        <div className="relative h-[calc(var(--u)*26)] overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})` }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: reduced ? 0.3 : 1.4, delay: reduced ? 0 : 1.1, ease: 'easeOut' }}
          />
        </div>
        <div className="space-y-[calc(var(--u)*2.5)] p-[calc(var(--u)*3.5)]">
          <h3 className="min-h-[calc(var(--u)*9)] font-display text-[calc(var(--u)*4)] leading-tight text-white">{typed}</h3>
          <Bars count={3} />
          <p className="text-[calc(var(--u)*1.5)] uppercase tracking-[0.25em] text-white/40">
            Source credited on every story
          </p>
        </div>
      </Chunk>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 6. Publish */

const DESTINATIONS = ['Your feed', 'Newsletter', 'Site widget', 'Social carousels'];

export const ScenePublish = ({ reduced, cue, tap }: SceneProps) => {
  const u = useUnit();
  useBeats(
    DESTINATIONS.map((_, i) => [700 + i * 500, () => { cue('land'); tap(8); }] as [number, () => void]),
  );
  const tall = isPortrait();
  const dx = (tall ? 11 : 30) * u;
  const dy = (tall ? 24 : 21) * u;
  const spots = [
    { x: -dx, y: -dy },
    { x: dx, y: -dy },
    { x: -dx, y: dy },
    { x: dx, y: dy },
  ];
  return (
    <Stage>
      <div className="relative mx-auto h-[calc(var(--u)*62)] w-full max-w-full">
        <Chunk className="absolute left-1/2 top-1/2 w-[calc(var(--u)*24)] -translate-x-1/2 -translate-y-1/2 space-y-[calc(var(--u)*1.5)] p-[calc(var(--u)*2)]">
          <div
            className="h-[calc(var(--u)*8)] rounded-[calc(var(--u)*1)]"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})` }}
          />
          <Bars count={2} />
        </Chunk>
        {DESTINATIONS.map((d, i) => (
          <motion.div
            key={d}
            className="absolute left-1/2 top-1/2 w-[min(calc(var(--u)*30),42vw)] truncate rounded-full border-[calc(var(--u)*0.4)] border-white/25 bg-white/[0.08] px-[calc(var(--u)*2)] py-[calc(var(--u)*2)] text-center text-[calc(var(--u)*2.2)] font-medium text-white/90"
            style={{ translate: '-50% -50%' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{ x: spots[i].x, y: spots[i].y, opacity: 1, scale: 1 }}
            transition={{
              duration: reduced ? 0.3 : 0.7,
              delay: reduced ? 0 : 0.6 + i * 0.5,
              type: reduced ? 'tween' : 'spring',
              stiffness: 200,
              damping: 16,
            }}
          >
            {d}
          </motion.div>
        ))}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 7. Editor */

export const SceneEditor = ({ reduced, cue, tap }: SceneProps) => {
  const [approved, setApproved] = useState(reduced);
  const [swiped, setSwiped] = useState(reduced);
  useBeats([
    [900, () => { setApproved(true); cue('land'); tap(12); }],
    [2100, () => { setSwiped(true); cue('whoosh'); }],
  ]);
  const Row = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <Chunk className="flex items-center gap-[calc(var(--u)*2.5)] p-[calc(var(--u)*2.6)]">
      <div className="flex-1 space-y-[calc(var(--u)*1.2)]">
        <div className="h-[calc(var(--u)*1.8)] w-3/4 rounded-full bg-white/30" />
        <div className="h-[calc(var(--u)*1.2)] w-1/2 rounded-full bg-white/15" />
      </div>
      {children ?? (
        <span className="rounded-full bg-white/10 px-[calc(var(--u)*2.5)] py-[calc(var(--u)*1.2)] text-[calc(var(--u)*2)] text-white/70">
          {label}
        </span>
      )}
    </Chunk>
  );
  return (
    <Stage>
      <div className="mx-auto w-full max-w-[calc(var(--u)*64)] space-y-[calc(var(--u)*2.5)]">
        <Chunk className="flex items-center gap-[calc(var(--u)*2.5)] p-[calc(var(--u)*2.6)]">
          <div className="flex-1 space-y-[calc(var(--u)*1.2)]">
            <div className="h-[calc(var(--u)*1.8)] w-3/4 rounded-full bg-white/30" />
            <div className="h-[calc(var(--u)*1.2)] w-1/2 rounded-full bg-white/15" />
          </div>
          <motion.span
            className="rounded-full px-[calc(var(--u)*2.5)] py-[calc(var(--u)*1.2)] text-[calc(var(--u)*2)] font-semibold"
            animate={
              approved
                ? { background: ACCENT, color: INK, scale: [1, 1.12, 1] }
                : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }
            }
            transition={{ duration: 0.35 }}
          >
            {approved ? 'Published' : 'Approve'}
          </motion.span>
        </Chunk>
        <motion.div
          animate={swiped ? { x: reduced ? 0 : 600, opacity: 0 } : {}}
          transition={{ duration: 0.45, ease: 'easeIn' }}
        >
          <Row label="Spike" />
        </motion.div>
        <motion.div layout>
          <Row label="Edit" />
        </motion.div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 8. Close */

export const SceneClose = ({ reduced, cue }: SceneProps) => {
  useBeats([[1500, () => cue('chime')]]);
  return (
    <Stage>
      <div className="mx-auto w-full max-w-[calc(var(--u)*86)] space-y-[calc(var(--u)*6)]">
        <div className="grid grid-cols-3 gap-[calc(var(--u)*2.5)]">
          {['Eastbourne', 'Cycling culture', 'AI & ethics'].map((t, i) => (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.3 : 0.55, delay: reduced ? 0 : i * 0.2 }}
            >
              <Chunk className="space-y-[calc(var(--u)*1.5)] p-[calc(var(--u)*2)]">
                <div
                  className="h-[calc(var(--u)*10)] rounded-[calc(var(--u)*1)]"
                  style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})` }}
                />
                <p className="truncate text-[calc(var(--u)*2)] font-medium text-white/80">{t}</p>
                <Bars count={2} />
              </Chunk>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="text-center font-display text-[calc(var(--u)*9)] leading-none tracking-tight text-white"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: reduced ? 0.1 : 0.9 }}
        >
          Curatr<span style={{ color: ACCENT }}>.</span>
          <span className="text-[calc(var(--u)*5)] opacity-70">pro</span>
        </motion.div>
      </div>
    </Stage>
  );
};
