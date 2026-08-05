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

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 flex items-center justify-center px-6">{children}</div>
);

const Card = ({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-sm ${className}`}>{children}</div>
);

const Lines = ({ count = 3, width = 'w-full' }: { count?: number; width?: string }) => (
  <div className="space-y-1.5">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`h-1.5 rounded-full bg-white/20 ${i === count - 1 ? 'w-2/3' : width}`} />
    ))}
  </div>
);

/* ---------------------------------------------------------------- 1. Problem */

const FRAGMENTS = [
  'Council votes on seafront plan',
  'Pier repairs delayed again',
  'New bus route consultation',
  'School wins county award',
  'Flood defence funding gap',
  'Market traders speak out',
  'Hospital waiting times rise',
  'Festival line-up announced',
];

export const SceneProblem = ({ reduced, cue }: SceneProps) => {
  useBeats([[200, () => cue('rustle')]]);
  return (
    <Stage>
      <div className="relative w-full max-w-2xl h-64">
        {FRAGMENTS.map((f, i) => {
          const angle = (i / FRAGMENTS.length) * Math.PI * 2;
          return (
            <motion.div
              key={f}
              className="absolute left-1/2 top-1/2 whitespace-nowrap text-white/25 text-sm md:text-base font-light"
              initial={{
                x: Math.cos(angle) * 420 - 80,
                y: Math.sin(angle) * 280,
                opacity: 0,
                rotate: reduced ? 0 : (i % 2 ? -4 : 4),
              }}
              animate={{
                x: Math.cos(angle) * (reduced ? 180 : 110) - 80,
                y: Math.sin(angle) * (reduced ? 90 : 70),
                opacity: 1,
              }}
              transition={{ duration: reduced ? 0.4 : 3.2, delay: i * 0.12, ease: 'easeOut' }}
            >
              {f}
            </motion.div>
          );
        })}
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
    }, 110);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stage>
      <div className="w-full max-w-md space-y-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Your subject</p>
        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-4">
          <span className="text-2xl md:text-3xl font-display text-white">{text}</span>
          {!chip && <span className="inline-block h-7 w-[2px] animate-pulse bg-white/70" />}
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={chip ? { opacity: 1, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
          style={{ background: ACCENT, color: 'hsl(214,50%,9%)' }}
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
  const [count, setCount] = useState(reduced ? 47 : 0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setCount((c) => (c >= 47 ? (window.clearInterval(id), 47) : c + 1));
    }, 130);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBeats(SOURCES.map((_, i) => [500 + i * 700, () => cue('pulse')] as [number, () => void]));

  return (
    <Stage>
      <div className="relative w-full max-w-2xl h-72">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-display text-5xl md:text-6xl text-white tabular-nums">{count}</div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mt-1">articles today</div>
        </div>
        {SOURCES.map((s, i) => {
          const angle = (i / SOURCES.length) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * 190;
          const y = Math.sin(angle) * 110;
          return (
            <motion.div
              key={s}
              className="absolute left-1/2 top-1/2 rounded-full border border-white/20 bg-white/[0.07] px-3 py-1.5 text-xs text-white/80 whitespace-nowrap"
              style={{ marginLeft: -40, marginTop: -14 }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              transition={{ duration: reduced ? 0.3 : 0.8, delay: reduced ? 0 : 0.15 * i, ease: 'easeOut' }}
            >
              <motion.span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: ACCENT }}
                animate={reduced ? {} : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
              {s}
            </motion.div>
          );
        })}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 4. Filter */

export const SceneFilter = ({ reduced, cue, tap }: SceneProps) => {
  useBeats([
    [1500, () => cue('thud')],
    [2100, () => { cue('thud'); tap(14); }],
  ]);
  const dropped = [0, 1, 2, 3, 4, 5];
  return (
    <Stage>
      <div className="relative w-full max-w-xl h-72">
        {/* falling, discarded cards */}
        {dropped.map((i) => (
          <motion.div
            key={`d-${i}`}
            className="absolute h-9 w-28 rounded-md border border-white/10 bg-white/[0.05]"
            style={{ left: `${8 + i * 15}%` }}
            initial={{ y: -40, opacity: 0.7 }}
            animate={{ y: reduced ? 40 : 230, opacity: 0 }}
            transition={{ duration: reduced ? 0.4 : 1.8, delay: i * 0.12, ease: 'easeIn' }}
          />
        ))}
        {/* the sieve */}
        <div className="absolute left-0 right-0 top-1/2 flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)' }} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">local relevance</span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)' }} />
        </div>
        {/* the keepers */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-64 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={`k-${i}`}
              initial={{ y: -160, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: reduced ? 0.3 : 0.6, delay: reduced ? 0 : 1.2 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="flex items-center gap-3 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
                <span className="h-1.5 flex-1 rounded-full bg-white/30" />
              </Card>
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
      <Card className="w-full max-w-sm overflow-hidden">
        {/* illustration paints in */}
        <div className="relative h-32 overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})`, opacity: 0.75 }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: reduced ? 0.3 : 1.4, delay: reduced ? 0 : 1.2, ease: 'easeOut' }}
          />
          <div className="absolute inset-0 bg-[hsl(214,50%,9%)]/25" />
        </div>
        <div className="space-y-3 p-4">
          <h3 className="text-lg font-display leading-snug text-white min-h-[3rem]">{typed}</h3>
          <Lines count={3} />
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Source credited on every story</p>
        </div>
      </Card>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 6. Publish */

