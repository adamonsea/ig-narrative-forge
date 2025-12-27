import { useState } from 'react';
import { ChevronDown, ChevronRight, BarChart3, Gamepad2, Heart, ThumbsDown, Users, MousePointer, Layers, Share2, ExternalLink, Brain } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EngagementFunnel } from '@/components/EngagementFunnel';
import { engagementColors } from '@/lib/designTokens';

interface CollapsibleEngagementCardProps {
  topicId: string;
  // Play Mode stats
  articlesLiked: number;
  articlesDisliked: number;
  playModeVisitsWeek: number;
  // Feed Mode stats
  avgStoriesEngaged: number;
  avgFinalSlidesSeen: number;
  shareClicks: number;
  sourceClicks: number;
  quizResponsesCount: number;
}

export const CollapsibleEngagementCard = ({
  topicId,
  articlesLiked,
  articlesDisliked,
  playModeVisitsWeek,
  avgStoriesEngaged,
  avgFinalSlidesSeen,
  shareClicks,
  sourceClicks,
  quizResponsesCount
}: CollapsibleEngagementCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate summary metrics
  const totalPlayActions = articlesLiked + articlesDisliked;
  const approvalRate = totalPlayActions > 0 ? Math.round((articlesLiked / totalPlayActions) * 100) : 0;
  const totalFeedEngagement = shareClicks + sourceClicks + quizResponsesCount;

  // Hide tiny sample sizes to avoid misleading ratios
  const MIN_PLAY_ACTIONS_FOR_DISPLAY = 25;
  const hasReliablePlaySample = totalPlayActions >= MIN_PLAY_ACTIONS_FOR_DISPLAY;

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-background/30 rounded-xl border border-border/30">
          <CollapsibleTrigger className="w-full p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3" />
                Engagement
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
              {hasReliablePlaySample ? (
                <>
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-pink-500" />
                    <span className="font-bold text-pink-500">{approvalRate}%</span>
                    <span className="text-muted-foreground text-xs">approval</span>
                  </span>
                  <span className="text-muted-foreground">•</span>
                </>
              ) : totalPlayActions > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    Collecting ratings ({totalPlayActions} so far)
                  </span>
                  <span className="text-muted-foreground">•</span>
                </>
              ) : null}

              <span className="flex items-center gap-1">
                <span className="font-bold" style={{ color: engagementColors.engaged }}>{avgStoriesEngaged}</span>
                <span className="text-muted-foreground text-xs">avg engaged</span>
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground text-xs">{totalFeedEngagement} interactions</span>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              {/* Play Mode + Feed Mode side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Play Mode */}
                <div className="bg-pink-500/5 rounded-lg p-3 border border-pink-500/20">
                  <div className="text-[10px] font-semibold text-pink-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Gamepad2 className="w-3 h-3" />
                    Play Mode
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/30 cursor-help text-center">
                          <div className="text-lg font-bold text-pink-500 flex items-center justify-center gap-1">
                            <Heart className="w-3 h-3" />
                            {hasReliablePlaySample ? articlesLiked : '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Liked</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Stories rated positively in Play Mode</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-orange-500/10 rounded-lg p-2 border border-orange-500/30 cursor-help text-center">
                          <div className="text-lg font-bold text-orange-500 flex items-center justify-center gap-1">
                            <ThumbsDown className="w-3 h-3" />
                            {hasReliablePlaySample ? articlesDisliked : '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Skipped</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Stories skipped in Play Mode</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/30 cursor-help text-center">
                          <div className="text-lg font-bold text-blue-500 flex items-center justify-center gap-1">
                            <Users className="w-3 h-3" />
                            {playModeVisitsWeek}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Visitors</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Unique Play Mode visitors this week</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Feed Mode */}
                <div className="rounded-lg p-3 border" style={{ backgroundColor: `${engagementColors.engaged}08`, borderColor: `${engagementColors.engaged}20` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: engagementColors.engaged }}>
                    <MousePointer className="w-3 h-3" />
                    Feed Mode
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg p-2 border cursor-help text-center" style={{ backgroundColor: `${engagementColors.engaged}15`, borderColor: `${engagementColors.engaged}30` }}>
                          <div className="text-lg font-bold" style={{ color: engagementColors.engaged }}>
                            {avgStoriesEngaged}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Engaged</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Avg unique stories engaged per visitor</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg p-2 border cursor-help text-center" style={{ backgroundColor: `${engagementColors.completed}15`, borderColor: `${engagementColors.completed}30` }}>
                          <div className="text-lg font-bold" style={{ color: engagementColors.completed }}>
                            {avgFinalSlidesSeen}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Completed</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Avg stories read to final slide per visitor</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg p-2 border cursor-help text-center" style={{ backgroundColor: `${engagementColors.shares}15`, borderColor: `${engagementColors.shares}30` }}>
                          <div className="text-lg font-bold" style={{ color: engagementColors.shares }}>
                            {shareClicks}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Shares</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Share button clicks on stories</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  
                  {/* Secondary stats */}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg p-2 border cursor-help text-center" style={{ backgroundColor: `${engagementColors.sourceClicks}10`, borderColor: `${engagementColors.sourceClicks}25` }}>
                          <div className="text-sm font-bold flex items-center justify-center gap-1" style={{ color: engagementColors.sourceClicks }}>
                            <ExternalLink className="w-3 h-3" />
                            {sourceClicks}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Source</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clicks to original source articles</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-lg p-2 border cursor-help text-center" style={{ backgroundColor: `${engagementColors.quiz}10`, borderColor: `${engagementColors.quiz}25` }}>
                          <div className="text-sm font-bold flex items-center justify-center gap-1" style={{ color: engagementColors.quiz }}>
                            <Brain className="w-3 h-3" />
                            {quizResponsesCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Quiz</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Quiz questions answered by readers</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Engagement Funnel */}
              <div className="pt-3 border-t border-border/20">
                <EngagementFunnel topicId={topicId} />
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </TooltipProvider>
  );
};
