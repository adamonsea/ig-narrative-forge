import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface SourceTypeInfo {
  type: string;
  successRate: string;
  badge: 'high' | 'medium' | 'low';
  icon: React.ReactNode;
  examples: string[];
}

const SOURCE_TYPES: SourceTypeInfo[] = [
  {
    type: 'WordPress/RSS',
    successRate: '95%',
    badge: 'high',
    icon: <CheckCircle className="w-3 h-3" />,
    examples: ['/feed', '/rss', 'wordpress.com']
  },
  {
    type: 'News Sites',
    successRate: '75%',
    badge: 'medium', 
    icon: <AlertTriangle className="w-3 h-3" />,
    examples: ['bbc.co.uk', 'reuters.com', 'local news']
  },
  {
    type: 'Social/Complex',
    successRate: '15%',
    badge: 'low',
    icon: <XCircle className="w-3 h-3" />,
    examples: ['twitter.com', 'facebook.com', 'linkedin.com']
  }
];

interface SourceQualityGuideProps {
  currentUrl?: string;
}

export const SourceQualityGuide = ({ currentUrl }: SourceQualityGuideProps) => {
  const [hasSeenGuide, setHasSeenGuide] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('source-quality-guide-seen');
    setHasSeenGuide(!!seen);
    
    // Show tooltip on first visit
    if (!seen) {
      setShowTooltip(true);
      const timer = setTimeout(() => {
        localStorage.setItem('source-quality-guide-seen', 'true');
        setHasSeenGuide(true);
        setShowTooltip(false);
      }, 8000); // Show for 8 seconds
      
      return () => clearTimeout(timer);
    }
  }, []);

  const detectSourceType = (url: string): SourceTypeInfo | null => {
    if (!url) return null;
    
    const lowerUrl = url.toLowerCase();
    
    // WordPress/RSS patterns
    if (lowerUrl.includes('/feed') || lowerUrl.includes('/rss') || 
        lowerUrl.includes('wordpress') || lowerUrl.includes('substack') ||
        lowerUrl.includes('.xml') || lowerUrl.includes('atom')) {
      return SOURCE_TYPES[0];
    }
    
    // Social media patterns  
    if (lowerUrl.includes('twitter') || lowerUrl.includes('facebook') ||
        lowerUrl.includes('linkedin') || lowerUrl.includes('instagram') ||
        lowerUrl.includes('tiktok') || lowerUrl.includes('youtube')) {
      return SOURCE_TYPES[2];
    }
    
    // Default to news sites
    return SOURCE_TYPES[1];
  };

  const getBadgeVariant = (badge: 'high' | 'medium' | 'low') => {
    switch (badge) {
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'destructive';
    }
  };

  const currentSourceType = currentUrl ? detectSourceType(currentUrl) : null;

  const GuideContent = () => (
    <div className="space-y-3">
      <div className="text-sm font-medium mb-2">Source Reliability</div>
      {SOURCE_TYPES.map((source) => (
        <div key={source.type} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {source.icon}
            <span>{source.type}</span>
          </div>
          <Badge variant={getBadgeVariant(source.badge)} className="text-xs">
            {source.successRate}
          </Badge>
        </div>
      ))}
      <div className="text-xs text-muted-foreground pt-2 border-t">
        Higher success rates mean more reliable content gathering
      </div>
    </div>
  );

  // Current URL reliability indicator
  const UrlReliabilityIndicator = () => {
    if (!currentSourceType) return null;
    
    return (
      <div className="flex items-center gap-2 text-xs">
        {currentSourceType.icon}
        <span className="text-muted-foreground">
          {currentSourceType.type}
        </span>
        <Badge variant={getBadgeVariant(currentSourceType.badge)} className="text-xs">
          {currentSourceType.successRate} success
        </Badge>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3">
        {/* URL Type Indicator */}
        {currentUrl && <UrlReliabilityIndicator />}
        
        {/* Info Icon with Guide */}
        <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
          <TooltipTrigger asChild>
            <button 
              className="flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors"
              onClick={() => setShowTooltip(!showTooltip)}
            >
              <Info className="w-3 h-3 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-64">
            <GuideContent />
          </TooltipContent>
        </Tooltip>
        
        {/* First-time visible hint */}
        {!hasSeenGuide && !showTooltip && (
          <div className="text-xs text-muted-foreground animate-pulse">
            ← Click for source tips
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};