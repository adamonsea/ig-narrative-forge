import { format } from 'date-fns';
import { Clock, Bot, User } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LifecycleStep {
  label: string;
  timestamp: string | null;
  isAutomated: boolean;
}

interface StoryLifecycleTooltipProps {
  gatheredAt?: string | null;
  simplifiedAt?: string | null;
  illustratedAt?: string | null;
  animatedAt?: string | null;
  isAutoGathered?: boolean;
  isAutoSimplified?: boolean;
  isAutoIllustrated?: boolean;
  isAutoAnimated?: boolean;
  children: React.ReactNode;
}

const formatTimestamp = (timestamp: string | null): string => {
  if (!timestamp) return 'Not completed';
  try {
    return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
  } catch {
    return 'Invalid date';
  }
};

const AutomationBadge = ({ isAutomated }: { isAutomated: boolean }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
    isAutomated 
      ? 'bg-primary/10 text-primary' 
      : 'bg-muted text-muted-foreground'
  }`}>
    {isAutomated ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
    {isAutomated ? 'Auto' : 'Manual'}
  </span>
);

export const StoryLifecycleTooltip = ({
  gatheredAt,
  simplifiedAt,
  illustratedAt,
  animatedAt,
  isAutoGathered = false,
  isAutoSimplified = false,
  isAutoIllustrated = false,
  isAutoAnimated = false,
  children,
}: StoryLifecycleTooltipProps) => {
  const steps: LifecycleStep[] = [
    { label: 'Gathered', timestamp: gatheredAt || null, isAutomated: isAutoGathered },
    { label: 'Simplified', timestamp: simplifiedAt || null, isAutomated: isAutoSimplified },
    { label: 'Image Added', timestamp: illustratedAt || null, isAutomated: isAutoIllustrated },
    { label: 'Video Added', timestamp: animatedAt || null, isAutomated: isAutoAnimated },
  ];

  const hasAnyAutomation = isAutoGathered || isAutoSimplified || isAutoIllustrated || isAutoAnimated;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="relative inline-flex">
            {children}
            {hasAnyAutomation && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" title="Has automation" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="w-64 p-0" sideOffset={8}>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground border-b border-border pb-2 mb-2">
              <Clock className="w-3.5 h-3.5" />
              Story Lifecycle
            </div>
            {steps.map((step) => (
              <div key={step.label} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    step.timestamp ? 'bg-green-500' : 'bg-muted-foreground/30'
                  }`} />
                  <span className="text-xs text-foreground truncate">{step.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {step.timestamp && <AutomationBadge isAutomated={step.isAutomated} />}
                  <span className={`text-[10px] ${step.timestamp ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                    {step.timestamp ? format(new Date(step.timestamp), 'MMM d, h:mm a') : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
