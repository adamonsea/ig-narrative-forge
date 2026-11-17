import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, Download, ExternalLink, Loader2, Play, RotateCcw, Trash2, Wifi } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rhythmSentence, type HealthVerdict } from "@/lib/sourceHealth";
import { SourceDots } from "./SourceDots";
import { SourceIcon } from "./SourceCard";
import { Figure, HealthLine, PanelSection } from "./SourcePanelParts";

export interface NewsSourceView {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  is_active: boolean | null;
  last_scraped_at: string | null;
  consecutive_failures?: number;
  last_failure_reason?: string | null;
  last_error?: string | null;
  stories_published_7d?: number;
  stories_published_total?: number;
  scraping_config?: any;
}

export interface NewsSourceSettings { feed_url: string; trust: boolean; trustDays: number }

/** Everything about one news source, in the same right-hand panel the Desk uses for stories. */
export function NewsSourcePanel({
  source, verdict, dots, gap, lastArrivalAt, gathering, testing, onClose, onGather, onBackfill, onArchive, onRestore, onRemove, onSave, onTest,
}: {
  source: NewsSourceView | null; verdict: HealthVerdict | null; dots: number[]; gap: number | null; lastArrivalAt: string | null;
  gathering: boolean; testing: boolean; onClose: () => void; onGather: () => void; onBackfill: () => void;
  onArchive: () => void; onRestore: () => void; onRemove: () => void; onSave: (s: NewsSourceSettings) => Promise<void> | void; onTest: () => void;
}) {
  const [url, setUrl] = useState("");
  const [trust, setTrust] = useState(false);
  const [trustDays, setTrustDays] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(source?.feed_url ?? "");
    setTrust(Boolean(source?.scraping_config?.trust_content_relevance));
    setTrustDays(Number(source?.scraping_config?.trusted_max_age_days) || 1);
  }, [source?.id, source?.feed_url, source?.scraping_config]);

  const gathered7d = dots.reduce((a, b) => a + b, 0);
  const published7d = source?.stories_published_7d ?? 0;
  const changed = source && (url.trim() !== (source.feed_url ?? "") || trust !== Boolean(source.scraping_config?.trust_content_relevance)
    || (trust && trustDays !== (Number(source.scraping_config?.trusted_max_age_days) || 1)));
  const archived = source?.is_active === false;
  const problem = source?.last_failure_reason || source?.last_error;

  return (
    <Sheet open={Boolean(source)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {source && verdict && (
          <>
            <SheetHeader className="space-y-4 p-6 pr-12 text-left">
              <div className="flex items-center gap-3">
                <SourceIcon domain={source.canonical_domain || ""} size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-xl leading-snug">{source.source_name}</SheetTitle>
                  <SheetDescription asChild>
                    <p className="truncate text-sm text-muted-foreground">
                      {source.feed_url ? (
                        <a href={source.feed_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                          {source.canonical_domain || source.feed_url}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : source.canonical_domain}
                    </p>
                  </SheetDescription>
                </div>
              </div>
              {archived ? <p className="rounded-lg bg-muted p-3 text-base">Archived. Nothing is gathered from here until you restore it.</p> : <HealthLine verdict={verdict} />}
              <div className="flex flex-wrap gap-2">
                {archived ? (
                  <Button onClick={onRestore}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Restore</Button>
                ) : (
                  <Button onClick={onGather} disabled={gathering || !source.feed_url}>
                    {gathering ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    {gathering ? "Gathering…" : "Gather now"}
                  </Button>
                )}
                {!archived && verdict.health === "failing" && (Number(source.consecutive_failures) || 0) > 0 && (
                  <Button variant="outline" onClick={onTest} disabled={testing}>
                    {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Wifi className="mr-1.5 h-4 w-4" aria-hidden="true" />}Test the link
                  </Button>
                )}
              </div>
            </SheetHeader>

            <PanelSection title="Last 7 days">
              <SourceDots counts={dots} size="lg" />
              <div className="grid grid-cols-3 gap-2">
                <Figure value={gathered7d} label="came in" />
                <Figure value={published7d} label="in the feed" />
                <Figure value={gathered7d ? `${Math.round((published7d / gathered7d) * 100)}%` : "–"} label="made it" />
              </div>
              <ul className="space-y-1 text-base text-muted-foreground">
                {rhythmSentence(gap) && <li>{rhythmSentence(gap)}</li>}
                <li>Last arrival: {lastArrivalAt ? formatDistanceToNow(new Date(lastArrivalAt), { addSuffix: true }) : "nothing yet"}</li>
                <li>Last checked: {source.last_scraped_at ? formatDistanceToNow(new Date(source.last_scraped_at), { addSuffix: true }) : "not yet"}</li>
                {typeof source.stories_published_total === "number" && <li>{source.stories_published_total} stories in the feed so far</li>}
              </ul>
            </PanelSection>

            {problem && (
              <PanelSection title="Last problem">
                <p className="rounded-lg bg-destructive/5 p-3 text-base text-muted-foreground">{problem}</p>
              </PanelSection>
            )}

            <PanelSection title="Settings">
              <div className="space-y-1.5">
                <Label htmlFor="source-link" className="text-sm text-muted-foreground">Link we read</Label>
                <Input id="source-link" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed" />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="source-trust" checked={trust} onCheckedChange={(c) => setTrust(c === true)} className="mt-0.5" />
                <Label htmlFor="source-trust" className="text-base font-normal leading-snug">
                  Trust everything from here
                  <span className="block text-sm text-muted-foreground">Skips the "is this about us?" check. Keep the time window short.</span>
                </Label>
              </div>
              {trust && (
                <Select value={String(trustDays)} onValueChange={(v) => setTrustDays(Number(v))}>
                  <SelectTrigger aria-label="How far back to take trusted stories"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="2">Last 48 hours</SelectItem>
                    <SelectItem value="3">Last 3 days</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" disabled={!changed || !url.trim() || saving}
                onClick={async () => { setSaving(true); try { await onSave({ feed_url: url.trim(), trust, trustDays }); } finally { setSaving(false); } }}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Save changes
              </Button>
            </PanelSection>

            <PanelSection title="More">
              <div className="flex flex-wrap gap-2">
                {!archived && <Button variant="outline" onClick={onBackfill}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Gather older stories</Button>}
                {!archived && <Button variant="outline" onClick={onArchive}><Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />Archive</Button>}
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onRemove}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Remove from this feed</Button>
              </div>
            </PanelSection>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
