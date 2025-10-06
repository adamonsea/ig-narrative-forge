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
            
            // Send browser notification with click handler
            const notification = new Notification(`New story in ${topicName}`, {
              body: newStory.title || 'A new story has been published',
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: newStory.id,
              requireInteraction: false,
            });

            // Open story link when notification is clicked
            notification.onclick = () => {
              const storyUrl = topicSlug 
                ? `/feed/${topicSlug}/story/${newStory.id}`
                : window.location.href;
              window.open(storyUrl, '_blank');
              notification.close();
            };
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
            
            const notification = new Notification(`New story in ${topicName}`, {
              body: updatedStory.title || 'A new story has been published',
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: updatedStory.id,
              requireInteraction: false,
            });

            // Open story link when notification is clicked
            notification.onclick = () => {
              const storyUrl = topicSlug 
                ? `/feed/${topicSlug}/story/${updatedStory.id}`
                : window.location.href;
              window.open(storyUrl, '_blank');
              notification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId, topicName]);
};
