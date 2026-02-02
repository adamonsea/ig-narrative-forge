import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AuditStats {
  totalStories: number;
  storiesWithSlides: number;
  storiesWithIllustrations: number;
  storiesWithAnimations: number;
  missingSimplifiedAt: number;
  missingIllustrationAt: number;
  missingAnimationAt: number;
  autoGathered: number;
  autoSimplified: number;
  autoIllustrated: number;
  autoAnimated: number;
}

export function LifecycleAudit() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAuditStats = async () => {
    setLoading(true);
    try {
      // Get total stories
      const { count: totalStories } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true });

      // Get stories with slides
      const { data: slideCounts } = await supabase
        .from('slides')
        .select('story_id')
        .limit(10000);
      
      const uniqueStoryIds = new Set(slideCounts?.map(s => s.story_id) || []);
      const storiesWithSlides = uniqueStoryIds.size;

      // Get stories with illustrations
      const { count: storiesWithIllustrations } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .not('cover_illustration_url', 'is', null);

      // Get stories with animations
      const { count: storiesWithAnimations } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .not('animated_illustration_url', 'is', null);

      // Get missing simplified_at (has slides but no timestamp)
      const { data: missingSimplified } = await supabase
        .from('stories')
        .select('id')
        .is('simplified_at', null)
        .limit(10000);
      
      // Filter to only those with slides
      const missingSimplifiedWithSlides = missingSimplified?.filter(s => uniqueStoryIds.has(s.id)) || [];

      // Get missing illustration_generated_at
      const { count: missingIllustrationAt } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .not('cover_illustration_url', 'is', null)
        .is('illustration_generated_at', null);

      // Get missing animation_generated_at
      const { count: missingAnimationAt } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .not('animated_illustration_url', 'is', null)
        .is('animation_generated_at', null);

      // Get automation counts
      const { count: autoGathered } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('is_auto_gathered', true);

      const { count: autoSimplified } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('is_auto_simplified', true);

      const { count: autoIllustrated } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('is_auto_illustrated', true);

      const { count: autoAnimated } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('is_auto_animated', true);

      setStats({
        totalStories: totalStories || 0,
        storiesWithSlides,
        storiesWithIllustrations: storiesWithIllustrations || 0,
        storiesWithAnimations: storiesWithAnimations || 0,
        missingSimplifiedAt: missingSimplifiedWithSlides.length,
        missingIllustrationAt: missingIllustrationAt || 0,
        missingAnimationAt: missingAnimationAt || 0,
        autoGathered: autoGathered || 0,
        autoSimplified: autoSimplified || 0,
        autoIllustrated: autoIllustrated || 0,
        autoAnimated: autoAnimated || 0,
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching audit stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditStats();
  }, []);

  const hasIssues = stats && (
    stats.missingSimplifiedAt > 0 ||
    stats.missingIllustrationAt > 0 ||
    stats.missingAnimationAt > 0
  );
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Story Lifecycle Audit
            </CardTitle>
            <CardDescription>
              Track timestamp and automation flag completeness
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAuditStats}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats ? (
          <>
            {/* Data Integrity Section */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                {hasIssues ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-primary" />
                )}
                Data Integrity
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  label="Missing simplified_at"
                  value={stats.missingSimplifiedAt}
                  total={stats.storiesWithSlides}
                  subtitle="Stories with slides"
                  isIssue={stats.missingSimplifiedAt > 0}
                />
                <StatCard
                  label="Missing illustration_generated_at"
                  value={stats.missingIllustrationAt}
                  total={stats.storiesWithIllustrations}
                  subtitle="Stories with illustrations"
                  isIssue={stats.missingIllustrationAt > 0}
                />
                <StatCard
                  label="Missing animation_generated_at"
                  value={stats.missingAnimationAt}
                  total={stats.storiesWithAnimations}
                  subtitle="Stories with animations"
                  isIssue={stats.missingAnimationAt > 0}
                />
              </div>
            </div>

            {/* Automation Stats Section */}
            <div>
              <h4 className="text-sm font-medium mb-3">Automation Coverage</h4>
              <div className="grid grid-cols-4 gap-4">
                <AutomationCard
                  label="Auto-Gathered"
                  value={stats.autoGathered}
                  total={stats.totalStories}
                />
                <AutomationCard
                  label="Auto-Simplified"
                  value={stats.autoSimplified}
                  total={stats.storiesWithSlides}
                />
                <AutomationCard
                  label="Auto-Illustrated"
                  value={stats.autoIllustrated}
                  total={stats.storiesWithIllustrations}
                />
                <AutomationCard
                  label="Auto-Animated"
                  value={stats.autoAnimated}
                  total={stats.storiesWithAnimations}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Total stories in database: {stats.totalStories}</span>
                {lastRefresh && (
                  <span>Last refreshed: {lastRefresh.toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ 
  label, 
  value, 
  total, 
  subtitle,
  isIssue 
}: { 
  label: string; 
  value: number; 
  total: number;
  subtitle: string;
  isIssue: boolean;
}) {
  const bgClass = isIssue ? 'border-amber-500/50 bg-amber-500/5' : 'border-emerald-500/50 bg-emerald-500/5';
  
  return (
    <div className={`p-4 rounded-lg border ${bgClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl font-bold">{value}</span>
        {isIssue ? (
          <Badge variant="destructive">
            Needs Fix
          </Badge>
        ) : (
          <Badge variant="secondary">
            OK
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">
        out of {total} {subtitle}
      </p>
    </div>
  );
}

function AutomationCard({ 
  label, 
  value, 
  total 
}: { 
  label: string; 
  value: number; 
  total: number;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  
  return (
    <div className="p-4 rounded-lg border bg-muted/30">
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-muted-foreground">/ {total}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{percentage}% automated</p>
    </div>
  );
}
