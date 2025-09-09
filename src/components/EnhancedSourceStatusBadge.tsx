import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, Loader2, XCircle, Minus } from "lucide-react";

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  credibility_score: number | null;
  is_active: boolean | null;
  articles_scraped: number | null;
  last_scraped_at: string | null;
  success_rate: number | null;
  success_count?: number;
  failure_count?: number;
  last_error?: string | null;
}

interface EnhancedSourceStatusBadgeProps {
  source: ContentSource;
  automationLastError?: string | null;
  size?: 'sm' | 'md';
}

export function EnhancedSourceStatusBadge({ 
  source, 
  automationLastError,
  size = 'md' 
}: EnhancedSourceStatusBadgeProps) {
  
  const getSourceStatus = () => {
    // Manual deactivation takes precedence
    if (!source.is_active) {
      return {
        status: 'inactive',
        label: 'Inactive',
        variant: 'secondary' as const,
        icon: Minus
      };
    }

    // Calculate metrics for status determination
    const successRate = source.success_rate || 0;
    const articlesScraped = source.articles_scraped || 0;
    const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
    const daysSinceLastScrape = lastScraped ? 
      Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const hasRecentActivity = daysSinceLastScrape <= 7;
    
    // Enhanced status logic prioritizing actual performance
    
    // Healthy: High success rate AND recent activity
    if (successRate >= 80 && hasRecentActivity && articlesScraped > 0) {
      return {
        status: 'healthy',
        label: 'Healthy',
        variant: 'default' as const,
        icon: CheckCircle,
        className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400'
      };
    }
    
    // Active: Moderate success rate with recent activity
    if (successRate >= 50 && hasRecentActivity && articlesScraped > 0) {
      return {
        status: 'active',
        label: 'Active',
        variant: 'default' as const,
        icon: CheckCircle,
        className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400'
      };
    }

    // No Content: Successfully connects but finds no relevant articles
    if (successRate >= 70 && articlesScraped === 0 && hasRecentActivity) {
      return {
        status: 'no_content',
        label: 'No Content',
        variant: 'outline' as const,
        icon: AlertCircle,
        className: 'bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400'
      };
    }

    // Idle: No recent activity but not failed
    if (daysSinceLastScrape > 7 && daysSinceLastScrape < 30 && !automationLastError) {
      return {
        status: 'idle',
        label: 'Idle',
        variant: 'outline' as const,
        icon: Clock,
        className: 'bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400'
      };
    }

    // Poor: Low success rate but some activity
    if (successRate > 0 && successRate < 50 && hasRecentActivity) {
      return {
        status: 'poor',
        label: 'Poor',
        variant: 'outline' as const,
        icon: AlertCircle,
        className: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400'
      };
    }

    // Failed: Recent errors AND poor performance OR very stale
    if ((automationLastError && successRate < 30) || daysSinceLastScrape > 30) {
      return {
        status: 'failed',
        label: 'Failed',
        variant: 'destructive' as const,
        icon: XCircle
      };
    }

    // New: No data yet
    return {
      status: 'new',
      label: 'New',
      variant: 'outline' as const,
      icon: Loader2,
      className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400'
    };
  };

  const { label, variant, icon: Icon, className } = getSourceStatus();
  
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  
  return (
    <Badge variant={variant} className={className}>
      <Icon className={`${iconSize} mr-1`} />
      {label}
    </Badge>
  );
}