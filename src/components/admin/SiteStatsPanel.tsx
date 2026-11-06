import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { isExcludedBrowser } from '@/lib/filmPlays';

type Stats = {
  film_started: number; film_halfway: number; film_finished: number;
  home_visitors: number; pricing_visitors: number; auth_visitors: number;
  idea_leads: number; idea_leads_email: number; new_feeds: number;
  top_referrers: { host: string; visitors: number }[];
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

export function SiteStatsPanel() {
  const [days, setDays] = useState<7 | 30>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const excluded = isExcludedBrowser();

  useEffect(() => {
    setStats(null);
    supabase.rpc('get_site_stats' as any, { _days: days }).then(({ data }) => setStats((data as Stats) ?? null));
  }, [days]);

  const excludeLink = `${window.location.origin}/?exclude_me=1`;

  const Row = ({ label, value, note }: { label: string; value: number | string; note?: string }) => (
    <div className="flex items-baseline justify-between border-b border-border py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-xl font-semibold text-foreground">{value}</span>
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([7, 30] as const).map((d) => (
          <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>
            Last {d} days
          </Button>
        ))}
      </div>

      {!stats ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Homepage film</h3>
            <Row label="Started" value={stats.film_started} note={`${pct(stats.film_started, stats.home_visitors)} of homepage visitors`} />
            <Row label="Watched past 30s" value={stats.film_halfway} note={pct(stats.film_halfway, stats.film_started)} />
            <Row label="Finished" value={stats.film_finished} note={pct(stats.film_finished, stats.film_started)} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Journey to sign-up</h3>
            <Row label="Homepage visitors" value={stats.home_visitors} />
            <Row label="Feed ideas generated" value={stats.idea_leads} note={`${stats.idea_leads_email} left an email`} />
            <Row label="Visited pricing" value={stats.pricing_visitors} />
            <Row label="Reached sign-in / sign-up" value={stats.auth_visitors} />
            <Row label="New feeds created" value={stats.new_feeds} />
          </div>
          <div className="md:col-span-2">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Where homepage visitors came from</h3>
            {stats.top_referrers.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Mostly direct visits – no referring sites recorded.</p>
            ) : stats.top_referrers.map((r) => <Row key={r.host} label={r.host || 'unknown'} value={r.visitors} />)}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        Your views aren't counted while you're signed in. To stop a phone or another browser counting, open this link on it once:
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-foreground">{excludeLink}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(excludeLink); setCopied(true); }}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        {excluded && <p className="mt-2">This browser is already excluded.</p>}
        <p className="mt-2">Film counting started on 6 November 2026; earlier plays weren't recorded.</p>
      </div>
    </div>
  );
}
