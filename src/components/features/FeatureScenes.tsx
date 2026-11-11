/**
 * Curatr — Features page explainer scenes (main brand: "Dark Ink Editorial").
 *
 * Eight looping animations that act out how each feature works. Each is drawn
 * on a fixed 480×360 board and scaled to its container, so layout is identical
 * at every screen size.
 *
 * - Plays only while on screen.
 * - prefers-reduced-motion: one representative still frame.
 * - Only dependency: framer-motion. Fonts: Instrument Serif, Work Sans, Lexend.
 * - All sample content lives in TOPIC below: swap it to re-theme every scene
 *   (e.g. a client-specific demo) without touching the animation code.
 *
 * Usage: <FeatureScene name="gather" />
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'framer-motion';

/* ================================================================ content */

export const TOPIC = {
  /* 01 Gather + 02 Filter — a precision oncology channel, with your own team's content mixed in */
  sources: [
    { name: 'Research journal', type: 'Sitemap' },
    { name: 'Regulator updates', type: 'Web page' },
    { name: 'Trade press', type: 'RSS' },
    { name: 'Your team', type: 'Your own posts' },
  ],
  incoming: [
    'New biomarker guidance',
    'Phase III trial succeeds',
    'Testing rates rise',
    'Our patient-gap analysis',
    'Liquid biopsy funded',
  ],
  keywords: ['Biomarkers', 'Diagnostics', 'Oncology'],
  blocked: 'Stock tips',
  filter: [
    { t: 'New biomarker guidance', keep: true, hit: 0 },
    { t: 'Pharma stocks to buy', keep: false, hit: 3, why: 'Blocked' },
    { t: 'Liquid biopsy trial grows', keep: true, hit: 1 },
    { t: 'Celebrity wellness app', keep: false, hit: -1, why: 'Off topic' },
    { t: 'Lung cancer testing gaps', keep: true, hit: 2 },
  ],
  /* 03 Brief — MedTech */
  article: { source: 'Trade press', headline: 'Wearable ECG patch cleared for remote monitoring' },
  slides: [
    'A heart monitor you wear for weeks',
    'It flags irregular rhythms to clinicians.',
    'Cleared for remote use this week.',
  ],
  byline: 'By Priya Shah, Trade press',
  /* 04 Illustrate — data science */
  illustrated: 'AI spots rare disease earlier',
  gag: '“It wants more data.”',
  /* 05 Publish — a non-health channel, to show range */
  published: 'Battery costs fall 18%',
  /* 06 Grow — rare disease channel */
  feed: 'Rare Disease',
  growStories: ['Rare therapy fast-tracked', 'Registry passes 10,000'],
  /* 07 Readers — pharma */
  stopper: 'Rare therapy fast-tracked',
  /* 08 Ask — your channel, inside your AI */
  question: "What's new in rare disease this week?",
  answers: [
    { t: 'Rare therapy fast-tracked', s: 'Regulator' },
    { t: 'Registry passes 10,000', s: 'Your team' },
    { t: 'Screening pilot widens', s: 'Journal' },
  ],
};

/* ================================================================= tokens */

const INK = 'hsl(214,50%,9%)';
const BOARD = 'hsl(214,50%,11%)';
const CARD = 'hsl(214,50%,15%)';
const CARD_HI = 'hsl(214,50%,19%)';
const LINE = 'rgba(255,255,255,0.12)';
const MINT = 'hsl(155,100%,67%)';
const VIOLET = 'hsl(270,100%,68%)';
const ROSE = 'hsl(352,90%,68%)';
const TEXT = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.55)';
const FAINT = 'rgba(255,255,255,0.14)';

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS = "'Work Sans', system-ui, sans-serif";
const LEX = "'Lexend', system-ui, sans-serif";

const W = 480;
const H = 360;
const EASE = [0.22, 1, 0.36, 1] as const;

const card = (accent?: string): CSSProperties => ({
  background: CARD,
  border: `1px solid ${accent ? accent : LINE}`,
  borderRadius: 14,
  boxShadow: accent ? `0 0 0 1px ${accent}33, 0 0 28px ${accent}33, 0 12px 30px rgba(0,0,0,.35)` : '0 12px 30px rgba(0,0,0,.35)',
  transition: 'border-color .4s, box-shadow .4s',
});

const label: CSSProperties = { fontSize: 12.5, fontWeight: 600, letterSpacing: '.12em', color: MUTED, textTransform: 'uppercase' };

/* ============================================================== utilities */

function useSceneClock(durations: number[], active: boolean, still: number | null) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (still !== null || !active) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step]);
    return () => window.clearTimeout(t);
  }, [step, active, still, durations]);
  return still !== null ? still : step;
}

function useTyped(text: string, on: boolean, speed = 45, instant = false) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return setN(0);
    if (instant) return setN(text.length);
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), speed);
    return () => window.clearInterval(id);
  }, [on, text, speed, instant]);
  return text.slice(0, n);
}

