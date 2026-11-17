import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Play, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { londonToday, eventSourceKindLabel } from "@/lib/whatsOn";
import { attentionOrder, newsSourceHealth, typicalGapDays, type HealthVerdict } from "@/lib/sourceHealth";
import { EventSourcePanel, host, useEventSourcesDeck, type EventSourceCardData } from "@/components/events/EventSources";
import { SourceCard, SourceIcon, hostOf } from "./SourceCard";
import { NewsSourcePanel, type NewsSourceSettings, type NewsSourceView } from "./NewsSourcePanel";

interface Rhythm { source_id: string; added_at: string | null; last_arrival_at: string | null; arrival_days: string[] | null; last7: number[] | null }

interface NewsCard { source: NewsSourceView; verdict: HealthVerdict; dots: number[]; gap: number | null; lastArrivalAt: string | null; name: string; health: HealthVerdict["health"] }

export interface SourceShelvesProps {
  topicId: string;
  sources: NewsSourceView[];
  loading: boolean;
  eventsReloadKey: number;
  gatheringId: string | null;
  testingId: string | null;
  onGather: (s: NewsSourceView) => Promise<void> | void;
  onArchive: (s: NewsSourceView) => Promise<void> | void;
  onRestore: (s: NewsSourceView) => Promise<void> | void;
  onRemove: (s: NewsSourceView) => Promise<void> | void;
  onSave: (s: NewsSourceView, settings: NewsSourceSettings) => Promise<void> | void;
  onTest: (s: NewsSourceView) => void;
  onBackfill: (s: NewsSourceView) => void;
}

