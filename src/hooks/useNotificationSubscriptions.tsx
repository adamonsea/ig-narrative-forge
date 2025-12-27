import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionState {
  daily: boolean;
  weekly: boolean;
}

export const useNotificationSubscriptions = (topicId: string, enabled: boolean = true) => {
  const [emailSubscriptions, setEmailSubscriptions] = useState<SubscriptionState>({
    daily: false,
    weekly: false
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscriptions = useCallback(async () => {
    // Avoid blocking UI (and avoid extra requests) when the modal isn't open.
    if (!enabled || !topicId) {
      setEmailSubscriptions({ daily: false, weekly: false });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('topic_newsletter_signups')
        .select('notification_type, email')
        .eq('topic_id', topicId)
        .eq('is_active', true)
        .not('email', 'is', null);

      if (error) {
        console.error('Error checking subscriptions:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const emailTypes = data
          .map(sub => sub.notification_type)
          .filter((type): type is string => type !== null);

        setEmailSubscriptions({
          daily: emailTypes.includes('daily'),
          weekly: emailTypes.includes('weekly')
        });
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error checking subscriptions:', error);
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

