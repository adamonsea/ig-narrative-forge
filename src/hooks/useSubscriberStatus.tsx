import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriberStatus {
  isVerifiedSubscriber: boolean;
  email: string | null;
  subscribedTypes: string[];
  loading: boolean;
}

// Store email in localStorage after verification for subscriber perks
const SUBSCRIBER_EMAIL_KEY = 'subscriber_email';

export const useSubscriberStatus = (topicId: string | null) => {
  const [status, setStatus] = useState<SubscriberStatus>({
    isVerifiedSubscriber: false,
    email: null,
    subscribedTypes: [],
    loading: true
  });

  const checkSubscription = useCallback(async () => {
    if (!topicId) {
      setStatus(prev => ({ ...prev, loading: false }));
      return;
    }

    // Check if we have a stored email from verification
    const storedEmail = localStorage.getItem(SUBSCRIBER_EMAIL_KEY);
    
    if (!storedEmail) {
      setStatus({
        isVerifiedSubscriber: false,
        email: null,
        subscribedTypes: [],
        loading: false
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('topic_newsletter_signups')
        .select('notification_type, email_verified')
        .eq('topic_id', topicId)
        .eq('email', storedEmail)
        .eq('email_verified', true)
        .eq('is_active', true);

      if (error) {
        console.error('Error checking subscription:', error);
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      const verifiedTypes = (data || [])
        .filter(s => s.email_verified)
        .map(s => s.notification_type)
        .filter(Boolean);

      setStatus({
        isVerifiedSubscriber: verifiedTypes.length > 0,
        email: storedEmail,
        subscribedTypes: verifiedTypes,
        loading: false
      });
    } catch (err) {
      console.error('Subscription check failed:', err);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  }, [topicId]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Method to store email after successful verification
  const setSubscriberEmail = useCallback((email: string) => {
    localStorage.setItem(SUBSCRIBER_EMAIL_KEY, email.toLowerCase());
    checkSubscription();
  }, [checkSubscription]);

  // Method to clear subscriber email (logout equivalent)
  const clearSubscriberEmail = useCallback(() => {
    localStorage.removeItem(SUBSCRIBER_EMAIL_KEY);
    setStatus({
      isVerifiedSubscriber: false,
      email: null,
      subscribedTypes: [],
      loading: false
    });
  }, []);

  return {
    ...status,
    setSubscriberEmail,
    clearSubscriberEmail,
    refresh: checkSubscription
  };
};