function Shelf({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

/**
 * The Sources tab as two shelves of cards (News, Events), sources needing a look pinned first,
 * and one Archived fold. Card fronts stay quiet; everything else is in the side panel.
 */
export function SourceShelves(p: SourceShelvesProps) {
  const today = londonToday();
  const scrapedKey = p.sources.map((s) => `${s.id}:${s.last_scraped_at ?? ""}`).join("|");
  const { data: rhythm } = useQuery({
    queryKey: ["source-rhythm", p.topicId, scrapedKey],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_topic_source_rhythm", { p_topic_id: p.topicId });
      if (error) throw error;
      return (data ?? []) as Rhythm[];
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const cards = useMemo(() => {
    const byId = new Map((rhythm ?? []).map((r) => [r.source_id, r]));
    return p.sources.map<NewsCard>((source) => {
      const r = byId.get(source.id);
      const arrivalDays = r?.arrival_days ?? [];
      const verdict = newsSourceHealth({
        consecutiveFailures: source.consecutive_failures,
        arrivalDays,
        lastArrivalAt: r?.last_arrival_at ?? null,
        addedAt: r?.added_at ?? null,
        today,
      });
      return { source, verdict, dots: r?.last7 ?? Array(7).fill(0), gap: typicalGapDays(arrivalDays), lastArrivalAt: r?.last_arrival_at ?? null, name: source.source_name, health: verdict.health };
    });
  }, [p.sources, rhythm, today]);

  const activeNews = cards.filter((c) => c.source.is_active !== false).sort(attentionOrder);
  const archivedNews = cards.filter((c) => c.source.is_active === false).sort((a, b) => a.name.localeCompare(b.name));

  const deck = useEventSourcesDeck(p.topicId, p.eventsReloadKey);
  const eventCards = deck.sources.map((s) => ({ ...s, health: s.verdict.health }));
  const activeEvents = eventCards.filter((s) => s.is_active !== false).sort(attentionOrder);
  const archivedEvents = eventCards.filter((s) => s.is_active === false).sort((a, b) => a.name.localeCompare(b.name));

  const [openNews, setOpenNews] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const newsOpen = cards.find((c) => c.source.id === openNews) ?? null;
  const eventOpen: EventSourceCardData | null = deck.sources.find((s) => s.id === openEvent) ?? null;
  const archivedCount = archivedNews.length + archivedEvents.length;

  return (
    <div className="space-y-10">
      <Shelf id="shelf-news" title="News">
        {activeNews.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-base text-muted-foreground">
            {p.loading ? "Loading sources…" : "No news sources yet. Paste a website above to add one."}
          </p>
        ) : (
          <div className={GRID}>
            {activeNews.map((c) => {
              const busy = p.gatheringId === c.source.id;
              return (
                <SourceCard key={c.source.id} name={c.name} domain={c.source.canonical_domain || hostOf(c.source.feed_url)} kind="news"
                  health={c.health} healthLabel={c.verdict.label} dots={c.dots}
                  figure={c.source.stories_published_7d ?? 0} figureLabel="in feed this week" busy={busy}
                  onOpen={() => setOpenNews(c.source.id)}
                  action={
                    <Button size="sm" onClick={() => p.onGather(c.source)} disabled={busy || !c.source.feed_url} aria-label={`Gather from ${c.name} now`}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                      {busy ? "Gathering…" : "Gather"}
                    </Button>
                  } />
              );
            })}
          </div>
        )}
      </Shelf>

      <Shelf id="shelf-events" title="Events">
        {activeEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-base text-muted-foreground">No events sources yet. Paste a what's-on page above to add one.</p>
        ) : (
          <div className={GRID}>
            {activeEvents.map((s) => {
              const busy = deck.busy === s.id;
              return (
                <SourceCard key={s.id} name={s.name} domain={host(s.url)} kind="events" health={s.health} healthLabel={s.verdict.label}
                  dots={s.dots} figure={s.upcoming} figureLabel="coming up" busy={busy} onOpen={() => setOpenEvent(s.id)}
                  action={
                    <Button size="sm" onClick={() => deck.gather(s)} disabled={busy} aria-label={`Gather from ${s.name} now`}>
                      <RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />{busy ? "Checking…" : "Gather"}
                    </Button>
                  } />
              );
            })}
          </div>
        )}
      </Shelf>

      {archivedCount > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 rounded text-base font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
            Archived ({archivedCount})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ul className="divide-y divide-border rounded-xl border border-border bg-muted/30">
              {archivedNews.map((c) => (
                <ArchivedRow key={c.source.id} name={c.name} domain={c.source.canonical_domain || hostOf(c.source.feed_url)} kind="news" label="News"
                  onOpen={() => setOpenNews(c.source.id)} onRestore={() => p.onRestore(c.source)} />
              ))}
              {archivedEvents.map((s) => (
                <ArchivedRow key={s.id} name={s.name} domain={host(s.url)} kind="events" label={eventSourceKindLabel(s.kind)}
                  onOpen={() => setOpenEvent(s.id)} onRestore={() => deck.restore(s)} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      <NewsSourcePanel
        source={newsOpen?.source ?? null} verdict={newsOpen?.verdict ?? null} dots={newsOpen?.dots ?? []} gap={newsOpen?.gap ?? null}
        lastArrivalAt={newsOpen?.lastArrivalAt ?? null}
        gathering={Boolean(newsOpen && p.gatheringId === newsOpen.source.id)} testing={Boolean(newsOpen && p.testingId === newsOpen.source.id)}
        onClose={() => setOpenNews(null)}
        onGather={() => newsOpen && p.onGather(newsOpen.source)}
        onBackfill={() => { if (newsOpen) { p.onBackfill(newsOpen.source); setOpenNews(null); } }}
        onArchive={() => newsOpen && p.onArchive(newsOpen.source)}
        onRestore={() => newsOpen && p.onRestore(newsOpen.source)}
        onRemove={async () => { if (newsOpen) { await p.onRemove(newsOpen.source); } }}
        onSave={(settings) => newsOpen ? p.onSave(newsOpen.source, settings) : undefined}
        onTest={() => newsOpen && p.onTest(newsOpen.source)}
      />
      <EventSourcePanel source={eventOpen} deck={deck} onClose={() => setOpenEvent(null)} />
    </div>
  );
}

function ArchivedRow({ name, domain, kind, label, onOpen, onRestore }: { name: string; domain: string; kind: "news" | "events"; label: string; onOpen: () => void; onRestore: () => void }) {
  return (
    <li className="flex items-center gap-3 p-3">
      <SourceIcon domain={domain} kind={kind} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-base font-medium text-muted-foreground hover:text-foreground hover:underline">{name}</span>
        <span className="block truncate text-sm text-muted-foreground">{label} · {domain}</span>
      </button>
      <Button size="sm" variant="outline" onClick={onRestore}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Restore</Button>
    </li>
  );
}
