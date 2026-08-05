import { motion, useReducedMotion } from 'framer-motion';

const ACCENT = 'hsl(155,100%,67%)';
const VIOLET = 'hsl(270,100%,68%)';

const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div
    role="img"
    aria-label={label}
    className="relative mb-5 h-24 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] sm:h-28"
  >
    {children}
  </div>
);

const loop = (duration: number, delay = 0) => ({
  duration,
  repeat: Infinity,
  repeatType: 'loop' as const,
  ease: 'easeInOut' as const,
  delay,
});

/* 1 — AI illustrations: a blank card gets painted with a gradient, over and over */
const LoopIllustrations = ({ reduced }: { reduced: boolean }) => (
  <Frame label="An empty story card being filled with generated artwork">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-16 w-24 overflow-hidden rounded-lg border border-white/15 bg-white/5 sm:h-20 sm:w-28">
        <div className="relative h-9 w-full overflow-hidden sm:h-11">
          <motion.div
            className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, ${VIOLET}, ${ACCENT})` }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={
              reduced
                ? { clipPath: 'inset(0 0% 0 0)' }
                : { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 0)', 'inset(0 100% 0 0)'] }
            }
            transition={reduced ? { duration: 0 } : loop(4.2)}
          />
        </div>
        <div className="space-y-1.5 p-2">
          <div className="h-1.5 w-full rounded-full bg-white/20" />
          <div className="h-1.5 w-2/3 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </Frame>
);

/* 2 — Play Mode: cards flick away left and right */
const LoopPlayMode = ({ reduced }: { reduced: boolean }) => (
  <Frame label="Story cards being swiped left and right">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-16 w-20 sm:h-20 sm:w-24">
        <div className="absolute inset-0 rotate-6 rounded-lg border border-white/10 bg-white/[0.06]" />
        <div className="absolute inset-0 -rotate-3 rounded-lg border border-white/10 bg-white/[0.08]" />
        <motion.div
          className="absolute inset-0 rounded-lg border border-white/20 bg-white/[0.14]"
          animate={
            reduced ? {} : { x: [0, 70, 0, -70, 0], rotate: [0, 14, 0, -14, 0], opacity: [1, 0, 1, 0, 1] }
          }
          transition={reduced ? { duration: 0 } : loop(5)}
        />
      </div>
    </div>
  </Frame>
);

/* 3 — Quiz cards: options cycle, the right one lights up */
const LoopQuiz = ({ reduced }: { reduced: boolean }) => (
  <Frame label="Quiz answers being checked one after another">
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="flex h-5 w-full max-w-[9rem] items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2 sm:h-6"
          animate={
            reduced
              ? {}
              : {
                  borderColor: [
                    'rgba(255,255,255,0.12)',
                    i === 1 ? 'rgba(94,255,190,0.9)' : 'rgba(255,255,255,0.12)',
                    'rgba(255,255,255,0.12)',
                  ],
                  backgroundColor: [
                    'rgba(255,255,255,0.05)',
                    i === 1 ? 'rgba(94,255,190,0.14)' : 'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0.05)',
                  ],
                }
          }
          transition={reduced ? { duration: 0 } : loop(3.6, i * 0.5)}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: i === 1 ? ACCENT : 'rgba(255,255,255,0.25)' }}
          />
          <span className="h-1.5 flex-1 rounded-full bg-white/20" />
        </motion.div>
      ))}
    </div>
  </Frame>
);

/* 4 — Sentiment tracking: bars breathe as a trend builds */
const LoopSentiment = ({ reduced }: { reduced: boolean }) => (
  <Frame label="A sentiment trend rising across a small bar chart">
    <div className="absolute inset-0 flex items-end justify-center gap-2 px-5 pb-5 pt-6">
      {[0.35, 0.55, 0.4, 0.75, 0.6, 0.95].map((h, i) => (
        <motion.span
          key={i}
          className="w-3 rounded-full sm:w-4"
          style={{ background: i === 5 ? ACCENT : 'rgba(255,255,255,0.18)' }}
          initial={{ height: `${h * 100}%` }}
          animate={reduced ? {} : { height: [`${h * 55}%`, `${h * 100}%`, `${h * 70}%`, `${h * 55}%`] }}
          transition={reduced ? { duration: 0 } : loop(4, i * 0.15)}
        />
      ))}
    </div>
  </Frame>
);

export type FeatureLoopName = 'illustrations' | 'play' | 'quiz' | 'sentiment';

export const FeatureLoop = ({ name }: { name: FeatureLoopName }) => {
  const reduced = !!useReducedMotion();
  if (name === 'illustrations') return <LoopIllustrations reduced={reduced} />;
  if (name === 'play') return <LoopPlayMode reduced={reduced} />;
  if (name === 'quiz') return <LoopQuiz reduced={reduced} />;
  return <LoopSentiment reduced={reduced} />;
};
