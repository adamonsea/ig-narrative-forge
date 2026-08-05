import { motion, useReducedMotion } from 'framer-motion';

const ACCENT = 'hsl(155,100%,67%)';
const VIOLET = 'hsl(270,100%,68%)';

const loop = (duration: number, delay = 0) => ({
  duration,
  repeat: Infinity,
  repeatType: 'loop' as const,
  ease: 'easeInOut' as const,
  delay,
});

const Stage = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div
    role="img"
    aria-label={label}
    className="relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:h-56"
  >
    {children}
  </div>
);

/* Trawling — source tiles pulse and feed a central pile */
const LoopTrawl = ({ reduced }: { reduced: boolean }) => (
  <Stage label="Multiple sources being scanned and collected into one pile">
    <div className="absolute inset-0 grid grid-cols-3 items-center gap-3 px-6">
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="h-4 w-full rounded-md border border-white/10 bg-white/[0.06]"
            animate={reduced ? {} : { opacity: [0.35, 1, 0.35], x: [0, 6, 0] }}
            transition={reduced ? { duration: 0 } : loop(3.2, i * 0.28)}
          />
        ))}
      </div>
      <div className="flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="mx-0.5 h-1.5 w-1.5 rounded-full"
            style={{ background: ACCENT }}
            animate={reduced ? {} : { opacity: [0.15, 1, 0.15] }}
            transition={reduced ? { duration: 0 } : loop(1.6, i * 0.2)}
          />
        ))}
      </div>
      <div className="relative h-24">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-x-0 h-16 rounded-lg border border-white/15 bg-white/[0.08]"
            style={{ top: i * 10, rotate: i % 2 ? 3 : -2 }}
            animate={reduced ? {} : { y: [-8, 0, 0], opacity: [0, 1, 1] }}
            transition={reduced ? { duration: 0 } : loop(3.2, i * 0.5)}
          />
        ))}
      </div>
    </div>
  </Stage>
);

/* Relevance filtering — off-topic chips fall away, local ones stay */
const LoopFilter = ({ reduced }: { reduced: boolean }) => (
  <Stage label="Irrelevant stories dropping away while relevant ones stay">
    <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-2 px-8">
      {[true, false, true, false, true, true, false, true].map((keep, i) => (
        <motion.span
          key={i}
          className="h-6 rounded-full border px-6"
          style={{
            borderColor: keep ? 'rgba(94,255,190,0.5)' : 'rgba(255,255,255,0.12)',
            background: keep ? 'rgba(94,255,190,0.12)' : 'rgba(255,255,255,0.05)',
          }}
          animate={reduced || keep ? {} : { y: [0, 0, 60], opacity: [1, 1, 0] }}
          transition={reduced ? { duration: 0 } : loop(4, i * 0.15)}
        />
      ))}
    </div>
  </Stage>
);

/* Briefings — lines typed out, then an audio waveform */
const LoopBriefing = ({ reduced }: { reduced: boolean }) => (
  <Stage label="A written briefing being drafted and read aloud">
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-10">
      {[1, 0.85, 0.65].map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded-full bg-white/20"
          style={{ maxWidth: `${w * 100}%` }}
          initial={{ width: '0%' }}
          animate={reduced ? { width: '100%' } : { width: ['0%', '100%', '100%', '0%'] }}
          transition={reduced ? { duration: 0 } : loop(5, i * 0.35)}
        />
      ))}
      <div className="mt-2 flex items-end gap-1.5">
        {[0.4, 0.9, 0.55, 1, 0.7, 0.45, 0.85].map((h, i) => (
          <motion.span
            key={i}
            className="w-2 rounded-full"
            style={{ background: VIOLET, height: `${h * 28}px` }}
            animate={reduced ? {} : { scaleY: [0.4, 1, 0.5, 1] }}
            transition={reduced ? { duration: 0 } : loop(1.8, i * 0.1)}
          />
        ))}
      </div>
    </div>
  </Stage>
);

/* Illustration — big version of the homepage paint loop */
const LoopArtwork = ({ reduced }: { reduced: boolean }) => (
  <Stage label="A story card being filled with generated artwork">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-48 overflow-hidden rounded-xl border border-white/15 bg-white/5 sm:w-56">
        <div className="relative h-24 w-full overflow-hidden sm:h-28">
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, ${VIOLET}, ${ACCENT})` }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={
              reduced
                ? { clipPath: 'inset(0 0% 0 0)' }
                : { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 0)', 'inset(0 100% 0 0)'] }
            }
            transition={reduced ? { duration: 0 } : loop(4.4)}
          />
        </div>
        <div className="space-y-2 p-4">
          <div className="h-2 w-full rounded-full bg-white/20" />
          <div className="h-2 w-2/3 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </Stage>
);

/* Publishing — one card fans out to feed, email, social, widget */
const LoopPublish = ({ reduced }: { reduced: boolean }) => (
  <Stage label="One story being sent out to feed, email, social and widget channels">
    <div className="absolute inset-0 flex items-center justify-center gap-8 px-8">
      <div className="h-20 w-14 rounded-lg border border-white/20 bg-white/[0.1]" />
      <div className="grid grid-cols-2 gap-3">
        {['Feed', 'Email', 'Social', 'Widget'].map((c, i) => (
          <motion.span
            key={c}
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] tracking-wide text-white/70"
            animate={reduced ? {} : { x: [-24, 0, 0, -24], opacity: [0, 1, 1, 0] }}
            transition={reduced ? { duration: 0 } : loop(4.6, i * 0.3)}
          >
            {c}
          </motion.span>
        ))}
      </div>
    </div>
  </Stage>
);

/* Editorial control — approve / reject cycling on a queue */
const LoopControl = ({ reduced }: { reduced: boolean }) => (
  <Stage label="Stories being approved or rejected in a review queue">
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-10">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="flex h-10 items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] px-4"
          animate={reduced ? {} : { opacity: [0.4, 1, 1, 0.4], x: [0, 0, 10, 0] }}
          transition={reduced ? { duration: 0 } : loop(4.2, i * 0.6)}
        >
          <span className="h-2 w-24 rounded-full bg-white/20" />
          <motion.span
            className="h-4 w-4 rounded-full"
            style={{ background: i === 1 ? 'rgba(255,255,255,0.15)' : ACCENT }}
            animate={reduced ? {} : { scale: [0.8, 1.15, 1, 0.8] }}
            transition={reduced ? { duration: 0 } : loop(4.2, i * 0.6)}
          />
        </motion.div>
      ))}
    </div>
  </Stage>
);

export type FeatureAnimationName = 'trawl' | 'filter' | 'briefing' | 'artwork' | 'publish' | 'control';

export const FeatureAnimation = ({ name }: { name: FeatureAnimationName }) => {
  const reduced = !!useReducedMotion();
  switch (name) {
    case 'trawl':
      return <LoopTrawl reduced={reduced} />;
    case 'filter':
      return <LoopFilter reduced={reduced} />;
    case 'briefing':
      return <LoopBriefing reduced={reduced} />;
    case 'artwork':
      return <LoopArtwork reduced={reduced} />;
    case 'publish':
      return <LoopPublish reduced={reduced} />;
    default:
      return <LoopControl reduced={reduced} />;
  }
};
