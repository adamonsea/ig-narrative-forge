import { canTrackReader, getVisitorId } from '@/lib/visitorIdentity';
import { supabase } from '@/integrations/supabase/client';

const generateVisitorId = (): string => getVisitorId('visitor');
const readThroughSent = new Set<string>();

export const useStoryInteractionTracking = () => {
  const trackSwipe = (storyId: string, topicId: string, slideIndex: number) => {
    if (!canTrackReader()) return;
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
          p_referrer: (referrer || null)!
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Swipe tracking failed:', error);
      }
    })();
  };

  const trackShareClick = (storyId: string, topicId: string, platform: string = 'native') => {
    if (!canTrackReader()) return;
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
          p_referrer: (referrer || null)!
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Share tracking failed:', error);
      }
    })();
  };

  const trackSourceClick = (storyId: string, topicId: string) => {
    if (!canTrackReader()) return;
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
          p_referrer: (referrer || null)!
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Source click tracking failed:', error);
      }
    })();
  };

  /** The reader reached the story's last slide as shown on screen. Sent once per story per page load. */
  const trackReadThrough = (storyId: string, topicId: string, slideIndex: number) => {
    if (!canTrackReader() || readThroughSent.has(storyId)) return;
    readThroughSent.add(storyId);
    void (async () => {
      try {
        await supabase.rpc('record_story_interaction', {
          p_story_id: storyId,
          p_topic_id: topicId,
          p_visitor_id: generateVisitorId(),
          p_interaction_type: 'read_through',
          p_slide_index: slideIndex,
          p_user_agent: navigator.userAgent,
          p_referrer: (document.referrer || null)!
        });
      } catch (error) {
        console.debug('Read-through tracking failed:', error);
      }
    })();
  };

  return {
    trackReadThrough,
    trackSwipe,
    trackShareClick,
    trackSourceClick
  };
};