import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { callReader } from '@/components/events/EventSources';
import { cn } from '@/lib/utils';

/** An organiser's ticket shop (scrape-whats-on `discover`), filled in by its own preview. */
interface Shop {
  url: string;
  name: string;
  state: 'reading' | 'ready' | 'empty' | 'added';
  venue?: string | null | undefined;
  events?: number | undefined;
}

const READ_AT_ONCE = 2;

/** Read one shop (once more after a pause if the read itself failed, e.g. a busy bot check). */
async function previewShop(topicId: string, url: string): Promise<Partial<Shop>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callReader({ action: 'preview', topicId, url });
    const d = res.data;
    const events = (d?.found ?? 0) + (d?.excluded ?? 0);
    if (!res.failed && events > 0) return { state: 'ready', name: d.name || undefined, venue: d.venue ?? null, events };
    if (!res.failed && !d?.error) break; // read fine, just nothing coming up
    if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
  }
  return { state: 'empty' };
}

/**
 * Organiser ticket shops for this feed, one tap to add each as an events source. Nothing is
 * left out for where it is: each shop shows its name, venue and events so the owner picks.
 * With `platformUrl`, every shop on that platform (except the one pasted).
 */
export function ShopSuggestions({ topicId, platformUrl, title, emptyText, onAdded }: {
  topicId: string;
  platformUrl?: string | undefined;
  title?: string | undefined;
  /** Shown when nothing is found; nothing renders when omitted. */
  emptyText?: string | undefined;
  onAdded?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setShops(null);
    (async () => {
      const res = await callReader({ action: 'discover', topicId, ...(platformUrl ? { url: platformUrl } : {}) });
      if (cancelled) return;
      const found = res.failed ? [] : ((res.data?.suggestions || []) as { url: string; name: string; added?: boolean | undefined }[]);
      setShops(found.map((s) => ({ url: s.url, name: s.name, state: s.added ? 'added' : 'reading' })));
      // Fill each new one in as it's read, a couple at a time
      const queue = found.filter((s) => !s.added).map((s) => s.url);
      const worker = async () => {
        for (let url = queue.shift(); url && !cancelled; url = queue.shift()) {
          const update = await previewShop(topicId, url);
          if (!cancelled) setShops((prev) => prev?.map((s) => s.url === url ? { ...s, ...update } : s) ?? prev);
        }
      };
      await Promise.all(Array.from({ length: READ_AT_ONCE }, worker));
    })();
    return () => { cancelled = true; };
  }, [topicId, platformUrl]);

  const add = async (shop: Shop) => {
    setAdding(shop.url);
    const res = await callReader({ action: 'save', topicId, url: shop.url, name: shop.name, kind: 'ticket_shop' });
    setAdding(null);
    if (res.failed || !res.data?.success) {
      toast({ title: "Couldn't add", description: res.message || res.data?.error || 'Try again.', variant: 'destructive' });
      return;
    }
    setAdded((prev) => [...prev, shop.url]);
    queryClient.invalidateQueries({ queryKey: ['event-desk', topicId] });
    onAdded?.();
  };

  // Shops with events first (in the order found), then those still being read, then ones the feed has; empty ones drop out
  const order: Shop['state'][] = ['ready', 'reading', 'added'];
  const visible = shops ? order.flatMap((state) => shops.filter((s) => s.state === state)) : null;
  if (visible && visible.length === 0) return emptyText ? <p className="text-base text-muted-foreground">{emptyText}</p> : null;

  return (
    <section className="space-y-2" aria-live="polite">
      {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
      <ul className="space-y-2">
        {visible === null
          ? [0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3" role="status" aria-label="Finding organisers">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            </li>
          ))
          : visible.map((shop) => {
            const busy = adding === shop.url;
            const done = added.includes(shop.url);
            if (shop.state === 'added') {
              return (
                <li key={shop.url} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{shop.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{new URL(shop.url).hostname}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm text-pop"><Check className="h-4 w-4" aria-hidden="true" />Added</span>
                </li>
              );
            }
            if (shop.state === 'reading') {
              return (
                <li key={shop.url} className="flex items-center gap-3 rounded-xl border bg-card p-3" role="status" aria-label={`Reading ${shop.name}`}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="truncate text-base font-medium text-muted-foreground">{shop.name}</p>
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                  <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
                </li>
              );
            }
            const events = shop.events ?? 0;
            return (
              <li key={shop.url} className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 settle-in', busy && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{shop.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {shop.venue || new URL(shop.url).hostname} · {events} {events === 1 ? 'event' : 'events'}
                  </p>
                </div>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-sm text-pop"><Check className="h-4 w-4" aria-hidden="true" />Added</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => add(shop)} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}Add
                  </Button>
                )}
              </li>
            );
          })}
      </ul>
    </section>
  );
}
