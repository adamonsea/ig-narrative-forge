import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StoryCard { id: string; title: string; source?: string | undefined; image?: string | null | undefined }
interface EventCard { id: string; title: string; start_date: string }
export interface BuildEventSource { url: string; name: string; kind: string }

interface FeedBuildProgressProps {
  topicId: string;
  topicName: string;
  /** The feed's own colour. */
  colour: string;
  sourceIds: string[];
  eventSources: BuildEventSource[];
  /** Shown when only some of the chosen sources could be connected. */
  connectedNote?: string | undefined;
  onSeeFeed: () => void;
  onOpenDesk: () => void;
}

type Stage = 'connecting' | 'events' | 'writing' | 'live';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DOT_GAP_MS = 260;

/** The build moment: a phone preview of the owner's feed assembling from real data. */
export const FeedBuildProgress = ({ topicId, topicName, colour, sourceIds, eventSources, connectedNote, onSeeFeed, onOpenDesk }: FeedBuildProgressProps) => {
  const total = sourceIds.length + eventSources.length;
  const [lit, setLit] = useState<boolean[]>(() => Array(total).fill(false));
  const [stage, setStage] = useState<Stage>('connecting');
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [events, setEvents] = useState<EventCard[]>([]);
  const started = useRef(false);
  const hasEvents = eventSources.length > 0;

  const light = (i: number) => setLit((prev) => prev.map((v, j) => (j === i ? true : v)));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    const today = new Date().toISOString().slice(0, 10);

    const pollEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('id, title, start_date')
        .eq('topic_id', topicId)
        .neq('status', 'excluded')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(6);
      if (data?.length) setEvents((prev) => [...prev, ...(data as EventCard[]).filter((e) => !prev.some((p) => p.id === e.id))]);
    };

    const pollStories = async () => {
      const { data } = (await supabase
        .from('stories')
        .select('id, title, cover_illustration_url, topic_articles!inner(topic_id, content_sources(source_name))')
        .eq('topic_articles.topic_id', topicId)
        .order('created_at', { ascending: true })
        .limit(5)) as { data: any[] | null };
      if (!data?.length) return 0;
      setStories((prev) => {
        const fresh = data
          .filter((s) => !prev.some((p) => p.id === s.id))
          .map((s) => ({ id: s.id, title: s.title, image: s.cover_illustration_url, source: s.topic_articles?.content_sources?.source_name }));
        return [...fresh.reverse(), ...prev];
      });
      return data.length;
    };

    const run = async () => {
      // News sources connect one by one; event sources are read in parallel
      const eventSaves = eventSources.map((s, i) =>
        supabase.functions
          .invoke('scrape-whats-on', { body: { action: 'save', topicId, url: s.url, name: s.name, kind: s.kind } })
          .then(({ data }) => { if (data?.success) light(sourceIds.length + i); })
          .catch(() => undefined),
      );
      for (let i = 0; i < sourceIds.length; i++) {
        try {
          await supabase.rpc('add_source_to_topic', { p_topic_id: topicId, p_source_id: sourceIds[i]!, p_source_config: {} });
        } catch (e) {
          console.warn('Source link error (may already exist):', e);
        }
        light(i);
        await wait(DOT_GAP_MS);
      }

      const eventTimer = hasEvents ? setInterval(() => { if (!stopped) void pollEvents(); }, 2000) : null;
      if (hasEvents) {
        setStage('events');
        await Promise.race([Promise.all(eventSaves), wait(25000)]);
        await pollEvents();
      }

      if (sourceIds.length > 0) {
        setStage('writing');
        try {
          await supabase.functions.invoke('universal-topic-scraper', { body: { topicId, mode: 'full' } });
        } catch (e) {
          console.warn('Scraper invocation error:', e);
        }
        let articleCount = 0;
        for (let i = 0; i < 20 && !stopped; i++) {
          await wait(2000);
          const { count } = await supabase.from('topic_articles').select('id', { count: 'exact', head: true }).eq('topic_id', topicId);
          articleCount = count || 0;
          if (articleCount >= 3) break;
        }
        if (articleCount > 0) {
          try {
            await supabase.functions.invoke('auto-simplify-queue', { body: { topicId, limit: 5 } });
          } catch (e) {
            console.warn('Auto-simplify error:', e);
          }
          for (let i = 0; i < 10 && !stopped; i++) {
            await wait(2000);
            if ((await pollStories()) >= 3) break;
          }
        }
      }
      if (eventTimer) clearInterval(eventTimer);
      if (hasEvents) await pollEvents();
      if (!stopped) setStage('live');
    };
    void run();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status =
    stage === 'connecting' ? `Connecting ${total} source${total === 1 ? '' : 's'}`
    : stage === 'events' ? 'Finding what’s on'
    : stage === 'writing' ? 'Writing your first stories'
    : stories.length || events.length ? 'Your feed is live' : 'Your feed is set up';
  const live = stage === 'live';
  const tint = `color-mix(in srgb, ${colour} 16%, hsl(var(--background)))`;

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <div
        className="flex h-[560px] w-full max-w-[380px] flex-col gap-3 overflow-hidden rounded-[44px] p-[14px] shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.35)] md:h-[620px]"
        style={{ background: tint }}
      >
        <header className="rounded-[30px_30px_12px_12px] bg-card px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-display text-[28px] leading-tight">{topicName}</p>
            {live && (
              <span className="setup-rise inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-pop">
                <span className="live-pulse h-2 w-2 rounded-full bg-pop" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
              {lit.map((on, i) => (
                <span
                  key={i}
                  className={cn('h-3 w-3 rounded-full transition-all duration-300', on ? 'scale-[1.15]' : 'bg-muted')}
                  style={on ? { background: colour } : undefined}
                />
              ))}
            </div>
          )}
        </header>

        {events.length > 0 && (
          <section className="setup-rise space-y-2">
            <h3 className="px-1 text-sm font-semibold">What's on</h3>
            <div className="flex gap-2 overflow-hidden">
              {events.slice(0, 6).map((e, i) => {
                const d = new Date(`${e.start_date}T12:00:00`);
                return (
                  <div key={e.id} className="setup-slide flex flex-[0_0_150px] flex-col gap-1 rounded-2xl bg-card p-3" style={{ animationDelay: `${Math.min(i, 3) * 450}ms` }}>
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-display text-[30px] leading-none">{d.getDate()}</span>
                      <span className="text-[13px] text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    </span>
                    <span className="line-clamp-2 text-[15px] font-medium leading-snug">{e.title}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {stories.length > 0 && (
          <section className="setup-rise min-h-0 space-y-2">
            <h3 className="px-1 text-sm font-semibold">Latest</h3>
            <ul className="space-y-2">
              {stories.map((s) => (
                <li key={s.id} className="setup-drop grid grid-cols-[96px_1fr] overflow-hidden rounded-2xl bg-card">
                  {s.image ? (
                    <img src={s.image} alt="" className="h-full min-h-[84px] w-full object-cover" />
                  ) : (
                    <span className="min-h-[84px]" style={{ background: colour }} aria-hidden="true" />
                  )}
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-3 text-base font-semibold leading-snug">{s.title}</p>
                    {s.source && <p className="truncate text-[13px] text-muted-foreground">{s.source}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p key={status} className="setup-rise text-center text-xl text-muted-foreground" aria-live="polite">{status}</p>
      {connectedNote && <p className="text-base text-muted-foreground">{connectedNote}</p>}

      {live && (
        <div className="setup-rise flex w-full max-w-xs flex-col items-center gap-3">
          <Button className="h-[60px] w-full gap-2 text-xl" onClick={onSeeFeed}>
            <ExternalLink className="h-5 w-5" aria-hidden="true" />
            See your feed
          </Button>
          <Button variant="ghost" className="text-lg text-muted-foreground" onClick={onOpenDesk}>Open the Desk</Button>
        </div>
      )}
    </div>
  );
};
