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
  const [emailSubscriptions, setEmailSubscriptions] = useState<SubscriptionState>({
    instant: false,
    daily: false,
    weekly: false
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscriptions = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Fetch all active subscriptions for this topic
      const { data, error } = await supabase
        .from('topic_newsletter_signups')
        .select('notification_type, push_subscription, email')
        .eq('topic_id', topicId)
        .eq('is_active', true);

      if (error) {
        console.error('Error checking subscriptions:', error);
        setIsLoading(false);
        return;
      }

      // Get current push subscription endpoint if available
      let currentEndpoint: string | null = null;
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            const subscriptionData = JSON.parse(JSON.stringify(subscription));
            currentEndpoint = subscriptionData.endpoint;
          }
        } catch (e) {
          console.warn('Could not get push subscription:', e);
        }
      }

      if (data) {
        // Check push subscriptions (match by endpoint)
        const pushTypes = data
          .filter(sub => {
            if (!sub.push_subscription || !currentEndpoint) return false;
            try {
              const subData = sub.push_subscription as any;
              return subData?.endpoint === currentEndpoint;
            } catch {
              return false;
            }
          })
          .map(sub => sub.notification_type)
          .filter((type): type is string => type !== null);

        setSubscriptions({
          instant: pushTypes.includes('instant'),
          daily: pushTypes.includes('daily'),
          weekly: pushTypes.includes('weekly')
        });

        // Check email subscriptions (any email subscription without push)
        const emailTypes = data
          .filter(sub => sub.email && !sub.push_subscription)
          .map(sub => sub.notification_type)
          .filter((type): type is string => type !== null);

        setEmailSubscriptions({
          instant: emailTypes.includes('instant'),
          daily: emailTypes.includes('daily'),
          weekly: emailTypes.includes('weekly')
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
    emailSubscriptions,
    isLoading,
    refresh: checkSubscriptions 
  };
};
