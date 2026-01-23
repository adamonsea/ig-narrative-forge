import { useState, useEffect } from 'react';
import { Eye, ChevronDown, ChevronRight, UserPlus, UserCheck, TrendingUp, TrendingDown, Minus, AlertTriangle, Globe, MapPin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useGeographicRelevance, getCountryName } from '@/hooks/useGeographicRelevance';

interface CollapsibleAudienceCardProps {
  topicId: string;
  visitsToday: number;
  visitsThisWeek: number;
}

interface VisitorBreakdown {
  today_new: number;
  today_returning: number;
  week_new: number;
  week_returning: number;
  total_unique: number;
  return_rate_pct: number;
}

interface WeekComparison {
  this_week: number;
  last_week: number;
  change_pct: number;
  trend: 'up' | 'down' | 'stable';
}

export const CollapsibleAudienceCard = ({ topicId, visitsToday, visitsThisWeek }: CollapsibleAudienceCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<VisitorBreakdown | null>(null);
  const [weekComparison, setWeekComparison] = useState<WeekComparison | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Geographic relevance data
  const { data: geoData, loading: geoLoading } = useGeographicRelevance(topicId, 30);

  useEffect(() => {
    if (isOpen && !breakdown) {
      loadBreakdown();
    }
  }, [isOpen, topicId]);

  // Load week comparison on mount
  useEffect(() => {
    loadWeekComparison();
  }, [topicId]);

  const loadWeekComparison = async () => {
    try {
      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - 7);
      
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const [thisWeekRes, lastWeekRes] = await Promise.all([
        supabase
          .from('site_visits')
          .select('visitor_id')
          .eq('topic_id', topicId)
          .in('page_type', ['feed', 'story'])
          .gte('visit_date', thisWeekStart.toISOString().split('T')[0]),
        supabase
          .from('site_visits')
          .select('visitor_id')
          .eq('topic_id', topicId)
          .in('page_type', ['feed', 'story'])
          .gte('visit_date', lastWeekStart.toISOString().split('T')[0])
          .lt('visit_date', thisWeekStart.toISOString().split('T')[0])
      ]);

      const thisWeekUnique = new Set(thisWeekRes.data?.map(v => v.visitor_id) || []).size;
      const lastWeekUnique = new Set(lastWeekRes.data?.map(v => v.visitor_id) || []).size;

      const changePct = lastWeekUnique > 0 
        ? Math.round(((thisWeekUnique - lastWeekUnique) / lastWeekUnique) * 100)
        : thisWeekUnique > 0 ? 100 : 0;

      const trend: 'up' | 'down' | 'stable' = 
        changePct > 10 ? 'up' : 
        changePct < -10 ? 'down' : 'stable';

      setWeekComparison({
        this_week: thisWeekUnique,
        last_week: lastWeekUnique,
        change_pct: changePct,
        trend
      });
    } catch (error) {
      console.error('Error loading week comparison:', error);
    }
  };

  const loadBreakdown = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase.rpc as any)('get_topic_visitor_breakdown', {
        p_topic_id: topicId,
        p_days: 7
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setBreakdown({
          today_new: Number(data[0].today_new) || 0,
          today_returning: Number(data[0].today_returning) || 0,
          week_new: Number(data[0].week_new) || 0,
          week_returning: Number(data[0].week_returning) || 0,
          total_unique: Number(data[0].total_unique) || 0,
          return_rate_pct: Number(data[0].return_rate_pct) || 0,
        });
      }
    } catch (error) {
      console.error('Error loading visitor breakdown:', error);
    } finally {
      setLoading(false);
    }
  };

  const returnRateColor = breakdown 
    ? breakdown.return_rate_pct >= 40 ? 'text-green-500' 
    : breakdown.return_rate_pct >= 20 ? 'text-yellow-500' 
    : 'text-muted-foreground'
    : 'text-muted-foreground';

  const getTrendIcon = () => {
    if (!weekComparison) return null;
    
    if (weekComparison.trend === 'up') {
      return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    } else if (weekComparison.trend === 'down') {
      return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    }
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (!weekComparison) return 'text-muted-foreground';
    if (weekComparison.trend === 'up') return 'text-green-500';
    if (weekComparison.trend === 'down') return 'text-red-500';
    return 'text-muted-foreground';
  };

  const isSignificantDrop = weekComparison && weekComparison.change_pct <= -50;

  // Geographic relevance color based on percentage
  const getGeoRelevanceColor = (percent: number) => {
    if (percent >= 70) return 'text-green-500';
    if (percent >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className={`bg-[hsl(270,100%,68%)]/5 rounded-xl border ${isSignificantDrop ? 'border-red-500/50' : 'border-[hsl(270,100%,68%)]/20'}`}>
          <CollapsibleTrigger className="w-full p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold text-[hsl(270,100%,68%)] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3 h-3" />
                Audience
                {isSignificantDrop && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Traffic down {Math.abs(weekComparison.change_pct)}% vs last week</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
            
            {/* Summary line - always visible */}
            <div className="mt-2 flex items-center gap-3 text-sm flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-[hsl(270,100%,68%)]">{visitsToday}</span>
                <span className="text-xs text-muted-foreground">today</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-foreground">{visitsThisWeek}</span>
                <span className="text-xs text-muted-foreground">this week</span>
              </div>
              
              {/* Week-over-week comparison */}
              {weekComparison && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1 text-xs font-medium ${getTrendColor()} cursor-help`}>
                        {getTrendIcon()}
                        <span>{weekComparison.change_pct > 0 ? '+' : ''}{weekComparison.change_pct}%</span>
                        <span className="text-muted-foreground">vs last week</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This week: {weekComparison.this_week} unique visitors</p>
                      <p>Last week: {weekComparison.last_week} unique visitors</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              
              {breakdown && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className={`text-xs font-medium ${returnRateColor}`}>
                    {breakdown.return_rate_pct}% return
                  </span>
                </>
              )}
              
              {/* Geographic relevance in summary */}
              {geoData && geoData.totalVisitors > 0 && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1 text-xs font-medium ${getGeoRelevanceColor(geoData.relevancePercent)} cursor-help`}>
                        <Globe className="w-3 h-3" />
                        <span>{geoData.relevancePercent}% {getCountryName(geoData.targetCountryCode)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{geoData.targetRegionVisitors} of {geoData.totalVisitors} visitors from target region</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-16">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : breakdown ? (
                <>
                  {/* Today vs This Week breakdown */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Today */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-[hsl(270,100%,68%)]/10 rounded-lg p-2 border border-[hsl(270,100%,68%)]/30 cursor-help text-center">
                              <div className="flex items-center justify-center gap-1">
                                <UserPlus className="w-3 h-3 text-green-500" />
                                <span className="text-lg font-bold text-green-500">{breakdown.today_new}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">New</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>First-time visitors today</p>
                          </TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-[hsl(270,100%,68%)]/10 rounded-lg p-2 border border-[hsl(270,100%,68%)]/30 cursor-help text-center">
                              <div className="flex items-center justify-center gap-1">
                                <UserCheck className="w-3 h-3 text-blue-500" />
                                <span className="text-lg font-bold text-blue-500">{breakdown.today_returning}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">Return</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Returning visitors today</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    
                    {/* This Week */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Week</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-[hsl(270,100%,68%)]/10 rounded-lg p-2 border border-[hsl(270,100%,68%)]/30 cursor-help text-center">
                              <div className="flex items-center justify-center gap-1">
                                <UserPlus className="w-3 h-3 text-green-500" />
                                <span className="text-lg font-bold text-green-500">{breakdown.week_new}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">New</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>First-time visitors this week</p>
                          </TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-[hsl(270,100%,68%)]/10 rounded-lg p-2 border border-[hsl(270,100%,68%)]/30 cursor-help text-center">
                              <div className="flex items-center justify-center gap-1">
                                <UserCheck className="w-3 h-3 text-blue-500" />
                                <span className="text-lg font-bold text-blue-500">{breakdown.week_returning}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">Return</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Returning visitors this week</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>

                  {/* Week-over-week comparison detail */}
                  {weekComparison && (
                    <div className="pt-2 border-t border-[hsl(270,100%,68%)]/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Week-over-Week</span>
                        <div className={`flex items-center gap-1 text-sm font-bold ${getTrendColor()}`}>
                          {getTrendIcon()}
                          <span>{weekComparison.change_pct > 0 ? '+' : ''}{weekComparison.change_pct}%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-background/50 rounded p-2">
                          <div className="text-muted-foreground">This week</div>
                          <div className="font-semibold">{weekComparison.this_week} visitors</div>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="text-muted-foreground">Last week</div>
                          <div className="font-semibold">{weekComparison.last_week} visitors</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Return rate section */}
                  <div className="pt-2 border-t border-[hsl(270,100%,68%)]/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{breakdown.total_unique} total unique</span>
                      </div>
                      <span className={`text-sm font-bold ${returnRateColor}`}>
                        {breakdown.return_rate_pct}% return rate
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <Progress 
                            value={Math.min(breakdown.return_rate_pct, 100)} 
                            className="h-2"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Target: 40%+ return rate indicates strong audience stickiness</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Geographic Relevance section */}
                  {geoData && geoData.totalVisitors > 0 && (
                    <div className="pt-2 border-t border-[hsl(270,100%,68%)]/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Geographic Relevance</span>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-sm font-bold ${getGeoRelevanceColor(geoData.relevancePercent)} cursor-help`}>
                              {geoData.relevancePercent}% from {getCountryName(geoData.targetCountryCode)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{geoData.targetRegionVisitors} of {geoData.totalVisitors} visitors from target region</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              70%+ = Excellent, 40-69% = Good, &lt;40% = Review audience targeting
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <Progress 
                              value={Math.min(geoData.relevancePercent, 100)} 
                              className="h-2"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Target: 70%+ visitors from target region</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Top countries breakdown */}
                      {geoData.topCountries.length > 1 && (
                        <div className="mt-3 space-y-1">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                            Top Countries (30 days)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {geoData.topCountries.map((country) => (
                              <Tooltip key={country.code}>
                                <TooltipTrigger asChild>
                                  <div 
                                    className={`text-xs px-2 py-1 rounded-full border cursor-help ${
                                      country.code === geoData.targetCountryCode 
                                        ? 'bg-green-500/10 border-green-500/30 text-green-600' 
                                        : 'bg-muted/50 border-border text-muted-foreground'
                                    }`}
                                  >
                                    {getCountryName(country.code)} {country.percent}%
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{country.count} unique visitors from {getCountryName(country.code)}</p>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {geoLoading && (
                    <div className="pt-2 border-t border-[hsl(270,100%,68%)]/10">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading geographic data...
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No visitor data available
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </TooltipProvider>
  );
};
