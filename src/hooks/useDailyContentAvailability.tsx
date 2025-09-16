import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ContentAvailability {
  source_id: string;
  new_urls_found: number;
  total_urls_discovered: number;
  check_date: string;
  success: boolean;
  error_message: string | null;
}

export function useDailyContentAvailability(topicId: string) {
  const [availability, setAvailability] = useState<Record<string, ContentAvailability>>({});
  const [loading, setLoading] = useState(false);

  const fetchAvailability = async () => {
    if (!topicId) return;
    
    try {
      setLoading(true);
      
      // Get today's availability data for this topic
      const { data, error } = await supabase
        .from('daily_content_availability')
        .select('*')
        .eq('topic_id', topicId)
        .eq('check_date', new Date().toISOString().split('T')[0]) // Today's date
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch content availability:', error);
        return;
      }

      // Convert to lookup by source_id
      const availabilityMap: Record<string, ContentAvailability> = {};
      data?.forEach(item => {
        availabilityMap[item.source_id] = item;
      });
      
      setAvailability(availabilityMap);
    } catch (error) {
      console.error('Error fetching daily content availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const runContentMonitor = async () => {
    try {
      const { error } = await supabase.functions.invoke('daily-content-monitor', {
        body: { topicId }
      });

      if (error) {
        console.error('Failed to run content monitor:', error);
        return false;
      }

      // Refresh data after running monitor
      setTimeout(() => fetchAvailability(), 1000);
      return true;
    } catch (error) {
      console.error('Error running content monitor:', error);
      return false;
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [topicId]);

  return {
    availability,
    loading,
    refreshAvailability: fetchAvailability,
    runContentMonitor
  };
}