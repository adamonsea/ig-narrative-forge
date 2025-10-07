import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useStoryNotifications = (topicId: string | undefined, topicName: string, topicSlug?: string) => {
  const lastNotifiedStoryId = useRef<string | null>(null);
  const permissionGranted = useRef(false);

  useEffect(() => {
    if (!topicId) return;

    // Request notification permission
    const requestPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        permissionGranted.current = permission === 'granted';
      } else if (Notification.permission === 'granted') {
        permissionGranted.current = true;
      }
    };

    requestPermission();

    // Helper: show notification via Service Worker when available
    const showStoryNotification = async (title: string, body: string, url: string, tag: string) => {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.showNotification(title, {
              body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag,
              
              data: { url }
            });
            return;
          }
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico', tag, requireInteraction: false });
          n.onclick = () => {
            window.focus();
            window.location.href = url;
            n.close();
          };
        }
      } catch (err) {
        console.error('Failed to show notification', err);
      }
    };

    // Subscribe to new story publications
    const channel = supabase
      .channel(`story-notifications-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories',
          filter: `is_published=eq.true`
        },
        (payload) => {
          const newStory = payload.new as any;
          
          // Check if this story belongs to this topic and we haven't notified about it
          if (newStory.id !== lastNotifiedStoryId.current && permissionGranted.current) {
            lastNotifiedStoryId.current = newStory.id;
            
            const storyUrl = topicSlug 
              ? `${window.location.origin}/feed/${topicSlug}/story/${newStory.id}`
              : window.location.href;
            showStoryNotification(
              `New story in ${topicName}`,
              newStory.title || 'A new story has been published',
              storyUrl,
              newStory.id
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `is_published=eq.true`
        },
        (payload) => {
          const updatedStory = payload.new as any;
          const oldStory = payload.old as any;
          
          // Only notify if story was just published (status changed to published)
          if (
            !oldStory.is_published && 
            updatedStory.is_published && 
            updatedStory.id !== lastNotifiedStoryId.current &&
            permissionGranted.current
          ) {
            lastNotifiedStoryId.current = updatedStory.id;
            
            const storyUrl = topicSlug 
              ? `${window.location.origin}/feed/${topicSlug}/story/${updatedStory.id}`
              : window.location.href;
            showStoryNotification(
              `New story in ${topicName}`,
              updatedStory.title || 'A new story has been published',
              storyUrl,
              updatedStory.id
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId, topicName]);
};