function useCountUp(to: number, on: boolean, from = 0, duration = 1.4, instant = false) {
  const [v, setV] = useState(instant ? to : from);
  useEffect(() => {
    if (instant) return setV(to);
    if (!on) return setV(from);
    const c = animate(from, to, { duration, ease: EASE, onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [on, to, from, duration, instant]);
  return v;
}

/* ================================================================== board */

const SceneBoard = ({ label: aria, render }: { label: string; render: (active: boolean) => ReactNode }) => {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const inView = useInView(outer, { amount: 0.35 });

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      role="img"
      aria-label={aria}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${W} / ${H}`,
        borderRadius: 24,
        overflow: 'hidden',
        background: `radial-gradient(120% 90% at 0% 0%, hsla(155,100%,67%,.10), transparent 55%), radial-gradient(120% 90% at 100% 100%, hsla(270,100%,68%,.12), transparent 55%), ${BOARD}`,
        border: `1px solid ${LINE}`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          fontFamily: SANS,
          color: TEXT,
        }}
      >
        {render(inView)}
      </div>
    </div>
  );
};

const Abs = ({ x, y, w, h, children, style }: { x: number; y: number; w?: number; h?: number; children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>{children}</div>
);

const Pill = ({ children, on, tone = MINT, style }: { children: ReactNode; on?: boolean; tone?: string; style?: CSSProperties }) => (
  <motion.span
    animate={{
      backgroundColor: on ? tone : 'rgba(255,255,255,0.04)',
      color: on ? INK : TEXT,
      borderColor: on ? tone : 'rgba(255,255,255,0.18)',
    }}
    transition={{ duration: 0.3 }}
    style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', ...style }}
  >
    {children}
  </motion.span>
);

const Tap = ({ x, y, show }: { x: number; y: number; show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        key={`${x}-${y}`}
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ position: 'absolute', left: x - 13, top: y - 13, width: 26, height: 26, zIndex: 30 }}
      >
        <div style={{ position: 'absolute', inset: 6, borderRadius: 99, background: TEXT, opacity: 0.9 }} />
        <motion.div
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.2, repeat: 1 }}
          style={{ position: 'absolute', inset: 0, borderRadius: 99, border: `2px solid ${TEXT}` }}
        />
      </motion.div>
    )}
  </AnimatePresence>
);

/** Tap marker centred on its (position: relative) parent. */
const TapIn = ({ show }: { show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.span
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 26, height: 26, marginLeft: -13, marginTop: -13, zIndex: 30, pointerEvents: 'none' }}
      >
        <span style={{ position: 'absolute', inset: 6, borderRadius: 99, background: TEXT, opacity: 0.9 }} />
        <motion.span
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.2, repeat: 1 }}
          style={{ position: 'absolute', inset: 0, borderRadius: 99, border: `2px solid ${TEXT}` }}
        />
      </motion.span>
    )}
  </AnimatePresence>
);

const Tick = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="13" fill={MINT} />
    <path d="M7.5 13.5l3.6 3.6 7.4-8" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Cross = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="13" fill={ROSE} />
    <path d="M9 9l8 8M17 9l-8 8" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/* ===================================================== geometric artwork */
/* Built from the Curatr mark's own language: quarter circles and rounds. */

type Pal = { bg: string; c: [string, string, string] };
const PALS: Pal[] = [
  { bg: 'hsl(214,45%,20%)', c: [MINT, VIOLET, '#EAF2FF'] },
  { bg: 'hsl(200,40%,18%)', c: ['#FFB547', '#3DD9C1', '#F5EFE6'] },
  { bg: 'hsl(230,35%,20%)', c: ['#FF7A8A', '#7AA8FF', '#F5EFE6'] },
];
type Cell = { k: 'q' | 'c' | 'h'; d: 0 | 1 | 2 | 3; col: 0 | 1 | 2 };
const ART: Record<'a' | 'b' | 'c', Cell[]> = {
  a: [
    { k: 'q', d: 2, col: 0 }, { k: 'c', d: 0, col: 2 }, { k: 'q', d: 3, col: 1 },
    { k: 'q', d: 1, col: 1 }, { k: 'h', d: 0, col: 0 }, { k: 'q', d: 0, col: 2 },
  ],
  b: [
    { k: 'h', d: 2, col: 1 }, { k: 'q', d: 3, col: 0 }, { k: 'c', d: 0, col: 1 },
    { k: 'q', d: 0, col: 2 }, { k: 'q', d: 1, col: 0 }, { k: 'h', d: 1, col: 1 },
  ],
  c: [
    { k: 'c', d: 0, col: 0 }, { k: 'q', d: 2, col: 1 }, { k: 'h', d: 3, col: 2 },
    { k: 'q', d: 1, col: 2 }, { k: 'c', d: 0, col: 1 }, { k: 'q', d: 3, col: 0 },
  ],
};

/** Which cells belong to which reveal layer (illustrate scene). */
const LAYER_OF = [0, 1, 0, 1, 0, 1];

const Art = ({ seed = 'a', pal = 0, uid, layer }: { seed?: 'a' | 'b' | 'c'; pal?: number; uid: string; layer?: 0 | 1 | 2 }) => {
  const p = PALS[pal];
  const s = 100;
  const tr = { transition: 'fill .6s ease' };
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
      <defs>
        {ART[seed].map((_, i) => (
          <clipPath key={i} id={`${uid}-c${i}`}>
            <rect x={(i % 3) * s} y={Math.floor(i / 3) * s} width={s} height={s} />
          </clipPath>
        ))}
      </defs>
      {(layer === undefined || layer === 0) && <rect width="300" height="200" fill={p.bg} style={tr} />}
      {ART[seed].map((c, i) => {
        if (layer !== undefined && LAYER_OF[i] + 1 !== layer) return null;
        const x = (i % 3) * s;
        const y = Math.floor(i / 3) * s;
        const fill = p.c[c.col];
        let el: ReactElement;
        if (c.k === 'q') {
          const cx = x + (c.d === 1 || c.d === 2 ? s : 0);
          const cy = y + (c.d >= 2 ? s : 0);
          el = <circle cx={cx} cy={cy} r={s} fill={fill} style={tr} />;
        } else if (c.k === 'c') {
          el = <circle cx={x + s / 2} cy={y + s / 2} r={s / 2.6} fill={fill} style={tr} />;
        } else {
          const cx = x + (c.d === 1 ? s : c.d === 3 ? 0 : s / 2);
          const cy = y + (c.d === 0 ? s : c.d === 2 ? 0 : s / 2);
          el = <circle cx={cx} cy={cy} r={s / 2} fill={fill} style={tr} />;
        }
        return (
          <g key={i} clipPath={`url(#${uid}-c${i})`}>
            {el}
          </g>
        );
      })}
    </svg>
  );
};

