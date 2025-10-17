import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// VAPID public key from environment
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

interface PushSubscriptionState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
}

export const usePushSubscription = (topicId?: string) => {
  const { toast } = useToast();
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: 'default'
  });

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = () => {
      const isSupported = 
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      
      setState(prev => ({
        ...prev,
        isSupported,
        permission: isSupported ? Notification.permission : 'denied',
        isLoading: false
      }));
    };

    checkSupport();
  }, []);

  // Convert base64 VAPID key to Uint8Array
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = async (email: string, name?: string): Promise<boolean> => {
    if (!state.isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in your browser",
        variant: "destructive"
      });
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error('VAPID public key not configured');
      toast({
        title: "Configuration Error",
        description: "Push notifications are not properly configured",
        variant: "destructive"
      });
      return false;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        toast({
          title: "Permission Denied",
          description: "You need to allow notifications to receive updates",
          variant: "destructive"
        });
        setState(prev => ({ ...prev, permission, isLoading: false }));
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Save subscription to database
      const subscriptionData = JSON.parse(JSON.stringify(subscription));
      
      const { error } = await supabase
        .from('topic_newsletter_signups')
        .insert({
          topic_id: topicId,
          email,
          name,
          push_subscription: subscriptionData,
          frequency: 'weekly',
          is_active: true
        });

      if (error) {
        console.error('Error saving push subscription:', error);
        toast({
          title: "Subscription Failed",
          description: "Could not save your subscription. Please try again.",
          variant: "destructive"
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        permission: 'granted',
        isLoading: false
      }));

      toast({
        title: "Subscribed!",
        description: "You'll receive weekly updates every Friday at 10 AM"
      });

      return true;

    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast({
        title: "Subscription Error",
        description: error instanceof Error ? error.message : "Failed to subscribe",
        variant: "destructive"
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false
      }));

      toast({
        title: "Unsubscribed",
        description: "You will no longer receive push notifications"
      });

      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  };

  return {
    ...state,
    subscribeToPush,
    unsubscribe
  };
};
