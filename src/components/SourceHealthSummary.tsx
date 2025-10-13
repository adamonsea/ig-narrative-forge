import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PauseCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { evaluateSourceHealth, SourceHealthSnapshot } from '@/lib/sourceHealth';
import { cn } from '@/lib/utils';

interface SourceHealthSummaryProps {
  snapshot: SourceHealthSnapshot;
}

const iconForLevel: Record<string, JSX.Element> = {
  healthy: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  watch: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  failing: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  offline: <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" />
};

const badgeVariantForLevel: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  healthy: 'default',
  watch: 'secondary',
  failing: 'destructive',
  offline: 'outline'
};

export const SourceHealthSummary = ({ snapshot }: SourceHealthSummaryProps) => {
  const [open, setOpen] = useState(false);
  const baseStatus = useMemo(() => evaluateSourceHealth(snapshot, { includeDetails: false }), [snapshot]);
  const detailedStatus = useMemo(
    () => (open ? evaluateSourceHealth(snapshot) : null),
    [open, snapshot]
  );
  const status = detailedStatus ?? baseStatus;
  const detailItems = detailedStatus?.details ?? [];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Badge
            variant={badgeVariantForLevel[status.level]}
            className={cn('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1')}
          >
            {iconForLevel[status.level]}
            <span>{status.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-3 space-y-2" side="bottom" align="start">
          <div>
            <p className="text-sm font-semibold">{status.summary}</p>
            <p className="text-xs text-muted-foreground leading-snug">{status.nextSteps}</p>
          </div>
          {detailItems.length > 0 && (
            <ul className="list-disc list-inside space-y-1">
              {detailItems.map((detail, idx) => (
                <li key={`${detail}-${idx}`} className="text-xs leading-snug">
                  {detail}
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
