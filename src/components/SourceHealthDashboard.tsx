import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Heart, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  TrendingDown,
  Settings,
  Eye,
  Loader2,
  Activity
} from 'lucide-react';

interface SourceHealth {
  sourceId: string;
  sourceName: string;
  isHealthy: boolean;
  successRate: number;
  avgResponseTime: number;
  lastError?: string;
  recommendedAction: 'none' | 'monitor' | 'method_change' | 'deactivate' | 'investigate';
  alternativeMethod?: string;
  healthScore: number;
}

interface HealthSummary {
  sources_processed: number;
  sources_deactivated: number;
  methods_changed: number;
  healthy_sources: number;
  unhealthy_sources: number;
}

export const SourceHealthDashboard = () => {
  const { toast } = useToast();
  const [healthMetrics, setHealthMetrics] = useState<SourceHealth[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const runHealthCheck = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('source-health-monitor');
      
      if (error) throw error;
      
      if (data && data.success) {
        setHealthMetrics(data.health_metrics || []);
        setSummary(data.summary);
        
        toast({
          title: 'Health Check Complete',
          description: `Analyzed ${data.summary.sources_processed} sources using actual article counts.`,
        });
      }
      
    } catch (error) {
      console.error('Health check error:', error);
      toast({
        title: 'Health Check Failed',
        description: error.message || 'Failed to run source health monitoring',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5" />
            Consolidated Source Health
          </CardTitle>
          <CardDescription>
            Monitor source health using actual stored article counts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={runHealthCheck} 
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            Run Health Check
          </Button>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{summary.sources_processed}</div>
                <div className="text-sm text-muted-foreground">Processed</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{summary.healthy_sources}</div>
                <div className="text-sm text-muted-foreground">Healthy</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};