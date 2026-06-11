import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ReelTeaserContent, REEL_PACE } from './storyReelContent';

interface StoryReelPreviewProps {
  content: ReelTeaserContent;
  /** Bumping this key restarts playback from the first beat. */
  playKey: number;
  onComplete?: () => void;
  className?: string;
}

type Beat = 'headline' | 'detail' | 'cta';
const ORDER: Beat[] = ['headline', 'detail', 'cta'];

// Easing reused from the landing H1 reveal — confident, not bouncy.
const EASE = [0.16, 1, 0.3, 1] as const;

export const StoryReelPreview = ({
  content,
  playKey,
  onComplete,
  className,
}: StoryReelPreviewProps) => {
  const reduceMotion = useReducedMotion();
  const [beatIndex, setBeatIndex] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setBeatIndex(0);

    const durations = [REEL_PACE.headline, REEL_PACE.detail, REEL_PACE.cta];
    let elapsed = 0;
    durations.forEach((d, i) => {
      elapsed += d;
      if (i < durations.length - 1) {
        timers.current.push(
          window.setTimeout(() => setBeatIndex(i + 1), elapsed * 1000)
        );
      } else {
        timers.current.push(
          window.setTimeout(() => onComplete?.(), elapsed * 1000)
        );
      }
    });

    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  const beat = ORDER[beatIndex];
  const words = content.headline.split(' ');

  const fade = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        aspectRatio: '9 / 16',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 16,
        background: 'hsl(214, 50%, 9%)',
        color: 'hsl(0, 0%, 100%)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Background image with slow Ken-Burns drift */}
      {content.backgroundImage && (
        <motion.img
          key={`bg-${playKey}`}
          src={content.backgroundImage}
          alt=""
          initial={{ scale: reduceMotion ? 1 : 1.08 }}
          animate={{ scale: reduceMotion ? 1 : 1.18 }}
          transition={{ duration: 13, ease: 'linear' }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.32,
          }}
        />
      )}
      {/* Readability gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, hsla(214,50%,9%,0.55) 0%, hsla(214,50%,9%,0.78) 55%, hsla(214,50%,9%,0.95) 100%)',
        }}
      />

      {/* Brand bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '6% 7% 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontFamily: "'Lexend', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: '4cqw',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'hsl(155, 100%, 67%)',
          }}
        >
          {content.brandName}
        </span>
        <span style={{ fontSize: '3cqw', color: 'hsl(0,0%,72%)' }}>
          {content.sourceLabel}
        </span>
      </div>

      {/* Progress segments */}
      <div
        style={{
          position: 'absolute',
          top: '4%',
          left: '7%',
          right: '7%',
          display: 'none',
        }}
      />

      {/* Beats */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8%',
          zIndex: 2,
          containerType: 'inline-size',
        }}
      >
        <AnimatePresence mode="wait">
          {beat === 'headline' && (
            <motion.h1
              key={`headline-${playKey}`}
              {...fade}
              transition={{ duration: 0.5 }}
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 700,
                fontSize: '9.5cqw',
                lineHeight: 1.12,
                margin: 0,
              }}
            >
              {words.map((w, i) => (
                <span key={i} style={{ display: 'inline-block', overflow: 'hidden' }}>
                  <motion.span
                    style={{ display: 'inline-block', paddingRight: '0.28em' }}
                    initial={reduceMotion ? { opacity: 0 } : { y: '110%' }}
                    animate={reduceMotion ? { opacity: 1 } : { y: '0%' }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.15 + i * 0.08 }}
                  >
                    {w}
                  </motion.span>
                </span>
              ))}
            </motion.h1>
          )}

          {beat === 'detail' && (
            <motion.p
              key={`detail-${playKey}`}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{
                fontSize: '6cqw',
                lineHeight: 1.4,
                fontWeight: 500,
                margin: 0,
                color: 'hsl(0,0%,92%)',
              }}
            >
              {content.detail}
            </motion.p>
          )}

          {beat === 'cta' && (
            <motion.div
              key={`cta-${playKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              style={{ width: '100%' }}
            >
              <motion.p
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                style={{ fontSize: '5cqw', color: 'hsl(0,0%,78%)', margin: '0 0 0.6em' }}
              >
                Read the full story
              </motion.p>
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
                style={{
                  display: 'inline-block',
                  fontFamily: "'Lexend', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: '6cqw',
                  color: 'hsl(214,50%,9%)',
                  background: 'hsl(155, 100%, 67%)',
                  padding: '0.5em 0.8em',
                  borderRadius: 10,
                  wordBreak: 'break-word',
                }}
              >
                {content.feedUrl}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          left: '8%',
          right: '8%',
          display: 'flex',
          gap: 6,
          zIndex: 2,
        }}
      >
        {ORDER.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 3,
              background:
                i <= beatIndex ? 'hsl(155, 100%, 67%)' : 'hsla(0,0%,100%,0.25)',
              transition: 'background 0.4s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
};