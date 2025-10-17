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
        .select('notification_type, push_subscription')
        .eq('topic_id', topicId)
        .eq('is_active', true)
        .not('push_subscription', 'is', null);

      if (error) {
        console.error('Error checking subscriptions:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        // Check which notification types match this browser's push endpoint
        const activeTypes = data
          .filter(sub => {
            try {
              const subData = sub.push_subscription as any;
              return subData?.endpoint === endpoint;
            } catch {
              return false;
            }
          })
          .map(sub => sub.notification_type)
          .filter((type): type is string => type !== null);

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
