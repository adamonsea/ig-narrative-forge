import { useEffect, useRef, useState } from 'react';
import { READER_ONBOARDING_EXTRAS } from '@/lib/featureFlags';

const MAX_HINT_VISITS = READER_ONBOARDING_EXTRAS ? 3 : 1;
const HINT_DELAY_MS = READER_ONBOARDING_EXTRAS ? 500 : 1000;

/** Whether the first-card swipe hint should show on this visit to a feed. */
export const shouldShowSwipeHint = (previousVisits: number) => previousVisits < MAX_HINT_VISITS;

interface HandSwipeHintProps {
  topicSlug: string;
  forceShow?: boolean | undefined;
  onComplete?: () => void;
}

export const HandSwipeHint = ({ topicSlug, forceShow = false, onComplete }: HandSwipeHintProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // If forceShow (from onboarding), always show
    if (forceShow) {
      const showTimer = setTimeout(() => {
        setIsVisible(true);
      }, 100);

      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 3100);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }

    // Normal behavior: track visit count for this topic
    const storageKey = `feed_swipe_hint_count_${topicSlug}`;
    const visitCount = parseInt(localStorage.getItem(storageKey) || '0', 10);

    if (shouldShowSwipeHint(visitCount)) {
      // Show hint after a brief delay
      const showTimer = setTimeout(() => {
        setIsVisible(true);
      }, HINT_DELAY_MS);

      // Auto-dismiss after 3 seconds and increment counter
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        localStorage.setItem(storageKey, String(visitCount + 1));
      }, HINT_DELAY_MS + 3000);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
    return undefined;
  }, [topicSlug, forceShow, onComplete]);

  // The story's own slides nudge left to show the next one, instead of a pretend card on top.
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isVisible) return;
    const card = (forceShow ? document.querySelector('[data-story-card]') : anchor.current?.closest('[data-story-card]')) as HTMLElement | null;
    const track = card?.querySelector('.embla-container-smooth');
    if (!card || !track || track.childElementCount < 2) return;
    card.classList.add('swipe-peek');
    return () => card.classList.remove('swipe-peek');
  }, [isVisible, forceShow]);

  return <span ref={anchor} hidden aria-hidden="true" />;
};
