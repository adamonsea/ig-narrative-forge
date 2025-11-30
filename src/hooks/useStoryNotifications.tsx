import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useStoryNotifications = (topicId: string | undefined, topicName: string, topicSlug?: string) => {
  const lastNotifiedStoryId = useRef<string | null>(null);
  const permissionGranted = useRef(false);

  useEffect(() => {
    if (!topicId) return;

    // Track notification enabled
    const trackNotificationEnabled = async () => {
      const visitorId = localStorage.getItem('visitor_id') || `visitor_${Date.now()}_${Math.random()}`;
      if (!localStorage.getItem('visitor_id')) {
        localStorage.setItem('visitor_id', visitorId);
      }

      try {
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId,
            visitorId,
            metricType: 'notification_enabled',
            userAgent: navigator.userAgent,
          }
        });
      } catch (error) {
        console.error('Error tracking notification metric:', error);
      }
    };

    // Request notification permission
    const requestPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        permissionGranted.current = permission === 'granted';
        if (permission === 'granted') {
          await trackNotificationEnabled();
        }
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
              icon: '/curatr-icon.png',
              badge: '/curatr-icon.png',
              tag,
              
              data: { url }
            });
            return;
          }
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(title, { body, icon: '/curatr-icon.png', badge: '/curatr-icon.png', tag, requireInteraction: false });
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

    // Helper: verify story belongs to current topic
    const verifyStoryBelongsTopic = async (storyData: any): Promise<boolean> => {
      if (!storyData.topic_article_id) {
        // Legacy architecture - check via article
        const { data: article } = await supabase
          .from('articles')
          .select('topic_id')
          .eq('id', storyData.article_id)
          .single();
        return article?.topic_id === topicId;
      } else {
        // Multi-tenant architecture - check via topic_article
        const { data: topicArticle } = await supabase
          .from('topic_articles')
          .select('topic_id')
          .eq('id', storyData.topic_article_id)
          .single();
        return topicArticle?.topic_id === topicId;
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
        async (payload) => {
          const newStory = payload.new as any;
          
          // Verify story belongs to this topic
          const belongsToTopic = await verifyStoryBelongsTopic(newStory);
          
          // Check if this story belongs to this topic and we haven't notified about it
          if (belongsToTopic && newStory.id !== lastNotifiedStoryId.current && permissionGranted.current) {
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
        async (payload) => {
          const updatedStory = payload.new as any;
          const oldStory = payload.old as any;
          
          // Verify story belongs to this topic
          const belongsToTopic = await verifyStoryBelongsTopic(updatedStory);
          
          // Only notify if story was just published (status changed to published)
          if (
            belongsToTopic &&
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
