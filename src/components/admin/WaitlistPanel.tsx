import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink } from 'lucide-react';

interface WaitlistRow {
  id: string;
  email: string;
  plan: string | null;
  created_at: string;
  invite_token: string;
}

interface ResponseRow {
  id: string;
  waitlist_id: string | null;
  answers: Record<string, unknown>;
  wants_early_access: boolean;
  is_preview: boolean;
  completed_at: string | null;
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];

export const WaitlistPanel = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WaitlistRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  const load = async () => {
    setLoading(true);
    const [w, r] = await Promise.all([
      supabase.from('waitlist').select('*').order('created_at', { ascending: false }),
      supabase.from('waitlist_responses').select('*').order('completed_at', { ascending: false }),
    ]);
    if (w.error) toast.error('Could not load waitlist');
    setEntries((w.data as unknown as WaitlistRow[]) ?? []);
    setResponses((r.data as unknown as ResponseRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const byWaitlistId = useMemo(() => {
    const map = new Map<string, ResponseRow>();
    responses.filter((r) => !r.is_preview && r.waitlist_id).forEach((r) => {
      if (!map.has(r.waitlist_id!)) map.set(r.waitlist_id!, r);
    });
    return map;
  }, [responses]);

  const tallies = useMemo(() => {
    const real = responses.filter((r) => !r.is_preview);
    const count = (key: string) => {
      const out: Record<string, number> = {};
      real.forEach((r) => {
        asList((r.answers ?? {})[key]).forEach((v) => {
          out[v] = (out[v] ?? 0) + 1;
        });
      });
      return Object.entries(out).sort((a, b) => b[1] - a[1]);
    };
    return {
      resonated: count('resonated'),
      blockers: count('blockers'),
      price: count('price_band'),
      total: real.length,
      keen: real.filter((r) => r.wants_early_access).length,
    };
  }, [responses]);

  const inviteUrl = (token: string) => `${window.location.origin}/waitlist/welcome?token=${token}`;

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const openPreview = () => {
    const token = `preview-${crypto.randomUUID()}`;
    window.open(`/waitlist/welcome?token=${token}`, '_blank');
  };

  const exportCsv = () => {
    const header = [
      'email',
      'plan',
      'joined',
      'responded',
      'early_access',
      'feed_kind',
      'feed_name',
      'audience',
      'today',
      'resonated',
      'blockers',
      'blockers_detail',
      'price_band',
      'wishlist',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = entries.map((e) => {
      const r = byWaitlistId.get(e.id);
      const a = (r?.answers ?? {}) as Record<string, unknown>;
      return [
        e.email,
        e.plan ?? '',
        new Date(e.created_at).toISOString(),
        r?.completed_at ? new Date(r.completed_at).toISOString() : '',
        r ? (r.wants_early_access ? 'yes' : 'no') : '',
        asList(a.feed_kind).join('; '),
        a.feed_name ?? '',
        a.audience ?? '',
        a.today ?? '',
        asList(a.resonated).join('; '),
        asList(a.blockers).join('; '),
        a.blockers_detail ?? '',
        a.price_band ?? '',
        a.wishlist ?? '',
      ].map(esc).join(',');
    });
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const outreachEmail = (email: string, token: string) =>
    `Subject: A quick question before we open Curatr up to you\n\n` +
    `Hi,\n\n` +
    `Thanks for putting your name down for Curatr. We're letting people in a few at a time so we can help each one set their feed up properly, rather than dropping you into an empty dashboard.\n\n` +
    `Before I do that, could you spare two minutes on six tap-through questions? It tells me what you'd want your feed to cover so I can have it half-built before you log in:\n\n` +
    `${inviteUrl(token)}\n\n` +
    `Any answer is useful, including "this isn't for me after all".\n\n` +
    `Adam\nCuratr`;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">
          Waitlist
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {entries.length} signups · {tallies.total} answered · {tallies.keen} want early access
          </span>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openPreview}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Preview questionnaire
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {tallies.total > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: 'What resonated', data: tallies.resonated },
              { title: 'Blockers', data: tallies.blockers },
              { title: 'Price bands', data: tallies.price },
            ].map((group) => (
              <div key={group.title} className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="space-y-1 text-sm">
                  {group.data.length === 0 && <li className="text-muted-foreground">—</li>}
                  {group.data.map(([label, n]) => (
                    <li key={label} className="flex justify-between gap-2">
                      <span className="truncate">{label}</span>
                      <span className="text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {entries.map((e) => {
            const r = byWaitlistId.get(e.id);
            const a = (r?.answers ?? {}) as Record<string, unknown>;
            return (
              <div key={e.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{e.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString()} · {e.plan || 'general'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r ? (
                      <Badge variant={r.wants_early_access ? 'default' : 'secondary'}>
                        {r.wants_early_access ? 'Keen' : 'Answered'}
                      </Badge>
                    ) : (
                      <Badge variant="outline">No answer yet</Badge>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => copy(inviteUrl(e.invite_token), 'Invite link')}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(outreachEmail(e.email, e.invite_token), 'Outreach email')}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Email draft
                    </Button>
                  </div>
                </div>

                {r && (
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-border pt-3 text-sm sm:grid-cols-2">
                    {[
                      ['Feed', [...asList(a.feed_kind), a.feed_name].filter(Boolean).join(' · ')],
                      ['Audience', a.audience],
                      ['Today', a.today],
                      ['Resonated', asList(a.resonated).join(', ')],
                      ['Blockers', [asList(a.blockers).join(', '), a.blockers_detail].filter(Boolean).join(' — ')],
                      ['Worth', a.price_band],
                      ['Wishlist', a.wishlist],
                    ]
                      .filter(([, v]) => !!v)
                      .map(([label, v]) => (
                        <div key={String(label)} className="flex gap-2">
                          <dt className="shrink-0 text-muted-foreground">{String(label)}:</dt>
                          <dd className="text-foreground">{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};