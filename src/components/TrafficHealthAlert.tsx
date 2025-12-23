import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingDown, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TopicAlert {
  topicId: string;
  topicName: string;
  thisWeek: number;
  lastWeek: number;
  changePct: number;
}

export const TrafficHealthAlert = () => {
  const [alerts, setAlerts] = useState<TopicAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      checkTrafficHealth();
    }
  }, [user]);

  const checkTrafficHealth = async () => {
    try {
      setLoading(true);

      // Get user's topics
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name')
        .eq('created_by', user?.id)
        .eq('is_archived', false);

      if (topicsError) throw topicsError;

      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - 7);
      
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const alertsFound: TopicAlert[] = [];

      for (const topic of topics || []) {
        const [thisWeekRes, lastWeekRes] = await Promise.all([
          supabase
            .from('feed_visits')
            .select('visitor_id')
            .eq('topic_id', topic.id)
            .gte('visit_date', thisWeekStart.toISOString().split('T')[0]),
          supabase
            .from('feed_visits')
            .select('visitor_id')
            .eq('topic_id', topic.id)
            .gte('visit_date', lastWeekStart.toISOString().split('T')[0])
            .lt('visit_date', thisWeekStart.toISOString().split('T')[0])
        ]);

        const thisWeekUnique = new Set(thisWeekRes.data?.map(v => v.visitor_id) || []).size;
        const lastWeekUnique = new Set(lastWeekRes.data?.map(v => v.visitor_id) || []).size;

        // Only alert if last week had meaningful traffic (>5 visitors) and drop is significant (>50%)
        if (lastWeekUnique >= 5) {
          const changePct = Math.round(((thisWeekUnique - lastWeekUnique) / lastWeekUnique) * 100);
          
          if (changePct <= -50) {
            alertsFound.push({
              topicId: topic.id,
              topicName: topic.name,
              thisWeek: thisWeekUnique,
              lastWeek: lastWeekUnique,
              changePct
            });
          }
        }
      }

      setAlerts(alertsFound);
    } catch (error) {
      console.error('Error checking traffic health:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (topicId: string) => {
    setDismissed(prev => new Set([...prev, topicId]));
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.topicId));

  if (loading || visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mb-4">
      {visibleAlerts.map((alert) => (
        <div 
          key={alert.topicId}
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3"
        >
          <div className="flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{alert.topicName}</span>
              <div className="flex items-center gap-1 text-red-500 text-sm font-medium">
                <TrendingDown className="w-4 h-4" />
                <span>{alert.changePct}% traffic</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {alert.thisWeek} visitors this week vs {alert.lastWeek} last week
            </p>
          </div>
          <button 
            onClick={() => dismissAlert(alert.topicId)}
            className="flex-shrink-0 p-1 hover:bg-red-500/20 rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
};