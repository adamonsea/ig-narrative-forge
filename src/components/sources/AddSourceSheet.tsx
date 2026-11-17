import { useEffect, useState } from 'react';
import { ArrowLeft, Info, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EventSourceAddPanel } from '@/components/events/EventSources';
import { detectSourceKind, isEventsSourceKind } from '@/lib/whatsOn';
import { SourceIcon } from './SourceCard';
import { SourceFinder, type SourceFinderProps } from './SourceFinder';
import { addSourceNameFromLink, addSourceHost } from '@/lib/addSource';

export interface NewNewsSource { name: string; url: string; trust: boolean; trustDays: number }

type Step = 'link' | 'news' | 'events' | 'find';

/**
 * Add source as a short wizard in the Desk's side drawer:
 * link first → kind detected from the link → only that kind's fields.
 * "Find sources" (AI suggestions) is a quiet option on the first step.
 */
export function AddSourceSheet({
  open, onOpenChange, topicId, finder, onAddNews, onEventsSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  finder: SourceFinderProps | null;
  onAddNews: (source: NewNewsSource) => Promise<boolean>;
  onEventsSaved: () => void;
}) {
  const [step, setStep] = useState<Step>('link');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [trust, setTrust] = useState(false);
  const [trustDays, setTrustDays] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) { setStep('link'); setUrl(''); setName(''); setTrust(false); setTrustDays(1); setAdding(false); }
  }, [open]);

  const host = addSourceHost(url);
  const next = () => {
    if (!host) return;
    setName(addSourceNameFromLink(url));
    setStep(isEventsSourceKind(detectSourceKind(url)) ? 'events' : 'news');
  };

  const addNews = async () => {
    setAdding(true);
    const ok = await onAddNews({ name: name.trim(), url: url.trim(), trust, trustDays });
    setAdding(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="panel" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 p-6 pr-12 text-left">
          {step !== 'link' && (
            <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => setStep('link')}>
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Back
            </Button>
          )}
          <SheetTitle className="text-xl">{step === 'find' ? 'Find sources' : 'Add source'}</SheetTitle>
          <SheetDescription className="sr-only">Paste a link to a news site, feed or what's-on page.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-6 pb-8">
          {step === 'link' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); next(); }}>
              <div className="space-y-1.5">
                <Label htmlFor="add-source-link" className="text-sm">Link</Label>
                <Input id="add-source-link" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              </div>
              <div className="flex items-center justify-between gap-3">
                {finder ? (
                  <Button type="button" variant="link" className="h-auto px-0 text-muted-foreground" onClick={() => setStep('find')}>Find sources</Button>
                ) : <span />}
                <Button type="submit" disabled={!host}>Next</Button>
              </div>
            </form>
          )}

          {(step === 'news' || step === 'events') && (
            <>
              <div className="flex items-center gap-3">
                <SourceIcon domain={host} />
                <p className="min-w-0 flex-1 truncate text-base text-muted-foreground">{host}</p>
                <ToggleGroup type="single" size="sm" variant="outline" value={step}
                  onValueChange={(v) => { if (v === 'news' || v === 'events') setStep(v); }} aria-label="Kind of source">
                  <ToggleGroupItem value="news">News</ToggleGroupItem>
                  <ToggleGroupItem value="events">What's on</ToggleGroupItem>
                </ToggleGroup>
              </div>

              {step === 'news' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-source-name" className="text-sm">Name</Label>
                    <Input id="add-source-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="add-source-trust" className="text-base font-normal">Trust everything</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="About trust everything">
                            <Info className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">Skips the relevance check. Keep the time window short.</TooltipContent>
                      </Tooltip>
                    </div>
                    <Switch id="add-source-trust" checked={trust} onCheckedChange={setTrust} />
                  </div>
                  {trust && (
                    <Select value={String(trustDays)} onValueChange={(v) => setTrustDays(Number(v))}>
                      <SelectTrigger aria-label="Time window"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Last 24 hours</SelectItem>
                        <SelectItem value="2">Last 48 hours</SelectItem>
                        <SelectItem value="3">Last 3 days</SelectItem>
                        <SelectItem value="7">Last 7 days</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button onClick={addNews} disabled={adding || !name.trim()}>
                    {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Add
                  </Button>
                </div>
              ) : (
                <EventSourceAddPanel topicId={topicId} url={url} onSaved={() => { onEventsSaved(); onOpenChange(false); }} />
              )}
            </>
          )}

          {step === 'find' && finder && <SourceFinder {...finder} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
