import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Stethoscope } from 'lucide-react';
import { evaluateSourceHealth, SourceHealthSnapshot, summarizeSourceHealth } from '@/lib/sourceHealth';

interface SourceHealthOverviewProps {
  sources: {
    id: string;
    name: string;
    snapshot: SourceHealthSnapshot;
  }[];
  loading?: boolean;
}

export const SourceHealthOverview = ({ sources, loading = false }: SourceHealthOverviewProps) => {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => summarizeSourceHealth(sources.map(({ snapshot }) => snapshot)), [sources]);

  if (sources.length === 0) {
    return null;
  }

  const total = sources.length;
  const healthyLabel = `${summary.counts.healthy}/${total} healthy`;
  const watchLabel = summary.counts.watch > 0 ? `${summary.counts.watch} watch` : null;
  const failingLabel = summary.counts.failing > 0 ? `${summary.counts.failing} failing` : null;
  const offlineLabel = summary.counts.offline > 0 ? `${summary.counts.offline} offline` : null;

  return (
    <Alert className="bg-muted/60 border-muted-foreground/20">
      <div className="flex items-start gap-3">
        <Stethoscope className="w-5 h-5 mt-1 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTitle className="flex items-center gap-2 text-base">
              Source health snapshot
              {loading && <Badge variant="secondary">Refreshing…</Badge>}
            </AlertTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Badge variant="default">{healthyLabel}</Badge>
              {watchLabel && <Badge variant="secondary">{watchLabel}</Badge>}
              {failingLabel && <Badge variant="destructive">{failingLabel}</Badge>}
              {offlineLabel && <Badge variant="outline">{offlineLabel}</Badge>}
            </div>
          </div>

          {summary.unhealthy.length > 0 ? (
            <div className="space-y-2">
              <AlertDescription className="text-sm">
                {summary.unhealthy.length} source{summary.unhealthy.length === 1 ? '' : 's'} need attention.
              </AlertDescription>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setOpen(!open)}
              >
                {open ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 mr-1" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 mr-1" />
                    Show details
                  </>
                )}
              </Button>
              {open && (
                <div className="space-y-2">
                  {sources
                    .map(source => ({ source, status: evaluateSourceHealth(source.snapshot) }))
                    .filter(({ status }) => status.level !== 'healthy')
                    .map(({ source, status }) => (
                      <div key={source.id} className="text-xs bg-background/80 border border-border/40 rounded-md p-2">
                        <p className="font-medium text-foreground">{source.name}</p>
                        <p className="text-muted-foreground leading-snug">{status.summary}</p>
                        <p className="text-muted-foreground leading-snug mt-1">{status.details[0]}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <AlertDescription className="text-sm text-muted-foreground">
              All configured sources are operating normally.
            </AlertDescription>
          )}
        </div>
      </div>
    </Alert>
  );
};
