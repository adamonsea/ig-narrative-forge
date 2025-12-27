import { useState } from 'react';
import { Users, ChevronDown, ChevronRight, Mail, Smartphone } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NewsletterSignupsManager } from './NewsletterSignupsManager';

interface CollapsibleSubscribersCardProps {
  topicId: string;
  installsThisWeek: number | null;
  installsTotal: number | null;
  registrantsThisWeek: number | null;
  registrantsTotal: number | null;
  emailSubscribers?: number;
  pushSubscribers?: number; // deprecated but kept for backwards compat
}

export const CollapsibleSubscribersCard = ({
  topicId,
  installsThisWeek,
  installsTotal,
  registrantsThisWeek,
  registrantsTotal,
  emailSubscribers = 0,
}: CollapsibleSubscribersCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const totalSubscribers = (installsTotal || 0) + (registrantsTotal || 0) + emailSubscribers;

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-background/30 rounded-xl border border-border/30">
          <CollapsibleTrigger className="w-full p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Subscribers
              </div>
              <div className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
            
            {/* Summary stats - always visible */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-pop/10 rounded-lg p-3 border border-pop/30 cursor-help">
                    <div className="text-xl font-bold text-pop-foreground">
                      {installsThisWeek || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      Homescreen (Week)
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Users who added this feed to their phone this week</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-pop/10 rounded-lg p-3 border border-pop/30 cursor-help">
                    <div className="text-xl font-bold text-pop-foreground">
                      {installsTotal || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      Homescreen (Total)
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total users with this feed on their home screen</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-[hsl(155,100%,67%)]/10 rounded-lg p-3 border border-[hsl(155,100%,67%)]/30 cursor-help">
                    <div className="text-xl font-bold text-[hsl(155,100%,67%)]">
                      {registrantsThisWeek || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Registrants (Week)</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>New Play Mode users who signed up this week</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-[hsl(155,100%,67%)]/10 rounded-lg p-3 border border-[hsl(155,100%,67%)]/30 cursor-help">
                    <div className="text-xl font-bold text-[hsl(155,100%,67%)]">
                      {registrantsTotal || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Registrants (Total)</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total Play Mode users for this feed</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Quick counts for email */}
            {emailSubscribers > 0 && (
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  <span>{emailSubscribers} email</span>
                </div>
                <span className="text-muted-foreground/60">• Click to view list</span>
              </div>
            )}
            
            {!isOpen && emailSubscribers === 0 && (
              <div className="text-xs text-muted-foreground/60 mt-2">
                Click to view subscriber details
              </div>
            )}
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-border/20 mt-2 pt-4">
              <NewsletterSignupsManager topicId={topicId} />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </TooltipProvider>
  );
};
