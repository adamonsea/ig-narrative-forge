import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import heroNewsroom from '@/assets/newsroom-hero.webp.asset.json';
import heroNewsroomBusy from '@/assets/newsroom-busy.webp.asset.json';
import heroNewsroomTypewriters from '@/assets/newsroom-typewriters.webp.asset.json';
import heroNewsroomFilm from '@/assets/newsroom-loop.mp4.asset.json';

const HERO_STILLS = [heroNewsroom.url, heroNewsroomBusy.url, heroNewsroomTypewriters.url];
const HERO_VIDEO = 'video';
const STILL_MS = 7000;
const VIDEO_WAIT_MS = 6000;

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Randomised newsroom backdrop: the three stills and the short film are
 * shuffled into a fresh order each visit and crossfade in a loop. The current
 * still stays on screen until the film is ready to play, so there is never a
 * blank gap while it loads. Reduced motion: one still, no film.
 */
const HeroNewsroomBackground = ({ reduce }: { reduce: boolean }) => {
  const order = useMemo(() => {
    const arr: string[] = [...HERO_STILLS, HERO_VIDEO];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const firstStill = order.findIndex((item) => item !== HERO_VIDEO);
  const [shown, setShown] = useState(() => firstStill);
  const [pending, setPending] = useState<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const advance = useCallback(() => {
    setShown((current) => {
      const next = (current + 1) % order.length;
      if (order[next] === HERO_VIDEO && !videoReady) {
        setPending(next);
        return current;
      }
      return next;
    });
  }, [order, videoReady]);

  // Stills advance on a timer; the film advances when it ends.
  useEffect(() => {
    if (reduce || order[shown] === HERO_VIDEO) return;
    const t = setTimeout(advance, STILL_MS);
    return () => clearTimeout(t);
  }, [shown, reduce, advance, order]);

  // Show the film once it can play; if it takes too long, skip past it.
  useEffect(() => {
    if (pending === null) return;
    if (videoReady) {
      setShown(pending);
      setPending(null);
      return;
    }
    const t = setTimeout(() => {
      setPending(null);
      setShown((pending + 1) % order.length);
    }, VIDEO_WAIT_MS);
    return () => clearTimeout(t);
  }, [pending, videoReady, order.length]);

  useEffect(() => {
    if (order[shown] !== HERO_VIDEO || !videoRef.current) return;
    const v = videoRef.current;
    v.muted = true;
    v.currentTime = 0;
    v.play().catch(() => advance());
  }, [shown, order, advance]);

  return (
    <>
      {order.map((item, i) =>
        item === HERO_VIDEO ? (
          reduce ? null : (
            <video
              key="film"
              ref={videoRef}
              src={heroNewsroomFilm.url}
              muted
              playsInline
              preload="auto"
              onCanPlay={() => setVideoReady(true)}
              onEnded={advance}
              onError={advance}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                shown === i && videoReady ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )
        ) : (
          <div
            key={item}
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
              shown === i ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url(${item})` }}
          />
        ),
      )}
    </>
  );
};

/**
 * Full-bleed hero layer: the randomised newsroom backdrop graded to black and
 * white, under a purple-to-navy duotone, animated film grain and a vignette.
 * A navy gradient sits underneath so the hero looks finished before any
 * image has loaded.
 */
export const HomeHeroMedia = () => {
  const reduce = !!useReducedMotion();

  return (
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

      {/* Base: shows while the first image loads */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, hsl(250 45% 16%) 0%, hsl(214 50% 9%) 100%)' }}
      />

      {/* Newsroom stills and film, graded to black and white */}
      <div className="absolute inset-0" style={{ filter: 'grayscale(1) contrast(1.15) brightness(0.7)' }}>
        <HeroNewsroomBackground reduce={reduce} />
      </div>

      {/* Duotone: purple tint on the greys, fading to navy at the bottom */}
      <div className="absolute inset-0 bg-[hsl(270,100%,68%)] opacity-30 mix-blend-color" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, hsl(270 70% 24% / 0.5) 0%, hsl(262 60% 18% / 0.5) 40%, hsl(214 50% 9% / 0.75) 72%, hsl(214 50% 9%) 100%)',
        }}
      />

      {/* Soft scrim behind the headline and idea box so they stay readable */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 48%, hsl(214 50% 9% / 0.6) 0%, transparent 100%)' }}
      />

      {/* Film grain */}
      <div
        className="home-hero-grain absolute -inset-[20%] opacity-[0.09] mix-blend-screen"
        style={{ backgroundImage: GRAIN_SVG, backgroundSize: '220px 220px' }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 50%, hsl(214 50% 5% / 0.75) 100%)' }}
      />
    </div>
  );
};