const DESTINATIONS = ['Your feed', 'Newsletter', 'Site widget', 'Social carousel'];

export const ScenePublish = ({ reduced, cue, tap }: SceneProps) => {
  useBeats(
    DESTINATIONS.map((_, i) => [700 + i * 450, () => { cue('land'); tap(8); }] as [number, () => void]),
  );
  const spots = [
    { x: -190, y: -80 },
    { x: 190, y: -80 },
    { x: -190, y: 80 },
    { x: 190, y: 80 },
  ];
  return (
    <Stage>
      <div className="relative w-full max-w-2xl h-72">
        <Card className="absolute left-1/2 top-1/2 -ml-16 -mt-12 w-32 space-y-2 p-3">
          <div className="h-8 rounded" style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})`, opacity: 0.7 }} />
          <Lines count={2} />
        </Card>
        {DESTINATIONS.map((d, i) => (
          <motion.div
            key={d}
            className="absolute left-1/2 top-1/2 -ml-[70px] -mt-4 w-[140px] rounded-full border border-white/20 bg-white/[0.07] px-3 py-2 text-center text-xs text-white/85"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
            animate={{ x: spots[i].x, y: spots[i].y, opacity: 1, scale: 1 }}
            transition={{
              duration: reduced ? 0.3 : 0.7,
              delay: reduced ? 0 : 0.5 + i * 0.45,
              type: reduced ? 'tween' : 'spring',
              stiffness: 220,
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
  return (
    <Stage>
      <div className="w-full max-w-sm space-y-3">
        <motion.div animate={approved ? { borderColor: ACCENT } : {}} transition={{ duration: 0.3 }}>
          <Card className="flex items-center gap-3 p-3" >
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-3/4 rounded-full bg-white/30" />
              <div className="h-1.5 w-1/2 rounded-full bg-white/15" />
            </div>
            <motion.span
              className="rounded-full px-3 py-1 text-xs font-medium"
              animate={
                approved
                  ? { background: ACCENT, color: 'hsl(214,50%,9%)', scale: [1, 1.12, 1] }
                  : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }
              }
              transition={{ duration: 0.35 }}
            >
              {approved ? 'Published' : 'Approve'}
            </motion.span>
          </Card>
        </motion.div>
        <motion.div animate={swiped ? { x: reduced ? 0 : 420, opacity: 0 } : {}} transition={{ duration: 0.45, ease: 'easeIn' }}>
          <Card className="flex items-center gap-3 p-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-2/3 rounded-full bg-white/20" />
              <div className="h-1.5 w-1/3 rounded-full bg-white/10" />
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">Spike</span>
          </Card>
        </motion.div>
        <motion.div layout>
          <Card className="flex items-center gap-3 p-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-4/5 rounded-full bg-white/20" />
              <div className="h-1.5 w-2/5 rounded-full bg-white/10" />
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">Edit</span>
          </Card>
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
      <div className="w-full max-w-2xl space-y-8">
        <div className="grid grid-cols-3 gap-3">
          {['Eastbourne', 'Cycling culture', 'AI & ethics'].map((t, i) => (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.3 : 0.5, delay: reduced ? 0 : i * 0.18 }}
            >
              <Card className="space-y-2 p-3">
                <div className="h-6 rounded" style={{ background: `linear-gradient(135deg, ${VIOLET}, ${ACCENT})`, opacity: 0.6 }} />
                <p className="truncate text-xs text-white/70">{t}</p>
                <Lines count={2} />
              </Card>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="text-center font-display text-4xl md:text-5xl tracking-tight text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: reduced ? 0.1 : 0.9 }}
        >
          Curatr<span style={{ color: ACCENT }}>.</span>
          <span className="text-2xl opacity-70">pro</span>
        </motion.div>
      </div>
    </Stage>
  );
};