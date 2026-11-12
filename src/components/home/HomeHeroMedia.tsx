import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import heroNewsroom from '@/assets/newsroom-hero.webp.asset.json';
import heroNewsroomBusy from '@/assets/newsroom-busy.webp.asset.json';
import heroNewsroomTypewriters from '@/assets/newsroom-typewriters.webp.asset.json';
import heroNewsroomFilm from '@/assets/newsroom-loop.mp4.asset.json';
import heroNewsroomBusyFilm from '@/assets/newsroom-busy-slow.mp4.asset.json';

// A backdrop item is a still, a film, or a still that comes to life: the busy
// newsroom film opens on the exact frame of its photo, so the photo holds for
// a moment and then starts moving with no visible cut.
type HeroItem = { key: string; still?: string; film?: string };

const HERO_ITEMS: HeroItem[] = [
  { key: 'hero', still: heroNewsroom.url },
  { key: 'typewriters', still: heroNewsroomTypewriters.url },
  { key: 'busy', still: heroNewsroomBusy.url, film: heroNewsroomBusyFilm.url },
  { key: 'loop', film: heroNewsroomFilm.url },
];
const STILL_MS = 7000;
const STILL_HOLD_MS = 2500;
const VIDEO_WAIT_MS = 6000;
const FADE_MS = 1600;

// Randomised hero backdrop: the newsroom stills and films are shuffled into a
// fresh order each visit and crossfade in a loop. Each film hands over to the
// next item before its last frame, so motion carries on through the fade. A
// still stays on screen until a film is actually playing, so there is never a
// blank gap while it loads.
const HeroNewsroomBackground = ({ reduce }: { reduce: boolean }) => {
  const order = useMemo(() => {
    const arr = [...HERO_ITEMS];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const firstStill = Math.max(0, order.findIndex((item) => item.still));
  // `current` drives the timing; `visible` is what's on screen. They differ
  // only while a film without a photo is loading.
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(0);
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const advance = useCallback(() => setCurrent((c) => (c + 1) % order.length), [order.length]);

  useEffect(() => {
    if (reduce) return;
    const item = order[current];
    if (item.still) setVisible(current);
    if (!item.film) {
      const t = window.setTimeout(advance, STILL_MS);
      return () => window.clearTimeout(t);
    }

    const v = videoRefs.current[item.key];
    if (!v) return;
    setPlaying((p) => ({ ...p, [item.key]: false }));
    v.pause();
    v.currentTime = 0;

    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      advance();
    };
    // Film can't play: a photo stays up for its usual time, otherwise skip.
    const fallback = () => {
      if (done) return;
      if (item.still) timers.push(window.setTimeout(finish, STILL_MS - STILL_HOLD_MS));
      else finish();
    };
    const onPlaying = () => {
      setVisible(current);
      setPlaying((p) => ({ ...p, [item.key]: true }));
    };
    const onTime = () => {
      if (v.duration && v.currentTime >= v.duration - FADE_MS / 1000) finish();
    };
    const play = () => v.play().catch(fallback);
    const start = () => {
      if (v.readyState >= 3) return play();
      const onReady = () => {
        window.clearTimeout(wait);
        play();
      };
      const wait = window.setTimeout(() => {
        v.removeEventListener('canplay', onReady);
        fallback();
      }, VIDEO_WAIT_MS);
      timers.push(wait);
      v.addEventListener('canplay', onReady, { once: true });
    };

    v.addEventListener('playing', onPlaying);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', finish);
    v.addEventListener('error', fallback);
    timers.push(window.setTimeout(start, item.still ? STILL_HOLD_MS : 0));

    // The outgoing film keeps playing underneath the crossfade.
    return () => {
      done = true;
      timers.forEach((t) => window.clearTimeout(t));
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', finish);
      v.removeEventListener('error', fallback);
    };
  }, [current, reduce, advance, order]);

  const onScreen = reduce ? firstStill : visible;
  const fade = 'transition-opacity duration-[1600ms] ease-in-out';

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] opacity-[0.22]"
      style={{
        isolation: 'isolate',
        maskImage: 'radial-gradient(120% 88% at 50% 42%, #000 34%, transparent 76%)',
        WebkitMaskImage: 'radial-gradient(120% 88% at 50% 42%, #000 34%, transparent 76%)',
      }}
    >
      {order.map((item, i) => (
        <div key={item.key} className={`absolute inset-0 ${fade} ${onScreen === i ? 'opacity-100' : 'opacity-0'}`}>
          {item.still && (
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${item.still})` }}
            />
          )}
          {item.film && !reduce && (
            <video
              ref={(el) => {
                videoRefs.current[item.key] = el;
              }}
              src={item.film}
              muted
              playsInline
              preload="auto"
              className={`absolute inset-0 h-full w-full object-cover ${fade} ${
                playing[item.key] ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-[hsl(270,100%,68%)] mix-blend-multiply" />
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-transparent to-[hsl(214,50%,9%)]" />
    </div>
  );
};

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Hero backdrop: Adam's approved randomised newsroom backdrop (unchanged),
 * with animated film grain and a soft vignette on top.
 */
export const HomeHeroMedia = () => {
  const reduce = !!useReducedMotion();

  return (
    <>
      <HeroNewsroomBackground reduce={reduce} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] overflow-hidden">
        <style>{`
          @keyframes home-hero-grain {
            0%, 100% { transform: translate(0, 0); }
            20% { transform: translate(-4%, 3%); }
            40% { transform: translate(3%, -5%); }
            60% { transform: translate(-6%, -2%); }
            80% { transform: translate(5%, 4%); }
          }
          .home-hero-grain { animation: home-hero-grain 0.9s steps(5) infinite; }
          @media (prefers-reduced-motion: reduce) { .home-hero-grain { animation: none; } }
        `}</style>

        {/* Film grain */}
        <div
          className="home-hero-grain absolute -inset-[20%] opacity-[0.09] mix-blend-screen"
          style={{ backgroundImage: GRAIN_SVG, backgroundSize: '220px 220px' }}
        />

        {/* Vignette, fading into the page navy at the bottom */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 50%, hsl(214 50% 5% / 0.75) 100%)' }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-b from-transparent to-[hsl(214,50%,9%)]" />
      </div>
    </>
  );
};
