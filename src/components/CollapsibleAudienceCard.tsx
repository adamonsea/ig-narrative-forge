import { useState, useEffect } from 'react';
import { Eye, ChevronDown, ChevronRight, UserPlus, UserCheck, TrendingUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

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

export const CollapsibleAudienceCard = ({ topicId, visitsToday, visitsThisWeek }: CollapsibleAudienceCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<VisitorBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !breakdown) {
      loadBreakdown();
    }
  }, [isOpen, topicId]);

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

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-[hsl(270,100%,68%)]/5 rounded-xl border border-[hsl(270,100%,68%)]/20">
          <CollapsibleTrigger className="w-full p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold text-[hsl(270,100%,68%)] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3 h-3" />
                Audience
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
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="font-bold text-[hsl(270,100%,68%)]">{visitsThisWeek}</span>
              <span className="text-muted-foreground">This Week</span>
              <span className="text-muted-foreground">•</span>
              {breakdown ? (
                <span className={`font-medium ${returnRateColor}`}>
                  {breakdown.return_rate_pct}% Return Rate
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Expand for details</span>
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
