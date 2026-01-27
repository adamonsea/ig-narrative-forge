import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, Eye, MousePointer, Users, Clock, ExternalLink, Sparkles } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface WidgetSite {
  domain: string;
  impressions: number;
  clicks: number;
  unique_visitors: number;
  first_seen: string;
  last_seen: string;
  click_rate: number;
}

interface WidgetAnalyticsProps {
  topicId: string;
  onNewSiteDetected?: (domain: string) => void;
}

// Domains to exclude from analytics (staging, preview, internal)
const EXCLUDED_DOMAIN_PATTERNS = [
  /\.webflow\.io$/i,           // Webflow staging
  /\.canvas\.webflow\.com$/i,  // Webflow editor preview
  /\.cloudfront\.net$/i,       // AWS CloudFront (internal workflows)
  /localhost/i,                // Local development
  /127\.0\.0\.1/i,             // Local IP
  /\.local$/i,                 // Local network
];

// Check if a domain should be excluded
function isExcludedDomain(domain: string): boolean {
  return EXCLUDED_DOMAIN_PATTERNS.some(pattern => pattern.test(domain));
}

// Extract clean domain from referrer URL
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function WidgetAnalytics({ topicId, onNewSiteDetected }: WidgetAnalyticsProps) {
  const [sites, setSites] = useState<WidgetSite[]>([]);
  const [totals, setTotals] = useState({ impressions: 0, clicks: 0, unique_visitors: 0 });
  const [loading, setLoading] = useState(true);
  const [newSites, setNewSites] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadWidgetAnalytics();
  }, [topicId]);

  async function loadWidgetAnalytics() {
    setLoading(true);
    try {
      // Fetch all widget analytics for this topic
      const { data, error } = await supabase
        .from('widget_analytics')
        .select('referrer_url, event_type, visitor_hash, created_at')
        .eq('topic_id', topicId)
        .not('referrer_url', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by domain
      const domainMap = new Map<string, {
        impressions: number;
        clicks: number;
        visitors: Set<string>;
        first_seen: string;
        last_seen: string;
      }>();

      let totalImpressions = 0;
      let totalClicks = 0;
      const allVisitors = new Set<string>();

      data?.forEach(row => {
        if (!row.referrer_url) return;
        
        const domain = extractDomain(row.referrer_url);
        
        // Skip excluded domains (staging, preview, internal)
        if (isExcludedDomain(domain)) return;
        
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            impressions: 0,
            clicks: 0,
            visitors: new Set(),
            first_seen: row.created_at,
            last_seen: row.created_at,
          });
        }

        const entry = domainMap.get(domain)!;
        
        if (row.event_type === 'impression') {
          entry.impressions++;
          totalImpressions++;
        } else if (row.event_type === 'click') {
          entry.clicks++;
          totalClicks++;
        }

        if (row.visitor_hash) {
          entry.visitors.add(row.visitor_hash);
          allVisitors.add(row.visitor_hash);
        }

        // Update first/last seen
        if (row.created_at < entry.first_seen) {
          entry.first_seen = row.created_at;
        }
        if (row.created_at > entry.last_seen) {
          entry.last_seen = row.created_at;
        }
      });

      // Convert to array and sort by impressions
      const sitesList: WidgetSite[] = Array.from(domainMap.entries())
        .map(([domain, stats]) => ({
          domain,
          impressions: stats.impressions,
          clicks: stats.clicks,
          unique_visitors: stats.visitors.size,
          first_seen: stats.first_seen,
          last_seen: stats.last_seen,
          click_rate: stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.impressions - a.impressions);

      // Check for sites added in last 24 hours (new integrations)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const newSiteSet = new Set<string>();
      sitesList.forEach(site => {
        if (site.first_seen > oneDayAgo) {
          newSiteSet.add(site.domain);
          onNewSiteDetected?.(site.domain);
        }
      });
      setNewSites(newSiteSet);

      setSites(sitesList);
      setTotals({
        impressions: totalImpressions,
        clicks: totalClicks,
        unique_visitors: allVisitors.size,
      });
    } catch (error) {
      console.error('Failed to load widget analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Globe className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No widget embeds detected yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Share your widget code with website owners to start tracking
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Impressions</span>
            </div>
            <p className="text-xl font-bold">{totals.impressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <MousePointer className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Clicks</span>
            </div>
            <p className="text-xl font-bold">{totals.clicks.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Visitors</span>
            </div>
            <p className="text-xl font-bold">{totals.unique_visitors.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Site List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Embedded on {sites.length} {sites.length === 1 ? 'website' : 'websites'}
        </h4>
        
        <div className="space-y-2">
          {sites.map((site) => (
            <Card key={site.domain} className={newSites.has(site.domain) ? 'ring-2 ring-primary/50 bg-primary/5' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <a 
                        href={`https://${site.domain}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:underline flex items-center gap-1 truncate"
                      >
                        {site.domain}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      {newSites.has(site.domain) && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                          NEW
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {site.impressions.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointer className="h-3 w-3" />
                        {site.clicks.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {site.unique_visitors.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground/70">
                        {site.click_rate.toFixed(1)}% CTR
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground/70">
                      First: {format(new Date(site.first_seen), 'MMM d')}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDistanceToNow(new Date(site.last_seen), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