/** Satirical cartoon: clean white line drawing, one accent. */
const Cartoon = () => (
  <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
    <rect width="300" height="200" fill="hsl(214,45%,16%)" />
    <g fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {/* chart frame with a gap where the line breaks out */}
      <path d="M60 40 V170 H250 V40 H196 M170 40 H60" />
      {[70, 100, 130].map((y) => (
        <path key={y} d={`M60 ${y} H250`} opacity=".18" />
      ))}
      <path d="M70 158 L110 140 L138 148 L168 104 L184 60 L186 22" stroke={MINT} strokeWidth="3.4" />
      <path d="M176 30 L186 16 L196 30" stroke={MINT} strokeWidth="3.4" />
      {/* frame shards */}
      <path d="M172 34 l-6 -8 M194 34 l7 -7 M182 46 l-3 6" />
      {/* tiny analyst, aghast */}
      <circle cx="232" cy="118" r="9" />
      <path d="M232 127 V150 M232 150 l-8 18 M232 150 l8 18 M232 134 l-12 -12 M232 134 l12 -12" />
      <path d="M228 116 h.1 M236 116 h.1" strokeWidth="3.4" />
      <circle cx="232" cy="122" r="2" />
    </g>
  </svg>
);

/* ================================================================= SCENES */

type SceneProps = { active: boolean; still: boolean };

/* 01 — Gather -------------------------------------------------------------- */

const GATHER_STEPS = [850, 850, 850, 850, 850, 2200];
const SRC_DOTS = [MINT, VIOLET, '#7AA8FF', '#FFB547'];

const GatherScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(GATHER_STEPS, active, still ? 4 : null);
  const slips = TOPIC.incoming;
  const shown = Math.min(step + 1, slips.length);
  const src = step % TOPIC.sources.length;
  return (
    <>
      <Abs x={22} y={20} style={label}>Your sources</Abs>
      {TOPIC.sources.map((s, i) => {
        const on = i === src && step < slips.length;
        return (
          <Abs key={s.name} x={20} y={48 + i * 70} w={180} h={56}>
            <motion.div animate={{ x: on ? 6 : 0 }} transition={{ duration: 0.3 }} style={{ ...card(on ? MINT : undefined), height: '100%', padding: '8px 14px' }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1, whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: on ? MINT : MUTED, marginTop: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: SRC_DOTS[i] }} />
                {s.type}
              </div>
            </motion.div>
          </Abs>
        );
      })}

      <Abs x={222} y={20} w={238} h={320} style={{ ...card(), background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: SERIF, fontSize: 24 }}>Your desk</span>
          <motion.span key={shown} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ fontSize: 13, fontWeight: 700, color: MINT }}>
            +{shown} new
          </motion.span>
        </div>
      </Abs>

      <AnimatePresence>
        {slips.slice(0, shown).map((t, i) => {
          const from = i % TOPIC.sources.length;
          return (
            <motion.div
              key={t}
              initial={{ x: 150, y: 58 + from * 70, scale: 0.55, opacity: 0 }}
              animate={{ x: 234, y: 274 - i * 50, scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              transition={{ type: 'spring', stiffness: 110, damping: 17 }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 214,
                padding: '10px 13px',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                whiteSpace: 'nowrap',
                background: i === shown - 1 ? CARD_HI : CARD,
                border: `1px solid ${i === shown - 1 ? MINT : LINE}`,
                borderRadius: 10,
                boxShadow: '0 8px 20px rgba(0,0,0,.35)',
                fontSize: 13.5,
                fontWeight: 500,
                lineHeight: 1.2,
                zIndex: 10 + i,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: SRC_DOTS[from] }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
};

/* 02 — Filter -------------------------------------------------------------- */

const FILTER_STEPS = TOPIC.filter.flatMap(() => [650, 1000, 650]);

const FilterScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(FILTER_STEPS, active, still ? 4 : null);
  const items = TOPIC.filter;
  const idx = Math.floor(step / 3);
  const phase = step % 3;
  const item = items[idx];
  const kept = items.slice(0, idx).filter((i) => i.keep).length + (phase === 2 && item.keep ? 1 : 0);
  const dropped = items.slice(0, idx).filter((i) => !i.keep).length + (phase === 2 && !item.keep ? 1 : 0);
  const verdict = phase >= 1 ? (item.keep ? MINT : ROSE) : undefined;

  return (
    <>
      <Abs x={20} y={20} w={440} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TOPIC.keywords.map((k, i) => (
          <Pill key={k} on={phase >= 1 && item.hit === i}>
            {k}
          </Pill>
        ))}
        <Pill on={phase >= 1 && item.hit === 3} tone={ROSE} style={{ textDecoration: 'line-through' }}>
          {TOPIC.blocked}
        </Pill>
      </Abs>

      <Abs x={268} y={74} w={0} h={250} style={{ borderLeft: `1.5px dashed ${FAINT}` }} />

      <AnimatePresence>
        <motion.div
          key={idx}
          initial={{ x: -240, y: 140, opacity: 1 }}
          animate={
            phase === 2
              ? item.keep
                ? { x: 320, y: 130, scale: 0.5, opacity: 0 }
                : { x: 60, y: 330, opacity: 0 }
              : { x: 24, y: 140, opacity: 1, scale: 1 }
          }
          exit={{ opacity: 0 }}
          transition={{ duration: phase === 2 ? 0.6 : 0.55, ease: EASE }}
          style={{ position: 'absolute', left: 0, top: 0, width: 224, padding: '12px 14px', ...card(verdict), zIndex: 5 }}
        >
          <div style={{ ...label, fontSize: 11.5, marginBottom: 4 }}>New story</div>
          <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.05 }}>{item.t}</div>
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                style={{ position: 'absolute', right: -12, top: -12 }}
              >
                {item.keep ? <Tick size={30} /> : <Cross size={30} />}
              </motion.div>
            )}
          </AnimatePresence>
          {phase >= 1 && !item.keep && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: ROSE }}>
              {item.why}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      <Abs x={300} y={96} w={160} h={156} style={{ ...card(), padding: '14px 16px' }}>
        <div style={label}>Your queue</div>
        <AnimatePresence mode="popLayout">
          <motion.div key={kept} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} style={{ fontFamily: SERIF, fontSize: 64, lineHeight: 1.1, color: MINT }}>
            {kept}
          </motion.div>
        </AnimatePresence>
        <div style={{ fontSize: 13.5, color: MUTED }}>worth reading</div>
      </Abs>
      <Abs x={302} y={272} style={{ fontSize: 14, color: MUTED }}>
        {dropped} kept out
      </Abs>
    </>
  );
};

/* 03 — Brief --------------------------------------------------------------- */

const BRIEF_STEPS = [1300, 1300, 700, 1600, 1600, 2400];

const Phone = ({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) => (
  <Abs x={x} y={y} w={w} h={h} style={{ background: 'hsl(214,40%,5%)', border: `1px solid rgba(255,255,255,.18)`, borderRadius: 28, padding: 8, boxShadow: '0 20px 40px rgba(0,0,0,.45)' }}>
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'hsl(214,50%,10%)', borderRadius: 21, overflow: 'hidden' }}>{children}</div>
  </Abs>
);

const BriefScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(BRIEF_STEPS, active, still ? 3 : null);
  const slide = step >= 3 ? Math.min(step - 3, 2) : 0;
  const lines = [1, 0.94, 0.98, 0.9, 0.96, 0.7, 1, 0.92, 0.97, 0.88, 0.95, 0.6];
  const keyLines = [2, 5, 9];

  return (
    <>
      <motion.div
        animate={{ opacity: step >= 2 ? 0.5 : 1 }}
        transition={{ duration: 0.5 }}
        style={{ position: 'absolute', left: 18, top: 20, width: 216, height: 320, ...card(), padding: '14px 16px' }}
      >
        <div style={{ ...label, fontSize: 11.5, color: MINT }}>{TOPIC.article.source}</div>
        <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.05, margin: '6px 0 12px' }}>{TOPIC.article.headline}</div>
        {lines.map((w, i) => (
          <div key={i} style={{ position: 'relative', height: 7, marginBottom: 9 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${w * 100}%`, borderRadius: 3, background: FAINT }} />
            {keyLines.includes(i) && (
              <motion.div
                initial={false}
                animate={{ width: step >= 1 ? `${w * 100}%` : '0%' }}
                transition={{ duration: 0.5, delay: keyLines.indexOf(i) * 0.18, ease: EASE }}
                style={{ position: 'absolute', left: 0, top: 0, height: 7, borderRadius: 3, background: MINT, boxShadow: `0 0 12px ${MINT}` }}
              />
            )}
          </div>
        ))}
      </motion.div>

      <motion.svg width="40" height="24" viewBox="0 0 40 24" animate={{ opacity: step >= 2 ? 1 : 0, x: step >= 2 ? 0 : -8 }} style={{ position: 'absolute', left: 238, top: 168 }}>
        <path d="M2 12h30M24 4l9 8-9 8" fill="none" stroke={MINT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>

      <motion.div animate={{ y: step >= 2 ? 0 : 30, opacity: step >= 2 ? 1 : 0 }} transition={{ duration: 0.6, ease: EASE }} style={{ position: 'absolute', inset: 0 }}>
        <Phone x={284} y={14} w={178} h={332}>
          <motion.div animate={{ x: -slide * 162 }} transition={{ duration: 0.55, ease: EASE }} style={{ display: 'flex', width: 162 * 3, height: '100%' }}>
            {TOPIC.slides.map((t, i) => (
              <div key={i} style={{ width: 162, flex: '0 0 162px', padding: 12 }}>
                {i === 0 && (
                  <div style={{ height: 96, borderRadius: 10, overflow: 'hidden' }}>
                    <Art seed="a" uid="brief" />
                  </div>
                )}
                <div style={{ fontFamily: LEX, fontWeight: 300, fontSize: i === 0 ? 19 : 18, lineHeight: 1.22, marginTop: i === 0 ? 12 : 26, letterSpacing: '-0.01em' }}>{t}</div>
                {i === 2 && (
                  <>
                    <div style={{ fontFamily: LEX, fontWeight: 500, fontSize: 12.5, marginTop: 16, color: MUTED }}>{TOPIC.byline}</div>
                    <div style={{ marginTop: 12, background: MINT, color: INK, borderRadius: 999, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '7px 0' }}>Read the full story</div>
                  </>
                )}
              </div>
            ))}
          </motion.div>
          <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} animate={{ width: i === slide ? 18 : 7, background: i === slide ? MINT : 'rgba(255,255,255,.25)' }} style={{ height: 7, borderRadius: 99 }} />
            ))}
          </div>
        </Phone>
      </motion.div>
    </>
  );
};

/* 04 — Illustrate ---------------------------------------------------------- */

const ILLUSTRATE_STEPS = [600, 850, 850, 850, 1400, 1100, 1100, 2800];

const IllustrateScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(ILLUSTRATE_STEPS, active, still ? 4 : null);
  const pal = step === 5 ? 1 : step === 6 ? 2 : 0;
  const cartoon = step === 7;
  const drawing = step >= 1 && step <= 3;
  const ART_W = 270;
  const note = drawing ? 'Illustrating…' : cartoon ? 'Gag included' : step >= 5 ? 'Colours vary' : step === 4 ? 'No stock images' : '';

  return (
    <>
      <Abs x={20} y={22} w={292} h={316} style={{ ...card(), padding: 10 }}>
        <div style={{ position: 'relative', width: ART_W, height: 206, borderRadius: 10, overflow: 'hidden', background: 'hsl(214,45%,14%)' }}>
          {[0, 1, 2].map((l) => (
            <motion.div
              key={l}
              initial={false}
              animate={{ clipPath: step > l ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
              transition={{ duration: step === 0 ? 0 : 0.75, ease: 'linear' }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <Art seed="a" pal={pal} uid={`ill-${l}`} layer={l as 0 | 1 | 2} />
            </motion.div>
          ))}
          <AnimatePresence>
            {cartoon && (
              <motion.div initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }} style={{ position: 'absolute', inset: 0 }}>
                <Cartoon />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {drawing && (
              <motion.div
                key={step}
                initial={{ x: -4 }}
                animate={{ x: ART_W }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.75, ease: 'linear' }}
                style={{ position: 'absolute', top: 0, bottom: 0, width: 3, background: MINT, boxShadow: `0 0 18px 4px ${MINT}` }}
              />
            )}
          </AnimatePresence>
        </div>
        <div style={{ padding: '14px 4px 0' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={cartoon ? 'g' : 'h'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={cartoon ? { fontFamily: SERIF, fontStyle: 'italic', fontSize: 24, lineHeight: 1.08 } : { fontFamily: LEX, fontWeight: 300, fontSize: 19, lineHeight: 1.2 }}
            >
              {cartoon ? TOPIC.gag : TOPIC.illustrated}
            </motion.div>
          </AnimatePresence>
        </div>
      </Abs>

      <Abs x={332} y={28} w={136}>
        <div style={{ ...label, marginBottom: 10 }}>Style</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <Pill on={!cartoon}>House style</Pill>
          <Pill on={cartoon} tone={VIOLET}>
            Cartoon
          </Pill>
        </div>
        <div style={{ ...label, margin: '26px 0 12px' }}>Colours</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {PALS.map((pp, i) => {
            const on = i === pal && !cartoon;
            return (
              <motion.span
                key={i}
                animate={{ scale: on ? 1.15 : 1, boxShadow: on ? `0 0 0 3px ${BOARD}, 0 0 0 4.5px ${TEXT}` : `0 0 0 0 ${BOARD}` }}
                style={{ width: 28, height: 28, borderRadius: 99, background: `conic-gradient(${pp.c[0]} 0 50%, ${pp.c[1]} 0 100%)` }}
              />
            );
          })}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={note} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginTop: 24, fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, color: MUTED }}>
            {note}
          </motion.div>
        </AnimatePresence>
      </Abs>
    </>
  );
};

/* 05 — Publish ------------------------------------------------------------- */

const PUBLISH_STEPS = [1100, 900, 2600, 1400];
const DESTS = ['Your feed', 'Email briefing', 'Website widget', 'RSS feed'];

const DestIcon = ({ i }: { i: number }) => {
  const stroke = { fill: 'none', stroke: TEXT, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      {i === 0 && (
        <>
          <rect x="9" y="3" width="16" height="28" rx="4" {...stroke} />
          <rect x="12" y="7" width="10" height="8" rx="2" fill={MINT} />
          <path d="M12 19h10M12 23h7" {...stroke} />
        </>
      )}
      {i === 1 && (
        <>
          <rect x="3" y="8" width="28" height="19" rx="3" {...stroke} />
          <path d="M3 10l14 10 14-10" {...stroke} />
        </>
      )}
      {i === 2 && (
        <>
          <rect x="2" y="6" width="30" height="22" rx="3" {...stroke} />
          <path d="M2 11h30" {...stroke} />
          <rect x="6" y="15" width="10" height="9" rx="2" fill={MINT} />
          <path d="M20 17h8M20 21h6" {...stroke} />
        </>
      )}
      {i === 3 && (
        <>
          <circle cx="9" cy="25" r="2.5" fill={VIOLET} />
          <path d="M7 15a12 12 0 0 1 12 12M7 7a20 20 0 0 1 20 20" {...stroke} />
        </>
      )}
    </svg>
  );
};

const PublishScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(PUBLISH_STEPS, active, still ? 3 : null);
  const approved = step >= 1;
  const out = step >= 2;
  const rows = DESTS.map((_, i) => 26 + i * 80);
  return (
    <>
      <Abs x={18} y={58} w={190} style={{ ...card(approved ? MINT : undefined), padding: 10 }}>
        <div style={{ height: 104, borderRadius: 8, overflow: 'hidden' }}>
          <Art seed="b" uid="pub" />
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.05, margin: '10px 2px 12px' }}>{TOPIC.published}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, textAlign: 'center', border: `1px solid rgba(255,255,255,.2)`, borderRadius: 999, fontSize: 13, fontWeight: 600, padding: '6px 0', opacity: approved ? 0.35 : 1 }}>Reject</div>
          <motion.div animate={{ backgroundColor: approved ? MINT : 'rgba(255,255,255,0.1)', color: approved ? INK : TEXT }} style={{ flex: 1, textAlign: 'center', borderRadius: 999, fontSize: 13, fontWeight: 600, padding: '7px 0' }}>
            {approved ? 'Approved' : 'Approve'}
          </motion.div>
        </div>
      </Abs>
      <Tap x={160} y={273} show={step === 1} />

      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {rows.map((y, i) => (
          <motion.path
            key={i}
            d={`M210 190 C 250 190, 250 ${y + 32}, 292 ${y + 32}`}
            fill="none"
            stroke={MINT}
            strokeWidth="1.8"
            initial={false}
            animate={{ pathLength: out ? 1 : 0, opacity: out ? 0.8 : 0 }}
            transition={{ duration: 0.45, delay: out ? i * 0.35 : 0, ease: EASE }}
          />
        ))}
      </svg>

      {DESTS.map((d, i) => (
        <motion.div
          key={d}
          initial={false}
          animate={{ opacity: out ? 1 : 0.4, x: out ? 0 : 6 }}
          transition={{ duration: 0.4, delay: out ? 0.3 + i * 0.35 : 0 }}
          style={{ position: 'absolute', left: 294, top: rows[i], width: 168, height: 64, ...card(out ? MINT : undefined), display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}
        >
          <DestIcon i={i} />
          <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.15 }}>{d}</span>
          <AnimatePresence>
            {out && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ delay: 0.5 + i * 0.35, type: 'spring', stiffness: 320, damping: 16 }} style={{ position: 'absolute', right: -9, top: -9 }}>
                <Tick size={22} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </>
  );
};

/* 06 — Grow ---------------------------------------------------------------- */

const GROW_STEPS = [1400, 900, 1000, 1500, 1700, 2200];

const GrowScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(GROW_STEPS, active, still ? 5 : null);
  const email = useTyped('you@email.com', step === 3, 55, still);
  const subs = useCountUp(1249, step === 5, 1248, 0.6, still);
  const freq = step >= 2 ? 2 : 0;
  return (
    <>
      <Phone x={26} y={14} w={196} h={332}>
        <motion.div animate={{ y: step >= 1 ? -238 : 0 }} transition={{ duration: 1.1, ease: EASE }} style={{ padding: 10 }}>
          {[
            { t: TOPIC.growStories[0], seed: 'a' as const },
            { t: TOPIC.growStories[1], seed: 'c' as const },
          ].map(({ t, seed }) => (
            <div key={t} style={{ ...card(), boxShadow: 'none', padding: 6, marginBottom: 10 }}>
              <div style={{ height: 82, borderRadius: 7, overflow: 'hidden' }}>
                <Art seed={seed} uid={`grow-${seed}`} />
              </div>
              <div style={{ fontFamily: LEX, fontWeight: 300, fontSize: 14, lineHeight: 1.22, margin: '7px 3px 3px' }}>{t}</div>
            </div>
          ))}
          <div style={{ ...card(MINT), padding: 11 }}>
            <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.02 }}>{TOPIC.feed}, by email</div>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 999, marginTop: 10, padding: 3 }}>
              {['Daily', 'Weekly', 'Both'].map((f, i) => (
                <motion.span key={f} animate={{ backgroundColor: freq === i ? MINT : 'rgba(0,0,0,0)', color: freq === i ? INK : TEXT }} style={{ position: 'relative', flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '4px 0', borderRadius: 999 }}>
                  {f}
                  {f === 'Both' && <TapIn show={step === 2} />}
                </motion.span>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {step >= 4 ? (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, fontWeight: 500 }}>
                  <Tick size={22} /> Check your inbox
                </motion.div>
              ) : (
                <motion.div key="form" exit={{ opacity: 0 }}>
                  <div style={{ marginTop: 9, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px', fontSize: 13, minHeight: 30, background: 'rgba(0,0,0,.25)', color: email ? TEXT : MUTED }}>{email || 'Your email'}</div>
                  <div style={{ position: 'relative', marginTop: 8, background: MINT, color: INK, borderRadius: 999, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '6px 0' }}>
                    Sign me up
                    <TapIn show={step === 3 && email.length > 11} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </Phone>
      <AnimatePresence>
        {step >= 4 && (
          <motion.div
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ position: 'absolute', left: 246, top: 36, width: 216, ...card(), padding: '13px 15px' }}
          >
            <div style={{ ...label, fontSize: 11.5 }}>1 new email</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.05, margin: '8px 0 12px' }}>Confirm both briefings</div>
            <div style={{ background: MINT, color: INK, borderRadius: 999, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '7px 0' }}>Confirm</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 5 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ position: 'absolute', left: 246, top: 212, width: 216, ...card(MINT), padding: '13px 15px' }}
          >
            <div style={label}>Subscribers</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 1.05 }}>{subs.toLocaleString('en-GB')}</span>
              <motion.span initial={{ y: 10, opacity: 0 }} animate={{ y: -4, opacity: 1 }} transition={{ delay: 0.4 }} style={{ fontSize: 18, fontWeight: 700, color: MINT }}>
                +1
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/* 07 — Readers ------------------------------------------------------------- */

const READERS_STEPS = [2400, 2600, 1400];
const DROP = [100, 78, 64, 55, 49, 46];

const ReadersScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(READERS_STEPS, active, still ? 1 : null);
  const reads = useCountUp(12481, active, 0, 1.6, still);
  const cx = (i: number) => 54 + i * 76;
  const cy = (v: number) => 306 - (v / 100) * 132;
  const d = DROP.map((v, i) => `${i ? 'L' : 'M'}${cx(i)} ${cy(v)}`).join(' ');
  return (
    <>
      <Abs x={20} y={20} w={176} h={98} style={{ ...card(), padding: '12px 15px' }}>
        <div style={label}>Reads this week</div>
        <div style={{ fontFamily: SERIF, fontSize: 48, lineHeight: 1.12 }}>{reads.toLocaleString('en-GB')}</div>
      </Abs>

      <Abs x={210} y={20} w={250} h={98} style={{ ...card(step >= 1 ? MINT : undefined), padding: 9, display: 'flex', gap: 11 }}>
        <div style={{ width: 78, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <Art seed="a" uid="reads" />
        </div>
        <div>
          <div style={{ ...label, fontSize: 11, color: MINT, letterSpacing: '.08em' }}>Top headline stopper</div>
          <div style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.05, marginTop: 5 }}>{TOPIC.stopper}</div>
        </div>
      </Abs>

      <Abs x={20} y={134} w={440} h={206} style={card()} />
      <Abs x={36} y={148} style={label}>
        Where readers stop
      </Abs>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="dropfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={MINT} stopOpacity=".28" />
            <stop offset="1" stopColor={MINT} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path d={`${d} L${cx(5)} 306 L${cx(0)} 306 Z`} fill="url(#dropfill)" initial={false} animate={{ opacity: active || still ? 1 : 0 }} transition={{ duration: 0.6, delay: 1.1 }} />
        <motion.path
          key={active ? 'on' : 'off'}
          d={d}
          fill="none"
          stroke={MINT}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: still ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EASE }}
        />
        {DROP.map((v, i) => (
          <g key={i}>
            <motion.circle
              cx={cx(i)}
              cy={cy(v)}
              r="5.5"
              fill={i === 1 && step >= 1 ? VIOLET : BOARD}
              stroke={i === 1 && step >= 1 ? VIOLET : MINT}
              strokeWidth="2.5"
              initial={{ scale: still ? 1 : 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: still ? 0 : 0.2 + i * 0.22 }}
              style={{ transformOrigin: `${cx(i)}px ${cy(v)}px` }}
            />
            <text x={cx(i)} y={328} textAnchor="middle" fontSize="12" fontWeight="500" fill={MUTED} fontFamily={SANS}>
              {i === 0 ? 'Slide 1' : i + 1}
            </text>
          </g>
        ))}
      </svg>
      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', left: cx(1) + 14, top: cy(DROP[1]) - 40, fontSize: 13, fontWeight: 600, background: VIOLET, color: INK, padding: '5px 10px', borderRadius: 8 }}
          >
            Drop-off: slide 2
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/* 08 — Ask AI -------------------------------------------------------------- */

const ASK_STEPS = [1900, 1100, 3600];

const AskScene = ({ active, still }: SceneProps) => {
  const step = useSceneClock(ASK_STEPS, active, still ? 2 : null);
  const q = useTyped(TOPIC.question, true, 38, still || step >= 1);
  return (
    <Abs x={22} y={18} w={436} h={324} style={{ ...card(), overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>ChatGPT or Claude</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, border: `1px solid ${LINE}`, borderRadius: 999, padding: '4px 11px' }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: MINT, boxShadow: `0 0 8px ${MINT}` }} /> Curatr connected
        </span>
      </div>
      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: 300, background: 'rgba(255,255,255,0.1)', borderRadius: '16px 16px 4px 16px', padding: '9px 14px', fontSize: 16, minHeight: 40 }}>
          {q}
          {step === 0 && !still && (
            <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
              |
            </motion.span>
          )}
        </div>
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="think" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: MUTED }}>
              <span style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} style={{ width: 7, height: 7, borderRadius: 7, background: MINT }} />
                ))}
              </span>
              Checking your {TOPIC.feed} channel…
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="ans" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ maxWidth: 404 }}>
              <div style={{ fontSize: 15, marginBottom: 6, color: MUTED }}>Top stories this week:</div>
              {TOPIC.answers.map((a, i) => (
                <motion.div
                  key={a.t}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: still ? 0 : 0.3 + i * 0.45 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', marginBottom: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}`, borderRadius: 10 }}
                >
                  <span style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{a.t}</span>
                  <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: MINT, border: `1px solid ${MINT}66`, borderRadius: 999, padding: '3px 9px' }}>{a.s}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Abs>
  );
};

