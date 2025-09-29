import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseParliamentaryAutomationProps {
  topicId: string;
  enabled: boolean;
  region?: string;
}

export const useParliamentaryAutomation = ({ topicId, enabled, region }: UseParliamentaryAutomationProps) => {
  useEffect(() => {
    if (!enabled || !topicId || !region) return;

    const triggerParliamentaryCollection = async () => {
      try {
        console.log('Triggering parliamentary data collection for topic:', topicId);
        
        const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
          body: {
            topicId,
            region
          }
        });

        if (error) {
          console.error('Error triggering parliamentary collection:', error);
          return;
        }

        console.log('Parliamentary collection triggered successfully:', data);
      } catch (error) {
        console.error('Failed to trigger parliamentary collection:', error);
      }
    };

    // Trigger collection when enabled (will be rate-limited on the backend)
    triggerParliamentaryCollection();

    // Set up a timer to check periodically (every 4 hours)
    const interval = setInterval(triggerParliamentaryCollection, 4 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [topicId, enabled, region]);
};