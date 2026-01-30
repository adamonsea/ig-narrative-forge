import { useState, useEffect, useCallback } from 'react';

interface SubscriptionState {
  daily: boolean;
  weekly: boolean;
}

const STORAGE_KEY = 'newsletter_subscriptions';

interface StoredSubscriptions {
  [topicId: string]: {
    daily?: boolean;
    weekly?: boolean;
  };
}

/**
 * Get stored subscriptions from localStorage
 */
const getStoredSubscriptions = (): StoredSubscriptions => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

/**
 * Save subscription status to localStorage
 */
export const saveSubscriptionStatus = (topicId: string, type: 'daily' | 'weekly', subscribed: boolean) => {
  try {
    const stored = getStoredSubscriptions();
    if (!stored[topicId]) {
      stored[topicId] = {};
    }
    stored[topicId][type] = subscribed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (e) {
    console.error('Error saving subscription status:', e);
  }
};

/**
 * Hook to check email subscription status for a topic.
 * Uses localStorage to track subscriptions since RLS prevents anonymous users
 * from querying the newsletter_signups table directly.
 */
export const useNotificationSubscriptions = (topicId: string, enabled: boolean = true) => {
  const [emailSubscriptions, setEmailSubscriptions] = useState<SubscriptionState>({
    daily: false,
    weekly: false
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscriptions = useCallback(() => {
    if (!enabled || !topicId) {
      setEmailSubscriptions({ daily: false, weekly: false });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const stored = getStoredSubscriptions();
      const topicSubs = stored[topicId] || {};
      
      setEmailSubscriptions({
        daily: topicSubs.daily || false,
        weekly: topicSubs.weekly || false
      });
    } catch (error) {
      console.error('Error checking subscriptions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [topicId, enabled]);

  useEffect(() => {
    checkSubscriptions();
  }, [checkSubscriptions]);

  return {
    emailSubscriptions,
    isLoading,
    refresh: checkSubscriptions
  };
};

