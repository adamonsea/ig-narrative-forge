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

    const triggerDailyCollection = async () => {
      try {
        console.log('Triggering daily parliamentary votes collection for topic:', topicId);
        
        const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
          body: {
            topicId,
            region,
            mode: 'daily'
          }
        });

        if (error) {
          console.error('Error triggering daily collection:', error);
          return;
        }

        console.log('Daily collection triggered successfully:', data);
      } catch (error) {
        console.error('Failed to trigger daily collection:', error);
      }
    };

    const triggerWeeklyRoundup = async () => {
      try {
        console.log('Triggering weekly parliamentary roundup for topic:', topicId);
        
        const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
          body: {
            topicId,
            region,
            mode: 'weekly'
          }
        });

        if (error) {
          console.error('Error triggering weekly roundup:', error);
          return;
        }

        console.log('Weekly roundup triggered successfully:', data);
      } catch (error) {
        console.error('Failed to trigger weekly roundup:', error);
      }
    };

    // Trigger daily collection immediately when enabled
    triggerDailyCollection();

    // Set up daily collection timer (every 6 hours)
    const dailyInterval = setInterval(triggerDailyCollection, 6 * 60 * 60 * 1000);

    // Set up weekly roundup timer (every Monday at 9am)
    const checkWeeklyRoundup = () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      
      // If it's Monday (1) and between 9-10am
      if (dayOfWeek === 1 && hour === 9) {
        triggerWeeklyRoundup();
      }
    };

    // Check weekly roundup every hour
    const weeklyInterval = setInterval(checkWeeklyRoundup, 60 * 60 * 1000);

    return () => {
      clearInterval(dailyInterval);
      clearInterval(weeklyInterval);
    };
  }, [topicId, enabled, region]);
};