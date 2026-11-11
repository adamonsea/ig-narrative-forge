import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Full-bleed hero backdrop. Plays a muted newsroom film (16:9 on desktop,
 * 9:16 on phones) washed into a purple/navy duotone with grain and vignette.
 * Until the film files exist, or if they fail, a navy-to-purple gradient
 * shows instead so the hero always looks finished. Reduced motion: poster only.
 */
const MEDIA = {
  desktop: { video: '/hero/newsroom-16x9.mp4', poster: '/hero/newsroom-16x9.jpg' },
  mobile: { video: '/hero/newsroom-9x16.mp4', poster: '/hero/newsroom-9x16.jpg' },
} as const;

const MOBILE_QUERY = '(max-width: 767px)';

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const useIsMobile = () => {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
};

export const HomeHeroMedia = () => {
  const reduce = !!useReducedMotion();
  const mobile = useIsMobile();
  const media = mobile ? MEDIA.mobile : MEDIA.desktop;
  const [posterOk, setPosterOk] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setPosterOk(false);
    setVideoOk(false);
  }, [media.video]);

  // React doesn't always reflect `muted` as an attribute, which blocks autoplay
  // on some mobile browsers, so set it on the element before playing.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduce) return;
    v.muted = true;
    v.play().catch(() => setVideoOk(false));
  }, [media.video, reduce]);

  const mediaFilter = 'grayscale(1) contrast(1.15) brightness(0.7)';

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

      {/* Placeholder: always underneath, visible until real media is ready */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 70% 15%, hsl(270 70% 32%) 0%, transparent 60%), radial-gradient(90% 70% at 15% 40%, hsl(262 60% 22%) 0%, transparent 65%), linear-gradient(180deg, hsl(250 45% 16%) 0%, hsl(214 50% 9%) 100%)',
        }}
      />

      {/* Real media, graded to black and white */}
      <div className="absolute inset-0" style={{ filter: mediaFilter }}>
        <img
          key={media.poster}
          src={media.poster}
          alt=""
          decoding="async"
          onLoad={() => setPosterOk(true)}
          onError={() => setPosterOk(false)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            posterOk ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {!reduce && (
          <video
            key={media.video}
            ref={videoRef}
            src={media.video}
            poster={posterOk ? media.poster : undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={() => setVideoOk(true)}
            onError={() => setVideoOk(false)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              videoOk ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>

      {/* Duotone: purple tint on the greys, fading to navy at the bottom for legibility */}
      <div className="absolute inset-0 bg-[hsl(270,100%,68%)] opacity-30 mix-blend-color" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, hsl(270 100% 68% / 0.18) 0%, hsl(270 100% 68% / 0.10) 35%, hsl(214 50% 9% / 0.55) 70%, hsl(214 50% 9%) 100%)',
        }}
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
