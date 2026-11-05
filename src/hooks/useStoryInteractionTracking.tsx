import { getVisitorId } from '@/lib/visitorIdentity';
import { supabase } from '@/integrations/supabase/client';

const generateVisitorId = (): string => getVisitorId('visitor');

export const useStoryInteractionTracking = () => {
  const trackSwipe = (storyId: string, topicId: string, slideIndex: number) => {
    // Non-blocking async call - fire and forget
    (async () => {
      try {
        const visitorId = generateVisitorId();
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        await supabase.rpc('record_story_interaction', {
          p_story_id: storyId,
          p_topic_id: topicId,
          p_visitor_id: visitorId,
          p_interaction_type: 'swipe',
          p_slide_index: slideIndex,
          p_user_agent: userAgent,
          p_referrer: referrer || null
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Swipe tracking failed:', error);
      }
    })();
  };

  const trackShareClick = (storyId: string, topicId: string, platform: string = 'native') => {
    // Non-blocking async call - fire and forget
    (async () => {
      try {
        const visitorId = generateVisitorId();
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        await supabase.rpc('record_story_interaction', {
          p_story_id: storyId,
          p_topic_id: topicId,
          p_visitor_id: visitorId,
          p_interaction_type: 'share_click',
          p_share_platform: platform,
          p_user_agent: userAgent,
          p_referrer: referrer || null
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Share tracking failed:', error);
      }
    })();
  };

  const trackSourceClick = (storyId: string, topicId: string) => {
    // Non-blocking async call - fire and forget
    (async () => {
      try {
        const visitorId = generateVisitorId();
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        await supabase.rpc('record_story_interaction', {
          p_story_id: storyId,
          p_topic_id: topicId,
          p_visitor_id: visitorId,
          p_interaction_type: 'source_click',
          p_user_agent: userAgent,
          p_referrer: referrer || null
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Source click tracking failed:', error);
      }
    })();
  };

  return {
    trackSwipe,
    trackShareClick,
    trackSourceClick
  };
};