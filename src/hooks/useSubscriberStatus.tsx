import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriberStatus {
  isVerifiedSubscriber: boolean;
  email: string | null;
  token: string | null;
  subscribedTypes: string[];
  loading: boolean;
}

// Store email in localStorage after verification for subscriber perks
const SUBSCRIBER_EMAIL_KEY = 'subscriber_email';
// Private code from the verification link; proves this browser is the subscriber
export const SUBSCRIBER_TOKEN_KEY = 'subscriber_token';

export const useSubscriberStatus = (topicId: string | null) => {
  const [status, setStatus] = useState<SubscriberStatus>({
    isVerifiedSubscriber: false,
    email: null,
        token: null,
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
    const storedToken = localStorage.getItem(SUBSCRIBER_TOKEN_KEY);
    
    if (!storedEmail || !storedToken) {
      setStatus({
        isVerifiedSubscriber: false,
        email: null,
        token: null,
        subscribedTypes: [],
        loading: false
      });
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .rpc('get_subscriber_status', {
          p_topic_id: topicId,
          p_token: storedToken,
        });

      if (error) {
        console.error('Error checking subscription:', error);
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      const verifiedTypes = ((data as any[]) || [])
        .filter((s: any) => s.email_verified)
        .map((s: any) => s.notification_type)
        .filter(Boolean);

      setStatus({
        isVerifiedSubscriber: verifiedTypes.length > 0,
        email: storedEmail,
        token: storedToken,
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
    localStorage.removeItem(SUBSCRIBER_TOKEN_KEY);
    setStatus({
      isVerifiedSubscriber: false,
      email: null,
        token: null,
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
