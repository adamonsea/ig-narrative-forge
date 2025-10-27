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

  // Check if push notifications are supported and auto-heal existing subscriptions
  useEffect(() => {
    const checkSupportAndHealSubscriptions = async () => {
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

      // Auto-heal subscriptions if permission already granted
      if (isSupported && Notification.permission === 'granted' && topicId && VAPID_PUBLIC_KEY) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const existingSubscription = await registration.pushManager.getSubscription();
          
          if (existingSubscription) {
            console.log('🔄 Auto-healing push subscription with current VAPID key');
            
            // Unsubscribe old subscription
            await existingSubscription.unsubscribe();
            
            // Re-subscribe with current VAPID key
            const newSubscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const subscriptionData = JSON.parse(JSON.stringify(newSubscription));
            const oldEndpoint = JSON.parse(JSON.stringify(existingSubscription)).endpoint;

            // Update all subscriptions for this topic with the new subscription data
            await supabase
              .from('topic_newsletter_signups')
              .update({ 
                push_subscription: subscriptionData,
                is_active: true 
              })
              .eq('topic_id', topicId)
              .filter('push_subscription->endpoint', 'eq', oldEndpoint);

            console.log('✅ Push subscription auto-healed successfully');
          }
        } catch (error) {
          console.error('Failed to auto-heal subscription:', error);
          // Silent fail - user can manually re-subscribe if needed
        }
      }
    };

    checkSupportAndHealSubscriptions();
  }, [topicId]);

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

  const subscribeToPush = async (
    notificationType: 'instant' | 'daily' | 'weekly'
  ): Promise<boolean> => {
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
          push_subscription: subscriptionData,
          notification_type: notificationType,
          frequency: notificationType, // Keep for compatibility
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

const messages = {
  instant: "You'll get notified as soon as new stories are published",
  daily: "You'll receive a daily summary every evening at 5 PM",
  weekly: "You'll receive a weekly roundup every Sunday at 9 AM"
};

      toast({
        title: "Subscribed!",
        description: messages[notificationType]
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

  const unsubscribe = async (
    notificationType: 'instant' | 'daily' | 'weekly'
  ): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }

      // Get the subscription endpoint to find the matching database record
      const subscriptionData = JSON.parse(JSON.stringify(subscription));
      const endpoint = subscriptionData.endpoint;

      // Deactivate the specific notification type subscription
      const { error } = await supabase
        .from('topic_newsletter_signups')
        .update({ is_active: false })
        .eq('topic_id', topicId)
        .eq('notification_type', notificationType)
        .filter('push_subscription', 'cs', JSON.stringify({ endpoint }));

      if (error) {
        console.error('Error unsubscribing:', error);
        toast({
          title: "Unsubscribe Failed",
          description: "Could not remove your subscription. Please try again.",
          variant: "destructive"
        });
        setState(prev => ({ ...prev, isLoading: false }));
        return false;
      }

      setState(prev => ({ ...prev, isLoading: false }));

      const messages = {
        instant: "You'll no longer get instant notifications",
        daily: "You'll no longer receive daily summaries",
        weekly: "You'll no longer receive weekly roundups"
      };

      toast({
        title: "Unsubscribed",
        description: messages[notificationType]
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
