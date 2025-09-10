import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle, Clock, Loader2, XCircle, Minus, RefreshCw } from "lucide-react";

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
  isGathering?: boolean; // New prop to show processing animation
}

export function EnhancedSourceStatusBadge({ 
  source, 
  automationLastError,
  size = 'md',
  isGathering = false 
}: EnhancedSourceStatusBadgeProps) {
  
  const getSourceStatus = () => {
    // Show gathering status if currently being processed
    if (isGathering) {
      return {
        status: 'gathering',
        label: 'Gathering',
        variant: 'outline' as const,
        icon: Loader2,
        className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400 animate-pulse',
        tooltip: 'Currently gathering articles from this source',
        animate: true
      };
    }

    // Manual deactivation takes precedence
    if (!source.is_active) {
      return {
        status: 'inactive',
        label: 'Inactive',
        variant: 'secondary' as const,
        icon: Minus,
        tooltip: 'Source has been manually deactivated'
      };
    }

    // Calculate metrics for status determination
    const articlesScraped = source.articles_scraped || 0;
    const successRate = source.success_rate || 0;
    const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
    const daysSinceLastScrape = lastScraped ? 
      Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const hasRecentActivity = daysSinceLastScrape <= 7;
    
    // CRITICAL: Prioritize actual content storage success
    // A source that consistently stores 0 articles should NOT be "healthy"
    
    // Healthy: Must actually be storing relevant articles regularly
    if (successRate >= 80 && hasRecentActivity && articlesScraped >= 5) {
      return {
        status: 'productive',
        label: 'Productive',
        variant: 'default' as const,
        icon: CheckCircle,
        className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400',
        tooltip: 'Consistently finding and storing relevant articles'
      };
    }
    
    // Active but Filtered: Connecting successfully but not finding relevant content
    if (successRate >= 70 && hasRecentActivity && articlesScraped < 3) {
      return {
        status: 'filtered',
        label: 'Active but Filtered',
        variant: 'outline' as const,
        icon: AlertCircle,
        className: 'bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400',
        tooltip: 'Source is responding but articles are being filtered for relevance'
      };
    }

    // Active: Moderate success rate with some content stored
    if (successRate >= 50 && hasRecentActivity && articlesScraped >= 3) {
      return {
        status: 'active',
        label: 'Active',
        variant: 'default' as const,
        icon: CheckCircle,
        className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400',
        tooltip: 'Regularly finding relevant articles'
      };
    }

    // Technical Issues: Low success rate indicating connection/parsing problems
    if (successRate < 50 && hasRecentActivity) {
      return {
        status: 'technical_issues',
        label: 'Technical Issues',
        variant: 'outline' as const,
        icon: AlertCircle,
        className: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400',
        tooltip: 'Having difficulty connecting to or parsing this source'
      };
    }

    // Idle: No recent activity
    if (!hasRecentActivity && daysSinceLastScrape < 30) {
      return {
        status: 'idle',
        label: 'Idle',
        variant: 'outline' as const,
        icon: Clock,
        className: 'bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400',
        tooltip: 'No recent activity - may need attention'
      };
    }

    // Trying to reconnect: Very stale or consistent failures
    if (daysSinceLastScrape >= 30 || (automationLastError && successRate < 20)) {
      return {
        status: 'reconnecting',
        label: 'Trying to reconnect',
        variant: 'outline' as const,
        icon: RefreshCw,
        className: 'bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-900/20 dark:text-gray-500',
        tooltip: 'Unable to connect or gather articles'
      };
    }

    // Default for new sources without data - show as gathering
    return {
      status: 'gathering',
      label: 'Gathering',
      variant: 'outline' as const,
      icon: Loader2,
      className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400',
      tooltip: 'Starting to gather articles from this source'
    };
  };

  const { label, variant, icon: Icon, className, tooltip, animate } = getSourceStatus();
  
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const iconClass = animate ? `${iconSize} mr-1 animate-spin` : `${iconSize} mr-1`;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className={className}>
            <Icon className={iconClass} />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}