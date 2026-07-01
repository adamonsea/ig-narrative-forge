import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, HeartPulse, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';

interface HealthRow {
  id: string;
  source_name: string;
  canonical_domain: string | null;
  status: string;
  reason_code: string;
  reason_detail: string | null;
  articles_last_window: number;
  window_days: number;
  checked_at: string;
}

const REASON_LABELS: Record<string, string> = {
  feed_404: 'Feed 404 / invalid feed',
  blocked: 'Blocked (anti-bot / 403)',
  needs_bypass_head: 'HEAD probe rejected',
  age_cutoff: 'Rejected by age cutoff',
  no_new_urls: 'No new content',
  inactive: 'Inactive',
  healthy: 'Healthy',
  unknown: 'Unknown',
};

function statusBadge(status: string) {
  if (status === 'failing') {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Failing</Badge>;
  }
  if (status === 'zero_articles') {
    return <Badge className="gap-1 bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/15 border-yellow-500/30">0 articles</Badge>;
  }
  return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />Healthy</Badge>;
}

export const SourceHealthMonitor = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('source_health_checks')
      .select('*')
      .order('status', { ascending: true })
      .order('articles_last_window', { ascending: true });
    if (error) {
      toast({ title: 'Error', description: 'Failed to load source health', variant: 'destructive' });
    } else {
      setRows((data as HealthRow[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('source-health-monitor', {
        body: { sendEmail: true },
      });
      if (error) throw error;
      toast({
        title: 'Health check complete',
        description: `Checked ${data?.checked ?? 0} sources, ${data?.flagged ?? 0} flagged${data?.emailed ? ' · email sent' : ''}.`,
      });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: 'Health check failed', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const flaggedCount = rows.filter((r) => r.status !== 'healthy').length;
  const lastChecked = rows[0]?.checked_at ? new Date(rows[0].checked_at).toLocaleString() : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5" />
            Source Health Monitor
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {flaggedCount} source(s) producing 0 articles
            {lastChecked ? ` · last checked ${lastChecked}` : ''}
          </p>
        </div>
        <Button onClick={runCheck} disabled={running} variant="outline">
          {running ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run check
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No health data yet. Run a check to populate.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.source_name}</span>
                    {statusBadge(r.status)}
                  </div>
                  {r.canonical_domain && (
                    <p className="text-xs text-muted-foreground">{r.canonical_domain}</p>
                  )}
                  {r.status !== 'healthy' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{REASON_LABELS[r.reason_code] || r.reason_code}</span>
                      {r.reason_detail ? ` — ${r.reason_detail}` : ''}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {r.articles_last_window} / {r.window_days}d
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};