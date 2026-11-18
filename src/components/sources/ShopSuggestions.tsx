import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { callReader } from '@/components/events/EventSources';
import { cn } from '@/lib/utils';

/** An organiser's ticket shop with upcoming events for this feed (scrape-whats-on `discover`). */
interface ShopSuggestion { url: string; name: string; found: number }

/**
 * Organiser ticket shops for this feed, one tap to add each as an events source.
 * With `platformUrl`, only shops on that platform (and not the one pasted).
 */
export function ShopSuggestions({ topicId, platformUrl, title, emptyText, onAdded }: {
  topicId: string;
  platformUrl?: string;
  title?: string;
  /** Shown when nothing is found; nothing renders when omitted. */
  emptyText?: string;
  onAdded?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shops, setShops] = useState<ShopSuggestion[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setShops(null);
    callReader({ action: 'discover', topicId, ...(platformUrl ? { url: platformUrl } : {}) }).then((res) => {
      if (!cancelled) setShops(res.failed ? [] : ((res.data?.suggestions || []) as ShopSuggestion[]));
    });
    return () => { cancelled = true; };
  }, [topicId, platformUrl]);

  const add = async (shop: ShopSuggestion) => {
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

  if (shops && shops.length === 0) return emptyText ? <p className="text-base text-muted-foreground">{emptyText}</p> : null;

  return (
    <section className="space-y-2" aria-live="polite">
      {title && <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>}
      <ul className="space-y-2">
        {shops === null
          ? [0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3" role="status" aria-label="Finding organisers">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            </li>
          ))
          : shops.map((shop) => {
            const busy = adding === shop.url;
            const done = added.includes(shop.url);
            return (
              <li key={shop.url} className={cn('flex items-center gap-3 rounded-xl border bg-card p-3', busy && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{shop.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{new URL(shop.url).hostname} · {shop.found} {shop.found === 1 ? 'event' : 'events'}</p>
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
