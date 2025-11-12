import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to track how many stories a user has viewed in the current session
 * Returns the count and a callback to increment it
 */
export const useStoryViewTracker = (topicSlug: string) => {
  const [storiesViewed, setStoriesViewed] = useState(0);

  useEffect(() => {
    // Load from sessionStorage on mount
    const key = `stories_viewed_${topicSlug}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setStoriesViewed(parseInt(stored, 10) || 0);
    }
  }, [topicSlug]);

  const incrementStoriesViewed = useCallback(() => {
    setStoriesViewed(prev => {
      const newCount = prev + 1;
      sessionStorage.setItem(`stories_viewed_${topicSlug}`, newCount.toString());
      return newCount;
    });
  }, [topicSlug]);

  return { storiesViewed, incrementStoriesViewed };
};
