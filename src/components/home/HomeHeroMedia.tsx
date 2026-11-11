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

// Randomised hero backdrop: the three newsroom stills and the short film are
// shuffled into a fresh order each visit and crossfade in a loop. The current
// still stays on screen until the film is ready to play, so there is never a
// blank gap while it loads.
const HeroNewsroomBackground = ({ reduce }: { reduce: boolean }) => {
  const order = useMemo(() => {
    const arr: string[] = [...HERO_STILLS, HERO_VIDEO];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const [shown, setShown] = useState(0);
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
    v.currentTime = 0;
    v.play().catch(() => advance());
  }, [shown, order, advance]);

  const videoIndex = order.indexOf(HERO_VIDEO);

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
      {order.map((item, i) =>
        item === HERO_VIDEO ? (
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
              !reduce && shown === i && videoReady ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div
            key={item}
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
              shown === i || (reduce && i === 0) ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url(${item})` }}
          />
        ),
      )}
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