/* ================================================================= export */

export type FeatureSceneName = 'gather' | 'filter' | 'brief' | 'illustrate' | 'publish' | 'grow' | 'readers' | 'ask';

const SCENES: Record<FeatureSceneName, { label: string; C: (p: SceneProps) => ReactElement }> = {
  gather: { label: 'New stories arriving from four sources onto your desk', C: GatherScene },
  filter: { label: 'Stories checked against your topics and keywords; off-topic ones kept out', C: FilterScene },
  brief: { label: 'A long article condensed into three swipeable slides', C: BriefScene },
  illustrate: { label: 'An illustration drawn in layers, recoloured, then switched to a satirical cartoon', C: IllustrateScene },
  publish: { label: 'One story approved and sent to feed, email, website widget and RSS', C: PublishScene },
  grow: { label: 'A reader signs up for daily and weekly email in the feed and confirms with one email', C: GrowScene },
  readers: { label: 'Reads counting up, the top headline stopper, and a drop-off curve across slides', C: ReadersScene },
  ask: { label: 'An AI assistant answering a question with stories from your Curatr channel', C: AskScene },
};

export const FeatureScene = ({ name }: { name: FeatureSceneName }) => {
  const reduced = !!useReducedMotion();
  const { label: aria, C } = SCENES[name];
  return <SceneBoard label={aria} render={(inView) => <C active={inView && !reduced} still={reduced} />} />;
};

export default FeatureScene;
