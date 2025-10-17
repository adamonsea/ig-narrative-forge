import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionState {
  instant: boolean;
  daily: boolean;
  weekly: boolean;
}

export const useNotificationSubscriptions = (topicId: string) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionState>({
    instant: false,
    daily: false,
    weekly: false
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscriptions = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsLoading(false);
      return;
    }

    try {
      // Get current push subscription endpoint
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        setIsLoading(false);
        return;
      }

      // Check database for existing subscriptions matching this endpoint
      const subscriptionData = JSON.parse(JSON.stringify(subscription));
      const endpoint = subscriptionData.endpoint;

      // Query for subscriptions with this push endpoint
      const { data, error } = await supabase
        .from('topic_newsletter_signups')
        .select('email, frequency')
        .eq('topic_id', topicId)
        .eq('is_active', true)
        .not('push_subscription', 'is', null);

      if (error) {
        console.error('Error checking subscriptions:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        // Parse email field which contains notification type temporarily
        // Format: "instant@notification.local", "daily@notification.local", etc.
        const activeTypes = data
          .map(sub => sub.email?.split('@')[0])
          .filter((type): type is string => type !== undefined);

        setSubscriptions({
          instant: activeTypes.includes('instant'),
          daily: activeTypes.includes('daily'),
          weekly: activeTypes.includes('weekly')
        });
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error checking subscriptions:', error);
      setIsLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    checkSubscriptions();
  }, [checkSubscriptions]);

  return { 
    subscriptions, 
    isLoading,
    refresh: checkSubscriptions 
  };
};
